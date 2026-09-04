import { unzipSync, strFromU8 } from 'three/examples/jsm/libs/fflate.module.js'
import type { FdmPrintParams, Material, PrinterProfile } from '../cost/types.ts'

/**
 * Dilimleyici profil içe aktarma: Bambu Studio / OrcaSlicer JSON (filament, machine, process),
 * Orca/Bambu paket zip'leri (.orca_filament, .orca_printer, .bbscfg, .bbsflmt), Bambu/Orca proje 3MF'inin
 * Metadata/project_settings.config'i ve PrusaSlicer INI (.ini) profilleri.
 * Yalnızca fiyat/süre modelini etkileyen alanlar okunur; eksik alanlar (inherits) üst profilden gelir, not düşülür.
 */
export type ProfileKind = 'filament' | 'machine' | 'process'
export type ProfileSource = 'bambu' | 'orca' | 'prusa' | 'unknown'

export interface FilamentProfile {
  name: string
  vendor: string | null
  type: string | null
  /** g/cm³ */
  density: number | null
  /** Dilimleyicideki maliyet (birim bilinmez: USD/EUR/TRY olabilir) */
  cost: number | null
  /** mm³/s */
  maxVolumetricSpeed: number | null
  /** sn (slow_down_layer_time / slowdown_below_layer_time) */
  minLayerTime: number | null
  nozzleTemp: number | null
  bedTemp: number | null
}
export interface MachineProfile {
  name: string
  model: string | null
  bed: { x: number; y: number; z: number } | null
  nozzleDiameter: number | null
  maxLayerHeight: number | null
  minLayerHeight: number | null
  /** mm/s (machine_max_speed_x) */
  maxSpeed: number | null
  /** Çok ekstruderli/çift nozul */
  extruders: number | null
}
export interface ProcessProfile {
  name: string
  layerHeight: number | null
  lineWidth: number | null
  wallLoops: number | null
  topLayers: number | null
  bottomLayers: number | null
  /** 0..1 */
  infillDensity: number | null
  supportEnabled: boolean | null
  supportType: string | null
  supportThresholdDeg: number | null
  /** mm/s */
  outerWallSpeed: number | null
}

export interface ImportedProfile {
  kind: ProfileKind
  source: ProfileSource
  fileName: string
  name: string
  inherits: string | null
  filament?: FilamentProfile
  machine?: MachineProfile
  process?: ProcessProfile
  notes: string[]
}

type Json = Record<string, unknown>

/** Bambu/Orca değerleri "21" ya da ["21"] biçimindedir; ilk elemanı sayı olarak döndürür */
function num(v: unknown): number | null {
  if (Array.isArray(v)) v = v[0]
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') { const n = parseFloat(v.replace(',', '.')); return Number.isFinite(n) ? n : null }
  return null
}
function str(v: unknown): string | null {
  if (Array.isArray(v)) v = v[0]
  return typeof v === 'string' && v.trim() ? v.trim() : null
}
function pct(v: unknown): number | null { const n = num(v); return n == null ? null : n > 1 ? n / 100 : n }
function bool(v: unknown): boolean | null { const s = str(v); return s == null ? null : s === '1' || s.toLowerCase() === 'true' }
/** "0x0,256x0,256x256,0x256" ya da ["0x0","256x0",...] → tabla boyutu */
function bedFromArea(v: unknown): { x: number; y: number } | null {
  const pts = (Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(',') : []).map((p) => p.split('x').map(parseFloat))
  if (pts.length < 3 || pts.some((p) => p.length !== 2 || p.some((n) => !Number.isFinite(n)))) return null
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  return { x: Math.round((Math.max(...xs) - Math.min(...xs)) * 100) / 100, y: Math.round((Math.max(...ys) - Math.min(...ys)) * 100) / 100 }
}

function detectSource(j: Json, fileName: string): ProfileSource {
  const from = str(j.from) ?? ''
  const name = (str(j.name) ?? '') + ' ' + fileName
  if (/orca/i.test(name) || /orca/i.test(String(j.version ?? '')) || 'filament_settings_id' in j && /orca/i.test(String(j.filament_settings_id))) return 'orca'
  if (/bambu|bbl/i.test(name) || from === 'system' || ['filament', 'machine', 'process'].includes(String(j.type)) || 'print_settings_id' in j || 'printer_settings_id' in j || 'filament_settings_id' in j || 'printable_area' in j || 'sparse_infill_density' in j) return 'bambu'
  return 'unknown'
}

