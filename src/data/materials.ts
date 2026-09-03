import type { Material } from '../lib/cost/types.ts'
import { CATALOG_MATERIALS } from './catalog.ts'

/**
 * Yoğunluk, maks. akış (0.4 nozul) ve min. katman süresi BambuStudio filament profillerinden (GitHub, Eylül 2026).
 * Fiyatlar Türkiye perakende (Akakçe / Robolink / Metatech / Robot Sepeti, Eylül 2026), 1 kg KDV dahil; ayarlardan düzenlenebilir.
 */
export const CURATED_MATERIALS: Material[] = [
  // --- FDM ---
  { id: 'pla-bambu', name: 'PLA Basic (Bambu Lab)', brand: 'Bambu Lab', tech: 'fdm', density: 1.26, pricePerKgTRY: 1000, maxFlow: 21, minLayerTime: 6, powerFactor: 1 },
  { id: 'pla-generic', name: 'PLA / PLA+ (yerli: Porima, eSUN, Microzey…)', brand: 'Genel', tech: 'fdm', density: 1.24, pricePerKgTRY: 500, maxFlow: 18, minLayerTime: 4, powerFactor: 1 },
  { id: 'pla-silk', name: 'PLA Silk / Matte', brand: 'Genel', tech: 'fdm', density: 1.24, pricePerKgTRY: 800, maxFlow: 15, minLayerTime: 6, powerFactor: 1 },
  { id: 'pla-cf', name: 'PLA-CF', brand: 'Genel', tech: 'fdm', density: 1.22, pricePerKgTRY: 1600, maxFlow: 15, minLayerTime: 8, powerFactor: 1.05 },
  { id: 'petg-bambu', name: 'PETG Basic (Bambu Lab)', brand: 'Bambu Lab', tech: 'fdm', density: 1.25, pricePerKgTRY: 1200, maxFlow: 8, minLayerTime: 12, powerFactor: 1.15 },
  { id: 'petg', name: 'PETG (yerli)', brand: 'Genel', tech: 'fdm', density: 1.27, pricePerKgTRY: 400, maxFlow: 10, minLayerTime: 12, powerFactor: 1.15 },
  { id: 'petg-cf', name: 'PETG-CF', brand: 'Genel', tech: 'fdm', density: 1.25, pricePerKgTRY: 1700, maxFlow: 14, minLayerTime: 6, powerFactor: 1.15 },
  { id: 'abs', name: 'ABS', brand: 'Genel', tech: 'fdm', density: 1.04, pricePerKgTRY: 600, maxFlow: 16, minLayerTime: 12, powerFactor: 1.9 },
  { id: 'asa', name: 'ASA', brand: 'Genel', tech: 'fdm', density: 1.05, pricePerKgTRY: 800, maxFlow: 18, minLayerTime: 12, powerFactor: 1.9 },
  { id: 'tpu', name: 'TPU 95A', brand: 'Genel', tech: 'fdm', density: 1.22, pricePerKgTRY: 1100, maxFlow: 3.6, minLayerTime: 6, powerFactor: 1 },
  { id: 'pa-cf', name: 'PA6-CF (Nylon)', brand: 'Genel', tech: 'fdm', density: 1.10, pricePerKgTRY: 2800, maxFlow: 8, minLayerTime: 2, powerFactor: 2.0 },
  { id: 'pc', name: 'PC', brand: 'Genel', tech: 'fdm', density: 1.185, pricePerKgTRY: 1500, maxFlow: 18, minLayerTime: 2, powerFactor: 2.0 },
  // --- Reçine (Elegoo SDS: özgül ağırlık 1.10–1.125) ---
  { id: 'resin-standard', name: 'Standart reçine (Elegoo Standard V2)', brand: 'Elegoo', tech: 'resin', density: 1.10, pricePerKgTRY: 1000, maxFlow: 0, minLayerTime: 0, powerFactor: 1 },
  { id: 'resin-water', name: 'Su ile yıkanabilir reçine', brand: 'Genel', tech: 'resin', density: 1.13, pricePerKgTRY: 1100, maxFlow: 0, minLayerTime: 0, powerFactor: 1 },
  { id: 'resin-abslike', name: 'ABS-like / dayanıklı reçine', brand: 'Genel', tech: 'resin', density: 1.12, pricePerKgTRY: 1400, maxFlow: 0, minLayerTime: 0, powerFactor: 1 },
  { id: 'resin-8k', name: 'Yüksek detay (8K/12K) reçine', brand: 'Genel', tech: 'resin', density: 1.10, pricePerKgTRY: 1600, maxFlow: 0, minLayerTime: 0, powerFactor: 1 },
]

const normKey = (m: Material) => m.name.toLowerCase().replace(/[^a-z0-9+]+/g, ' ').trim()
const curatedKeys = new Set(CURATED_MATERIALS.map(normKey))

/** Tüm dahili malzemeler: seçilmiş liste + perakende kataloğu (aynı marka+tür tekrar eklenmez). */
export const MATERIALS: Material[] = [
  ...CURATED_MATERIALS,
  ...CATALOG_MATERIALS.filter((m) => !curatedKeys.has(normKey(m))),
]
