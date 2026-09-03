/**
 * Duvar kalınlığı analizi: yüzeyden alan ağırlıklı örnek noktalar alınır, her noktadan
 * yüzey normalinin tersine (içeri) ışın atılır; ilk çarpma mesafesi yerel kalınlıktır.
 * Sonuç: örnek başına kalınlık (mm) ve örneğin ait olduğu üçgen indeksi.
 */
import * as THREE from 'three'
import { MeshBVH } from 'three-mesh-bvh'

export interface ThicknessResult {
  /** Örnek başına kalınlık, mm (çarpma yoksa Infinity) */
  samples: Float32Array
  /** Örnek başına üçgen indeksi */
  tri: Uint32Array
  /** 5. ve 50. yüzdelik, mm (sonlu örnekler üzerinden) */
  p5: number
  p50: number
  sampleCount: number
  /** Çok büyük mesh'te atlandıysa */
  skipped: boolean
}

export function computeThickness(pos: Float32Array, sampleCount = 20000, maxTriangles = 1_500_000, onProgress?: (f: number) => void): ThicknessResult {
  const triCount = Math.floor(pos.length / 9)
  const empty: ThicknessResult = { samples: new Float32Array(0), tri: new Uint32Array(0), p5: 0, p50: 0, sampleCount: 0, skipped: true }
  if (triCount === 0 || triCount > maxTriangles) return empty

  // Alan ağırlıklı örnekleme için kümülatif alan
  const cum = new Float64Array(triCount)
  let total = 0
  const nx = new Float32Array(triCount), ny = new Float32Array(triCount), nz = new Float32Array(triCount)
  for (let t = 0; t < triCount; t++) {
    const b = t * 9
    const e1x = pos[b + 3] - pos[b], e1y = pos[b + 4] - pos[b + 1], e1z = pos[b + 5] - pos[b + 2]
    const e2x = pos[b + 6] - pos[b], e2y = pos[b + 7] - pos[b + 1], e2z = pos[b + 8] - pos[b + 2]
    const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x
    const len = Math.sqrt(cx * cx + cy * cy + cz * cz)
    total += len / 2
    cum[t] = total
    if (len > 0) { nx[t] = cx / len; ny[t] = cy / len; nz[t] = cz / len }
  }
  if (total <= 0) return empty

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const bvh = new MeshBVH(geo, { targetLeafSize: 10 })
  onProgress?.(0.4)

  const n = Math.min(sampleCount, triCount * 4)
  const samples = new Float32Array(n)
  const tri = new Uint32Array(n)
  const ray = new THREE.Ray()
  const target = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 } as THREE.Intersection
  // Deterministik sözde rastgele (aynı model → aynı sonuç)
  let seed = 12345
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  const bboxDiag = (() => { const bb = geo.boundingBox ?? (geo.computeBoundingBox(), geo.boundingBox!); return bb.min.distanceTo(bb.max) })()

  for (let i = 0; i < n; i++) {
    // Üçgen seç (alan ağırlıklı, ikili arama)
    const r = rnd() * total
    let lo = 0, hi = triCount - 1
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid }
    const t = lo, b = t * 9
    // Üçgen içinde rastgele nokta (barycentric)
    let u = rnd(), v = rnd()
    if (u + v > 1) { u = 1 - u; v = 1 - v }
    const w = 1 - u - v
    const px = w * pos[b] + u * pos[b + 3] + v * pos[b + 6]
    const py = w * pos[b + 1] + u * pos[b + 4] + v * pos[b + 7]
    const pz = w * pos[b + 2] + u * pos[b + 5] + v * pos[b + 8]
    // İçeri: −normal; kendi üçgenini vurmamak için küçük ofset
    const eps = 1e-3 * Math.max(1, bboxDiag / 1000)
    ray.origin.set(px - nx[t] * eps, py - ny[t] * eps, pz - nz[t] * eps)
    ray.direction.set(-nx[t], -ny[t], -nz[t])
    const hit = bvh.raycastFirst(ray, THREE.DoubleSide, 0, bboxDiag * 2)
    samples[i] = hit ? hit.distance + eps : Infinity
    tri[i] = t
    if (onProgress && i % 2000 === 0) onProgress(0.4 + 0.6 * (i / n))
  }
  void target
  const finite = Array.from(samples).filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  const pct = (p: number) => (finite.length ? finite[Math.min(finite.length - 1, Math.floor(p * finite.length))] : 0)
  return { samples, tri, p5: pct(0.05), p50: pct(0.5), sampleCount: n, skipped: false }
}

/** Eşik altı örnek oranı (0..1) */
export function thinFraction(th: ThicknessResult, thresholdMm: number): number {
  if (!th || th.sampleCount === 0) return 0
  let c = 0
  for (let i = 0; i < th.samples.length; i++) if (th.samples[i] < thresholdMm) c++
  return c / th.samples.length
}

/** Üçgen başına ince bayrağı: üçgenin herhangi bir örneği eşiğin altındaysa 1 */
export function thinMask(th: ThicknessResult, thresholdMm: number, triCount: number): Uint8Array {
  const mask = new Uint8Array(triCount)
  if (!th || th.sampleCount === 0) return mask
  for (let i = 0; i < th.samples.length; i++) if (th.samples[i] < thresholdMm) mask[th.tri[i]] = 1
  return mask
}
