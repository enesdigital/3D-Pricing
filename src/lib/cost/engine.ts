import type { MeshStats } from '../mesh/types.ts'
import type { CalibrationFactors, SlicerOverride } from '../slicer/types.ts'
import type {
  BusinessSettings, CostLine, Estimate, EstimateTotals, FdmPrinterSpec, FdmPrintParams, Material,
  PrinterProfile, ResinPrinterSpec, ResinPrintParams, Tech, Translate,
} from './types.ts'

const MM3_PER_CM3 = 1000
/** Adet üst sınırı (giriş ve motor) */
export const MAX_QUANTITY = 10000
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Saatlik amortisman; ömür 0/negatif/NaN ise 1 saat kabul edilir (Infinity engellenir) */
export const machineRate = (p: PrinterProfile) => (Number.isFinite(p.priceTRY) ? Math.max(0, p.priceTRY) : 0) / Math.max(1, Number.isFinite(p.lifetimeHours) ? p.lifetimeHours : 1)

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
  /** Yalnızca kenar payı ihlal edilerek sığıyor */
  marginViolated: boolean
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
  let rotated = b.cols * b.rows > a.cols * a.rows
  let g = rotated ? b : a
  let marginViolated = false
  if (g.cols * g.rows === 0) {
    // Kenar payı olmadan (tabla kenarına dayalı) tek parça sığıyorsa kapasite 1 kabul edilir, uyarı verilir
    const fit = checkFit(stats, printer)
    if (fit.fitsRotated) {
      rotated = !fit.fits
      g = { cols: 1, rows: 1 }
      marginViolated = true
    }
  }
  return {
    capacity: g.cols * g.rows, cols: g.cols, rows: g.rows, rotated,
    cellX: rotated ? stats.size.y : stats.size.x, cellY: rotated ? stats.size.x : stats.size.y,
    spacing, margin, marginViolated,
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
/** Adet → tabla dağılımı: dolu tablalar aynıdır, tek tek listelemek yerine sayı+kalan tutulur. */
function planPlates(quantity: number, partsPerPlate: number): { plates: number; cap: number; full: number; rest: number } {
  const cap = Math.max(1, partsPerPlate)
  const q = Math.min(MAX_QUANTITY, Math.max(1, Math.floor(Number.isFinite(quantity) ? quantity : 1)))
  const full = Math.floor(q / cap)
  const rest = q - full * cap
  return { plates: full + (rest > 0 ? 1 : 0), cap, full, rest }
}
/** Tabla başına f(k) fonksiyonunu tüm tablalar üzerinde toplar (dolu tablalar bir kez hesaplanır). */
function sumPlates(plan: { cap: number; full: number; rest: number }, f: (k: number) => number): number {
  return (plan.full > 0 ? plan.full * f(plan.cap) : 0) + (plan.rest > 0 ? f(plan.rest) : 0)
}

export interface CommonInput {
  stats: MeshStats
  printer: PrinterProfile
  material: Material
  settings: BusinessSettings
  /** Dilimleyici çıktısından parça başına gerçek süre/gram (varsa model tahmininin yerine geçer) */
  slicer?: SlicerOverride | null
  /** Kalibrasyon kayıtlarından türetilen düzeltme katsayıları (dilimleyici verisi yoksa uygulanır) */
  calibration?: CalibrationFactors | null
  /** Duvar kalınlığı analizi özeti (ince yüzey oranı, eşik, 5. yüzdelik) */
  thinness?: { fraction: number; thresholdMm: number; p5: number } | null
}

/* ------------------------------------------------------------------ FDM */

/** Tek parçanın FDM üretim modeli: katman başına ekstrüzyon süresi, gram, destek. Tabla süresi bundan türetilir. */
export interface FdmPartModel {
  /** Parçanın dilim katmanı başına tek kopya ekstrüzyon süresi (sn), min. katman süresi uygulanmadan */
  layerExtrude: Float64Array
  /** Dilim katman kalınlığı (kabalaştırılmış olabilir) */
  lh: number
  /** Parametre katman kalınlığında katman sayısı */
  layerCount: number
  supportTimeSec: number
  partGrams: number
  supportGrams: number
  /** Dilimleyici verisi: parça başına süre (iş başlangıcı hariç), sn; yoksa null */
  slicerPerPartSec: number | null
  basis: Estimate['basis']
  footprint: number
  modelVolume: number
  supportVolume: number
  wallVolume: number
  skinVolume: number
  infillVolume: number
}

export interface FdmPlateContext {
  printer: PrinterProfile
  material: Material
  params: FdmPrintParams
  settings: BusinessSettings
  calibration?: CalibrationFactors | null
}

const fdmLayerH = (params: FdmPrintParams) => Math.max(0.01, Number.isFinite(params.layerHeight) ? params.layerHeight : 0.2)

export function fdmPartModel(input: CommonInput & { params: FdmPrintParams }): FdmPartModel {
  const { stats, printer, material, params } = input
  const spec = printer.spec as FdmPrinterSpec
  const L = stats.layers
  const layerH = fdmLayerH(params)
  const layerCount = Math.max(1, Math.ceil(stats.size.z / layerH - 1e-6))

  // --- Malzeme (tek parça): kabuk + dolgu ---
  const wallThickness = params.wallLoops * params.lineWidth
  let wallVolume = 0
  for (let i = 0; i < L.layerCount; i++) {
    wallVolume += Math.min(L.perimeter[i] * wallThickness, L.area[i]) * L.layerHeight
  }
  const skinThickness = params.topBottomLayers * layerH
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
    supportVolume = stats.supportColumnVolume * params.supportDensity + stats.overhangProjectedArea * 2 * layerH
    supportVolume = Math.min(supportVolume, stats.size.x * stats.size.y * stats.size.z * 0.5)
  }
  const useSlicer = !!(input.slicer && input.slicer.partTimeSec > 0 && input.slicer.partGrams > 0)
  const calib = !useSlicer && input.calibration && input.calibration.samples > 0 ? input.calibration : null
  // Dilimleyici gramı destek ve purge'ü içerir → destek 0, model = dosya değeri; aksi halde model tahmini × kalibrasyon
  const partGrams = useSlicer ? input.slicer!.partGrams : gramsFromMm3(modelVolume, material.density) * (calib?.gramsFactor ?? 1)
  const supportGrams = useSlicer ? 0 : gramsFromMm3(supportVolume, material.density) * (calib?.gramsFactor ?? 1)

  // --- Efektif akış ---
  const qMax = Math.min(material.maxFlow, spec.maxFlow)
  const sv = stats.surfaceArea / Math.max(1, volume)
  const kGeom = clamp(0.25 + 0.35 * (1 - Math.min(1, sv / 1.5)), 0.2, 0.65) * spec.efficiencyScale
  const qBulk = Math.max(0.5, qMax * kGeom)
  const qWall = Math.max(0.3, Math.min(qBulk, Math.max(0.1, params.lineWidth) * layerH * Math.max(1, spec.outerWallSpeed) * 0.6))
  const shellScale = shell > 0 ? Math.min(1, volume / (wallVolume + skinVolume || 1)) : 1
  const wallPerLayerFactor = wallThickness * shellScale
  const bulkShare = (skinVolume + infillVolume) / Math.max(1e-9, modelVolume)
  const lh = L.layerHeight
  const layerExtrude = new Float64Array(L.layerCount)
  for (let i = 0; i < L.layerCount; i++) {
    const wallV = Math.min(L.perimeter[i] * wallPerLayerFactor, L.area[i]) * lh
    const bulkV = Math.max(0, L.area[i] * lh - wallV) * bulkShare
    layerExtrude[i] = wallV / qWall + bulkV / qBulk
  }
  return {
    layerExtrude, lh, layerCount, supportTimeSec: supportVolume / qBulk, partGrams, supportGrams,
    slicerPerPartSec: useSlicer ? Math.max(0, input.slicer!.partTimeSec - spec.jobOverheadSec) : null,
    basis: useSlicer ? 'slicer' : calib ? 'calibrated' : 'model',
    footprint: stats.size.x * stats.size.y, modelVolume, supportVolume, wallVolume, skinVolume, infillVolume,
  }
}

