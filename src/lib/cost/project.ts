import type { MeshStats } from '../mesh/types.ts'
import type { CalibrationFactors } from '../slicer/types.ts'
import type { BusinessSettings, CostLine, Estimate, EstimateTotals, FdmPrinterSpec, FdmPrintParams, Material, PrinterProfile, ResinPrinterSpec, ResinPrintParams, Translate } from './types.ts'
import {
  MAX_QUANTITY, checkFit, estimateFdm, estimateResin, fdmPartModel, fdmPlateEnergyKWh, fdmPlateTime, fdmPlateWaste, fdmColorEvents,
  geometryWarnings, gramsFromMm3, machineRate, priceLines, resinPlateEnergyKWh, resinPlateTime, resinSpacing, plateLayout,
} from './engine.ts'
import { packPlates, type PackedPlate } from './pack.ts'

export interface ProjectPart {
  id: string
  name: string
  stats: MeshStats
  quantity: number
}

export interface ProjectPartResult {
  id: string
  name: string
  quantity: number
  /** Adet başına malzeme (model + destek), g */
  gramsPerUnit: number
  /** Tek başına tek parça süresi, sn (referans) */
  singleTimeSec: number
  /** Bu parçaya düşen toplam maliyet ve fiyat (KDV hariç), TRY */
  cost: number
  price: number
  unitPrice: number
  fits: boolean
  fitsRotated: boolean
  /** Tablalara yerleştirilen kopya */
  placed: number
  layerCount: number
}

export interface PlatePlan {
  index: number
  items: PackedPlate['items']
  counts: Record<string, number>
  synthetic: boolean
  timeSec: number
  layerCount: number
  partCount: number
}

export interface ProjectEstimate extends Estimate {
  project: {
    parts: ProjectPartResult[]
    plates: PlatePlan[]
    unplaced: number
    margin: number
  }
}

export interface ProjectInput {
  parts: ProjectPart[]
  printer: PrinterProfile
  material: Material
  settings: BusinessSettings
  fdmParams: FdmPrintParams
  resinParams: ResinPrintParams
  calibration?: CalibrationFactors | null
}

const clampQty = (q: number) => Math.min(MAX_QUANTITY, Math.max(1, Math.floor(Number.isFinite(q) ? q : 1)))

/**
 * Çok parçalı proje tahmini: tüm parçalar aynı yazıcı/malzeme ile, karışık tablalara MaxRects ile yerleştirilir.
 * FDM'de tabla süresi katman katman toplanır (soğutma tabanı ortak), reçinede en yüksek parçanın katman sayısı belirler.
 * Fiyat parçalara tek başına maliyet ağırlığıyla dağıtılır.
 */
