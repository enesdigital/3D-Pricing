import { unzipSync, strFromU8 } from 'three/examples/jsm/libs/fflate.module.js'
import type { SlicerData } from './types.ts'
import { parseGcodeText } from './parseGcode.ts'

/**
 * Bambu Studio / OrcaSlicer .gcode.3mf (dilimlenmiş proje): Metadata/slice_info.config içindeki
 * plaka başına prediction (sn), weight (g), filament used_g/used_m; yoksa gömülü plate_N.gcode başlığı.
 */
export function parseGcode3mf(buffer: ArrayBuffer, fileName = ''): SlicerData {
  const files = unzipSync(new Uint8Array(buffer))
  const names = Object.keys(files)
  const notes: SlicerData['notes'] = []
  const d: SlicerData = {
    source: 'bambu', fileName, printTimeSec: null, filamentGrams: null, filamentMm: null, filamentType: null,
    filamentDensity: null, printerModel: null, layerHeight: null, layerCount: null, nozzleDiameter: null,
    filamentCount: null, supportUsed: null, plateCount: null, notes,
  }
  const info = names.find((n) => /Metadata\/slice_info\.config$/i.test(n))
  if (info) {
    const xml = new DOMParser().parseFromString(strFromU8(files[info]), 'application/xml')
    const plates = [...xml.querySelectorAll('plate')]
    d.plateCount = plates.length || null
    let time = 0, grams = 0, mm = 0, hasTime = false, hasG = false
    const types = new Set<string>()
    for (const p of plates) {
      const meta = (k: string) => p.querySelector(`metadata[key="${k}"]`)?.getAttribute('value') ?? null
      const pred = meta('prediction'); if (pred) { time += parseFloat(pred); hasTime = true }
      const w = meta('weight'); if (w) { grams += parseFloat(w); hasG = true }
      const sup = meta('support_used'); if (sup != null) d.supportUsed = (d.supportUsed ?? false) || sup === 'true'
      const pm = meta('printer_model_id'); if (pm) d.printerModel = pm
      const nd = meta('nozzle_diameters'); if (nd) d.nozzleDiameter = parseFloat(nd.split(',')[0])
      for (const f of p.querySelectorAll('filament')) {
        const ug = f.getAttribute('used_g'); const um = f.getAttribute('used_m')
        if (um) mm += parseFloat(um) * 1000
        if (!hasG && ug) grams += parseFloat(ug)
        const ty = f.getAttribute('type'); if (ty) types.add(ty)
      }
    }
    if (hasTime) d.printTimeSec = Math.round(time)
    if (grams > 0) d.filamentGrams = grams
    if (mm > 0) d.filamentMm = mm
    if (types.size) { d.filamentType = [...types][0]; d.filamentCount = types.size }
    const gen = xml.querySelector('header_item[key="X-BBL-Client-Type"]')?.getAttribute('value')
    if (gen && /orca/i.test(gen)) d.source = 'orca'
  } else notes.push('no-slice-info')

  // Gömülü G-code'dan eksikleri tamamla (katman kalınlığı, katman sayısı, yoğunluk)
  const g = names.find((n) => /Metadata\/plate_\d+\.gcode$/i.test(n))
  if (g) {
    const bytes = files[g]
    const head = strFromU8(bytes.subarray(0, Math.min(bytes.length, 262144)))
    const tail = bytes.length > 524288 ? strFromU8(bytes.subarray(bytes.length - 262144)) : ''
    const gd = parseGcodeText(head + '\n' + tail, fileName)
    if (gd.source !== 'unknown') d.source = gd.source
    d.layerHeight ??= gd.layerHeight; d.layerCount ??= gd.layerCount; d.filamentDensity ??= gd.filamentDensity
    d.printTimeSec ??= gd.printTimeSec; d.filamentGrams ??= gd.filamentGrams; d.filamentMm ??= gd.filamentMm
    d.filamentType ??= gd.filamentType; d.printerModel ??= gd.printerModel; d.nozzleDiameter ??= gd.nozzleDiameter
  } else if (!info) {
    notes.push('no-gcode')
  }
  if (d.printTimeSec == null) notes.push('no-time')
  if (d.filamentGrams == null && d.filamentMm == null) notes.push('no-filament')
  return d
}

export const isGcode3mf = (name: string, buffer: ArrayBuffer) =>
  /\.3mf$/i.test(name) && new Uint8Array(buffer, 0, 2).join(',') === '80,75' // "PK"
