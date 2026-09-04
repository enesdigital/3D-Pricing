import type { BedSize } from './types.ts'
import type { PlateLayout } from './engine.ts'

/** Paketlenecek parça: taban kutusu (mm) ve adet */
export interface PackItem { key: string; w: number; h: number; z: number; count: number }
/** Tabla üzerine yerleştirilmiş bir kopya; x,y kutunun sol-alt köşesi (tabla koordinatı, mm) */
export interface PackedRect { key: string; x: number; y: number; w: number; h: number; rotated: boolean }
export interface PackedPlate {
  items: PackedRect[]
  /** Parça anahtarı → bu tabladaki kopya sayısı */
  counts: Record<string, number>
  /** Kutu konumu olmadan yalnızca sayıya göre (çok yüksek adette ızgara kestirimi) */
  synthetic: boolean
}
export interface PackResult {
  plates: PackedPlate[]
  /** Tablaya hiç sığmayan parçalar: anahtar → adet */
  unplaced: Record<string, number>
  /** Kenar payı ihlal edilerek yerleştirilen parça var mı */
  marginViolated: boolean
}

interface FreeRect { x: number; y: number; w: number; h: number }

/** Tek tabla için MaxRects (Best Short Side Fit, 90° döndürme serbest) */
class MaxRectsBin {
  free: FreeRect[]
  items: PackedRect[] = []
  counts: Record<string, number> = {}
  W: number
  H: number
  constructor(W: number, H: number) { this.W = W; this.H = H; this.free = [{ x: 0, y: 0, w: W, h: H }] }

  insert(key: string, w: number, h: number, allowRotate: boolean): PackedRect | null {
    let best: { i: number; x: number; y: number; w: number; h: number; rotated: boolean; s1: number; s2: number } | null = null
    const tryFit = (i: number, fw: number, fh: number, rotated: boolean) => {
      const f = this.free[i]
      if (fw > f.w + 1e-9 || fh > f.h + 1e-9) return
      const s1 = Math.min(f.w - fw, f.h - fh), s2 = Math.max(f.w - fw, f.h - fh)
      if (!best || s1 < best.s1 || (s1 === best.s1 && s2 < best.s2)) best = { i, x: f.x, y: f.y, w: fw, h: fh, rotated, s1, s2 }
    }
    for (let i = 0; i < this.free.length; i++) {
      tryFit(i, w, h, false)
      if (allowRotate && Math.abs(w - h) > 1e-9) tryFit(i, h, w, true)
    }
    if (!best) return null
    const b = best as { x: number; y: number; w: number; h: number; rotated: boolean }
    const placed: PackedRect = { key, x: b.x, y: b.y, w: b.w, h: b.h, rotated: b.rotated }
    this.split(placed)
    this.prune()
    this.items.push(placed)
    this.counts[key] = (this.counts[key] ?? 0) + 1
    return placed
  }

  private split(r: PackedRect) {
    const next: FreeRect[] = []
    for (const f of this.free) {
      if (r.x >= f.x + f.w || r.x + r.w <= f.x || r.y >= f.y + f.h || r.y + r.h <= f.y) { next.push(f); continue }
      if (r.x > f.x) next.push({ x: f.x, y: f.y, w: r.x - f.x, h: f.h })
      if (r.x + r.w < f.x + f.w) next.push({ x: r.x + r.w, y: f.y, w: f.x + f.w - (r.x + r.w), h: f.h })
      if (r.y > f.y) next.push({ x: f.x, y: f.y, w: f.w, h: r.y - f.y })
      if (r.y + r.h < f.y + f.h) next.push({ x: f.x, y: r.y + r.h, w: f.w, h: f.y + f.h - (r.y + r.h) })
    }
    this.free = next.filter((f) => f.w > 1e-6 && f.h > 1e-6)
  }

  private prune() {
    const f = this.free
    const contains = (a: FreeRect, b: FreeRect) => b.x >= a.x - 1e-9 && b.y >= a.y - 1e-9 && b.x + b.w <= a.x + a.w + 1e-9 && b.y + b.h <= a.y + a.h + 1e-9
    const keep: FreeRect[] = []
    for (let i = 0; i < f.length; i++) {
      let dominated = false
      for (let j = 0; j < f.length && !dominated; j++) if (i !== j && contains(f[j], f[i]) && !(contains(f[i], f[j]) && j > i)) dominated = true
      if (!dominated) keep.push(f[i])
    }
    this.free = keep
  }
}

/** MaxRects ile paketlenen en fazla kopya; kalanı ızgara kapasitesiyle sayısal olarak dağıtılır */
export const MAX_PACKED_INSTANCES = 2500

/**
 * Karışık tabla yerleşimi: tüm parçaların kopyaları büyükten küçüğe MaxRects ile tablalara dağıtılır.
 * Parçalar arası boşluk kutuya, tablaya ise kenar payı uygulanır. Tablaya (kenar payı olmadan da) sığmayan
 * parçalar `unplaced` olarak döner. Yalnızca kenar payı ihlaliyle sığan parça tek başına bir tablaya konur.
 */
