import type { PrinterProfile } from '../lib/cost/types.ts'
import { CATALOG_PRINTERS } from './catalog.ts'

/**
 * Yazıcı profilleri. Kaynaklar: Bambu Lab resmi spec PDF'leri ve Bambu Wiki güç sayfası,
 * Elegoo ürün sayfası + Tom's Hardware / CNC Kitchen incelemeleri (Eylül 2026).
 * Fiyatlar resmi TR distribütörü (MetatechTR) ve 3Eksen/Porima3D listelerinden, KDV dahil.
 * "Efektif akış" değerleri ivme/travel/soğutma kayıplarını içeren ortalama tahminlerdir;
 * Ayarlar > Gelişmiş bölümünden kendi dilimleyici sonuçlarınıza göre kalibre edebilirsiniz.
 */
/** Elle doğrulanmış (kaynaklı) profiller; katalogdaki aynı model bunlarla değiştirilmez. */
export const CURATED_PRINTERS: PrinterProfile[] = [
  {
    id: 'bambu-a1-combo',
    name: 'A1 Combo',
    brand: 'Bambu Lab',
    tech: 'fdm',
    bed: { x: 256, y: 256, z: 256 },
    priceTRY: 25080,
    lifetimeHours: 5000,
    maintenanceTRYPerHour: 2.5, // hotend 329 ₺/~800 sa, plaka, kayış
    spec: {
      tech: 'fdm',
      maxFlow: 28,             // resmi spec (Bambu ABS @280 °C); PLA profili 21 mm³/s ile sınırlanır
      efficiencyScale: 1.0,    // 500 mm/s, 10 000 mm/s² (profil ivmesi 6 000)
      outerWallSpeed: 200,     // 0.20 mm Standard @BBL A1
      layerChangeSec: 1.5,
      jobOverheadSec: 300,     // ısınma + titreşim testi + bed leveling + purge: 3–6 dk (forum ölçümleri)
      jobWasteGrams: 1.0,      // purge hattı (G1 E50 ≈ 0.15 g) + nozul temizliği + skirt
      colorChangeWasteGrams: 0.5, // Bambu flush 107–800 mm³ (0.13–1.0 g) + prime tower payı; tipik ~0.35–0.5 g
      colorChangeTimeSec: 75,  // AMS lite yükle/boşalt ~1–1.5 dk
      nozzleDiameter: 0.4,
      supportsMultiColor: true,
      dualNozzle: false,
      nozzleSwitchWasteGrams: 0,
      nozzleSwitchTimeSec: 0,
      avgPowerW: 95,           // Bambu Wiki resmi ölçüm: PLA 95 W, ABS 200 W
      heatupPowerW: 350,
    },
    notes: 'Açık kasa, AMS lite 4 renk. Tek nozul: her renk değişiminde flush israfı olur.',
  },
  {
    id: 'bambu-x2d-combo',
    name: 'X2D Combo',
    brand: 'Bambu Lab',
    tech: 'fdm',
    bed: { x: 256, y: 256, z: 260 },
    priceTRY: 56295,
    lifetimeHours: 6000,
    maintenanceTRYPerHour: 4,   // hotend 815 ₺, filtre, plaka
    spec: {
      tech: 'fdm',
      maxFlow: 40,             // resmi spec; 1000 mm/s, 20 000 mm/s²
      efficiencyScale: 1.15,
      outerWallSpeed: 200,
      layerChangeSec: 1.2,
      jobOverheadSec: 540,     // kalibrasyon 6–8 dk (X serisi) + ısıtmalı kasa (65 °C) ön ısıtma
      jobWasteGrams: 1.5,
      colorChangeWasteGrams: 0.5, // 3+ renkte aynı nozuldan AMS 2 Pro flush (A1 ile aynı mertebede)
      colorChangeTimeSec: 60,
      nozzleDiameter: 0.4,
      supportsMultiColor: true,
      dualNozzle: true,           // 2 renk: hotend flush yok, yalnızca prime tower (X2D FAQ)
      nozzleSwitchWasteGrams: 0.03, // prime tower ~15–20 mm³ / değişim
      nozzleSwitchTimeSec: 8,     // toolhead değişimi + ısı dengeleme
      avgPowerW: 180,          // resmi 250 W (PLA), CNC Kitchen ölçümü 160 W PLA / 330 W ASA (kasa ısıtmalı)
      heatupPowerW: 1200,
    },
    notes: 'Kapalı, ısıtmalı kasa; çift nozul (ana + yardımcı): 2 renk/malzeme flush olmadan basılır, 3+ renkte AMS purge devreye girer. Çift nozul modunda tabla 235.5×256×256 mm.',
  },
  {
    id: 'bambu-h2d',
    name: 'H2D',
    brand: 'Bambu Lab',
    tech: 'fdm',
    bed: { x: 325, y: 320, z: 325 },   // resmi spec: tek nozul 325×320×325; çift nozul 300×320×325; toplam zarf 350×320×325
    priceTRY: 95060,                    // rhino3dprinter 95 060 / 3dultra 94 850 / metatech 98 951 → medyan (KDV dahil, Eyl 2026)
    lifetimeHours: 8000,
    maintenanceTRYPerHour: 5,           // hotend kiti 815 ₺, filtre, plaka
    spec: {
      tech: 'fdm',
      maxFlow: 40,             // resmi: 40 mm³/s standart hotend (65 mm³/s yüksek akışlı hotend ile)
      efficiencyScale: 1.15,   // 1000 mm/s, 20 000 mm/s², CoreXY
      outerWallSpeed: 200,
      layerChangeSec: 1.2,
      jobOverheadSec: 600,     // kalibrasyon + 65 °C ısıtmalı kasa ön ısıtma
      jobWasteGrams: 1.5,
      colorChangeWasteGrams: 0.5, // 3+ renkte aynı nozuldan AMS 2 Pro flush
      colorChangeTimeSec: 60,
      nozzleDiameter: 0.4,
      supportsMultiColor: false,  // AMS dahil değil (Combo sürümüne bakın)
      dualNozzle: true,           // 2 renk/malzeme nozul değişimiyle, flush yok (prime tower)
      nozzleSwitchWasteGrams: 0.03,
      nozzleSwitchTimeSec: 8,
      avgPowerW: 197,          // Bambu Wiki resmi ölçüm: PLA 197 W, PETG 150 W, PC 395 W; bekleme ~25 W
      heatupPowerW: 1500,      // nominal 2200 W @220 V
    },
    notes: 'Kapalı, 65 °C ısıtmalı kasa; çift nozul (300×320×325 mm çift nozul modunda). 350 °C hotend, mühendislik malzemeleri. Kaynak: Bambu Lab resmi spec, Bambu Wiki güç tablosu; fiyat 3 site medyanı.',
  },
  {
    id: 'bambu-h2d-combo',
    name: 'H2D Combo',
    brand: 'Bambu Lab',
    tech: 'fdm',
    bed: { x: 325, y: 320, z: 325 },
    priceTRY: 112800,                   // rhino 113 662 / 3dultra 112 000 / robo90 115 920 / metatech 111 773 → medyan
    lifetimeHours: 8000,
    maintenanceTRYPerHour: 5,
    spec: {
      tech: 'fdm',
      maxFlow: 40,
      efficiencyScale: 1.15,
      outerWallSpeed: 200,
      layerChangeSec: 1.2,
      jobOverheadSec: 600,
      jobWasteGrams: 1.5,
      colorChangeWasteGrams: 0.5,
      colorChangeTimeSec: 60,
      nozzleDiameter: 0.4,
      supportsMultiColor: true,   // AMS 2 Pro dahil
      dualNozzle: true,
      nozzleSwitchWasteGrams: 0.03,
      nozzleSwitchTimeSec: 8,
      avgPowerW: 197,
      heatupPowerW: 1500,
    },
    notes: 'H2D + AMS 2 Pro. Çift nozul: 2 renk flush olmadan; 3+ renkte AMS purge devreye girer. Kaynak: Bambu Lab resmi spec, Bambu Wiki; fiyat 4 site medyanı.',
  },
  {
    id: 'elegoo-jupiter-2',
    name: 'Jupiter 2',
    brand: 'Elegoo',
    tech: 'resin',
    bed: { x: 302.4, y: 161.98, z: 300 },
    priceTRY: 59500,
    lifetimeHours: 3000,       // LCD ömrüyle sınırlı (2000–3000 sa)
    maintenanceTRYPerHour: 8,  // LCD ~6 500 ₺/2 500 sa + FEP 250 ₺/50 baskı + eldiven/filtre
    spec: {
      tech: 'resin',
      pixelSizeMm: 0.023,      // 20 × 26 µm, 16K 14"
      defaultLayerHeight: 0.05,
      exposureSec: 2.5,        // Elegoo standart reçine (Tom's Hardware spec tablosu); ısıtmalı vat
      bottomExposureSec: 25,   // Jupiter SE resmi profili baz alındı (Jupiter 2 için yayınlanmadı)
      bottomLayers: 6,
      liftCycleSec: 7.0,       // kaldırma 3+4 mm @ 85+300 mm/dk, iniş 300+70, 0.5 s bekleme (~9.5 s/katman toplam)
      vatCapacityMl: 1500,     // yayınlanmadı; otomatik besleme 2 kg şişeden
      avgPowerW: 150,          // ölçüm yok; PSU 300 W; LCD + COB UV + vat ısıtıcı tahmini
      postPowerW: 60,          // yıkama/kürleme istasyonu
      tiltRelease: true,       // eğimli ayırma: kaldırma parametresi elle ayarlanmaz, kaplama cezası yok
    },
    notes: 'Otomatik reçine besleme/geri alma, 30 °C ısıtmalı vat, tilt-release. Maks hız 70 mm/sa. Süre parça sayısından bağımsız, sadece yüksekliğe bağlıdır.',
  },
  {
    id: 'bambu-p1s-combo',
    name: 'P1S Combo',
    brand: 'Bambu Lab',
    tech: 'fdm',
    bed: { x: 256, y: 256, z: 256 },
    priceTRY: 44000,          // AMS dahil Combo, TR perakende KDV dahil (Akakçe/Metatech, Eyl 2026)
    lifetimeHours: 6000,
    maintenanceTRYPerHour: 3,
    spec: {
      tech: 'fdm',
      maxFlow: 32,             // kapalı kasa CoreXY, sertleştirilmiş nozul; PLA profili ~21 ile sınırlı
      efficiencyScale: 1.1,    // 500 mm/s, input shaping ile ~20 000 mm/s²
      outerWallSpeed: 200,
      layerChangeSec: 1.3,
      jobOverheadSec: 300,
      jobWasteGrams: 1.0,
      colorChangeWasteGrams: 0.6, // AMS flush (tek nozul) A1'den biraz yüksek
      colorChangeTimeSec: 45,
      nozzleDiameter: 0.4,
      supportsMultiColor: true,
      dualNozzle: false,
      nozzleSwitchWasteGrams: 0,
      nozzleSwitchTimeSec: 0,
      avgPowerW: 110,          // kapalı kasa CoreXY, PLA sürekli
      heatupPowerW: 350,
    },
    notes: 'Kapalı kasa CoreXY, AMS 4 renk. Tek nozul: renk değişiminde flush israfı olur. ABS/ASA için ideal.',
  },
  {
    id: 'creality-ender3-v3-ke',
    name: 'Ender-3 V3 KE',
    brand: 'Creality',
    tech: 'fdm',
    bed: { x: 220, y: 220, z: 240 },
    priceTRY: 34000,          // TR perakende KDV dahil (Akakçe/Cimri, Eyl 2026)
    lifetimeHours: 4000,
    maintenanceTRYPerHour: 2,
    spec: {
      tech: 'fdm',
      maxFlow: 24,             // 60 W seramik ısıtıcı, yüksek akışlı nozul
      efficiencyScale: 0.95,   // açık kasa, Klipper 500 mm/s, ~8 000 mm/s²
      outerWallSpeed: 180,
      layerChangeSec: 1.6,
      jobOverheadSec: 240,
      jobWasteGrams: 0.8,      // prime hattı
      colorChangeWasteGrams: 0,
      colorChangeTimeSec: 0,
      nozzleDiameter: 0.4,
      supportsMultiColor: false,
      dualNozzle: false,
      nozzleSwitchWasteGrams: 0,
      nozzleSwitchTimeSec: 0,
      avgPowerW: 110,          // 350 W yatak + hotend, PLA ortalama
      heatupPowerW: 300,
    },
    notes: 'Açık kasa, Klipper tabanlı hızlı yazıcı. Tek renk. Fiyat/performans için popüler giriş seviyesi.',
  },
  {
    id: 'anycubic-kobra3-combo',
    name: 'Kobra 3 Combo',
    brand: 'Anycubic',
    tech: 'fdm',
    bed: { x: 250, y: 250, z: 260 },
    priceTRY: 20000,          // ACE Pro dahil Combo, TR perakende KDV dahil (Akakçe/Porima, Eyl 2026)
    lifetimeHours: 4000,
    maintenanceTRYPerHour: 2,
    spec: {
      tech: 'fdm',
      maxFlow: 28,             // 600 mm/s, yüksek akışlı hotend
      efficiencyScale: 1.0,
      outerWallSpeed: 180,
      layerChangeSec: 1.5,
      jobOverheadSec: 300,
      jobWasteGrams: 1.2,
      colorChangeWasteGrams: 1.2, // ACE Pro flush yüksektir (tek nozul, 4 renk)
      colorChangeTimeSec: 60,
      nozzleDiameter: 0.4,
      supportsMultiColor: true,
      dualNozzle: false,
      nozzleSwitchWasteGrams: 0,
      nozzleSwitchTimeSec: 0,
      avgPowerW: 100,
      heatupPowerW: 300,
    },
    notes: 'Açık kasa, ACE Pro ile 4 renk. Renk değişimlerinde flush israfı yüksektir. Geniş 250 mm tabla.',
  },
  {
    id: 'prusa-core-one',
    name: 'Core One',
    brand: 'Prusa',
    tech: 'fdm',
    bed: { x: 250, y: 220, z: 270 },
    priceTRY: 105000,         // Kit, TR distribütör KDV dahil (Metatech, Eyl 2026)
    lifetimeHours: 8000,
    maintenanceTRYPerHour: 3.5,
    spec: {
      tech: 'fdm',
      maxFlow: 24,             // Nextruder, 0.4 nozul
      efficiencyScale: 1.05,   // kapalı CoreXY, ~500 mm/s
      outerWallSpeed: 180,
      layerChangeSec: 1.4,
      jobOverheadSec: 360,     // mesh bed leveling + kasa ön ısıtma
      jobWasteGrams: 1.2,      // purge hattı
      colorChangeWasteGrams: 0,
      colorChangeTimeSec: 0,
      nozzleDiameter: 0.4,
      supportsMultiColor: false, // MMU3 opsiyonel; standartta tek renk
      dualNozzle: false,
      nozzleSwitchWasteGrams: 0,
      nozzleSwitchTimeSec: 0,
      avgPowerW: 120,
      heatupPowerW: 350,
    },
    notes: 'Kapalı kasa CoreXY, aktif hazne sıcaklığı. Mühendislik malzemeleri (ASA/ABS/PC/PA) için uygun. MMU3 ile çok renk eklenebilir.',
  },
  {
    id: 'elegoo-saturn4-ultra-16k',
    name: 'Saturn 4 Ultra 16K',
    brand: 'Elegoo',
    tech: 'resin',
    bed: { x: 218.88, y: 122.88, z: 220 },
    priceTRY: 26000,          // 16K, TR perakende KDV dahil (Akakçe/İncehesap, Eyl 2026)
    lifetimeHours: 2500,       // LCD ömrü
    maintenanceTRYPerHour: 6,  // LCD + FEP + sarf
    spec: {
      tech: 'resin',
      pixelSizeMm: 0.019,      // 19 µm, 16K 10"
      defaultLayerHeight: 0.05,
      exposureSec: 2.5,
      bottomExposureSec: 24,
      bottomLayers: 5,
      liftCycleSec: 6.0,       // tilt-release, hızlı kaldırma
      vatCapacityMl: 500,
      avgPowerW: 120,
      postPowerW: 60,
      tiltRelease: true,
    },
    notes: 'Tilt-release ayırma, yüksek hızlı 16K MSLA. Masaüstü sınıfının en popüler reçine yazıcılarından. Süre yüksekliğe bağlıdır.',
  },
  {
    id: 'elegoo-mars5-ultra-9k',
    name: 'Mars 5 Ultra 9K',
    brand: 'Elegoo',
    tech: 'resin',
    bed: { x: 153.36, y: 77.76, z: 165 },
    priceTRY: 20000,          // 9K, TR perakende KDV dahil (Akakçe/Cimri, Eyl 2026)
    lifetimeHours: 2200,
    maintenanceTRYPerHour: 5,
    spec: {
      tech: 'resin',
      pixelSizeMm: 0.018,      // 18 µm, 9K 7"
      defaultLayerHeight: 0.05,
      exposureSec: 2.5,
      bottomExposureSec: 25,
      bottomLayers: 5,
      liftCycleSec: 6.5,       // tilt-release
      vatCapacityMl: 200,
      avgPowerW: 100,
      postPowerW: 60,
      tiltRelease: true,
    },
    notes: 'Kompakt 9K MSLA, tilt-release. Küçük/orta parçalar için popüler. Süre yüksekliğe bağlıdır.',
  },
]