/** Tabla başına renk değişimi / nozul değişimi sayıları (katman sayısına göre) */
export function fdmColorEvents(spec: FdmPrinterSpec, params: FdmPrintParams, layerCount: number): { colorChanges: number; nozzleSwitches: number } {
  // Renk değişimleri tabla başına: her katmanda yapılır, parça sayısından bağımsız.
  // Çift nozulda katman başına ilk geçiş nozul değişimidir (flush yok); kalan geçişler AMS flush.
  const changesPerLayer = params.colorCount > 1 ? params.colorChangesPerLayer * (params.colorCount - 1) : 0
  const switchPerLayer = spec.dualNozzle && params.colorCount > 1 ? Math.min(changesPerLayer, params.colorChangesPerLayer) : 0
  const nozzleSwitches = Math.round(layerCount * switchPerLayer)
  const colorChanges = Math.round(layerCount * (changesPerLayer - switchPerLayer))
  return { colorChanges, nozzleSwitches }
}

/**
 * Karışık bir tablanın süresi (sn): her parçadan k kopya. Katman başına ekstrüzyon toplanır; soğutma tabanı
 * (min. katman süresi) katman toplamına uygulanır (küçük parçalar partide daha verimli). Parametre katman
 * kalınlığı ızgarasına yeniden örneklenir; kabalaştırılmış dilimler doğrusal ölçeklenir.
 */
