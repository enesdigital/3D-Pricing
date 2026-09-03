import { effectiveScale, type MeshStats, type Placement, type Vec3 } from './types.ts'
import { sliceLayers } from './slice.ts'

const DEG = Math.PI / 180

/** Euler XYZ (derece) döndürme matrisi (satır-major 3x3). */
export function rotationMatrix(p: Placement): Float64Array {
  const cx = Math.cos(p.rotX * DEG), sx = Math.sin(p.rotX * DEG)
  const cy = Math.cos(p.rotY * DEG), sy = Math.sin(p.rotY * DEG)
  const cz = Math.cos(p.rotZ * DEG), sz = Math.sin(p.rotZ * DEG)
  // R = Rz * Ry * Rx
  const m = new Float64Array(9)
  m[0] = cz * cy;                 m[1] = cz * sy * sx - sz * cx;  m[2] = cz * sy * cx + sz * sx
  m[3] = sz * cy;                 m[4] = sz * sy * sx + cz * cx;  m[5] = sz * sy * cx - cz * sx
  m[6] = -sy;                     m[7] = cy * sx;                 m[8] = cy * cx
  const s = effectiveScale(p)
  for (let i = 0; i < 9; i++) m[i] *= s
  return m
}

export function transformPositions(src: Float32Array, p: Placement): Float32Array {
  const m = rotationMatrix(p)
  const out = new Float32Array(src.length)
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i], y = src[i + 1], z = src[i + 2]
    out[i] = m[0] * x + m[1] * y + m[2] * z
    out[i + 1] = m[3] * x + m[4] * y + m[5] * z
    out[i + 2] = m[6] * x + m[7] * y + m[8] * z
  }
  return out
}

export interface AnalyzeOptions {
  overhangThresholdDeg: number // dikeyden sapma açısı; bunu aşan yüzeyler destek ister (tipik 45)
  manifoldCheck: boolean
  layerHeight: number
  onProgress?: (f: number) => void
}

export interface AnalyzeResult {
  stats: MeshStats
  /** Üçgen başına 1 = sarkma (destek gerekir), 2 = bed teması, 0 = normal */
  overhangMask: Uint8Array
}

/**
 * Yerleştirilmiş (döndürülmüş/ölçeklenmiş) üçgen çorbası üzerinde tüm metrikleri tek geçişte hesaplar.
 * pos: her üçgen 9 float, mm.
 */
export function analyzeMesh(pos: Float32Array, opts: AnalyzeOptions): AnalyzeResult {
  const triCount = Math.floor(pos.length / 9)
  if (triCount === 0) throw new Error('Modelde üçgen yok.')
  const mask = new Uint8Array(triCount)
  const sinThr = Math.sin(opts.overhangThresholdDeg * DEG)

  // 1. geçiş: bbox + hacim + alan + normal bileşenleri
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2]
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      throw new Error(`Dosyada geçersiz koordinat (NaN/sonsuz) var (köşe #${i / 3}); dosya bozuk olabilir.`)
    }
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
  }

  let signedVol = 0
  let area = 0, horizontal = 0, vertical = 0
  let bedContact = 0, overhangArea = 0, overhangProj = 0, supportCol = 0, footprint = 0
  // Kahan benzeri kayıp önlemek için parça toplamları
  let volAcc = 0, volComp = 0
  const bedEps = Math.max(0.02, (maxZ - minZ) * 1e-4)
  const step = Math.max(1, Math.floor(triCount / 40))

  for (let t = 0; t < triCount; t++) {
    const b = t * 9
    const ax = pos[b], ay = pos[b + 1], az = pos[b + 2]
    const bx = pos[b + 3], by = pos[b + 4], bz = pos[b + 5]
    const cx = pos[b + 6], cy = pos[b + 7], cz = pos[b + 8]

    // Signed volume: a · (b × c) / 6
    const v = (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
    const y = v - volComp
    const tmp = volAcc + y
    volComp = (tmp - volAcc) - y
    volAcc = tmp

    // Normal = (b−a) × (c−a)
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az
    const nx = e1y * e2z - e1z * e2y
    const ny = e1z * e2x - e1x * e2z
    const nz = e1x * e2y - e1y * e2x
    const len2 = nx * nx + ny * ny + nz * nz
    if (len2 === 0) continue
    const len = Math.sqrt(len2)
    const a = len / 2
    const unz = nz / len
    const absNz = Math.abs(unz)
    area += a
    horizontal += a * absNz
    vertical += a * Math.sqrt(Math.max(0, 1 - unz * unz))

    const czen = (az + bz + cz) / 3
    if (unz < 0) {
      // Aşağı bakan yüzey
      const onBed = czen - minZ <= bedEps && Math.max(az, bz, cz) - minZ <= bedEps * 5
      if (onBed) {
        bedContact += a
        footprint += a * absNz
        mask[t] = 2
      } else if (unz < -sinThr) {
        overhangArea += a
        overhangProj += a * absNz
        supportCol += a * absNz * (czen - minZ)
        mask[t] = 1
      }
    }
    if (opts.onProgress && t % step === 0) opts.onProgress((t / triCount) * 0.5)
  }
  signedVol = volAcc

  // Footprint: bed'e temas yoksa, tüm yukarı bakan yüzeylerin izdüşümü (üstten görünüm) ≈ ayak izi
  if (footprint <= 0) footprint = horizontal / 2

  let manifold = { checked: false, openEdges: 0, nonManifoldEdges: 0, isClosed: true }
  if (opts.manifoldCheck) {
    manifold = { checked: true, ...checkManifold(pos) }
  }

  const layers = sliceLayers(pos, minZ, maxZ, opts.layerHeight, (f) => opts.onProgress?.(0.5 + f * 0.5))

  const stats: MeshStats = {
    triangleCount: triCount,
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
    size: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ },
    volume: Math.abs(signedVol),
    surfaceArea: area,
    horizontalArea: horizontal,
    verticalArea: vertical,
    bedContactArea: bedContact,
    overhangArea,
    overhangProjectedArea: overhangProj,
    supportColumnVolume: supportCol,
    footprintArea: footprint,
    manifold,
    invertedWinding: signedVol < 0,
    overhangThresholdDeg: opts.overhangThresholdDeg,
    layers,
  }
  opts.onProgress?.(1)
  return { stats, overhangMask: mask }
}

