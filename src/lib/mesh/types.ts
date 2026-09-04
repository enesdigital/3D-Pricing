export interface Vec3 { x: number; y: number; z: number }

/** Duvar kalınlığı örnekleri (worker'dan transfer edilir) */
export interface ThicknessData {
  samples: Float32Array
  tri: Uint32Array
  p5: number
  p50: number
  sampleCount: number
  skipped: boolean
}

/** Modelin bed üzerindeki yerleşimi: derece cinsinden döndürme + ölçek. */
export interface Placement {
  rotX: number
  rotY: number
  rotZ: number
  /** Dosya birimi: 1 = mm, 25.4 = inç */
  unit: number
  /** Kullanıcı ölçeği, yüzde (100 = orijinal) */
  scalePct: number
}

/** Toplam ölçek çarpanı (birim × yüzde) */
export const effectiveScale = (p: Placement) => {
  const s = (p.unit || 1) * ((p.scalePct || 100) / 100)
  return Number.isFinite(s) && s > 0 ? s : 1
}
export const DEFAULT_PLACEMENT: Placement = { rotX: 0, rotY: 0, rotZ: 0, unit: 1, scalePct: 100 }

import type { LayerProfile } from './slice.ts'
import type { OrientationMetrics } from './orient.ts'

export interface MeshStats {
  triangleCount: number
  /** Döndürme + ölçek uygulanmış bounding box (mm). */
  min: Vec3
  max: Vec3
  size: Vec3
  /** Kapalı hacim, mm³ (mutlak). */
  volume: number
  /** Toplam yüzey alanı, mm² */
  surfaceArea: number
  /** Σ alan·|nz| — yatay (üst/alt) yüzey izdüşüm alanı, mm² */
  horizontalArea: number
  /** Σ alan·√(1−nz²) — dikey bileşen, duvarlar için, mm² */
  verticalArea: number
  /** Bed'e temas eden (en alttaki) yüzey alanı, mm² */
  bedContactArea: number
  /** Sarkma eşiğini aşan yüzey alanı (bed'e temas hariç), mm² */
  overhangArea: number
  /** Sarkan yüzeylerin XY izdüşüm alanı, mm² */
  overhangProjectedArea: number
  /** Sarkan yüzeylerin altından bed'e kadar olan hacim (dolu sütun), mm³ */
  supportColumnVolume: number
  /** Bed'e temas eden ilk katman izdüşümü yaklaşık (footprint), mm² */
  footprintArea: number
  /** Manifold kontrolü */
  manifold: {
    checked: boolean
    openEdges: number
    nonManifoldEdges: number
    isClosed: boolean
    /** Bağlı bileşen (ayrı kabuk) sayısı */
    components: number
    /** Aynı yönde iki kez görülen kenar sayısı (tutarsız sarım → hacim güvenilmez) */
    inconsistentEdges: number
  }
  /** Yüzey normali negatif hacim veriyorsa (ters sarım) */
  invertedWinding: boolean
  overhangThresholdDeg: number
  /** Katman profili (dilimleme) */
  layers: LayerProfile
}

export type WorkerRequest =
  | { type: 'load'; id: number; partId: string; buffer: ArrayBuffer; fileName: string }
  | { type: 'analyze'; id: number; partId: string; placement: Placement; overhangThresholdDeg: number; manifoldCheck: boolean; layerHeight: number; thickness: boolean }
  /** partId verilmezse tüm parçalar bırakılır */
  | { type: 'unload'; partId?: string }
  /** Otomatik yönlendirme adaylarını puanla */
  | { type: 'orient'; id: number; partId: string; placement: Placement; overhangThresholdDeg: number; tech: 'fdm' | 'resin' }

export type WorkerResponse =
  | { type: 'progress'; id: number; phase: 'parse' | 'analyze' | 'orient'; fraction: number }
  | { type: 'loaded'; id: number; positions: Float32Array; triangleCount: number; format: string; unit?: number; colorHint?: number | null; objectCount?: number; decimated?: boolean }
  | { type: 'analyzed'; id: number; stats: MeshStats; overhangMask: Uint8Array; thickness: ThicknessData | null }
  | { type: 'oriented'; id: number; candidates: OrientationMetrics[] }
  | { type: 'error'; id: number; message: string }
