import type { PrinterProfile } from '../lib/cost/types.ts'

/**
 * Yazıcı profilleri. Kaynaklar: Bambu Lab resmi spec PDF'leri ve Bambu Wiki güç sayfası,
 * Elegoo ürün sayfası + Tom's Hardware / CNC Kitchen incelemeleri (Eylül 2026).
 * Fiyatlar resmi TR distribütörü (MetatechTR) ve 3Eksen/Porima3D listelerinden, KDV dahil.
 * "Efektif akış" değerleri ivme/travel/soğutma kayıplarını içeren ortalama tahminlerdir;
 * Ayarlar > Gelişmiş bölümünden kendi dilimleyici sonuçlarınıza göre kalibre edebilirsiniz.
 */
export const PRINTERS: PrinterProfile[] = [
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
      jobOverheadSec: 420,     // ısınma + otomatik kalibrasyon + purge (~7 dk; Studio prep compensation 260 s)
      jobWasteGrams: 1.0,      // purge hattı (G1 E50 ≈ 0.15 g) + nozul temizliği + skirt
      colorChangeWasteGrams: 0.8, // flush 280–600 mm³ + prime tower payı (~0.4–0.8 g); dark→light 1.0+
      colorChangeTimeSec: 75,  // AMS lite yükle/boşalt ~1–1.5 dk
      nozzleDiameter: 0.4,
      supportsMultiColor: true,
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
      jobOverheadSec: 600,     // ısıtmalı kasa (65 °C) + kalibrasyon
      jobWasteGrams: 1.5,
      colorChangeWasteGrams: 0.4, // çift nozul: 2 renkte hotend flush yok, prime tower var; >2 renkte AMS purge devreye girer
      colorChangeTimeSec: 20,
      nozzleDiameter: 0.4,
      supportsMultiColor: true,
      avgPowerW: 180,          // resmi 250 W (PLA), CNC Kitchen ölçümü 160 W PLA / 330 W ASA (kasa ısıtmalı)
      heatupPowerW: 1200,
    },
    notes: 'Kapalı, ısıtmalı kasa; çift nozul (ana + yardımcı). Çift nozul modunda tabla 235.5×256×256 mm.',
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
    },
    notes: 'Otomatik reçine besleme/geri alma, 30 °C ısıtmalı vat. Maks hız 70 mm/sa.',
  },
]

export const printerById = (id: string) => PRINTERS.find((p) => p.id === id) ?? PRINTERS[0]