export function fdmPlateTime(parts: { m: FdmPartModel; k: number }[], ctx: FdmPlateContext): number {
  const spec = ctx.printer.spec as FdmPrinterSpec
  const layerH = fdmLayerH(ctx.params)
  const calib = ctx.calibration && ctx.calibration.samples > 0 ? ctx.calibration : null
  const K = parts.reduce((s, p) => s + p.k, 0)
  // Parçalar arası travel: ≤3 parçada ihmal, 10+ parçada baskı süresinin ~%2–5'i
  const travelFactor = K > 3 ? Math.min(0.05, 0.006 * (K - 3)) : 0
  const modelParts = parts.filter((p) => p.m.slicerPerPartSec == null && p.k > 0)
  const slicerT = parts.filter((p) => p.m.slicerPerPartSec != null).reduce((s, p) => s + p.m.slicerPerPartSec! * p.k, 0)
  let t = 0
  if (modelParts.length > 0) {
    const layerCount = Math.max(...modelParts.map((p) => p.m.layerCount))
    const minLayer = Math.max(0, ctx.material.minLayerTime)
    let extrude = 0
    if (modelParts.length === 1 && Math.abs(modelParts[0].m.lh - layerH) < 1e-9) {
      // Hızlı yol: tek parça, dilim ızgarası = parametre ızgarası
      const { m, k } = modelParts[0]
      for (let i = 0; i < m.layerExtrude.length; i++) extrude += Math.max(m.layerExtrude[i] * k, minLayer)
    } else {
      const fine = Math.max(...modelParts.map((p) => Math.ceil(p.m.layerExtrude.length * p.m.lh / layerH - 1e-6)))
      for (let j = 0; j < fine; j++) {
        let e = 0
        for (const { m, k } of modelParts) {
          const idx = Math.floor((j * layerH) / m.lh + 1e-9)
          if (idx < m.layerExtrude.length) e += m.layerExtrude[idx] * (layerH / m.lh) * k
        }
        if (e > 0) extrude += Math.max(e, minLayer)
      }
    }
    const support = modelParts.reduce((s, p) => s + p.k * p.m.supportTimeSec, 0)
    const ev = fdmColorEvents(spec, ctx.params, layerCount)
    t = (extrude + support) * (1 + travelFactor) + layerCount * spec.layerChangeSec
      + ev.colorChanges * spec.colorChangeTimeSec + ev.nozzleSwitches * (spec.nozzleSwitchTimeSec ?? 0)
  }
  return spec.jobOverheadSec + t * ctx.settings.timeMultiplier * (calib?.timeFactor ?? 1) + slicerT * (1 + travelFactor)
}

