import { transformPositions } from './analyze.ts'
import type { Placement } from './types.ts'

/**
 * Otomatik yönlendirme: 90° adımlı eksene hizalı 16 aday (rotX × rotY) için tek geçişte
 * sarkma/destek/yükseklik/tabla teması hesaplanır ve teknolojiye göre puanlanır.
 * Dilimleme/manifold yapılmaz; 1,5M üçgende ~1–2 s.
 */
export interface OrientationMetrics {
  rotX: number
  rotY: number
  rotZ: number
  height: number
  footprint: number
  bedContactArea: number
  overhangArea: number
  supportColumnVolume: number
  /** Düşük = iyi; adaylar arasında normalize edilmiş bileşik puan */
  score: number
}

export interface OrientOptions {
  overhangThresholdDeg: number
  tech: 'fdm' | 'resin'
  /** Mevcut birim/ölçek (yalnızca döndürme değişir) */
  placement: Placement
  onProgress?: (f: number) => void
}

/** Tek geçiş: bbox + tabla teması + sarkma alanı + destek sütun hacmi (analyzeMesh ile aynı tanımlar) */
export function quickMetrics(pos: Float32Array, thresholdDeg: number): Omit<OrientationMetrics, 'rotX' | 'rotY' | 'rotZ' | 'score'> {
  const triCount = Math.floor(pos.length / 9)
  const sinThr = Math.sin((thresholdDeg * Math.PI) / 180)
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2]
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
  }
  const bedEps = Math.max(0.02, (maxZ - minZ) * 1e-4)
  let bedContact = 0, overhangArea = 0, supportCol = 0
  for (let t = 0; t < triCount; t++) {
    const b = t * 9
    const ax = pos[b], ay = pos[b + 1], az = pos[b + 2], bx = pos[b + 3], by = pos[b + 4], bz = pos[b + 5], cx = pos[b + 6], cy = pos[b + 7], cz = pos[b + 8]
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az, e2x = cx - ax, e2y = cy - ay, e2z = cz - az
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz)
    if (len === 0) continue
    const a = len / 2, unz = nz / len
    if (unz >= 0) continue
    const czen = (az + bz + cz) / 3
    if (czen - minZ <= bedEps && Math.max(az, bz, cz) - minZ <= bedEps * 5) bedContact += a
    else if (unz < -sinThr) { overhangArea += a; supportCol += a * -unz * (czen - minZ) }
  }
  return { height: maxZ - minZ, footprint: (maxX - minX) * (maxY - minY), bedContactArea: bedContact, overhangArea, supportColumnVolume: supportCol }
}

const ANGLES = [0, 90, 180, 270]

export function rankOrientations(original: Float32Array, opts: OrientOptions): OrientationMetrics[] {
  const raw: OrientationMetrics[] = []
  let done = 0
  for (const rotX of ANGLES) for (const rotY of ANGLES) {
    const placed = transformPositions(original, { ...opts.placement, rotX, rotY, rotZ: 0 })
    const m = quickMetrics(placed, opts.overhangThresholdDeg)
    raw.push({ rotX, rotY, rotZ: 0, ...m, score: 0 })
    opts.onProgress?.(++done / 16)
  }
  // Aynı sonucu veren adaylar (ör. rotX 180 + rotY 180 ≡ rotZ 180) tek kez tutulur
  const seen = new Map<string, OrientationMetrics>()
  for (const c of raw) {
    const k = [c.height, c.footprint, c.bedContactArea, c.overhangArea, c.supportColumnVolume].map((v) => Math.round(v * 100)).join('|')
    if (!seen.has(k)) seen.set(k, c)
  }
  const list = [...seen.values()]
  const max = (f: (c: OrientationMetrics) => number) => Math.max(1e-9, ...list.map(f))
  const mSup = max((c) => c.supportColumnVolume), mH = max((c) => c.height), mBed = max((c) => c.bedContactArea), mFoot = max((c) => c.footprint), mOver = max((c) => c.overhangArea)
  for (const c of list) {
    const sup = c.supportColumnVolume / mSup, h = c.height / mH, over = c.overhangArea / mOver
    // Tabla teması: ayak izinin %5'inden azsa (yuvarlak yüzeye teğet duran parça) yapışma/devrilme sorunu → tam ceza
    const bed = c.bedContactArea < 0.05 * c.footprint ? 1 : 1 - c.bedContactArea / mBed
    // FDM: sarkma alanı ve destek hacmi (malzeme+süre) öncelikli, tabla teması (yapışma) ve yükseklik (süre) ikincil
    // Reçine: sarkma/destek + taban alanı (ayrılma kuvveti, footprint vekili) + yükseklik (katman sayısı = süre); tabla teması daha az önemli (raft/destek yaygın)
    c.score = opts.tech === 'fdm'
      ? 0.35 * over + 0.25 * sup + 0.25 * bed + 0.15 * h
      : 0.3 * over + 0.3 * sup + 0.2 * (c.footprint / mFoot) + 0.1 * h + 0.1 * bed
  }
  return list.sort((a, b) => a.score - b.score || a.height - b.height)
}
