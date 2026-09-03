/**
 * Katman dilimleyici: her katman ortasında Z düzlemiyle kesişen üçgenlerden
 * kesit alanı (Green teoremi, normal yönüyle işaretli) ve çevre uzunluğu hesaplar.
 * Kapalı, tutarlı sarımlı mesh'lerde alan doğrudur; ters sarımda mutlak değer alınır.
 * Döngü kurmaya gerek yoktur: alan = ½ Σ (x1·y2 − x2·y1) segmentler üzerinde.
 */
export interface LayerProfile {
  layerHeight: number
  layerCount: number
  /** Katman başına kesit alanı, mm² */
  area: Float32Array
  /** Katman başına çevre uzunluğu, mm */
  perimeter: Float32Array
  /** Σ alan × katman yüksekliği, mm³ (hacim için sağlam alternatif) */
  volume: number
  /** En büyük kesit alanı (reçine ayrılma kuvveti için), mm² */
  maxArea: number
  /** Efektif katman yüksekliği (çok büyük mesh'lerde kabalaştırılabilir) */
  coarsened: boolean
}

export function sliceLayers(
  pos: Float32Array,
  minZ: number,
  maxZ: number,
  layerHeight: number,
  onProgress?: (f: number) => void,
): LayerProfile {
  const nTri = Math.floor(pos.length / 9)
  const height = Number.isFinite(maxZ - minZ) ? Math.max(0, maxZ - minZ) : 0
  // Geçersiz katman kalınlığı (0, NaN, negatif) → güvenli varsayılan; aksi halde kabalaştırma döngüsü sonsuza girer.
  let lh = Number.isFinite(layerHeight) && layerHeight > 0 ? layerHeight : 0.2
  let coarsened = false
  let nLayers = Math.max(1, Math.ceil(height / lh - 1e-6))
  // İş yükü sınırı: üçgen × katman çok büyükse katmanı kabalaştır (tahmin doğruluğu hâlâ yeterli).
  while (nTri * nLayers > 4e8 && nLayers > 50 && lh < height) {
    lh *= 2
    nLayers = Math.max(1, Math.ceil(height / lh - 1e-6))
    coarsened = true
  }

  const zlo = new Float32Array(nTri), zhi = new Float32Array(nTri)
  const startLayer = new Int32Array(nTri)
  const count = new Int32Array(nLayers + 1)
  for (let t = 0; t < nTri; t++) {
    const i = t * 9
    const a = pos[i + 2], b = pos[i + 5], c = pos[i + 8]
    const lo = Math.min(a, b, c), hi = Math.max(a, b, c)
    zlo[t] = lo; zhi[t] = hi
    const s = Math.min(nLayers - 1, Math.max(0, Math.floor((lo - minZ) / lh)))
    startLayer[t] = s
    count[s + 1]++
  }
  for (let l = 0; l < nLayers; l++) count[l + 1] += count[l]
  const order = new Int32Array(nTri)
  const fill = count.slice(0, nLayers)
  for (let t = 0; t < nTri; t++) order[fill[startLayer[t]]++] = t

  const area = new Float32Array(nLayers)
  const perimeter = new Float32Array(nLayers)
  let active = new Int32Array(1024)
  let activeLen = 0
  let cursor = 0
  let volume = 0
  let maxArea = 0
  const px = [0, 0], py = [0, 0]
  const step = Math.max(1, Math.floor(nLayers / 40))

  for (let l = 0; l < nLayers; l++) {
    const z = minZ + (l + 0.5) * lh
    // Yeni aktifleşen üçgenleri ekle
    while (cursor < nTri && startLayer[order[cursor]] <= l) {
      if (activeLen === active.length) {
        const bigger = new Int32Array(active.length * 2)
        bigger.set(active); active = bigger
      }
      active[activeLen++] = order[cursor++]
    }
    let A = 0, P = 0
    let w = 0
    for (let k = 0; k < activeLen; k++) {
      const t = active[k]
      if (zhi[t] < z) continue // bitti, düşür
      active[w++] = t
      const i = t * 9
      let n = 0
      for (let e = 0; e < 3 && n < 2; e++) {
        const a = i + e * 3, b = i + ((e + 1) % 3) * 3
        const za = pos[a + 2], zb = pos[b + 2]
        if ((za < z) !== (zb < z)) {
          const s = (z - za) / (zb - za)
          px[n] = pos[a] + s * (pos[b] - pos[a])
          py[n] = pos[a + 1] + s * (pos[b + 1] - pos[a + 1])
          n++
        }
      }
      if (n < 2) continue
      // Segment yönünü üçgen normaline göre hizala: d ∥ (ny, −nx)
      const ux = pos[i + 3] - pos[i], uy = pos[i + 4] - pos[i + 1], uz = pos[i + 5] - pos[i + 2]
      const vx = pos[i + 6] - pos[i], vy = pos[i + 7] - pos[i + 1], vz = pos[i + 8] - pos[i + 2]
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz
      let dx = px[1] - px[0], dy = py[1] - py[0]
      let x0 = px[0], y0 = py[0], x1 = px[1], y1 = py[1]
      if (dx * ny - dy * nx < 0) { x0 = px[1]; y0 = py[1]; x1 = px[0]; y1 = py[0]; dx = -dx; dy = -dy }
      A += x0 * y1 - x1 * y0
      P += Math.sqrt(dx * dx + dy * dy)
    }
    activeLen = w
    const a = Math.abs(A) / 2
    area[l] = a
    perimeter[l] = P
    volume += a * lh
    if (a > maxArea) maxArea = a
    if (onProgress && l % step === 0) onProgress(l / nLayers)
  }
  onProgress?.(1)
  return { layerHeight: lh, layerCount: nLayers, area, perimeter, volume, maxArea, coarsened }
}
