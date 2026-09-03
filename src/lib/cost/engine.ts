import type { MeshStats } from '../mesh/types.ts'
import type {
  BusinessSettings, CostLine, Estimate, FdmPrinterSpec, FdmPrintParams, Material,
  PrinterProfile, ResinPrinterSpec, ResinPrintParams,
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

interface CommonInput {
  stats: MeshStats
  printer: PrinterProfile
  material: Material
  settings: BusinessSettings
}

/* ------------------------------------------------------------------ FDM */

export interface FdmBreakdown {
  wallVolume: number
  skinVolume: number
  infillVolume: number
  supportVolume: number
  modelVolume: number
  colorChanges: number
}

export function estimateFdm(input: CommonInput & { params: FdmPrintParams }): Estimate {
  const { stats, printer, material, settings, params } = input
  const spec = printer.spec as FdmPrinterSpec
  const warnings: string[] = []
  const L = stats.layers

  // Katman sayısı: istenen katman kalınlığına göre
  const layerCount = Math.max(1, Math.ceil(stats.size.z / params.layerHeight - 1e-6))

  // --- Malzeme (kabuk + dolgu) ---
  const wallThickness = params.wallLoops * params.lineWidth
  // Duvar hacmi: her dilimde çevre × duvar kalınlığı × dilim yüksekliği, dilim kesit alanıyla sınırlanır
  let wallVolume = 0
  for (let i = 0; i < L.layerCount; i++) {
    const wall = Math.min(L.perimeter[i] * wallThickness, L.area[i])
    wallVolume += wall * L.layerHeight
  }
  // Üst/alt kabuk: yatay yüzey izdüşümü × kabuk kalınlığı
  const skinThickness = params.topBottomLayers * params.layerHeight
  let skinVolume = stats.horizontalArea * skinThickness
  const volume = stats.manifold.checked && !stats.manifold.isClosed ? Math.max(stats.volume, L.volume) : stats.volume
  // Kabuk hacmi toplam hacmi aşamaz (ince parçalar)
  let shell = wallVolume + skinVolume
  if (shell > volume) {
    const k = volume / shell
    wallVolume *= k; skinVolume *= k; shell = volume
  }
  const infillVolume = (volume - shell) * params.infillDensity
  const modelVolume = shell + infillVolume

  // --- Destek ---
  let supportVolume = 0
  const needsSupport = params.supports === 'on' || (params.supports === 'auto' && stats.overhangArea > 4)
  if (needsSupport) {
    // Sütun hacmi × destek yoğunluğu + arayüz katmanları (2 katman, tam yoğun)
    supportVolume = stats.supportColumnVolume * params.supportDensity
      + stats.overhangProjectedArea * 2 * params.layerHeight
    // Sütun tahmini modelin altındaki geometriyi göz ardı eder; bbox hacmiyle sınırla
    const bboxVol = stats.size.x * stats.size.y * stats.size.z
    supportVolume = Math.min(supportVolume, bboxVol * 0.5)
  }

  // --- İsraf ---
  const colorChanges = params.colorCount > 1
    ? Math.round(layerCount * params.colorChangesPerLayer * (params.colorCount - 1))
    : 0
  const wasteGrams = spec.jobWasteGrams + colorChanges * spec.colorChangeWasteGrams

  const modelGrams = gramsFromMm3(modelVolume, material.density)
  const supportGrams = gramsFromMm3(supportVolume, material.density)
  const materialGrams = modelGrams + supportGrams + wasteGrams

  // --- Süre ---
  // Efektif akış: makine/malzeme tavanı × geometri karmaşıklığı katsayısı (S/V oranı: küçük detaylı parçalar ivmelenemez)
  const qMax = Math.min(material.maxFlow, spec.maxFlow)
  const sv = stats.surfaceArea / Math.max(1, volume) // mm⁻¹
  const kGeom = clamp(0.25 + 0.35 * (1 - Math.min(1, sv / 1.5)), 0.2, 0.65) * spec.efficiencyScale
  const qBulk = Math.max(0.5, qMax * kGeom)
  const qWall = Math.min(qBulk, params.lineWidth * params.layerHeight * spec.outerWallSpeed * 0.6)
  // Katman bazlı: her dilimin hacmi → süre; min. katman süresi tabanı; katman değişimi sabiti
  const shellScale = shell > 0 ? Math.min(1, volume / (wallVolume + skinVolume || 1)) : 1
  const wallPerLayerFactor = wallThickness * shellScale
  const skinShare = skinVolume / Math.max(1e-9, modelVolume)
  const infillShare = infillVolume / Math.max(1e-9, modelVolume)
  let extrudeTime = 0
  const lh = L.layerHeight
  for (let i = 0; i < L.layerCount; i++) {
    const wallV = Math.min(L.perimeter[i] * wallPerLayerFactor, L.area[i]) * lh
    const bulkV = Math.max(0, L.area[i] * lh - wallV) * (skinShare + infillShare) // kabuk/dolgu payı (yaklaşık)
    const t = wallV / qWall + bulkV / qBulk
    extrudeTime += Math.max(t, material.minLayerTime * (lh / params.layerHeight))
  }
  // Analiz dilim kalınlığı ile istenen katman kalınlığı farklıysa hacim korunur; sadece min. süre/katman geçişi ölçeklenir
  const supportTime = supportVolume / qBulk
  const layerTime = layerCount * spec.layerChangeSec
  const changeTime = colorChanges * spec.colorChangeTimeSec
  const printTimeSec = spec.jobOverheadSec + (extrudeTime + supportTime + layerTime + changeTime) * settings.timeMultiplier

  // --- Enerji ---
  const printHours = (printTimeSec - spec.jobOverheadSec) / 3600
  const energyKWh = (printHours * spec.avgPowerW * material.powerFactor + (spec.jobOverheadSec / 3600) * spec.heatupPowerW) / 1000

  // --- Maliyet ---
  const lines: CostLine[] = []
  const matCost = (modelGrams / 1000) * material.pricePerKgTRY
  lines.push({ key: 'material', label: 'Model malzemesi', amount: matCost, detail: `${modelGrams.toFixed(1)} g ${material.name}` })
  if (supportGrams > 0) lines.push({ key: 'support', label: 'Destek malzemesi', amount: (supportGrams / 1000) * material.pricePerKgTRY, detail: `${supportGrams.toFixed(1)} g` })
  lines.push({ key: 'waste', label: 'İsraf (purge/flush)', amount: (wasteGrams / 1000) * material.pricePerKgTRY, detail: `${wasteGrams.toFixed(1)} g${colorChanges ? `, ${colorChanges} renk değişimi` : ''}` })
  lines.push({ key: 'energy', label: 'Elektrik', amount: energyKWh * settings.electricityTRYPerKWh, detail: `${energyKWh.toFixed(2)} kWh` })
  const totalHours = printTimeSec / 3600
  lines.push({ key: 'machine', label: 'Makine amortismanı', amount: totalHours * (printer.priceTRY / printer.lifetimeHours), detail: `${totalHours.toFixed(2)} sa × ${(printer.priceTRY / printer.lifetimeHours).toFixed(2)} ₺/sa` })
  lines.push({ key: 'maintenance', label: 'Bakım & sarf', amount: totalHours * printer.maintenanceTRYPerHour })
  lines.push({ key: 'labor', label: 'İşçilik', amount: (settings.fdmSetupMinutes / 60) * settings.laborTRYPerHour, detail: `${settings.fdmSetupMinutes} dk` })

  return finalize({
    tech: 'fdm', stats, printer, settings, lines, warnings,
    materialGrams, materialVolumeMm3: modelVolume + supportVolume, supportGrams, wasteGrams,
    printTimeSec, layerCount, energyKWh,
    breakdown: { wallVolume, skinVolume, infillVolume, supportVolume, modelVolume, colorChanges },
  })
}

/* ---------------------------------------------------------------- Resin */

export function estimateResin(input: CommonInput & { params: ResinPrintParams }): Estimate {
  const { stats, printer, material, settings, params } = input
  const spec = printer.spec as ResinPrinterSpec
  const warnings: string[] = []

  const layerCount = Math.max(1, Math.ceil(stats.size.z / params.layerHeight - 1e-6))
  const volume = stats.volume

  // --- Model reçinesi (boşaltma seçeneği) ---
  let modelVolume = volume
  let hollowSaved = 0
  if (params.hollow) {
    const shell = Math.min(volume, stats.surfaceArea * params.hollowWallMm)
    const inner = volume - shell
    modelVolume = shell + inner * params.hollowResidualRatio
    hollowSaved = volume - modelVolume
  }

  // --- Destek ---
  let supportVolume = 0
  const needsSupport = params.supports === 'on' || (params.supports === 'auto' && (stats.overhangArea > 4 || stats.bedContactArea < stats.footprintArea * 0.5))
  if (needsSupport) {
    // Reçine destekleri seyrek sütunlardır; sütun hacminin küçük bir oranı + raft tabanı
    const pillars = stats.supportColumnVolume * 0.04
    const raft = stats.size.x * stats.size.y * 0.35 * 1.0 // ~%35 kaplama, 1 mm taban
    supportVolume = Math.max(pillars + raft, volume * params.supportRatio)
    supportVolume = Math.min(supportVolume, volume * 0.6 + raft)
  }

  // --- İsraf: parça üzerinde kalan / yıkamada giden reçine ---
  const wasteRatio = 0.08
  const wasteVolume = (modelVolume + supportVolume) * wasteRatio
  const modelGrams = gramsFromMm3(modelVolume, material.density)
  const supportGrams = gramsFromMm3(supportVolume, material.density)
  const wasteGrams = gramsFromMm3(wasteVolume, material.density)
  const materialGrams = modelGrams + supportGrams + wasteGrams

  // --- Süre: katman × (pozlama + kaldırma döngüsü) ---
  const bottom = Math.min(params.bottomLayers, layerCount)
  const normal = layerCount - bottom
  const printTimeSec = 60 + (bottom * (params.bottomExposureSec + params.liftCycleSec) + normal * (params.exposureSec + params.liftCycleSec)) * settings.timeMultiplier

  // --- Enerji ---
  const energyKWh = ((printTimeSec / 3600) * spec.avgPowerW + (settings.resinPostMinutes / 60) * spec.postPowerW) / 1000

  // --- Maliyet ---
  const lines: CostLine[] = []
  lines.push({ key: 'material', label: 'Model reçinesi', amount: (modelGrams / 1000) * material.pricePerKgTRY, detail: `${modelGrams.toFixed(1)} g ${material.name}${hollowSaved > 0 ? ` (boşaltma ile ${gramsFromMm3(hollowSaved, material.density).toFixed(0)} g tasarruf)` : ''}` })
  if (supportGrams > 0) lines.push({ key: 'support', label: 'Destek reçinesi', amount: (supportGrams / 1000) * material.pricePerKgTRY, detail: `${supportGrams.toFixed(1)} g` })
  lines.push({ key: 'waste', label: 'İsraf (yıkama kaybı)', amount: (wasteGrams / 1000) * material.pricePerKgTRY, detail: `${wasteGrams.toFixed(1)} g` })
  // IPA: taban miktar + yüzey alanına göre artış
  const ipaLiters = settings.ipaLitersPerPrintBase + stats.surfaceArea / 100000 * 0.05
  lines.push({ key: 'ipa', label: 'IPA / yıkama', amount: ipaLiters * settings.ipaTRYPerLiter, detail: `${(ipaLiters * 1000).toFixed(0)} ml` })
  lines.push({ key: 'energy', label: 'Elektrik', amount: energyKWh * settings.electricityTRYPerKWh, detail: `${energyKWh.toFixed(2)} kWh` })
  const totalHours = printTimeSec / 3600
  lines.push({ key: 'machine', label: 'Makine amortismanı', amount: totalHours * (printer.priceTRY / printer.lifetimeHours), detail: `${totalHours.toFixed(2)} sa` })
  lines.push({ key: 'maintenance', label: 'Bakım & sarf (FEP, eldiven, filtre)', amount: totalHours * printer.maintenanceTRYPerHour })
  const laborMin = settings.resinSetupMinutes + settings.resinPostMinutes
  lines.push({ key: 'labor', label: 'İşçilik (hazırlık + yıkama/kürleme)', amount: (laborMin / 60) * settings.laborTRYPerHour, detail: `${laborMin} dk` })

  if (stats.layers.maxArea > 0.5 * printer.bed.x * printer.bed.y) {
    warnings.push('Çok büyük kesit alanı: FEP üzerindeki ayrılma kuvveti yüksek; boşaltma veya açılı yerleşim önerilir.')
  }

  return finalize({
    tech: 'resin', stats, printer, settings, lines, warnings,
    materialGrams, materialVolumeMm3: modelVolume + supportVolume, supportGrams, wasteGrams,
    printTimeSec, layerCount, energyKWh,
    breakdown: { modelVolume, supportVolume, hollowSaved, wasteVolume },
  })
}

/* ------------------------------------------------------------- ortak son */

function finalize(a: {
  tech: Estimate['tech']; stats: MeshStats; printer: PrinterProfile; settings: BusinessSettings
  lines: CostLine[]; warnings: string[]
  materialGrams: number; materialVolumeMm3: number; supportGrams: number; wasteGrams: number
  printTimeSec: number; layerCount: number; energyKWh: number; breakdown: Record<string, number>
}): Estimate {
  const { settings, stats, printer } = a
  const lines = [...a.lines]
  const direct = lines.reduce((s, l) => s + l.amount, 0)
  // Başarısızlık riski: doğrudan maliyetin beklenen kaybı
  if (settings.failureRate > 0) {
    const fr = settings.failureRate
    lines.push({ key: 'failure', label: 'Başarısız baskı riski', amount: direct * (fr / (1 - fr)), detail: `%${(fr * 100).toFixed(0)}` })
  }
  if (settings.packagingTRY > 0) lines.push({ key: 'packaging', label: 'Ambalaj', amount: settings.packagingTRY })
  const costPerUnit = lines.reduce((s, l) => s + l.amount, 0)
  let pricePerUnit = costPerUnit * (1 + settings.markup)
  const qty = Math.max(1, Math.floor(settings.quantity))
  if (pricePerUnit * qty < settings.minimumPriceTRY) pricePerUnit = settings.minimumPriceTRY / qty
  const pricePerUnitWithVat = pricePerUnit * (1 + settings.vat)

  const fit = checkFit(stats, printer)
  const warnings = [...a.warnings]
  if (!fit.fits && fit.fitsRotated) warnings.push('Model tablaya yalnızca 90° döndürülünce sığıyor.')
  if (!fit.fitsRotated) warnings.push(`Model bu yazıcının tablasına sığmıyor (${stats.size.x.toFixed(0)}×${stats.size.y.toFixed(0)}×${stats.size.z.toFixed(0)} mm > ${printer.bed.x}×${printer.bed.y}×${printer.bed.z} mm).`)
  if (stats.manifold.checked && !stats.manifold.isClosed) warnings.push(`Mesh kapalı değil (${stats.manifold.openEdges} açık, ${stats.manifold.nonManifoldEdges} non-manifold kenar); hacim tahmini sapabilir. Dilimleyicide onarım önerilir.`)
  if (stats.invertedWinding) warnings.push('Yüzey normalleri ters görünüyor; hacim mutlak değer olarak alındı.')
  if (stats.layers.coarsened) warnings.push('Çok yoğun mesh: katman analizi daha kaba adımla yapıldı.')

  return {
    tech: a.tech,
    materialGrams: a.materialGrams,
    materialVolumeMm3: a.materialVolumeMm3,
    supportGrams: a.supportGrams,
    wasteGrams: a.wasteGrams,
    printTimeSec: a.printTimeSec,
    layerCount: a.layerCount,
    energyKWh: a.energyKWh,
    lines,
    costPerUnit,
    pricePerUnit,
    pricePerUnitWithVat,
    totalPrice: pricePerUnit * qty,
    totalPriceWithVat: pricePerUnitWithVat * qty,
    warnings,
    fits: fit.fits,
    fitsRotated: fit.fitsRotated,
    breakdown: a.breakdown,
  }
}

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  if (h === 0) return `${m} dk`
  return `${h} sa ${m} dk`
}

export const fmtTRY = (n: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 }).format(n)
