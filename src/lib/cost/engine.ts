import type { MeshStats } from '../mesh/types.ts'
import type {
  BusinessSettings, CostLine, Estimate, EstimateTotals, FdmPrinterSpec, FdmPrintParams, Material,
  PrinterProfile, ResinPrinterSpec, ResinPrintParams, Tech,
} from './types.ts'

const MM3_PER_CM3 = 1000
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export function gramsFromMm3(mm3: number, density: number): number {
  return (mm3 / MM3_PER_CM3) * density
}

export function checkFit(stats: MeshStats, printer: PrinterProfile): { fits: boolean; fitsRotated: boolean } {
  const { x, y, z } = stats.size
  const b = printer.bed
  const eps = 0.01
  const fits = x <= b.x + eps && y <= b.y + eps && z <= b.z + eps
  const fitsRotated = fits || (y <= b.x + eps && x <= b.y + eps && z <= b.z + eps)
  return { fits, fitsRotated }
}

/**
 * Tablaya sığan parça sayısı: bounding box ızgara yerleşimi + boşluk + kenar payı; 90° döndürülmüş varyant da denenir.
 * Z'de istifleme yapılmaz.
 */
export function plateCapacity(stats: MeshStats, printer: PrinterProfile, spacing: number, margin: number): number {
  const ux = printer.bed.x - 2 * margin
  const uy = printer.bed.y - 2 * margin
  const fit = (px: number, py: number) => {
    if (px <= 0 || py <= 0) return 0
    const nx = Math.floor((ux + spacing) / (px + spacing))
    const ny = Math.floor((uy + spacing) / (py + spacing))
    return Math.max(0, nx) * Math.max(0, ny)
  }
  if (stats.size.z > printer.bed.z + 0.01) return 0
  return Math.max(fit(stats.size.x, stats.size.y), fit(stats.size.y, stats.size.x))
}

/** Adet → tabla dağılımı: [dolu tabla sayısı, son tabladaki parça] */
function planPlates(quantity: number, partsPerPlate: number): { plates: number; loads: number[] } {
  const cap = Math.max(1, partsPerPlate)
  const plates = Math.ceil(quantity / cap)
  const loads: number[] = []
  let left = quantity
  for (let i = 0; i < plates; i++) { const k = Math.min(cap, left); loads.push(k); left -= k }
  return { plates, loads }
}

interface CommonInput {
  stats: MeshStats
  printer: PrinterProfile
  material: Material
  settings: BusinessSettings
}

/* ------------------------------------------------------------------ FDM */