export function packPlates(items: PackItem[], bed: BedSize, spacing: number, margin: number, opts: { maxInstances?: number } = {}): PackResult {
  const maxInst = Math.max(1, opts.maxInstances ?? MAX_PACKED_INSTANCES)
  const sp = Math.max(0, spacing)
  const mg = Math.max(0, margin)
  const ux = bed.x - 2 * mg, uy = bed.y - 2 * mg
  const eps = 0.01
  const unplaced: Record<string, number> = {}
  const plates: PackedPlate[] = []
  const bins: MaxRectsBin[] = []
  let marginViolated = false

  const fitsMargin = (w: number, h: number) => (w <= ux + eps && h <= uy + eps) || (h <= ux + eps && w <= uy + eps)
  const fitsBed = (w: number, h: number) => (w <= bed.x + eps && h <= bed.y + eps) || (h <= bed.x + eps && w <= bed.y + eps)

  // Büyük alan önce; aynı alanlı parçalar anahtar sırasıyla (deterministik)
  const queue: { key: string; w: number; h: number; count: number }[] = []
  for (const it of items) {
    const count = Math.max(0, Math.floor(Number.isFinite(it.count) ? it.count : 0))
    if (count === 0) continue
    if (!(it.w > 0 && it.h > 0) || it.z > bed.z + eps || !fitsBed(it.w, it.h)) { unplaced[it.key] = (unplaced[it.key] ?? 0) + count; continue }
    if (!fitsMargin(it.w, it.h)) {
      // Kenar payı ihlal edilerek tek başına birer tabla
      marginViolated = true
      const rotated = !(it.w <= bed.x + eps && it.h <= bed.y + eps)
      for (let c = 0; c < count; c++) plates.push({ items: [{ key: it.key, x: -mg + (bed.x - (rotated ? it.h : it.w)) / 2, y: -mg + (bed.y - (rotated ? it.w : it.h)) / 2, w: rotated ? it.h : it.w, h: rotated ? it.w : it.h, rotated }], counts: { [it.key]: 1 }, synthetic: false })
      continue
    }
    queue.push({ key: it.key, w: it.w, h: it.h, count })
  }
  queue.sort((a, b) => b.w * b.h - a.w * a.h || a.key.localeCompare(b.key))

  let packed = 0
  const leftovers: { key: string; w: number; h: number; count: number }[] = []
  for (const q of queue) {
    let remaining = q.count
    while (remaining > 0 && packed < maxInst) {
      let placed: PackedRect | null = null
      for (const bin of bins) { placed = bin.insert(q.key, q.w + sp, q.h + sp, true); if (placed) break }
      if (!placed) {
        const bin = new MaxRectsBin(ux + sp, uy + sp)
        bins.push(bin)
        placed = bin.insert(q.key, q.w + sp, q.h + sp, true)
        if (!placed) { unplaced[q.key] = (unplaced[q.key] ?? 0) + remaining; remaining = 0; break } // olmamalı: fitsMargin kontrol edildi
      }
      remaining--; packed++
    }
    if (remaining > 0) leftovers.push({ ...q, count: remaining })
  }
  for (const bin of bins) {
    plates.push({ items: bin.items.map((r) => ({ key: r.key, x: r.x, y: r.y, w: r.w - sp, h: r.h - sp, rotated: r.rotated })), counts: { ...bin.counts }, synthetic: false })
  }
  // Çok yüksek adet: kalanlar parça başına ızgara kapasitesiyle tam tablalara dağıtılır
  for (const q of leftovers) {
    const cap = Math.max(1, gridCapacity(q.w, q.h, ux, uy, sp))
    let rem = q.count
    while (rem > 0) { const k = Math.min(cap, rem); plates.push({ items: [], counts: { [q.key]: k }, synthetic: true }); rem -= k }
  }
  return { plates, unplaced, marginViolated }
}

function gridCapacity(w: number, h: number, ux: number, uy: number, sp: number): number {
  const g = (a: number, b: number) => Math.max(0, Math.floor((ux + sp) / (a + sp))) * Math.max(0, Math.floor((uy + sp) / (b + sp)))
  return Math.max(g(w, h), g(h, w))
}

/** Tek parçalı ızgara yerleşimi için kopya merkezleri (tabla koordinatı, mm) — 3B görünüm */
export function gridInstances(layout: PlateLayout, shown: number, bed: BedSize): { x: number; y: number; rotated: boolean }[] {
  const n = Math.max(0, Math.min(shown, layout.capacity))
  if (n <= 1) return [{ x: bed.x / 2, y: bed.y / 2, rotated: n === 1 ? layout.rotated : false }]
  const cols = Math.max(1, layout.cols)
  const rowsUsed = Math.ceil(n / cols)
  const colsUsed = Math.min(cols, n)
  const gridW = colsUsed * layout.cellX + (colsUsed - 1) * layout.spacing
  const gridH = rowsUsed * layout.cellY + (rowsUsed - 1) * layout.spacing
  const x0 = (bed.x - gridW) / 2 + layout.cellX / 2
  const y0 = (bed.y - gridH) / 2 + layout.cellY / 2
  const out: { x: number; y: number; rotated: boolean }[] = []
  for (let i = 0; i < n; i++) {
    const c = i % cols, r = Math.floor(i / cols)
    out.push({ x: x0 + c * (layout.cellX + layout.spacing), y: y0 + r * (layout.cellY + layout.spacing), rotated: layout.rotated })
  }
  return out
}

/** Paketlenmiş kutuları kopya merkezlerine çevirir (kenar payı eklenir) */
export function packedInstances(plate: PackedPlate, margin: number): { key: string; x: number; y: number; rotated: boolean }[] {
  return plate.items.map((r) => ({ key: r.key, x: margin + r.x + r.w / 2, y: margin + r.y + r.h / 2, rotated: r.rotated }))
}
