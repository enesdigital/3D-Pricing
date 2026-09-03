import type { SlicerData } from './types.ts'

/** "1d 2h 3m 4s", "1h 23m 45s", "23m 4s", "45s", "4567" → saniye */
export function parseDuration(s: string): number | null {
  const str = s.trim().toLowerCase()
  if (/^\d+(\.\d+)?$/.test(str)) return Math.round(parseFloat(str))
  let total = 0, found = false
  const re = /(\d+(?:\.\d+)?)\s*(d|h|m|s)\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(str)) !== null) {
    found = true
    const v = parseFloat(m[1])
    total += m[2] === 'd' ? v * 86400 : m[2] === 'h' ? v * 3600 : m[2] === 'm' ? v * 60 : v
  }
  if (found) return Math.round(total)
  // "01:23:45"
  const hms = str.match(/^(\d+):(\d{2}):(\d{2})$/)
  if (hms) return +hms[1] * 3600 + +hms[2] * 60 + +hms[3]
  return null
}

const num = (s: string | undefined): number | null => {
  if (s == null) return null
  // "12.3, 4.5" → ilk değerleri topla (çoklu filament)
  const parts = s.split(/[;,]/).map((x) => parseFloat(x.trim())).filter((x) => Number.isFinite(x))
  if (parts.length === 0) return null
  return parts.reduce((a, b) => a + b, 0)
}
const first = (s: string | undefined): number | null => {
  if (s == null) return null
  const v = parseFloat(s.split(/[;,]/)[0])
  return Number.isFinite(v) ? v : null
}

/**
 * G-code başlık/altbilgi yorumlarından dilimleyici meta verisini okur.
 * Yalnızca ilk ve son ~256 KB taranır (200 MB dosyalarda hızlı).
 */
export function parseGcodeText(text: string, fileName = ''): SlicerData {
  const notes: string[] = []
  const d: SlicerData = {
    source: 'unknown', fileName, printTimeSec: null, filamentGrams: null, filamentMm: null, filamentType: null,
    filamentDensity: null, printerModel: null, layerHeight: null, layerCount: null, nozzleDiameter: null,
    filamentCount: null, supportUsed: null, plateCount: null, notes,
  }
  const get = (re: RegExp) => { const m = text.match(re); return m ? m[1].trim() : undefined }

  if (/BambuStudio|Bambu Studio/i.test(text)) d.source = 'bambu'
  else if (/OrcaSlicer/i.test(text)) d.source = 'orca'
  else if (/PrusaSlicer|SuperSlicer/i.test(text)) d.source = 'prusa'
  else if (/^;FLAVOR:|Cura_SteamEngine|;Generated with Cura/im.test(text)) d.source = 'cura'

  if (d.source === 'cura') {
    const t = get(/^;TIME:(\d+)/m)
    d.printTimeSec = t ? parseInt(t, 10) : null
    const fl = get(/^;Filament used:\s*([\d.]+)\s*m/m)
    d.filamentMm = fl ? parseFloat(fl) * 1000 : null
    d.layerHeight = first(get(/^;Layer height:\s*([\d.]+)/m))
    const lc = get(/^;LAYER_COUNT:(\d+)/m)
    d.layerCount = lc ? parseInt(lc, 10) : null
    // Cura ağırlık yazmaz; uzunluk × kesit (1.75 mm → 2.405 mm²) × yoğunluk (PLA varsayılan) sonra hesaplanır
    if (d.filamentMm != null) notes.push('cura-weight-derived')
    return d
  }

  // Bambu / Orca / Prusa: "; key = value" biçimi
  const esc = (k: string) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // "; key = value" ya da "; key : value" (Bambu bazı satırlarda iki nokta kullanır)
  const kv = (key: string) => get(new RegExp('^;\\s*' + esc(key) + '\\s*[:=]\\s*(.+)$', 'mi'))
  d.filamentGrams = num(kv('total filament used [g]')) ?? num(kv('total filament weight [g]')) ?? num(kv('filament used [g]'))
  d.filamentMm = num(kv('total filament length [mm]')) ?? num(kv('filament used [mm]'))
  const timeStr = kv('estimated printing time (normal mode)') ?? get(/total estimated time:\s*([^;\n]+)/i) ?? get(/model printing time:\s*([^;\n]+)/i)
  d.printTimeSec = timeStr ? parseDuration(timeStr) : null
  d.filamentType = kv('filament_type')?.split(/[;,]/)[0].trim() ?? null
  d.filamentDensity = first(kv('filament_density'))
  d.printerModel = kv('printer_model') ?? kv('printer_settings_id') ?? null
  d.layerHeight = first(kv('layer_height'))
  d.nozzleDiameter = first(kv('nozzle_diameter'))
  const lc = get(/^;\s*total layer number:\s*(\d+)/mi) ?? get(/^;\s*total layers count:\s*(\d+)/mi)
  d.layerCount = lc ? parseInt(lc, 10) : null
  const ft = kv('filament_type')
  if (ft) d.filamentCount = ft.split(/[;,]/).filter((x) => x.trim()).length
  const sup = kv('enable_support') ?? kv('support_material')
  d.supportUsed = sup == null ? null : /^(1|true)$/i.test(sup)
  if (d.printTimeSec == null) notes.push('no-time')
  if (d.filamentGrams == null && d.filamentMm == null) notes.push('no-filament')
  return d
}

/** Büyük dosyada yalnızca baş ve son kısmı oku */
export async function readHeadTail(file: Blob, bytes = 262144): Promise<string> {
  if (file.size <= bytes * 2) return await file.text()
  const head = await file.slice(0, bytes).text()
  const tail = await file.slice(file.size - bytes).text()
  return head + '\n' + tail
}

/** Ağırlık yoksa uzunluk × kesit × yoğunluk ile türet (1.75 mm filament) */
export function gramsFromLength(mm: number, density: number, diameterMm = 1.75): number {
  const area = Math.PI * (diameterMm / 2) ** 2 // mm²
  return (mm * area / 1000) * density
}