function filamentFrom(j: Json, name: string): FilamentProfile {
  return {
    name,
    vendor: str(j.filament_vendor),
    type: str(j.filament_type),
    density: num(j.filament_density),
    cost: num(j.filament_cost),
    maxVolumetricSpeed: num(j.filament_max_volumetric_speed),
    minLayerTime: num(j.slow_down_layer_time) ?? num(j.slowdown_below_layer_time),
    nozzleTemp: num(j.nozzle_temperature) ?? num(j.temperature),
    bedTemp: num(j.hot_plate_temp) ?? num(j.textured_plate_temp) ?? num(j.cool_plate_temp) ?? num(j.bed_temperature),
  }
}
function machineFrom(j: Json, name: string): MachineProfile {
  const area = bedFromArea(j.printable_area ?? j.bed_shape)
  const z = num(j.printable_height) ?? num(j.max_print_height)
  const nozzles = Array.isArray(j.nozzle_diameter) ? j.nozzle_diameter.length : 1
  return {
    name, model: str(j.printer_model) ?? str(j.printer_variant) ?? null,
    bed: area && z != null ? { x: area.x, y: area.y, z } : area ? { x: area.x, y: area.y, z: 0 } : null,
    nozzleDiameter: num(j.nozzle_diameter),
    maxLayerHeight: num(j.max_layer_height), minLayerHeight: num(j.min_layer_height),
    maxSpeed: num(j.machine_max_speed_x) ?? num(j.machine_max_feedrate_x),
    extruders: num(j.extruders_count) ?? (nozzles > 1 ? nozzles : null),
  }
}
function processFrom(j: Json, name: string): ProcessProfile {
  const enable = bool(j.enable_support) ?? bool(j.support_material)
  return {
    name,
    layerHeight: num(j.layer_height),
    lineWidth: num(j.line_width) ?? num(j.outer_wall_line_width) ?? num(j.extrusion_width) ?? num(j.perimeter_extrusion_width),
    wallLoops: num(j.wall_loops) ?? num(j.perimeters),
    topLayers: num(j.top_shell_layers) ?? num(j.top_solid_layers),
    bottomLayers: num(j.bottom_shell_layers) ?? num(j.bottom_solid_layers),
    infillDensity: pct(j.sparse_infill_density) ?? pct(j.fill_density),
    supportEnabled: enable,
    supportType: str(j.support_type) ?? (bool(j.support_material) ? 'normal' : null),
    supportThresholdDeg: num(j.support_threshold_angle) ?? num(j.support_material_threshold),
    outerWallSpeed: num(j.outer_wall_speed) ?? num(j.external_perimeter_speed),
  }
}

/** Tek bir Bambu/Orca JSON profilini (ya da proje ayarlarını) çözer; proje/karışık nesnede birden çok profil dönebilir */
export function parseProfileJson(text: string, fileName = ''): ImportedProfile[] {
  let j: Json
  try { j = JSON.parse(text) as Json } catch { throw new Error('JSON') }
  if (!j || typeof j !== 'object') throw new Error('JSON')
  const source = detectSource(j, fileName)
  const inherits = str(j.inherits)
  const notes: string[] = []
  if (inherits) notes.push('inherits')
  const type = str(j.type)
  const out: ImportedProfile[] = []
  const has = (...keys: string[]) => keys.some((k) => k in j)
  const isProject = has('print_settings_id') && has('printer_settings_id') && has('filament_settings_id')
  if (type === 'filament' || (!type && !isProject && has('filament_density', 'filament_max_volumetric_speed', 'filament_type'))) {
    const name = str(j.filament_settings_id) ?? str(j.name) ?? fileName.replace(/\.[^.]+$/, '')
    out.push({ kind: 'filament', source, fileName, name, inherits, filament: filamentFrom(j, name), notes })
  } else if (type === 'machine' || (!type && !isProject && has('printable_area', 'printable_height', 'bed_shape'))) {
    const name = str(j.printer_settings_id) ?? str(j.name) ?? fileName.replace(/\.[^.]+$/, '')
    out.push({ kind: 'machine', source, fileName, name, inherits, machine: machineFrom(j, name), notes })
  } else if (type === 'process' || (!type && !isProject && has('layer_height', 'wall_loops', 'sparse_infill_density', 'perimeters'))) {
    const name = str(j.print_settings_id) ?? str(j.name) ?? fileName.replace(/\.[^.]+$/, '')
    out.push({ kind: 'process', source, fileName, name, inherits, process: processFrom(j, name), notes })
  } else if (isProject) {
    // Proje ayarları: yazıcı + süreç + ekstruder başına filament (aynı ad tekrar eklenmez)
    const pn = str(j.printer_settings_id) ?? 'printer'
    out.push({ kind: 'machine', source, fileName, name: pn, inherits: null, machine: machineFrom(j, pn), notes: ['project'] })
    const prn = str(j.print_settings_id) ?? 'process'
    out.push({ kind: 'process', source, fileName, name: prn, inherits: null, process: processFrom(j, prn), notes: ['project'] })
    const ids = Array.isArray(j.filament_settings_id) ? j.filament_settings_id.map(String) : [String(j.filament_settings_id ?? 'filament')]
    const seen = new Set<string>()
    ids.forEach((id, i) => {
      if (seen.has(id)) return
      seen.add(id)
      const pick = (k: string) => (Array.isArray(j[k]) ? (j[k] as unknown[])[i] : j[k])
      const sub: Json = {}
      for (const k of ['filament_vendor', 'filament_type', 'filament_density', 'filament_cost', 'filament_max_volumetric_speed', 'slow_down_layer_time', 'nozzle_temperature', 'hot_plate_temp', 'textured_plate_temp', 'cool_plate_temp']) sub[k] = pick(k)
      out.push({ kind: 'filament', source, fileName, name: id, inherits: null, filament: filamentFrom(sub, id), notes: ['project'] })
    })
  } else {
    throw new Error('UNKNOWN')
  }
  return out
}

