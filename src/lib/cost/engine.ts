import type { MeshStats } from '../mesh/types.ts'
import type {
  BusinessSettings, CostLine, Estimate, EstimateTotals, FdmPrinterSpec, FdmPrintParams, Material,
  PrinterProfile, ResinPrinterSpec, ResinPrintParams, Tech, Translate,
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

export interface PlateLayout {
  /** Tabla başına sığan parça */
  capacity: number
  cols: number
  rows: number
  /** Parça 90° döndürülerek yerleştirildi mi (X/Y takas) */
  rotated: boolean
  /** Hücre boyutu (döndürme sonrası), mm */
  cellX: number
  cellY: number
  spacing: number
  margin: number
}

/**
 * Tabla yerleşimi: bounding box ızgara + boşluk + kenar payı; 90° döndürülmüş varyant da denenir, çok olan seçilir.
 * Z'de istifleme yapılmaz. Model tablaya hiç sığmıyorsa capacity 0 döner.
 */
export function plateLayout(stats: MeshStats, printer: PrinterProfile, spacing: number, margin: number): PlateLayout {
  const ux = printer.bed.x - 2 * margin
  const uy = printer.bed.y - 2 * margin
  const grid = (px: number, py: number) => {
    if (px <= 0 || py <= 0 || stats.size.z > printer.bed.z + 0.01) return { cols: 0, rows: 0 }
    return { cols: Math.max(0, Math.floor((ux + spacing) / (px + spacing))), rows: Math.max(0, Math.floor((uy + spacing) / (py + spacing))) }
  }
  const a = grid(stats.size.x, stats.size.y)
  const b = grid(stats.size.y, stats.size.x)
  const rotated = b.cols * b.rows > a.cols * a.rows
  const g = rotated ? b : a
  return {
    capacity: g.cols * g.rows, cols: g.cols, rows: g.rows, rotated,
    cellX: rotated ? stats.size.y : stats.size.x, cellY: rotated ? stats.size.x : stats.size.y,
    spacing, margin,
  }
}

export function plateCapacity(stats: MeshStats, printer: PrinterProfile, spacing: number, margin: number): number {
  return plateLayout(stats, printer, spacing, margin).capacity
}

/** Reçinede büyük taban alanlı parçalar (>40 cm²) için aralık en az 15 mm */
export function resinSpacing(stats: MeshStats, base: number): number {
  return stats.size.x * stats.size.y > 4000 ? Math.max(base, 15) : base
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

export function estimateFdm(input: CommonInput & { params: FdmPrintParams }, t: Translate): Estimate {
  const { stats, printer, material, settings, params } = input
  const qp = (n: number) => (n > 1 ? t('cost.detail.qtyPrefix', { qty: n }) : '')
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
  // Renk değişimleri tabla başına: her katmanda yapılır, parça sayısından bağımsız.
  // Çift nozulda katman başına ilk geçiş nozul değişimidir (flush yok); kalan geçişler AMS flush.
  const changesPerLayer = params.colorCount > 1 ? params.colorChangesPerLayer * (params.colorCount - 1) : 0
  const switchPerLayer = spec.dualNozzle && params.colorCount > 1 ? Math.min(changesPerLayer, params.colorChangesPerLayer) : 0
  const nozzleSwitches = Math.round(layerCount * switchPerLayer)
  const colorChangesPlate = Math.round(layerCount * (changesPerLayer - switchPerLayer))

  /** k parçalı bir tablanın süresi (sn) */
  const plateTime = (k: number) => {
    let extrude = 0
    for (let i = 0; i < L.layerCount; i++) {
      // Aynı katmanda k parça: soğutma tabanı katman toplamına uygulanır (küçük parçalar partide daha verimli)
      extrude += Math.max(layerExtrude[i] * k, minLayer)
    }
    // Parçalar arası travel: ≤3 parçada ihmal, 10+ parçada baskı süresinin ~%2–5'i
    const travelFactor = k > 3 ? Math.min(0.05, 0.006 * (k - 3)) : 0
    const t = (extrude + k * supportTimePart) * (1 + travelFactor) + layerCount * spec.layerChangeSec
      + colorChangesPlate * spec.colorChangeTimeSec + nozzleSwitches * spec.nozzleSwitchTimeSec
    return spec.jobOverheadSec + t * settings.timeMultiplier
  }
  const plateWasteGrams = spec.jobWasteGrams + colorChangesPlate * spec.colorChangeWasteGrams + nozzleSwitches * spec.nozzleSwitchWasteGrams
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
  lines.push({ key: 'material', label: t('cost.lines.material_fdm'), amount: partGrams * qty * price, detail: t('cost.detail.materialFdm', { qp: qp(qty), g: partGrams.toFixed(1), mat: material.name }) })
  if (partSupportGrams > 0) lines.push({ key: 'support', label: t('cost.lines.support_fdm'), amount: partSupportGrams * qty * price, detail: t('cost.detail.support', { qp: qp(qty), g: partSupportGrams.toFixed(1) }) })
  lines.push({ key: 'waste', label: t('cost.lines.waste_fdm'), amount: totalWaste * price, detail: t('cost.detail.wasteBase', { g: totalWaste.toFixed(1), plates }) + (colorChangesPlate ? t('cost.detail.wasteAms', { n: colorChangesPlate }) : '') + (nozzleSwitches ? t('cost.detail.wasteNozzle', { n: nozzleSwitches }) : '') })
  lines.push({ key: 'energy', label: t('cost.lines.energy'), amount: totalEnergy * settings.electricityTRYPerKWh, detail: t('cost.detail.energy', { kwh: totalEnergy.toFixed(2) }) })
  const hours = totalTime / 3600
  lines.push({ key: 'machine', label: t('cost.lines.machine'), amount: hours * (printer.priceTRY / printer.lifetimeHours), detail: t('cost.detail.machineFdm', { h: hours.toFixed(2), rate: (printer.priceTRY / printer.lifetimeHours).toFixed(2) }) })
  lines.push({ key: 'maintenance', label: t('cost.lines.maintenance_fdm'), amount: hours * printer.maintenanceTRYPerHour })
  const laborMin = plates * settings.fdmSetupMinutes + qty * settings.fdmPerPartMinutes
  lines.push({ key: 'labor', label: t('cost.lines.labor_fdm'), amount: (laborMin / 60) * settings.laborTRYPerHour, detail: t('cost.detail.laborFdm', { plates, min: settings.fdmSetupMinutes, qty, min2: settings.fdmPerPartMinutes }) })

  return finalize({
    t,
    tech: 'fdm', stats, printer, settings, lines, warnings, qty, partsPerPlate, plates,
    single: { printTimeSec: singleTime, materialGrams: partGrams + partSupportGrams + plateWasteGrams },
    plateTimeSec: fullPlateTime,
    totals: { materialGrams: (partGrams + partSupportGrams) * qty + totalWaste, supportGrams: partSupportGrams * qty, wasteGrams: totalWaste, printTimeSec: totalTime, energyKWh: totalEnergy },
    materialVolumeMm3: modelVolume + supportVolume, layerCount,
    breakdown: { wallVolume, skinVolume, infillVolume, supportVolume, modelVolume, colorChanges: colorChangesPlate, nozzleSwitches },
  })
}

/* ---------------------------------------------------------------- Resin */

export function estimateResin(input: CommonInput & { params: ResinPrintParams }, t: Translate): Estimate {
  const { stats, printer, material, settings, params } = input
  const qp = (n: number) => (n > 1 ? t('cost.detail.qtyPrefix', { qty: n }) : '')
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
  const footprint = stats.size.x * stats.size.y
  const spacing = resinSpacing(stats, settings.resinPartSpacingMm)
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
  lines.push({ key: 'material', label: t('cost.lines.material_resin'), amount: partGrams * qty * price, detail: t('cost.detail.materialResin', { qp: qp(qty), g: partGrams.toFixed(1), mat: material.name, hollow: hollowSaved > 0 ? t('cost.detail.materialResinHollow', { n: gramsFromMm3(hollowSaved, material.density).toFixed(0) }) : '' }) })
  if (partSupportGrams > 0) lines.push({ key: 'support', label: t('cost.lines.support_resin'), amount: partSupportGrams * qty * price, detail: t('cost.detail.support', { qp: qp(qty), g: partSupportGrams.toFixed(1) }) })
  lines.push({ key: 'waste', label: t('cost.lines.waste_resin'), amount: partWasteGrams * qty * price, detail: t('cost.detail.wasteResin', { g: (partWasteGrams * qty).toFixed(1) }) })
  const ipaLiters = qty * (settings.ipaLitersPerPrintBase + (stats.surfaceArea / 100000) * 0.05)
  lines.push({ key: 'ipa', label: t('cost.lines.ipa'), amount: ipaLiters * settings.ipaTRYPerLiter, detail: t('cost.detail.ipa', { ml: (ipaLiters * 1000).toFixed(0) }) })
  lines.push({ key: 'energy', label: t('cost.lines.energy'), amount: totalEnergy * settings.electricityTRYPerKWh, detail: t('cost.detail.energy', { kwh: totalEnergy.toFixed(2) }) })
  const hours = totalTime / 3600
  lines.push({ key: 'machine', label: t('cost.lines.machine'), amount: hours * (printer.priceTRY / printer.lifetimeHours), detail: t('cost.detail.machineResin', { h: hours.toFixed(2), plates }) })
  lines.push({ key: 'maintenance', label: t('cost.lines.maintenance_resin'), amount: hours * printer.maintenanceTRYPerHour })
  const laborMin = plates * (settings.resinSetupMinutes + settings.resinPostMinutes) + qty * settings.resinPerPartMinutes
  lines.push({ key: 'labor', label: t('cost.lines.labor_resin'), amount: (laborMin / 60) * settings.laborTRYPerHour, detail: t('cost.detail.laborResin', { plates, min: settings.resinSetupMinutes + settings.resinPostMinutes, qty, min2: settings.resinPerPartMinutes }) })

  if (stats.layers.maxArea > 0.5 * plateArea) {
    warnings.push(t('cost.warn.bigArea'))
  }

  return finalize({
    t,
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
  t: Translate
  tech: Tech; stats: MeshStats; printer: PrinterProfile; settings: BusinessSettings
  lines: CostLine[]; warnings: string[]; qty: number; partsPerPlate: number; plates: number
  single: { printTimeSec: number; materialGrams: number }; plateTimeSec: number
  totals: Omit<EstimateTotals, 'cost' | 'price' | 'priceWithVat'>
  materialVolumeMm3: number; layerCount: number; breakdown: Record<string, number>
}): Estimate {
  const { t, settings, stats, printer, qty } = a
  const lines = [...a.lines]
  const direct = lines.reduce((s, l) => s + l.amount, 0)
  const fr = a.tech === 'resin' ? settings.resinFailureRate : settings.failureRate
  if (fr > 0) {
    lines.push({ key: 'failure', label: t('cost.lines.failure'), amount: direct * (fr / (1 - fr)), detail: t('cost.detail.failure', { pct: (fr * 100).toFixed(0) }) })
  }
  if (settings.packagingTRY > 0) lines.push({ key: 'packaging', label: t('cost.lines.packaging'), amount: settings.packagingTRY * qty, detail: qty > 1 ? t('cost.detail.packaging', { qty, try: settings.packagingTRY }) : undefined })
  const cost = lines.reduce((s, l) => s + l.amount, 0)
  let price = cost * (1 + settings.markup)
  if (price < settings.minimumPriceTRY) price = settings.minimumPriceTRY
  const priceWithVat = price * (1 + settings.vat)

  const fit = checkFit(stats, printer)
  const warnings = [...a.warnings]
  if (!fit.fits && fit.fitsRotated) warnings.push(t('cost.warn.rotatedFit'))
  if (fit.fitsRotated && qty > a.partsPerPlate) warnings.push(t('cost.warn.multiPlate', { qty, n: a.partsPerPlate, p: a.plates }))
  if (!fit.fitsRotated) warnings.push(t('cost.warn.noFit', { x: stats.size.x.toFixed(0), y: stats.size.y.toFixed(0), z: stats.size.z.toFixed(0), bx: printer.bed.x, by: printer.bed.y, bz: printer.bed.z }))
  if (stats.manifold.checked && !stats.manifold.isClosed) warnings.push(t('cost.warn.notClosed', { o: stats.manifold.openEdges, nm: stats.manifold.nonManifoldEdges }))
  if (stats.invertedWinding) warnings.push(t('cost.warn.inverted'))
  if (stats.layers.coarsened) warnings.push(t('cost.warn.coarsened'))

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

export function formatDuration(sec: number, t: Translate): string {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  if (h === 0) return t('duration.min', { m })
  if (h >= 48) return t('duration.day', { n: (sec / 86400).toFixed(1) })
  return t('duration.hm', { h, m })
}

export const fmtTRY = (n: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 }).format(n)
