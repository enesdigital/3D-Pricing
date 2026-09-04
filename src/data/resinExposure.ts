import type { Material, PrinterProfile } from '../lib/cost/types.ts'

/**
 * Reçine pozlama veritabanı: yazıcı sınıfı × reçine türü için 0,05 mm başlangıç değerleri.
 * Kaynaklar: ELEGOO resmi "Resin Settings" tabloları (Mars/Saturn/Jupiter serileri, 2023–2025 sürümleri; standart reçine
 * 0,05 mm için Jupiter 2 / Saturn 4 Ultra 16K sınıfında 2,5–3 s, taban 25–35 s, 5–6 taban katmanı) ve Anycubic Wiki
 * "Resin Settings for Photon Series" (Anycubic reçineyle 2–3 s, taban 25–40 s, 6 taban katmanı; 14K Photon P1 / Mono M7 sınıfı).
 * Değerler aralıkların ortası, reçine türü ve katman kalınlığı için türetilmiş çarpanlar uygulanır → kalibrasyon başlangıcıdır.
 */
export type ResinType = 'standard' | 'water' | 'abslike' | 'highres' | 'clear' | 'other'

export interface ExposureBase {
  /** Yazıcı kimliği/adı deseni (küçük harf, includes) */
  match: RegExp
  label: string
  /** 0,05 mm standart reçine */
  exposureSec: number
  bottomExposureSec: number
  bottomLayers: number
  /** Katman başına kaldırma+inme (varsa; yoksa mevcut parametre korunur) */
  liftCycleSec?: number
  source: string
}

/** Sıra önemli: ilk eşleşen kullanılır (özelden genele) */
export const EXPOSURE_BASES: ExposureBase[] = [
  { match: /jupiter 2|jupiter-2/, label: 'Elegoo Jupiter 2 (16K)', exposureSec: 2.7, bottomExposureSec: 28, bottomLayers: 5, liftCycleSec: 7, source: 'ELEGOO resmi tablo: 2,5–3 s / 25–30 s' },
  { match: /jupiter se|jupiter-se|jupiter 6k/, label: 'Elegoo Jupiter SE / 6K', exposureSec: 3, bottomExposureSec: 35, bottomLayers: 5, liftCycleSec: 8, source: 'ELEGOO resmi tablo (Jupiter): 3 s / 30–40 s' },
  { match: /jupiter/, label: 'Elegoo Jupiter', exposureSec: 3, bottomExposureSec: 35, bottomLayers: 5, liftCycleSec: 8, source: 'ELEGOO resmi tablo (Jupiter): 3 s / 30–40 s' },
  { match: /saturn 4 ultra|saturn-4-ultra|saturn 4/, label: 'Elegoo Saturn 4 Ultra', exposureSec: 2.5, bottomExposureSec: 25, bottomLayers: 5, liftCycleSec: 6, source: 'ELEGOO resmi tablo: 2,5 s / 25 s' },
  { match: /saturn 3|saturn-3/, label: 'Elegoo Saturn 3 (12K)', exposureSec: 2.5, bottomExposureSec: 30, bottomLayers: 6, source: 'ELEGOO resmi tablo: 2,5 s / 30 s' },
  { match: /saturn 2|saturn-2|saturn 8k/, label: 'Elegoo Saturn 2 (8K)', exposureSec: 2.5, bottomExposureSec: 30, bottomLayers: 6, source: 'ELEGOO resmi tablo: 2,5 s / 30 s' },
  { match: /saturn/, label: 'Elegoo Saturn', exposureSec: 3, bottomExposureSec: 35, bottomLayers: 6, source: 'ELEGOO resmi tablo (Saturn/S): 2,5–3,5 s / 30–40 s' },
  { match: /mars 5 ultra|mars-5-ultra|mars 5|mars 4 ultra|mars-4-ultra/, label: 'Elegoo Mars 4/5 Ultra (9K)', exposureSec: 2, bottomExposureSec: 28, bottomLayers: 5, liftCycleSec: 5, source: 'ELEGOO resmi tablo: 1,8–2,5 s / 25–30 s' },
  { match: /mars 4|mars-4|mars 3|mars-3/, label: 'Elegoo Mars 3/4', exposureSec: 2.5, bottomExposureSec: 30, bottomLayers: 5, source: 'ELEGOO resmi tablo: 2–3 s / 30 s' },
  { match: /mars/, label: 'Elegoo Mars', exposureSec: 2.5, bottomExposureSec: 35, bottomLayers: 5, source: 'ELEGOO resmi tablo (Mars serisi): 2–3 s / 30–40 s' },
  { match: /photon p1|photon-p1|mono m7|mono-m7|m7 pro|m7 max|m5s pro/, label: 'Anycubic Photon P1 / Mono M7 (14K)', exposureSec: 2.2, bottomExposureSec: 28, bottomLayers: 6, liftCycleSec: 6, source: 'Anycubic Wiki: Anycubic reçineyle 2–3 s / 25–40 s, 6 taban katmanı' },
  { match: /mono 4 ultra|mono-4-ultra|mono 4|mono x 6k|m5s/, label: 'Anycubic Photon Mono 4 / M5s', exposureSec: 1.8, bottomExposureSec: 25, bottomLayers: 6, source: 'Anycubic Wiki: 1,5–2,5 s / 25–30 s' },
  { match: /m3 max|mono x|mono m3/, label: 'Anycubic Photon M3 / Mono X', exposureSec: 2.5, bottomExposureSec: 30, bottomLayers: 6, source: 'Anycubic Wiki: 2–3 s / 25–40 s' },
  { match: /anycubic|photon/, label: 'Anycubic Photon (genel)', exposureSec: 2.5, bottomExposureSec: 30, bottomLayers: 6, source: 'Anycubic Wiki: 2–3 s / 25–40 s' },
  { match: /halot|creality/, label: 'Creality Halot', exposureSec: 2.5, bottomExposureSec: 30, bottomLayers: 5, source: 'Creality önerisi: 2–3 s / 30 s (türetilmiş)' },
  { match: /phrozen|sonic/, label: 'Phrozen Sonic', exposureSec: 2.5, bottomExposureSec: 30, bottomLayers: 5, source: 'Phrozen tablosu: 2–3 s / 30 s (türetilmiş)' },
]
/** Tanınmayan yazıcı: mono LCD genel başlangıcı */
export const EXPOSURE_FALLBACK: ExposureBase = { match: /./, label: 'Mono LCD (genel)', exposureSec: 2.5, bottomExposureSec: 30, bottomLayers: 5, source: 'Genel mono LCD başlangıç değeri (türetilmiş)' }