/** PrusaSlicer INI: [filament:Ad] / [printer:Ad] / [print:Ad] bölümleri ya da bölümsüz tek profil */
export function parseProfileIni(text: string, fileName = ''): ImportedProfile[] {
  const sections: { kind: string | null; name: string; j: Json }[] = []
  let cur: { kind: string | null; name: string; j: Json } = { kind: null, name: fileName.replace(/\.[^.]+$/, ''), j: {} }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith(';')) continue
    const sec = line.match(/^\[(\w+):(.+)\]$/)
    if (sec) { if (Object.keys(cur.j).length) sections.push(cur); cur = { kind: sec[1], name: sec[2].trim(), j: {} }; continue }
    const eq = line.indexOf('=')
    if (eq > 0) cur.j[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
  }
  if (Object.keys(cur.j).length) sections.push(cur)
  const out: ImportedProfile[] = []
  for (const s of sections) {
    const j = s.j
    const inherits = str(j.inherits)
    const notes = inherits ? ['inherits'] : []
    const kind = s.kind ?? ('filament_density' in j || 'filament_type' in j ? 'filament' : 'bed_shape' in j || 'max_print_height' in j ? 'printer' : 'layer_height' in j || 'perimeters' in j ? 'print' : null)
    if (kind === 'filament') out.push({ kind: 'filament', source: 'prusa', fileName, name: s.name, inherits, filament: filamentFrom(j, s.name), notes })
    else if (kind === 'printer') out.push({ kind: 'machine', source: 'prusa', fileName, name: s.name, inherits, machine: machineFrom(j, s.name), notes })
    else if (kind === 'print') out.push({ kind: 'process', source: 'prusa', fileName, name: s.name, inherits, process: processFrom(j, s.name), notes })
  }
  if (!out.length) throw new Error('UNKNOWN')
  return out
}

/** Zip paketleri (.orca_filament/.orca_printer/.bbscfg/.bbsflmt/.zip) ve proje 3MF (Metadata/project_settings.config) */
export function parseProfileBundle(buffer: ArrayBuffer, fileName = ''): ImportedProfile[] {
  const files = unzipSync(new Uint8Array(buffer))
  const out: ImportedProfile[] = []
  for (const [name, bytes] of Object.entries(files)) {
    const lower = name.toLowerCase()
    const isJson = lower.endsWith('.json') && !lower.endsWith('bundle_structure.json')
    const isProject = /metadata\/project_settings\.config$/.test(lower)
    if (!isJson && !isProject) continue
    try { out.push(...parseProfileJson(strFromU8(bytes), name.split('/').pop() ?? name)) } catch { /* profil olmayan json'ları atla */ }
  }
  if (!out.length) throw new Error('UNKNOWN')
  return out.map((p) => ({ ...p, fileName: fileName || p.fileName }))
}

export const PROFILE_EXT = ['json', 'ini', 'zip', 'orca_printer', 'orca_filament', 'bbscfg', 'bbsflmt', '3mf']

export async function parseProfileFile(file: File): Promise<ImportedProfile[]> {
  const ext = file.name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'json') return parseProfileJson(await file.text(), file.name)
  if (ext === 'ini') return parseProfileIni(await file.text(), file.name)
  if (PROFILE_EXT.includes(ext)) return parseProfileBundle(await file.arrayBuffer(), file.name)
  throw new Error('UNKNOWN')
}

/* ----------------------------------------------------------- uygulama */