/** Tabla başına sabit israf (purge hattı + renk/nozul değişimleri), g */
export function fdmPlateWaste(spec: FdmPrinterSpec, params: FdmPrintParams, layerCount: number): number {
  const ev = fdmColorEvents(spec, params, layerCount)
  return spec.jobWasteGrams + ev.colorChanges * spec.colorChangeWasteGrams + ev.nozzleSwitches * (spec.nozzleSwitchWasteGrams ?? 0)
}

export function fdmPlateEnergyKWh(spec: FdmPrinterSpec, material: Material, plateSec: number): number {
  return ((plateSec - spec.jobOverheadSec) / 3600 * spec.avgPowerW * material.powerFactor + (spec.jobOverheadSec / 3600) * spec.heatupPowerW) / 1000
}

export function estimateFdm(input: CommonInput & { params: FdmPrintParams }, t: Translate): Estimate {
  const { stats, printer, material, settings, params } = input
  const qp = (n: number) => (n > 1 ? t('cost.detail.qtyPrefix', { qty: n }) : '')
  const spec = printer.spec as FdmPrinterSpec
  const warnings: string[] = []
  const qty = Math.min(MAX_QUANTITY, Math.max(1, Math.floor(Number.isFinite(settings.quantity) ? settings.quantity : 1)))
  const m = fdmPartModel(input)
  const { layerCount, partGrams, supportGrams: partSupportGrams, modelVolume, supportVolume, wallVolume, skinVolume, infillVolume } = m
  const ctx: FdmPlateContext = { printer, material, params, settings, calibration: input.calibration }
  const plateTime = (k: number) => fdmPlateTime([{ m, k }], ctx)
  const ev = fdmColorEvents(spec, params, layerCount)
  const colorChangesPlate = ev.colorChanges, nozzleSwitches = ev.nozzleSwitches
  const plateWasteGrams = fdmPlateWaste(spec, params, layerCount)
  const plateEnergyKWh = (sec: number) => fdmPlateEnergyKWh(spec, material, sec)

  // --- Tabla planı ---
  const layoutInfo = plateLayout(stats, printer, settings.fdmPartSpacingMm, settings.plateMarginMm)
  const partsPerPlate = layoutInfo.capacity
  const plan = planPlates(qty, partsPerPlate)
  const plates = plan.plates
  const totalTime = sumPlates(plan, plateTime)
  const totalEnergy = sumPlates(plan, (k) => plateEnergyKWh(plateTime(k)))
  const totalWaste = plates * plateWasteGrams
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
  lines.push({ key: 'machine', label: t('cost.lines.machine'), amount: hours * machineRate(printer), detail: t('cost.detail.machineFdm', { h: hours.toFixed(2), rate: machineRate(printer).toFixed(2) }) })
  lines.push({ key: 'maintenance', label: t('cost.lines.maintenance_fdm'), amount: hours * printer.maintenanceTRYPerHour })
  const laborMin = plates * settings.fdmSetupMinutes + qty * settings.fdmPerPartMinutes
  lines.push({ key: 'labor', label: t('cost.lines.labor_fdm'), amount: (laborMin / 60) * settings.laborTRYPerHour, detail: t('cost.detail.laborFdm', { plates, min: settings.fdmSetupMinutes, qty, min2: settings.fdmPerPartMinutes }) })

  return finalize({
    t,
    basis: m.basis,
    tech: 'fdm', stats, printer, settings, lines, warnings, qty, partsPerPlate, plates, marginViolated: layoutInfo.marginViolated, thinness: input.thinness,
    single: { printTimeSec: singleTime, materialGrams: partGrams + partSupportGrams + plateWasteGrams },
    plateTimeSec: fullPlateTime,
    totals: { materialGrams: (partGrams + partSupportGrams) * qty + totalWaste, supportGrams: partSupportGrams * qty, wasteGrams: totalWaste, printTimeSec: totalTime, energyKWh: totalEnergy },
    materialVolumeMm3: modelVolume + supportVolume, layerCount,
    breakdown: { wallVolume, skinVolume, infillVolume, supportVolume, modelVolume, colorChanges: colorChangesPlate, nozzleSwitches },
  })
}

