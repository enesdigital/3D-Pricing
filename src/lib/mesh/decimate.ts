/**
 * Görüntüleme için mesh sadeleştirme (meshoptimizer). Hesaplamalar orijinal mesh'te yapılır;
 * yalnızca 3B görünüm için üçgen sayısı hedefe indirilir.
 */
import { MeshoptSimplifier } from 'meshoptimizer'

/** İndexsiz üçgen çorbasını 1e-4 mm ızgarasında birleştirip (weld) indexli hale getirir */
export function weld(pos: Float32Array): { positions: Float32Array; indices: Uint32Array } {
  const vertCount = Math.floor(pos.length / 3)
  const Q = 1e4
  let tableSize = 1
  while (tableSize < vertCount * 2) tableSize <<= 1
  const mask = tableSize - 1
  const table = new Int32Array(tableSize).fill(-1)
  const qx = new Int32Array(vertCount), qy = new Int32Array(vertCount), qz = new Int32Array(vertCount)
  const indices = new Uint32Array(vertCount)
  const out = new Float32Array(vertCount * 3)
  let unique = 0
  for (let v = 0; v < vertCount; v++) {
    const x = Math.round(pos[v * 3] * Q), y = Math.round(pos[v * 3 + 1] * Q), z = Math.round(pos[v * 3 + 2] * Q)
    let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & mask
    for (;;) {
      const slot = table[h]
      if (slot === -1) {
        table[h] = unique; qx[unique] = x; qy[unique] = y; qz[unique] = z
        out[unique * 3] = pos[v * 3]; out[unique * 3 + 1] = pos[v * 3 + 1]; out[unique * 3 + 2] = pos[v * 3 + 2]
        indices[v] = unique++
        break
      }
      if (qx[slot] === x && qy[slot] === y && qz[slot] === z) { indices[v] = slot; break }
      h = (h + 1) & mask
    }
  }
  return { positions: out.slice(0, unique * 3), indices }
}

/** Hedef üçgen sayısına indirger; sonuç yine indexsiz Float32Array (viewer için). */
export async function decimateForDisplay(pos: Float32Array, targetTriangles: number): Promise<Float32Array> {
  const triCount = Math.floor(pos.length / 9)
  if (triCount <= targetTriangles) return pos
  await MeshoptSimplifier.ready
  const { positions, indices } = weld(pos)
  const targetIndexCount = Math.max(3, Math.floor(targetTriangles) * 3)
  const [simplified] = MeshoptSimplifier.simplify(indices, positions, 3, targetIndexCount, 0.05, ['LockBorder'])
  const out = new Float32Array(simplified.length * 3)
  for (let i = 0; i < simplified.length; i++) {
    const vi = simplified[i] * 3
    out[i * 3] = positions[vi]; out[i * 3 + 1] = positions[vi + 1]; out[i * 3 + 2] = positions[vi + 2]
  }
  return out
}