export function estimateFdm(input: CommonInput & { params: FdmPrintParams }): Estimate {
  const { stats, printer, material, settings, params } = input
  const spec = printer.spec as FdmPrinterSpec
  const warnings: string[] = []
  const L = stats.layers
  const qty = Math.max(1, Math.floor(settings.quantity))

  const layerCount = Math.max(1, Math.ceil(stats.size.z / params.layerHeight - 1e-6))

  // --- Malzeme (tek parça): kabuk + dolgu ---
  const wallThickness = params.wallLoops * params.lineWidth
  let wallVolume = 0
  for (let i = 0; i < L.layerCount; i++) {
    wallVolume += Math.min(L.perimeter[i] * wallThickness, L.area[i]) * L.layerHeight
  }
  const skinThickness = params.topBottomLayers * params.layerHeight
  let skinVolume = stats.horizontalArea * skinThickness
  const volume = stats.manifold.checked && !stats.manifold.isClosed ? Math.max(stats.volume, L.volume) : stats.volume
  let shell = wallVolume + skinVolume
  if (shell > volume) { const k = volume / shell; wallVolume *= k; skinVolume *= k; shell = volume }
  const infillVolume = (volume - shell) * params.infillDensity
  const modelVolume = shell + infillVolume

  // --- Destek (tek parça) ---
  let supportVolume = 0
  const needsSupport = params.supports === 'on' || (params.supports === 'auto' && stats.overhangArea > 4)
  if (needsSupport) {
    supportVolume = stats.supportColumnVolume * params.supportDensity + stats.overhangProjectedArea * 2 * params.layerHeight
    supportVolume = Math.min(supportVolume, stats.size.x * stats.size.y * stats.size.z * 0.5)
  }
  const partGrams = gramsFromMm3(modelVolume, material.density)
  const partSupportGrams = gramsFromMm3(supportVolume, material.density)

  // --- Efektif akış ---
  const qMax = Math.min(material.maxFlow, spec.maxFlow)
  const sv = stats.surfaceArea / Math.max(1, volume)
  const kGeom = clamp(0.25 + 0.35 * (1 - Math.min(1, sv / 1.5)), 0.2, 0.65) * spec.efficiencyScale
  const qBulk = Math.max(0.5, qMax * kGeom)
  const qWall = Math.min(qBulk, params.lineWidth * params.layerHeight * spec.outerWallSpeed * 0.6)
  const shellScale = shell > 0 ? Math.min(1, volume / (wallVolume + skinVolume || 1)) : 1
  const wallPerLayerFactor = wallThickness * shellScale
  const bulkShare = (skinVolume + infillVolume) / Math.max(1e-9, modelVolume)
  const lh = L.layerHeight
  // Katman başına tek parça ekstrüzyon süresi (min. katman süresi uygulanmadan)
  const layerExtrude = new Float64Array(L.layerCount)
  for (let i = 0; i < L.layerCount; i++) {
    const wallV = Math.min(L.perimeter[i] * wallPerLayerFactor, L.area[i]) * lh
    const bulkV = Math.max(0, L.area[i] * lh - wallV) * bulkShare
    layerExtrude[i] = wallV / qWall + bulkV / qBulk
  }
  const minLayer = material.minLayerTime * (lh / params.layerHeight)
  const supportTimePart = supportVolume / qBulk
  // Renk değişimleri tabla başına: her katmanda bir kez yapılır, parça sayısından bağımsız
  const colorChangesPlate = params.colorCount > 1 ? Math.round(layerCount * params.colorChangesPerLayer * (params.colorCount - 1)) : 0

  /** k parçalı bir tablanın süresi (sn) */
  const plateTime = (k: number) => {
    let extrude = 0
    for (let i = 0; i < L.layerCount; i++) {
      // Aynı katmanda k parça: soğutma tabanı katman toplamına uygulanır (küçük parçalar partide daha verimli)
      extrude += Math.max(layerExtrude[i] * k, minLayer)
    }
    // Parçalar arası travel: ≤3 parçada ihmal, 10+ parçada baskı süresinin ~%2–5'i
    const travelFactor = k > 3 ? Math.min(0.05, 0.006 * (k - 3)) : 0
    const t = (extrude + k * supportTimePart) * (1 + travelFactor) + layerCount * spec.layerChangeSec + colorChangesPlate * spec.colorChangeTimeSec
    return spec.jobOverheadSec + t * settings.timeMultiplier
  }
  const plateWasteGrams = spec.jobWasteGrams + colorChangesPlate * spec.colorChangeWasteGrams
  const plateEnergyKWh = (t: number) => ((t - spec.jobOverheadSec) / 3600 * spec.avgPowerW * material.powerFactor + (spec.jobOverheadSec / 3600) * spec.heatupPowerW) / 1000

  // --- Tabla planı ---
  const partsPerPlate = plateCapacity(stats, printer, settings.fdmPartSpacingMm, settings.plateMarginMm)
  const { plates, loads } = planPlates(qty, partsPerPlate)
  let totalTime = 0, totalEnergy = 0, totalWaste = 0
  for (const k of loads) {
    const t = plateTime(k)
    totalTime += t
    totalEnergy += plateEnergyKWh(t)
    totalWaste += plateWasteGrams
  }
  const fullPlateTime = plateTime(Math.min(qty, Math.max(1, partsPerPlate)))
  const singleTime = plateTime(1)

  // --- Maliyet (sipariş toplamı) ---
  const price = material.pricePerKgTRY / 1000
  const lines: CostLine[] = []
  lines.push({ key: 'material', label: 'Model malzemesi', amount: partGrams * qty * price, detail: `${qty > 1 ? `${qty} × ` : ''}${partGrams.toFixed(1)} g ${material.name}` })
  if (partSupportGrams > 0) lines.push({ key: 'support', label: 'Destek malzemesi', amount: partSupportGrams * qty * price, detail: `${qty > 1 ? `${qty} × ` : ''}${partSupportGrams.toFixed(1)} g` })
  lines.push({ key: 'waste', label: 'İsraf (purge/flush)', amount: totalWaste * price, detail: `${totalWaste.toFixed(1)} g · ${plates} tabla${colorChangesPlate ? ` · ${colorChangesPlate} renk değişimi/tabla` : ''}` })
  lines.push({ key: 'energy', label: 'Elektrik', amount: totalEnergy * settings.electricityTRYPerKWh, detail: `${totalEnergy.toFixed(2)} kWh` })
  const hours = totalTime / 3600
  lines.push({ key: 'machine', label: 'Makine amortismanı', amount: hours * (printer.priceTRY / printer.lifetimeHours), detail: `${hours.toFixed(2)} sa × ${(printer.priceTRY / printer.lifetimeHours).toFixed(2)} ₺/sa` })
  lines.push({ key: 'maintenance', label: 'Bakım & sarf', amount: hours * printer.maintenanceTRYPerHour })
  const laborMin = plates * settings.fdmSetupMinutes + qty * settings.fdmPerPartMinutes
  lines.push({ key: 'labor', label: 'İşçilik', amount: (laborMin / 60) * settings.laborTRYPerHour, detail: `${plates} tabla × ${settings.fdmSetupMinutes} dk + ${qty} × ${settings.fdmPerPartMinutes} dk` })

  return finalize({
    tech: 'fdm', stats, printer, settings, lines, warnings, qty, partsPerPlate, plates,
    single: { printTimeSec: singleTime, materialGrams: partGrams + partSupportGrams + plateWasteGrams },
    plateTimeSec: fullPlateTime,
    totals: { materialGrams: (partGrams + partSupportGrams) * qty + totalWaste, supportGrams: partSupportGrams * qty, wasteGrams: totalWaste, printTimeSec: totalTime, energyKWh: totalEnergy },
    materialVolumeMm3: modelVolume + supportVolume, layerCount,
    breakdown: { wallVolume, skinVolume, infillVolume, supportVolume, modelVolume, colorChanges: colorChangesPlate },
  })
}