/* ---------------------------------------------------------------- Resin */

/** Reçine tabla süresi: katman sayısına bağlı, parça sayısından bağımsız.
 *  Statik ayırmalı makinelerde kaplama arttıkça rest/lift yavaşlatması: ×(1 + ceza × kaplama), üst sınır +%30. */
export function resinPlateTime(plate: { layerCount: number; fill: number }, ctx: { printer: PrinterProfile; params: ResinPrintParams; settings: BusinessSettings; calibration?: CalibrationFactors | null }): number {
  const spec = ctx.printer.spec as ResinPrinterSpec
  const { params, settings } = ctx
  const calib = ctx.calibration && ctx.calibration.samples > 0 ? ctx.calibration : null
  const penalty = spec.tiltRelease ? 0 : Math.min(0.3, settings.resinLiftAreaPenalty * Math.min(1, Math.max(0, plate.fill)))
  const bottom = Math.min(params.bottomLayers, plate.layerCount)
  const normal = plate.layerCount - bottom
  const layersTime = bottom * (params.bottomExposureSec + params.liftCycleSec) + normal * (params.exposureSec + params.liftCycleSec)
  return 60 + layersTime * (1 + penalty) * settings.timeMultiplier * (calib?.timeFactor ?? 1)
}
export function resinPlateEnergyKWh(spec: ResinPrinterSpec, settings: BusinessSettings, plateSec: number): number {
  return ((plateSec / 3600) * spec.avgPowerW + (settings.resinPostMinutes / 60) * spec.postPowerW) / 1000
}