/** Nozul sıcaklığından güç çarpanı (PLA 1.0, PETG 1.15, ABS/ASA 1.9, PA/PC 2.0 — malzeme varsayılanlarıyla uyumlu) */
export function powerFactorFromTemp(temp: number | null): number {
  if (temp == null) return 1
  return temp >= 270 ? 2.0 : temp >= 250 ? 1.9 : temp >= 235 ? 1.15 : 1.0
}

/** Filament profilinden özel malzeme (fiyat ve eksik alanlar temel malzemeden) */
export function profileToMaterial(fp: FilamentProfile, base: Material | null, id = `custom-${Date.now().toString(36)}`): Material {
  const type = fp.type ?? base?.name ?? 'PLA'
  const name = fp.name || `${fp.vendor ?? ''} ${type}`.trim()
  return {
    id, name, brand: fp.vendor ?? base?.brand ?? undefined, tech: 'fdm',
    density: fp.density ?? base?.density ?? 1.24,
    pricePerKgTRY: base?.pricePerKgTRY ?? 0,
    maxFlow: fp.maxVolumetricSpeed ?? base?.maxFlow ?? 12,
    minLayerTime: fp.minLayerTime ?? base?.minLayerTime ?? 8,
    powerFactor: fp.nozzleTemp != null ? powerFactorFromTemp(fp.nozzleTemp) : (base?.powerFactor ?? 1),
    notes: [fp.vendor, fp.type, fp.nozzleTemp != null ? `${fp.nozzleTemp}°C` : null].filter(Boolean).join(' · ') || undefined,
  }
}

/** Süreç profilinden baskı parametreleri (yalnızca dolu alanlar) */
export function profileToParams(pp: ProcessProfile, base: FdmPrintParams): FdmPrintParams {
  const p = { ...base }
  if (pp.layerHeight) p.layerHeight = pp.layerHeight
  if (pp.lineWidth) p.lineWidth = pp.lineWidth
  if (pp.wallLoops) p.wallLoops = Math.round(pp.wallLoops)
  const tb = pp.topLayers != null && pp.bottomLayers != null ? Math.round((pp.topLayers + pp.bottomLayers) / 2) : pp.topLayers ?? pp.bottomLayers
  if (tb != null) p.topBottomLayers = Math.round(tb)
  if (pp.infillDensity != null) p.infillDensity = Math.min(1, Math.max(0, pp.infillDensity))
  if (pp.supportEnabled != null) p.supports = pp.supportEnabled ? 'on' : 'off'
  if (pp.supportType && /tree/i.test(pp.supportType)) p.supportDensity = Math.min(p.supportDensity, 0.15)
  // Dilimleyici eşiği yataydan ölçülür (Bambu 30°); motorun eşiği dikeyden → 90 − eşik
  if (pp.supportThresholdDeg) p.overhangThresholdDeg = Math.min(80, Math.max(10, 90 - pp.supportThresholdDeg))
  return p
}

/** Makine profilinden özel yazıcı (spec temel yazıcıdan; tabla/nozul/hız profilden) */
export function profileToPrinter(mp: MachineProfile, base: PrinterProfile, id = `custom-${Date.now().toString(36)}`): PrinterProfile {
  const spec = base.spec.tech === 'fdm' ? { ...base.spec } : { ...base.spec }
  if (spec.tech === 'fdm') {
    if (mp.nozzleDiameter) spec.nozzleDiameter = mp.nozzleDiameter
    if (mp.extruders && mp.extruders > 1) spec.dualNozzle = true
    if (mp.maxSpeed) spec.outerWallSpeed = Math.min(spec.outerWallSpeed, mp.maxSpeed)
  }
  // "Bambu Lab X2D 0.4 nozzle" → marka temel yazıcıdan (adı onunla başlıyorsa), ad nozul ekinden arındırılır
  const clean = mp.name.replace(/\s*\d+(\.\d+)?\s*(mm)?\s*nozzle\b/i, '').trim()
  const startsWithBase = clean.toLowerCase().startsWith(base.brand.toLowerCase() + ' ')
  const brand = startsWithBase ? base.brand : clean.split(' ')[0]
  const name = (startsWithBase ? clean.slice(base.brand.length) : clean.split(' ').slice(1).join(' ')).trim() || clean
  return {
    ...base, id, brand, name, spec,
    bed: mp.bed && mp.bed.z > 0 ? mp.bed : mp.bed ? { ...mp.bed, z: base.bed.z } : base.bed,
    notes: [mp.model, mp.nozzleDiameter ? `${mp.nozzleDiameter} mm nozul` : null].filter(Boolean).join(' · ') || undefined,
  }
}
