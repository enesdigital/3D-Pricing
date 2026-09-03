import type { FdmPrinterSpec, Material, PrinterProfile, ResinPrinterSpec } from './types.ts'

export const FDM_SPEC_DEFAULTS: FdmPrinterSpec = {
  tech: 'fdm', maxFlow: 20, efficiencyScale: 0.9, outerWallSpeed: 150, layerChangeSec: 1.5, jobOverheadSec: 300,
  jobWasteGrams: 1, colorChangeWasteGrams: 0.5, colorChangeTimeSec: 75, nozzleDiameter: 0.4, supportsMultiColor: false,
  dualNozzle: false, nozzleSwitchWasteGrams: 0.03, nozzleSwitchTimeSec: 8, avgPowerW: 120, heatupPowerW: 400,
}
export const RESIN_SPEC_DEFAULTS: ResinPrinterSpec = {
  tech: 'resin', pixelSizeMm: 0.035, defaultLayerHeight: 0.05, exposureSec: 2.5, bottomExposureSec: 25, bottomLayers: 6,
  liftCycleSec: 7, vatCapacityMl: 500, avgPowerW: 80, postPowerW: 50, tiltRelease: false,
}

const num = (v: unknown, fallback: number, min = 0) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
  return Number.isFinite(n) && n >= min ? n : fallback
}

/** localStorage'dan gelen özel yazıcıları eski/eksik alanlara karşı tamamlar; bozuk kayıtları atar. */
export function normalizeCustomPrinters(stored: unknown, initial: PrinterProfile[]): PrinterProfile[] {
  if (!Array.isArray(stored)) return initial
  const out: PrinterProfile[] = []
  for (const raw of stored) {
    if (!raw || typeof raw !== 'object') continue
    const p = raw as Partial<PrinterProfile> & { spec?: Partial<FdmPrinterSpec & ResinPrinterSpec> }
    if (typeof p.id !== 'string' || typeof p.name !== 'string') continue
    const tech = p.tech === 'resin' ? 'resin' : 'fdm'
    const bed = { x: num(p.bed?.x, 200, 1), y: num(p.bed?.y, 200, 1), z: num(p.bed?.z, 200, 1) }
    const base = tech === 'fdm' ? FDM_SPEC_DEFAULTS : RESIN_SPEC_DEFAULTS
    const spec: Record<string, unknown> = { ...base }
    for (const [k, def] of Object.entries(base)) {
      const v = (p.spec ?? {})[k as keyof typeof p.spec]
      spec[k] = typeof def === 'number' ? num(v, def) : typeof def === 'boolean' ? (typeof v === 'boolean' ? v : def) : def
    }
    out.push({
      id: p.id, name: p.name, brand: typeof p.brand === 'string' ? p.brand : '', tech, bed,
      priceTRY: num(p.priceTRY, 0), lifetimeHours: num(p.lifetimeHours, 3000, 1), maintenanceTRYPerHour: num(p.maintenanceTRYPerHour, 0),
      spec: spec as unknown as PrinterProfile['spec'], notes: typeof p.notes === 'string' ? p.notes : undefined,
    })
  }
  return out
}

export function normalizeCustomMaterials(stored: unknown, initial: Material[]): Material[] {
  if (!Array.isArray(stored)) return initial
  const out: Material[] = []
  for (const raw of stored) {
    if (!raw || typeof raw !== 'object') continue
    const m = raw as Partial<Material>
    if (typeof m.id !== 'string' || typeof m.name !== 'string') continue
    const tech = m.tech === 'resin' ? 'resin' : 'fdm'
    out.push({
      id: m.id, name: m.name, tech,
      density: num(m.density, tech === 'fdm' ? 1.24 : 1.1, 0.1), pricePerKgTRY: num(m.pricePerKgTRY, 0),
      maxFlow: num(m.maxFlow, tech === 'fdm' ? 15 : 0), minLayerTime: num(m.minLayerTime, tech === 'fdm' ? 6 : 0),
      powerFactor: num(m.powerFactor, 1, 0.1), notes: typeof m.notes === 'string' ? m.notes : undefined,
    })
  }
  return out
}