export function estimateResin(input: CommonInput & { params: ResinPrintParams }, t: Translate): Estimate {
  const { stats, printer, material, settings, params } = input
  const qp = (n: number) => (n > 1 ? t('cost.detail.qtyPrefix', { qty: n }) : '')
  const spec = printer.spec as ResinPrinterSpec
  const warnings: string[] = []
  const qty = Math.min(MAX_QUANTITY, Math.max(1, Math.floor(Number.isFinite(settings.quantity) ? settings.quantity : 1)))
  const layerH = Math.max(0.01, Number.isFinite(params.layerHeight) ? params.layerHeight : 0.05)
  const layerCount = Math.max(1, Math.ceil(stats.size.z / layerH - 1e-6))
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
  const calib = input.calibration && input.calibration.samples > 0 ? input.calibration : null
  const partGrams = gramsFromMm3(modelVolume, material.density) * (calib?.gramsFactor ?? 1)
  const partSupportGrams = gramsFromMm3(supportVolume, material.density) * (calib?.gramsFactor ?? 1)
  const partWasteGrams = (partGrams + partSupportGrams) * wasteRatio

  // --- Tabla planı ---
  const footprint = stats.size.x * stats.size.y
  const spacing = resinSpacing(stats, settings.resinPartSpacingMm)
  const layoutInfo = plateLayout(stats, printer, spacing, settings.plateMarginMm)
  const partsPerPlate = layoutInfo.capacity
  const plan = planPlates(qty, partsPerPlate)
  const plates = plan.plates
  const plateArea = printer.bed.x * printer.bed.y

  const plateTime = (k: number) => resinPlateTime({ layerCount, fill: Math.min(1, (k * footprint) / plateArea) }, { printer, params, settings, calibration: input.calibration })
  const totalTime = sumPlates(plan, plateTime)
  const totalEnergy = sumPlates(plan, (k) => resinPlateEnergyKWh(spec, settings, plateTime(k)))
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
  lines.push({ key: 'machine', label: t('cost.lines.machine'), amount: hours * machineRate(printer), detail: t('cost.detail.machineResin', { h: hours.toFixed(2), plates }) })
  lines.push({ key: 'maintenance', label: t('cost.lines.maintenance_resin'), amount: hours * printer.maintenanceTRYPerHour })
  const laborMin = plates * (settings.resinSetupMinutes + settings.resinPostMinutes) + qty * settings.resinPerPartMinutes
  lines.push({ key: 'labor', label: t('cost.lines.labor_resin'), amount: (laborMin / 60) * settings.laborTRYPerHour, detail: t('cost.detail.laborResin', { plates, min: settings.resinSetupMinutes + settings.resinPostMinutes, qty, min2: settings.resinPerPartMinutes }) })

  if (stats.layers.maxArea > 0.5 * plateArea) {
    warnings.push(t('cost.warn.bigArea'))
  }

  return finalize({
    t,
    basis: calib ? 'calibrated' : 'model',
    tech: 'resin', stats, printer, settings, lines, warnings, qty, partsPerPlate, plates, marginViolated: layoutInfo.marginViolated, thinness: input.thinness,
    single: { printTimeSec: singleTime, materialGrams: partGrams + partSupportGrams + partWasteGrams },
    plateTimeSec: fullPlateTime,
    totals: { materialGrams: (partGrams + partSupportGrams + partWasteGrams) * qty, supportGrams: partSupportGrams * qty, wasteGrams: partWasteGrams * qty, printTimeSec: totalTime, energyKWh: totalEnergy },
    materialVolumeMm3: modelVolume + supportVolume, layerCount,
    breakdown: { modelVolume, supportVolume, hollowSaved, wasteVolume: (modelVolume + supportVolume) * wasteRatio },
  })
}

/* ------------------------------------------------------------- ortak son */

/** Maliyet kalemlerinden fiyat: başarısızlık payı, ambalaj, kâr, kademeli indirim, minimum tutar, KDV, teslim süresi */
export function priceLines(a: { t: Translate; tech: Tech; settings: BusinessSettings; lines: CostLine[]; qty: number; printTimeSec: number }): {
  lines: CostLine[]; cost: number; price: number; priceWithVat: number; discountPct: number; leadDays: number
} {
  const { t, settings, qty } = a
  const lines = [...a.lines]
  const direct = lines.reduce((s, l) => s + l.amount, 0)
  const fr = a.tech === 'resin' ? settings.resinFailureRate : settings.failureRate
  if (fr > 0) {
    lines.push({ key: 'failure', label: t('cost.lines.failure'), amount: direct * (fr / (1 - fr)), detail: t('cost.detail.failure', { pct: (fr * 100).toFixed(0) }) })
  }
  if (settings.packagingTRY > 0) lines.push({ key: 'packaging', label: t('cost.lines.packaging'), amount: settings.packagingTRY * qty, detail: qty > 1 ? t('cost.detail.packaging', { qty, try: settings.packagingTRY }) : undefined })
  const cost = lines.reduce((s, l) => s + l.amount, 0)
  let price = cost * (1 + settings.markup)
  // Kademeli adet indirimi (en yüksek eşleşen kademe)
  const tier = (settings.discountTiers ?? []).filter((d) => qty >= d.minQty && d.pct > 0).sort((x, y) => y.minQty - x.minQty)[0]
  const discountPct = tier ? Math.min(0.9, tier.pct) : 0
  price *= 1 - discountPct
  if (price < settings.minimumPriceTRY) price = settings.minimumPriceTRY
  // Teslim süresi: toplam makine süresi ÷ (yazıcı × günlük saat) + 1 gün hazırlık/son işlem
  const capacityH = Math.max(1, settings.printerCount || 1) * Math.max(1, settings.workHoursPerDay || 20)
  const leadDays = Math.max(1, Math.ceil(a.printTimeSec / 3600 / capacityH) + 1)
  const priceWithVat = price * (1 + settings.vat)
  return { lines, cost, price, priceWithVat, discountPct, leadDays }
}