/** Reçine türü çarpanları: pozlama ekleme (s) ve taban pozlama ekleme (s) — resmi tablolardaki farklara göre */
export const RESIN_TYPE_ADJ: Record<ResinType, { addSec: number; addBottomSec: number; mul: number }> = {
  standard: { addSec: 0, addBottomSec: 0, mul: 1 },
  water: { addSec: 0.3, addBottomSec: 0, mul: 1 },
  abslike: { addSec: 0.5, addBottomSec: 5, mul: 1 },
  highres: { addSec: 0.3, addBottomSec: 0, mul: 1 },
  clear: { addSec: 0, addBottomSec: 10, mul: 2 },
  other: { addSec: 0.3, addBottomSec: 0, mul: 1 },
}

export function classifyResin(m: Material | null | undefined): ResinType {
  const n = (m?.name ?? '').toLocaleLowerCase('tr-TR')
  if (!n) return 'standard'
  if (/su ile|water|yıkanabilir/.test(n)) return 'water'
  if (/abs|tough|dayanıklı|sert|rigid|pro 2/.test(n)) return 'abslike'
  if (/clear|şeffaf|transparent|saydam/.test(n)) return 'clear'
  if (/8k|9k|12k|14k|16k|yüksek detay|high.?detail|\bhd\b/.test(n)) return 'highres'
  if (/standar|standart|basic|plant|bitki|genel|eco|rapid/.test(n)) return 'standard'
  return 'other'
}

export interface ExposureRecommendation {
  exposureSec: number
  bottomExposureSec: number
  bottomLayers: number
  liftCycleSec: number | null
  base: ExposureBase
  resinType: ResinType
  layerHeight: number
  /** Resmi tablo eşleşmesi mi, genel türetme mi */
  confidence: 'official' | 'derived'
}

const r1 = (n: number) => Math.round(n * 10) / 10

/** Yazıcı + reçine + katman kalınlığı için önerilen pozlama. Katman ölçeği (lh/0,05)^0,75 (0,03 → ×0,68; 0,1 → ×1,68); taban değişmez. */
export function recommendedExposure(printer: PrinterProfile, material: Material | null | undefined, layerHeight: number): ExposureRecommendation | null {
  if (printer.tech !== 'resin') return null
  const key = `${printer.brand} ${printer.name} ${printer.id}`.toLowerCase()
  const base = EXPOSURE_BASES.find((b) => b.match.test(key)) ?? EXPOSURE_FALLBACK
  const resinType = classifyResin(material)
  const adj = RESIN_TYPE_ADJ[resinType]
  const lh = Math.max(0.01, Number.isFinite(layerHeight) ? layerHeight : 0.05)
  const scale = Math.pow(lh / 0.05, 0.75)
  return {
    exposureSec: r1((base.exposureSec * adj.mul + adj.addSec) * scale),
    bottomExposureSec: Math.round(base.bottomExposureSec + adj.addBottomSec),
    bottomLayers: base.bottomLayers,
    liftCycleSec: base.liftCycleSec ?? null,
    base, resinType, layerHeight: lh,
    confidence: base === EXPOSURE_FALLBACK || /türetilmiş/.test(base.source) ? 'derived' : 'official',
  }
}
