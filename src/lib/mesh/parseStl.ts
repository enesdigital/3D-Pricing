/**
 * STL ayrıştırıcı — binary ve ASCII biçimlerini destekler.
 * Çıktı: her üçgen için 9 float (v0,v1,v2) içeren düz Float32Array (indexsiz).
 * STL'de birim yoktur; mm varsayılır. Boyut ölçekleme çağıran tarafta yapılır.
 */

export interface ParsedMesh {
  positions: Float32Array
  triangleCount: number
  format: 'binary' | 'ascii'
}

export type ProgressFn = (fraction: number) => void

function isAsciiStl(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 512))
  // Binary dosyalarda başlık "solid" ile başlayabilir; asıl ölçüt boyut tutarlılığıdır.
  if (buffer.byteLength >= 84) {
    const n = new DataView(buffer).getUint32(80, true)
    if (84 + n * 50 === buffer.byteLength) return false
  }
  let text = ''
  for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i])
  const head = text.trimStart().toLowerCase()
  if (!head.startsWith('solid')) return false
  // ASCII ise ilk 512 bayt içinde "facet" ya da "endsolid" görmeyi bekleriz.
  // eslint-disable-next-line no-control-regex
  return /facet|endsolid/.test(head) || /^[\x09\x0a\x0d\x20-\x7e]*$/.test(text)
}

export function parseBinaryStl(buffer: ArrayBuffer, onProgress?: ProgressFn): ParsedMesh {
  const view = new DataView(buffer)
  const declared = view.getUint32(80, true)
  const available = Math.floor((buffer.byteLength - 84) / 50)
  const count = Math.min(declared, available)
  if (count <= 0) throw new Error('Binary STL içinde üçgen bulunamadı.')

  const positions = new Float32Array(count * 9)
  let off = 84
  const step = Math.max(1, Math.floor(count / 50))
  for (let i = 0; i < count; i++) {
    // 12 bayt normal atlanır (yeniden hesaplanır), ardından 3 köşe.
    const base = i * 9
    for (let k = 0; k < 9; k++) {
      positions[base + k] = view.getFloat32(off + 12 + k * 4, true)
    }
    off += 50
    if (onProgress && i % step === 0) onProgress(i / count)
  }
  onProgress?.(1)
  return { positions, triangleCount: count, format: 'binary' }
}

export function parseAsciiStl(buffer: ArrayBuffer, onProgress?: ProgressFn): ParsedMesh {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
  // "vertex x y z" satırlarını tarayarak köşeleri topla.
  const re = /vertex\s+([-+]?[\d.eE+-]+)\s+([-+]?[\d.eE+-]+)\s+([-+]?[\d.eE+-]+)/g
  const estimate = Math.max(1, Math.floor(text.length / 60)) // kabaca üçgen başına ~200 karakter
  let cap = estimate * 9
  let positions = new Float32Array(cap)
  let n = 0
  let m: RegExpExecArray | null
  let lastReport = 0
  while ((m = re.exec(text)) !== null) {
    if (n + 3 > cap) {
      cap *= 2
      const bigger = new Float32Array(cap)
      bigger.set(positions)
      positions = bigger
    }
    positions[n++] = parseFloat(m[1])
    positions[n++] = parseFloat(m[2])
    positions[n++] = parseFloat(m[3])
    if (onProgress && re.lastIndex - lastReport > 2_000_000) {
      lastReport = re.lastIndex
      onProgress(re.lastIndex / text.length)
    }
  }
  const triangleCount = Math.floor(n / 9)
  if (triangleCount === 0) throw new Error('ASCII STL içinde üçgen bulunamadı.')
  onProgress?.(1)
  return { positions: positions.subarray(0, triangleCount * 9).slice(), triangleCount, format: 'ascii' }
}

export function parseStl(buffer: ArrayBuffer, onProgress?: ProgressFn): ParsedMesh {
  if (buffer.byteLength < 15) throw new Error('Dosya çok küçük; geçerli bir STL değil.')
  return isAsciiStl(buffer) ? parseAsciiStl(buffer, onProgress) : parseBinaryStl(buffer, onProgress)
}