/** Katalog betiğiyle (scripts/build-catalog.py) aynı kanonik anahtar: parantez, "AMS", "Original Prusa", CoreXZ vb. yazım farkları yok sayılır. */
const normKey = (p: PrinterProfile) => `${p.brand} ${p.name}`.toLowerCase()
  .replace(/\+/g, ' plus ').replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ')
  .replace(/\b(3d|printer|yazici|original prusa|ams|core xz|corexz|quick swap|dual nozzle|idex)\b/g, ' ')
  .replace(/\bmars 5 ultra 9k\b/, 'mars 5 ultra').replace(/\ba350t\b/, 'a350')
  .replace(/\s+/g, ' ').trim()
const curatedKeys = new Set(CURATED_PRINTERS.map(normKey))

/** Tüm dahili profiller: seçilmiş profiller + perakende kataloğu (aynı model tekrar eklenmez). Marka/model sırasıyla.
 *  Açılır listede gösterilmez; "Yazıcı ekle" penceresinde şablon olarak sunulur. */
export const ALL_PRINTERS: PrinterProfile[] = [
  ...CURATED_PRINTERS,
  ...CATALOG_PRINTERS.filter((p) => !curatedKeys.has(normKey(p))),
].sort((a, b) => a.tech.localeCompare(b.tech) || a.brand.localeCompare(b.brand, 'tr') || a.name.localeCompare(b.name, 'tr', { numeric: true }))

/** Açılır listede yer alan yazıcılar (kullanıcının atölyesi): sıra korunur. Diğer profiller şablon olarak kalır. */
export const ACTIVE_PRINTER_IDS = ['bambu-a1-combo', 'bambu-x2d-combo', 'elegoo-jupiter-2', 'cat-anycubic-photon-p1'] as const

export const PRINTERS: PrinterProfile[] = ACTIVE_PRINTER_IDS
  .map((id) => ALL_PRINTERS.find((p) => p.id === id))
  .filter((p): p is PrinterProfile => !!p)

/** Varsayılan seçim: Bambu Lab A1 Combo (aktif listenin ilki) */
export const DEFAULT_PRINTER_ID = PRINTERS[0].id

export const printerById = (id: string) => ALL_PRINTERS.find((p) => p.id === id) ?? PRINTERS[0]