/** Geometriye bağlı uyarılar (sığma, kenar payı, manifold, DFM) */
export function geometryWarnings(a: { t: Translate; tech: Tech; stats: MeshStats; printer: PrinterProfile; settings: BusinessSettings; qty: number; partsPerPlate: number; plates: number; marginViolated: boolean; thinness?: { fraction: number; thresholdMm: number; p5: number } | null }): string[] {
  const { t, settings, stats, printer, qty } = a
  const fit = checkFit(stats, printer)
  const warnings: string[] = []
  if (!fit.fits && fit.fitsRotated) warnings.push(t('cost.warn.rotatedFit'))
  if (a.marginViolated) warnings.push(t('cost.warn.marginTight', { m: settings.plateMarginMm }))
  if (fit.fitsRotated && qty > a.partsPerPlate) warnings.push(t('cost.warn.multiPlate', { qty, n: a.partsPerPlate, p: a.plates }))
  if (!fit.fitsRotated) warnings.push(t('cost.warn.noFit', { x: stats.size.x.toFixed(0), y: stats.size.y.toFixed(0), z: stats.size.z.toFixed(0), bx: printer.bed.x, by: printer.bed.y, bz: printer.bed.z }))
  if (stats.manifold.checked && !stats.manifold.isClosed) warnings.push(t('cost.warn.notClosed', { o: stats.manifold.openEdges, nm: stats.manifold.nonManifoldEdges }))
  if (stats.invertedWinding) warnings.push(t('cost.warn.inverted'))
  // Basılabilirlik (DFM) uyarıları
  if (stats.manifold.checked && stats.manifold.components > 1) warnings.push(t('cost.warn.components', { n: stats.manifold.components }))
  if (stats.manifold.checked && stats.manifold.inconsistentEdges > 0) warnings.push(t('cost.warn.inconsistent', { n: stats.manifold.inconsistentEdges }))
  const maxDim = Math.max(stats.size.x, stats.size.y, stats.size.z)
  if (maxDim > 0 && maxDim < 5) warnings.push(t('cost.warn.unitSmall', { d: maxDim.toFixed(2) }))
  if (maxDim > 1500) warnings.push(t('cost.warn.unitLarge', { d: maxDim.toFixed(0) }))
  const footprintMin = Math.min(stats.size.x, stats.size.y)
  if (footprintMin > 0 && stats.size.z / footprintMin > 4 && stats.bedContactArea < 0.25 * stats.size.x * stats.size.y) warnings.push(t('cost.warn.tipOver', { r: (stats.size.z / footprintMin).toFixed(1) }))
  if (stats.bedContactArea < 1 && a.tech === 'fdm') warnings.push(t('cost.warn.noBedContact'))
  if (a.thinness && a.thinness.fraction >= 0.03) warnings.push(t('cost.warn.thinWalls', { pct: Math.round(a.thinness.fraction * 100), th: a.thinness.thresholdMm.toFixed(1), p5: a.thinness.p5.toFixed(2) }))
  if (stats.layers.coarsened) warnings.push(t('cost.warn.coarsened'))

  return warnings
}