export function estimateProject(input: ProjectInput, t: Translate): ProjectEstimate {
  const { printer, material, settings } = input
  const parts = input.parts.map((p) => ({ ...p, quantity: clampQty(p.quantity) }))
  const tech = printer.tech
  const isFdm = tech === 'fdm'
  const warnings: string[] = []

  // Tek başına tahminler: fiyat dağıtım ağırlığı + parça uyarıları
  const standalone = new Map<string, Estimate>()
  for (const p of parts) {
    const s = { ...settings, quantity: p.quantity }
    standalone.set(p.id, isFdm
      ? estimateFdm({ stats: p.stats, printer, material, settings: s, params: input.fdmParams, calibration: input.calibration }, t)
      : estimateResin({ stats: p.stats, printer, material, settings: s, params: input.resinParams, calibration: input.calibration }, t))
  }

  // Paketleme
  const margin = settings.plateMarginMm
  const spacing = isFdm ? settings.fdmPartSpacingMm : Math.max(...parts.map((p) => resinSpacing(p.stats, settings.resinPartSpacingMm)))
  const packed = packPlates(parts.map((p) => ({ key: p.id, w: p.stats.size.x, h: p.stats.size.y, z: p.stats.size.z, count: p.quantity })), printer.bed, spacing, margin)
  const byId = new Map(parts.map((p) => [p.id, p]))
  const placedCount: Record<string, number> = {}
  for (const pl of packed.plates) for (const [k, n] of Object.entries(pl.counts)) placedCount[k] = (placedCount[k] ?? 0) + n
  const unplaced = Object.values(packed.unplaced).reduce((s, n) => s + n, 0)
  for (const [k, n] of Object.entries(packed.unplaced)) {
    const p = byId.get(k)!
    warnings.push(t('cost.warn.projectNoFit', { name: p.name, n, x: p.stats.size.x.toFixed(0), y: p.stats.size.y.toFixed(0), z: p.stats.size.z.toFixed(0) }))
  }
  if (packed.marginViolated) warnings.push(t('cost.warn.marginTight', { m: margin }))

  const placedQty = Object.values(placedCount).reduce((s, n) => s + n, 0)
  const qty = Math.max(1, placedQty)
  const price = material.pricePerKgTRY / 1000
  const lines: CostLine[] = []
  const plans: PlatePlan[] = []
  let totalTime = 0, totalEnergy = 0, totalWaste = 0, maxLayers = 0
  let partGramsTotal = 0, supportGramsTotal = 0
  const gramsPerUnit: Record<string, number> = {}
  const layerCounts: Record<string, number> = {}

  if (isFdm) {
    const spec = printer.spec as FdmPrinterSpec
    const models = new Map(parts.map((p) => [p.id, fdmPartModel({ stats: p.stats, printer, material, settings, params: input.fdmParams, calibration: input.calibration })]))
    const ctx = { printer, material, params: input.fdmParams, settings, calibration: input.calibration }
    for (const p of parts) { const m = models.get(p.id)!; gramsPerUnit[p.id] = m.partGrams + m.supportGrams; layerCounts[p.id] = m.layerCount; const n = placedCount[p.id] ?? 0; partGramsTotal += m.partGrams * n; supportGramsTotal += m.supportGrams * n }
    packed.plates.forEach((pl, i) => {
      const entries = Object.entries(pl.counts).map(([k, n]) => ({ m: models.get(k)!, k: n }))
      const layerCount = Math.max(...entries.map((e) => e.m.layerCount))
      const sec = fdmPlateTime(entries, ctx)
      const partCount = entries.reduce((s, e) => s + e.k, 0)
      totalTime += sec
      totalEnergy += fdmPlateEnergyKWh(spec, material, sec)
      totalWaste += fdmPlateWaste(spec, input.fdmParams, layerCount)
      maxLayers = Math.max(maxLayers, layerCount)
      plans.push({ index: i, items: pl.items, counts: pl.counts, synthetic: pl.synthetic, timeSec: sec, layerCount, partCount })
    })
    const ev = fdmColorEvents(spec, input.fdmParams, maxLayers)
    lines.push({ key: 'material', label: t('cost.lines.material_fdm'), amount: partGramsTotal * price, detail: t('cost.detail.materialProject', { n: parts.length, g: partGramsTotal.toFixed(0), mat: material.name }) })
    if (supportGramsTotal > 0) lines.push({ key: 'support', label: t('cost.lines.support_fdm'), amount: supportGramsTotal * price, detail: t('cost.detail.support', { qp: '', g: supportGramsTotal.toFixed(1) }) })
    lines.push({ key: 'waste', label: t('cost.lines.waste_fdm'), amount: totalWaste * price, detail: t('cost.detail.wasteBase', { g: totalWaste.toFixed(1), plates: plans.length }) + (ev.colorChanges ? t('cost.detail.wasteAms', { n: ev.colorChanges }) : '') })
    lines.push({ key: 'energy', label: t('cost.lines.energy'), amount: totalEnergy * settings.electricityTRYPerKWh, detail: t('cost.detail.energy', { kwh: totalEnergy.toFixed(2) }) })
    const hours = totalTime / 3600
    lines.push({ key: 'machine', label: t('cost.lines.machine'), amount: hours * machineRate(printer), detail: t('cost.detail.machineFdm', { h: hours.toFixed(2), rate: machineRate(printer).toFixed(2) }) })
    lines.push({ key: 'maintenance', label: t('cost.lines.maintenance_fdm'), amount: hours * printer.maintenanceTRYPerHour })
    const laborMin = plans.length * settings.fdmSetupMinutes + qty * settings.fdmPerPartMinutes
    lines.push({ key: 'labor', label: t('cost.lines.labor_fdm'), amount: (laborMin / 60) * settings.laborTRYPerHour, detail: t('cost.detail.laborFdm', { plates: plans.length, min: settings.fdmSetupMinutes, qty, min2: settings.fdmPerPartMinutes }) })
  } else {
    const spec = printer.spec as ResinPrinterSpec
    const rp = input.resinParams
    const layerH = Math.max(0.01, Number.isFinite(rp.layerHeight) ? rp.layerHeight : 0.05)
    const wasteRatio = 0.08
    const calib = input.calibration && input.calibration.samples > 0 ? input.calibration : null
    let wasteTotal = 0, surfaceTotal = 0
    const perPart = new Map<string, { grams: number; support: number; layers: number; footprint: number }>()
    for (const p of parts) {
      const st = p.stats
      let modelVolume = st.volume
      if (rp.hollow) { const shell = Math.min(st.volume, st.surfaceArea * rp.hollowWallMm); modelVolume = shell + (st.volume - shell) * rp.hollowResidualRatio }
      let supportVolume = 0
      const needsSupport = rp.supports === 'on' || (rp.supports === 'auto' && (st.overhangArea > 4 || st.bedContactArea < st.footprintArea * 0.5))
      if (needsSupport) {
        const pillars = st.supportColumnVolume * 0.04, raft = st.size.x * st.size.y * 0.35
        supportVolume = Math.min(Math.max(pillars + raft, st.volume * rp.supportRatio), st.volume * 0.6 + raft)
      }
      const grams = gramsFromMm3(modelVolume, material.density) * (calib?.gramsFactor ?? 1)
      const support = gramsFromMm3(supportVolume, material.density) * (calib?.gramsFactor ?? 1)
      const layers = Math.max(1, Math.ceil(st.size.z / layerH - 1e-6))
      perPart.set(p.id, { grams, support, layers, footprint: st.size.x * st.size.y })
      gramsPerUnit[p.id] = grams + support; layerCounts[p.id] = layers
      const n = placedCount[p.id] ?? 0
      partGramsTotal += grams * n; supportGramsTotal += support * n; wasteTotal += (grams + support) * wasteRatio * n
      surfaceTotal += (settings.ipaLitersPerPrintBase + (st.surfaceArea / 100000) * 0.05) * n
    }
    const plateArea = printer.bed.x * printer.bed.y
    packed.plates.forEach((pl, i) => {
      const entries = Object.entries(pl.counts).map(([k, n]) => ({ d: perPart.get(k)!, k: n }))
      const layerCount = Math.max(...entries.map((e) => e.d.layers))
      const fill = Math.min(1, entries.reduce((s, e) => s + e.k * e.d.footprint, 0) / plateArea)
      const sec = resinPlateTime({ layerCount, fill }, { printer, params: rp, settings, calibration: input.calibration })
      const partCount = entries.reduce((s, e) => s + e.k, 0)
      totalTime += sec
      totalEnergy += resinPlateEnergyKWh(spec, settings, sec)
      maxLayers = Math.max(maxLayers, layerCount)
      plans.push({ index: i, items: pl.items, counts: pl.counts, synthetic: pl.synthetic, timeSec: sec, layerCount, partCount })
    })
    totalWaste = wasteTotal
    lines.push({ key: 'material', label: t('cost.lines.material_resin'), amount: partGramsTotal * price, detail: t('cost.detail.materialProject', { n: parts.length, g: partGramsTotal.toFixed(0), mat: material.name }) })
    if (supportGramsTotal > 0) lines.push({ key: 'support', label: t('cost.lines.support_resin'), amount: supportGramsTotal * price, detail: t('cost.detail.support', { qp: '', g: supportGramsTotal.toFixed(1) }) })
    lines.push({ key: 'waste', label: t('cost.lines.waste_resin'), amount: wasteTotal * price, detail: t('cost.detail.wasteResin', { g: wasteTotal.toFixed(1) }) })
    lines.push({ key: 'ipa', label: t('cost.lines.ipa'), amount: surfaceTotal * settings.ipaTRYPerLiter, detail: t('cost.detail.ipa', { ml: (surfaceTotal * 1000).toFixed(0) }) })
    lines.push({ key: 'energy', label: t('cost.lines.energy'), amount: totalEnergy * settings.electricityTRYPerKWh, detail: t('cost.detail.energy', { kwh: totalEnergy.toFixed(2) }) })
    const hours = totalTime / 3600
    lines.push({ key: 'machine', label: t('cost.lines.machine'), amount: hours * machineRate(printer), detail: t('cost.detail.machineResin', { h: hours.toFixed(2), plates: plans.length }) })
    lines.push({ key: 'maintenance', label: t('cost.lines.maintenance_resin'), amount: hours * printer.maintenanceTRYPerHour })
    const laborMin = plans.length * (settings.resinSetupMinutes + settings.resinPostMinutes) + qty * settings.resinPerPartMinutes
    lines.push({ key: 'labor', label: t('cost.lines.labor_resin'), amount: (laborMin / 60) * settings.laborTRYPerHour, detail: t('cost.detail.laborResin', { plates: plans.length, min: settings.resinSetupMinutes + settings.resinPostMinutes, qty, min2: settings.resinPerPartMinutes }) })
  }

  const priced = priceLines({ t, tech, settings, lines, qty, printTimeSec: totalTime })

  // Parça başına dağıtım: tek başına maliyet ağırlığı
  const weights = parts.map((p) => ({ id: p.id, w: (placedCount[p.id] ?? 0) > 0 ? Math.max(1e-6, standalone.get(p.id)!.total.cost * ((placedCount[p.id] ?? 0) / p.quantity)) : 0 }))
  const wSum = weights.reduce((s, x) => s + x.w, 0) || 1
  const results: ProjectPartResult[] = parts.map((p) => {
    const st = standalone.get(p.id)!
    const w = weights.find((x) => x.id === p.id)!.w / wSum
    const placed = placedCount[p.id] ?? 0
    const fit = checkFit(p.stats, printer)
    return {
      id: p.id, name: p.name, quantity: p.quantity, gramsPerUnit: gramsPerUnit[p.id] ?? 0, singleTimeSec: st.single.printTimeSec,
      cost: priced.cost * w, price: priced.price * w, unitPrice: placed > 0 ? (priced.price * w) / placed : 0,
      fits: fit.fits, fitsRotated: fit.fitsRotated, placed, layerCount: layerCounts[p.id] ?? 0,
    }
  })

  // Parça uyarıları (geometri/DFM), parça adıyla; sığma/çoklu tabla uyarıları proje düzeyinde ele alındığı için atlanır
  const seen = new Set<string>()
  for (const p of parts) {
    const gw = geometryWarnings({ t, tech, stats: p.stats, printer, settings, qty: p.quantity, partsPerPlate: p.quantity, plates: 1, marginViolated: false })
    for (const w of gw) { const line = `${p.name}: ${w}`; if (!seen.has(line)) { seen.add(line); warnings.push(line) } }
  }
  if (plans.length > 1) warnings.push(t('cost.warn.projectPlates', { qty, p: plans.length }))

  const materialGrams = isFdm ? partGramsTotal + supportGramsTotal + totalWaste : partGramsTotal + supportGramsTotal + totalWaste
  const total: EstimateTotals = { materialGrams, supportGrams: supportGramsTotal, wasteGrams: totalWaste, printTimeSec: totalTime, energyKWh: totalEnergy, cost: priced.cost, price: priced.price, priceWithVat: priced.priceWithVat }
  const perUnit: EstimateTotals = {
    materialGrams: total.materialGrams / qty, supportGrams: total.supportGrams / qty, wasteGrams: total.wasteGrams / qty,
    printTimeSec: total.printTimeSec / qty, energyKWh: total.energyKWh / qty, cost: total.cost / qty, price: total.price / qty, priceWithVat: total.priceWithVat / qty,
  }
  const longest = plans.reduce((m, p) => Math.max(m, p.timeSec), 0)
  const allFit = results.every((r) => r.fitsRotated)
  const materialVolumeMm3 = parts.reduce((s, p) => s + (standalone.get(p.id)!.materialVolumeMm3 * (placedCount[p.id] ?? 0)), 0) / qty
  const breakdown: Record<string, number> = { plates: plans.length, unplaced }
  if (isFdm) {
    for (const p of parts) { const st = standalone.get(p.id)!; const n = placedCount[p.id] ?? 0; for (const k of ['wallVolume', 'skinVolume', 'infillVolume', 'supportVolume', 'modelVolume']) breakdown[k] = (breakdown[k] ?? 0) + (st.breakdown[k] ?? 0) * n / qty }
    const ev = fdmColorEvents(printer.spec as FdmPrinterSpec, input.fdmParams, maxLayers)
    breakdown.colorChanges = ev.colorChanges; breakdown.nozzleSwitches = ev.nozzleSwitches
  }
  const calibrated = !!(input.calibration && input.calibration.samples > 0)
  return {
    tech, basis: calibrated ? 'calibrated' : 'model', quantity: qty, partsPerPlate: plans.length ? Math.ceil(qty / plans.length) : 0, plates: plans.length,
    single: { printTimeSec: plans[0]?.timeSec ?? 0, materialGrams: perUnit.materialGrams }, plateTimeSec: longest,
    total, perUnit, materialVolumeMm3, layerCount: maxLayers, discountPct: priced.discountPct, leadDays: priced.leadDays,
    lines: priced.lines, warnings, fits: results.every((r) => r.fits), fitsRotated: allFit, breakdown,
    project: { parts: results, plates: plans, unplaced, margin },
  }
}

/** Tek parçalı ızgara yerleşimi ile projedeki tabla sayısı karşılaştırması için yardımcı */
export function gridPlatesFor(stats: MeshStats, printer: PrinterProfile, qty: number, spacing: number, margin: number): number {
  const cap = plateLayout(stats, printer, spacing, margin).capacity
  return cap > 0 ? Math.ceil(qty / cap) : 0
}