/* ---------------------------------------------------------------- Resin */

export function estimateResin(input: CommonInput & { params: ResinPrintParams }): Estimate {
  const { stats, printer, material, settings, params } = input
  const spec = printer.spec as ResinPrinterSpec
  const warnings: string[] = []
  const qty = Math.max(1, Math.floor(settings.quantity))

  const layerCount = Math.max(1, Math.ceil(stats.size.z / params.layerHeight - 1e-6))
  const volume = stats.volume

  // --- Model reçinesi (tek parça) ---
  let modelVolume = volume
  let hollowSaved = 0
  if (params.hollow) {
    const shell = Math.min(volume, stats.surfaceArea * params.hollowWallMm)
    modelVolume = shell + (volume - shell) * params.hollowResidualRatio
    hollowSaved = volume - modelVolume
  }
  let supportVolume = 0
  const needsSupport = params.supports === 'on' || (params.supports === 'auto' && (stats.overhangArea > 4 || stats.bedContactArea < stats.footprintArea * 0.5))
  if (needsSupport) {
    const pillars = stats.supportColumnVolume * 0.04
    const raft = stats.size.x * stats.size.y * 0.35 * 1.0
    supportVolume = Math.min(Math.max(pillars + raft, volume * params.supportRatio), volume * 0.6 + raft)
  }
  const wasteRatio = 0.08
  const partGrams = gramsFromMm3(modelVolume, material.density)
  const partSupportGrams = gramsFromMm3(supportVolume, material.density)
  const partWasteGrams = (partGrams + partSupportGrams) * wasteRatio

  // --- Tabla planı ---
  // Büyük taban alanlı parçalarda (>40 cm²) ayrılma kuvveti için parça aralığı 15 mm'e çıkarılır
  const footprint = stats.size.x * stats.size.y
  const spacing = footprint > 4000 ? Math.max(settings.resinPartSpacingMm, 15) : settings.resinPartSpacingMm
  const partsPerPlate = plateCapacity(stats, printer, spacing, settings.plateMarginMm)
  const { plates, loads } = planPlates(qty, partsPerPlate)
  const plateArea = printer.bed.x * printer.bed.y

  /** k parçalı tabla süresi: katman sayısına bağlı, parça sayısından bağımsız.
   *  Statik ayırmalı makinelerde kaplama arttıkça rest/lift yavaşlatması: ×(1 + ceza × kaplama), üst sınır +%30. */
  const plateTime = (k: number) => {
    const fill = Math.min(1, (k * footprint) / plateArea)
    const penalty = spec.tiltRelease ? 0 : Math.min(0.3, settings.resinLiftAreaPenalty * fill)
    const bottom = Math.min(params.bottomLayers, layerCount)
    const normal = layerCount - bottom
    const layersTime = bottom * (params.bottomExposureSec + params.liftCycleSec) + normal * (params.exposureSec + params.liftCycleSec)
    return 60 + layersTime * (1 + penalty) * settings.timeMultiplier
  }
  let totalTime = 0, totalEnergy = 0
  for (const k of loads) {
    const t = plateTime(k)
    totalTime += t
    totalEnergy += ((t / 3600) * spec.avgPowerW + (settings.resinPostMinutes / 60) * spec.postPowerW) / 1000
  }
  const fullPlateTime = plateTime(Math.min(qty, Math.max(1, partsPerPlate)))
  const singleTime = plateTime(1)

  // --- Maliyet (sipariş toplamı) ---
  const price = material.pricePerKgTRY / 1000
  const lines: CostLine[] = []
  lines.push({ key: 'material', label: 'Model reçinesi', amount: partGrams * qty * price, detail: `${qty > 1 ? `${qty} × ` : ''}${partGrams.toFixed(1)} g ${material.name}${hollowSaved > 0 ? ` (boşaltma ile ${gramsFromMm3(hollowSaved, material.density).toFixed(0)} g/adet tasarruf)` : ''}` })
  if (partSupportGrams > 0) lines.push({ key: 'support', label: 'Destek reçinesi', amount: partSupportGrams * qty * price, detail: `${qty > 1 ? `${qty} × ` : ''}${partSupportGrams.toFixed(1)} g` })
  lines.push({ key: 'waste', label: 'İsraf (yıkama kaybı)', amount: partWasteGrams * qty * price, detail: `${(partWasteGrams * qty).toFixed(1)} g` })
  const ipaLiters = qty * (settings.ipaLitersPerPrintBase + (stats.surfaceArea / 100000) * 0.05)
  lines.push({ key: 'ipa', label: 'IPA / yıkama', amount: ipaLiters * settings.ipaTRYPerLiter, detail: `${(ipaLiters * 1000).toFixed(0)} ml` })
  lines.push({ key: 'energy', label: 'Elektrik', amount: totalEnergy * settings.electricityTRYPerKWh, detail: `${totalEnergy.toFixed(2)} kWh` })
  const hours = totalTime / 3600
  lines.push({ key: 'machine', label: 'Makine amortismanı', amount: hours * (printer.priceTRY / printer.lifetimeHours), detail: `${hours.toFixed(2)} sa · ${plates} tabla` })
  lines.push({ key: 'maintenance', label: 'Bakım & sarf (FEP, LCD, eldiven, filtre)', amount: hours * printer.maintenanceTRYPerHour })
  const laborMin = plates * (settings.resinSetupMinutes + settings.resinPostMinutes) + qty * settings.resinPerPartMinutes
  lines.push({ key: 'labor', label: 'İşçilik (hazırlık + yıkama/kürleme + destek sökme)', amount: (laborMin / 60) * settings.laborTRYPerHour, detail: `${plates} tabla × ${settings.resinSetupMinutes + settings.resinPostMinutes} dk + ${qty} × ${settings.resinPerPartMinutes} dk` })

  if (stats.layers.maxArea > 0.5 * plateArea) {
    warnings.push('Çok büyük kesit alanı: FEP üzerindeki ayrılma kuvveti yüksek; boşaltma veya açılı yerleşim önerilir.')
  }

  return finalize({
    tech: 'resin', stats, printer, settings, lines, warnings, qty, partsPerPlate, plates,
    single: { printTimeSec: singleTime, materialGrams: partGrams + partSupportGrams + partWasteGrams },
    plateTimeSec: fullPlateTime,
    totals: { materialGrams: (partGrams + partSupportGrams + partWasteGrams) * qty, supportGrams: partSupportGrams * qty, wasteGrams: partWasteGrams * qty, printTimeSec: totalTime, energyKWh: totalEnergy },
    materialVolumeMm3: modelVolume + supportVolume, layerCount,
    breakdown: { modelVolume, supportVolume, hollowSaved, wasteVolume: (modelVolume + supportVolume) * wasteRatio },
  })
}