/**
 * Kenar sayımı ile manifold kontrolü. Köşeler 1e-4 mm ızgarasına yuvarlanarak birleştirilir.
 * Her kenar tam 2 üçgende görünmeli. 1 → açık kenar (delik), >2 → non-manifold.
 */
export function checkManifold(pos: Float32Array): { openEdges: number; nonManifoldEdges: number; isClosed: boolean } {
  const triCount = Math.floor(pos.length / 9)
  const vertCount = triCount * 3
  const Q = 1e4 // kuantizasyon (0.0001 mm)

  // Açık adresli hash tablosu: köşe → id
  let tableSize = 1
  while (tableSize < vertCount * 2) tableSize <<= 1
  const tableMask = tableSize - 1
  const table = new Int32Array(tableSize).fill(-1)
  const qx = new Int32Array(vertCount), qy = new Int32Array(vertCount), qz = new Int32Array(vertCount)
  const ids = new Int32Array(vertCount)
  let uniqueCount = 0

  for (let v = 0; v < vertCount; v++) {
    const x = Math.round(pos[v * 3] * Q)
    const y = Math.round(pos[v * 3 + 1] * Q)
    const z = Math.round(pos[v * 3 + 2] * Q)
    let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) & tableMask
    for (;;) {
      const slot = table[h]
      if (slot === -1) {
        table[h] = uniqueCount
        qx[uniqueCount] = x; qy[uniqueCount] = y; qz[uniqueCount] = z
        ids[v] = uniqueCount++
        break
      }
      if (qx[slot] === x && qy[slot] === y && qz[slot] === z) { ids[v] = slot; break }
      h = (h + 1) & tableMask
    }
  }

  // Kenar anahtarları (min<<24 | max — 2^24 = 16.7M köşe sınırı, double hassasiyetinde güvenli)
  const SHIFT = 16777216 // 2^24
  const edges = new Float64Array(triCount * 3)
  for (let t = 0; t < triCount; t++) {
    const a = ids[t * 3], b = ids[t * 3 + 1], c = ids[t * 3 + 2]
    edges[t * 3] = Math.min(a, b) * SHIFT + Math.max(a, b)
    edges[t * 3 + 1] = Math.min(b, c) * SHIFT + Math.max(b, c)
    edges[t * 3 + 2] = Math.min(c, a) * SHIFT + Math.max(c, a)
  }
  edges.sort()
  let open = 0, nonManifold = 0
  let i = 0
  while (i < edges.length) {
    let j = i + 1
    while (j < edges.length && edges[j] === edges[i]) j++
    const n = j - i
    if (n === 1) open++
    else if (n > 2) nonManifold++
    i = j
  }
  return { openEdges: open, nonManifoldEdges: nonManifold, isClosed: open === 0 && nonManifold === 0 }
}

export function vec3Max(v: Vec3): number { return Math.max(v.x, v.y, v.z) }
