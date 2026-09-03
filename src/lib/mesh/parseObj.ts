/**
 * Minimal OBJ ayrıştırıcı: v ve f satırları. Çokgen yüzler fan üçgenlemesiyle bölünür.
 * Çıktı indexsiz Float32Array (üçgen başına 9 float).
 */
import type { ParsedMesh, ProgressFn } from './parseStl.ts'

export function parseObj(buffer: ArrayBuffer, onProgress?: ProgressFn): ParsedMesh {
  const text = new TextDecoder().decode(buffer)
  const verts: number[] = []
  const tris: number[] = []
  const lines = text.split(/\r?\n/)
  const step = Math.max(1, Math.floor(lines.length / 50))
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    if (line.length < 3) continue
    const c0 = line.charCodeAt(0)
    if (c0 === 118 /* v */ && line.charCodeAt(1) === 32) {
      const p = line.trim().split(/\s+/)
      verts.push(parseFloat(p[1]), parseFloat(p[2]), parseFloat(p[3]))
    } else if (c0 === 102 /* f */ && line.charCodeAt(1) === 32) {
      const p = line.trim().split(/\s+/)
      const idx: number[] = []
      for (let i = 1; i < p.length; i++) {
        const raw = parseInt(p[i].split('/')[0], 10)
        // Negatif indeksler sondan sayar.
        idx.push(raw < 0 ? verts.length / 3 + raw : raw - 1)
      }
      for (let i = 1; i + 1 < idx.length; i++) tris.push(idx[0], idx[i], idx[i + 1])
    }
    if (onProgress && li % step === 0) onProgress(li / lines.length)
  }
  const triangleCount = tris.length / 3
  if (triangleCount === 0) throw new Error('OBJ içinde yüz (f) bulunamadı.')
  const positions = new Float32Array(triangleCount * 9)
  for (let t = 0; t < triangleCount; t++) {
    for (let k = 0; k < 3; k++) {
      const vi = tris[t * 3 + k] * 3
      positions[t * 9 + k * 3] = verts[vi]
      positions[t * 9 + k * 3 + 1] = verts[vi + 1]
      positions[t * 9 + k * 3 + 2] = verts[vi + 2]
    }
  }
  onProgress?.(1)
  return { positions, triangleCount, format: 'ascii' }
}