/* ------------------------------------------------------------- ortak son */

function finalize(a: {
  tech: Tech; stats: MeshStats; printer: PrinterProfile; settings: BusinessSettings
  lines: CostLine[]; warnings: string[]; qty: number; partsPerPlate: number; plates: number
  single: { printTimeSec: number; materialGrams: number }; plateTimeSec: number
  totals: Omit<EstimateTotals, 'cost' | 'price' | 'priceWithVat'>
  materialVolumeMm3: number; layerCount: number; breakdown: Record<string, number>
}): Estimate {
  const { settings, stats, printer, qty } = a
  const lines = [...a.lines]
  const direct = lines.reduce((s, l) => s + l.amount, 0)
  const fr = a.tech === 'resin' ? settings.resinFailureRate : settings.failureRate
  if (fr > 0) {
    lines.push({ key: 'failure', label: 'Başarısız baskı riski', amount: direct * (fr / (1 - fr)), detail: `%${(fr * 100).toFixed(0)}` })
  }
  if (settings.packagingTRY > 0) lines.push({ key: 'packaging', label: 'Ambalaj', amount: settings.packagingTRY * qty, detail: qty > 1 ? `${qty} × ${settings.packagingTRY} ₺` : undefined })
  const cost = lines.reduce((s, l) => s + l.amount, 0)
  let price = cost * (1 + settings.markup)
  if (price < settings.minimumPriceTRY) price = settings.minimumPriceTRY
  const priceWithVat = price * (1 + settings.vat)

  const fit = checkFit(stats, printer)
  const warnings = [...a.warnings]
  if (!fit.fits && fit.fitsRotated) warnings.push('Model tablaya yalnızca 90° döndürülünce sığıyor.')
  if (!fit.fitsRotated) warnings.push(`Model bu yazıcının tablasına sığmıyor (${stats.size.x.toFixed(0)}×${stats.size.y.toFixed(0)}×${stats.size.z.toFixed(0)} mm > ${printer.bed.x}×${printer.bed.y}×${printer.bed.z} mm).`)
  if (stats.manifold.checked && !stats.manifold.isClosed) warnings.push(`Mesh kapalı değil (${stats.manifold.openEdges} açık, ${stats.manifold.nonManifoldEdges} non-manifold kenar); hacim tahmini sapabilir. Dilimleyicide onarım önerilir.`)
  if (stats.invertedWinding) warnings.push('Yüzey normalleri ters görünüyor; hacim mutlak değer olarak alındı.')
  if (stats.layers.coarsened) warnings.push('Çok yoğun mesh: katman analizi daha kaba adımla yapıldı.')

  const total: EstimateTotals = { ...a.totals, cost, price, priceWithVat }
  const perUnit: EstimateTotals = {
    materialGrams: total.materialGrams / qty, supportGrams: total.supportGrams / qty, wasteGrams: total.wasteGrams / qty,
    printTimeSec: total.printTimeSec / qty, energyKWh: total.energyKWh / qty,
    cost: cost / qty, price: price / qty, priceWithVat: priceWithVat / qty,
  }
  return {
    tech: a.tech, quantity: qty, partsPerPlate: a.partsPerPlate, plates: a.plates,
    single: a.single, plateTimeSec: a.plateTimeSec, total, perUnit,
    materialVolumeMm3: a.materialVolumeMm3, layerCount: a.layerCount,
    lines, warnings, fits: fit.fits, fitsRotated: fit.fitsRotated, breakdown: a.breakdown,
  }
}

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  if (h === 0) return `${m} dk`
  if (h >= 48) return `${(sec / 86400).toFixed(1)} gün`
  return `${h} sa ${m} dk`
}

export const fmtTRY = (n: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 }).format(n)