function finalize(a: {
  t: Translate
  basis: Estimate['basis']
  tech: Tech; stats: MeshStats; printer: PrinterProfile; settings: BusinessSettings
  lines: CostLine[]; warnings: string[]; qty: number; partsPerPlate: number; plates: number; marginViolated: boolean
  thinness?: { fraction: number; thresholdMm: number; p5: number } | null
  single: { printTimeSec: number; materialGrams: number }; plateTimeSec: number
  totals: Omit<EstimateTotals, 'cost' | 'price' | 'priceWithVat'>
  materialVolumeMm3: number; layerCount: number; breakdown: Record<string, number>
}): Estimate {
  const { stats, printer, qty } = a
  const { lines, cost, price, priceWithVat, discountPct, leadDays } = priceLines({ t: a.t, tech: a.tech, settings: a.settings, lines: a.lines, qty, printTimeSec: a.totals.printTimeSec })
  const fit = checkFit(stats, printer)
  const warnings = [...a.warnings, ...geometryWarnings(a)]
  const total: EstimateTotals = { ...a.totals, cost, price, priceWithVat }
  const perUnit: EstimateTotals = {
    materialGrams: total.materialGrams / qty, supportGrams: total.supportGrams / qty, wasteGrams: total.wasteGrams / qty,
    printTimeSec: total.printTimeSec / qty, energyKWh: total.energyKWh / qty,
    cost: cost / qty, price: price / qty, priceWithVat: priceWithVat / qty,
  }
  return {
    tech: a.tech, basis: a.basis, quantity: qty, partsPerPlate: a.partsPerPlate, plates: a.plates,
    single: a.single, plateTimeSec: a.plateTimeSec, total, perUnit,
    materialVolumeMm3: a.materialVolumeMm3, layerCount: a.layerCount, discountPct, leadDays,
    lines, warnings, fits: fit.fits, fitsRotated: fit.fitsRotated, breakdown: a.breakdown,
  }
}

export function formatDuration(sec: number, t: Translate): string {
  const totalMin = Math.max(0, Math.round((Number.isFinite(sec) ? sec : 0) / 60))
  const h = Math.floor(totalMin / 60), m = totalMin % 60
  if (h === 0) return t('duration.min', { m })
  if (h >= 48) return t('duration.day', { n: (sec / 86400).toFixed(1) })
  return t('duration.hm', { h, m })
}

export function formatDurationCompact(sec: number, t: Translate): string {
  const totalMin = Math.max(0, Math.round((Number.isFinite(sec) ? sec : 0) / 60))
  const h = Math.floor(totalMin / 60), m = totalMin % 60
  return h ? t('duration.compactHM', { h, m }) : t('duration.compactMin', { m })
}

export const fmtTRY = (n: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 }).format(n)

type CurrencyOpts = Pick<BusinessSettings, 'displayCurrency' | 'fxRates'>
/** TRY tutarını gösterim para birimine çevirir (1 birim döviz = fxRates[cur] TRY) */
export function toDisplay(tryAmount: number, s: CurrencyOpts): number {
  if (!s.displayCurrency || s.displayCurrency === 'TRY') return tryAmount
  const rate = s.fxRates?.[s.displayCurrency]
  return rate && rate > 0 ? tryAmount / rate : tryAmount
}
export function fromDisplay(amount: number, s: CurrencyOpts): number {
  if (!s.displayCurrency || s.displayCurrency === 'TRY') return amount
  const rate = s.fxRates?.[s.displayCurrency]
  return rate && rate > 0 ? amount * rate : amount
}
/** TRY tutarını gösterim para biriminde biçimlendirir */
export function fmtMoney(tryAmount: number, s: CurrencyOpts, digits = 2): string {
  const cur = s.displayCurrency || 'TRY'
  return new Intl.NumberFormat(cur === 'TRY' ? 'tr-TR' : 'en-US', { style: 'currency', currency: cur, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(toDisplay(tryAmount, s))
}
export const currencySymbol = (cur: string) => (cur === 'EUR' ? '€' : cur === 'USD' ? '$' : '₺')
