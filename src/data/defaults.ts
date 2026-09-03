import type { BusinessSettings, FdmPrintParams, ResinPrintParams } from '../lib/cost/types.ts'

export const DEFAULT_FDM_PARAMS: FdmPrintParams = {
  layerHeight: 0.2,
  lineWidth: 0.42,
  wallLoops: 2,
  topBottomLayers: 4,     // Bambu varsayılanı: üst 5 / alt 3 → ortalama 4
  infillDensity: 0.15,
  supports: 'auto',
  supportDensity: 0.15,   // ağaç destek ~%15
  overhangThresholdDeg: 45,
  colorCount: 1,
  colorChangesPerLayer: 1,
}

export const DEFAULT_RESIN_PARAMS: ResinPrintParams = {
  layerHeight: 0.05,
  exposureSec: 2.5,
  bottomExposureSec: 25,
  bottomLayers: 6,
  liftCycleSec: 7.0, // 3+4 mm @ 85+300 mm/dk kaldırma, 300+70 iniş, 0.5 s bekleme ≈ 6.8 s
  supports: 'auto',
  supportRatio: 0.2,
  overhangThresholdDeg: 45,
  hollow: false,
  hollowWallMm: 2.5,
  hollowResidualRatio: 0.1,
}

export const DEFAULT_SETTINGS: BusinessSettings = {
  currency: 'TRY',
  electricityTRYPerKWh: 3.25, // EPDK Nis-2026: mesken kademe 1 ≈ 3.2; kademe 2 ≈ 4.7–5.9; ticarethane ≈ 6.5 ₺/kWh
  laborTRYPerHour: 200,
  fdmSetupMinutes: 12,     // tabla başına: dilimleme, yükleme, çıkarma
  resinSetupMinutes: 5,    // tabla başına: reçine, plaka, sıyırma
  resinPostMinutes: 10,    // tabla/parti başına: yıkama + kürleme işlemi
  ipaTRYPerLiter: 250,
  ipaLitersPerPrintBase: 0.025, // parça başına ~20–30 ml (1 L ≈ 30–50 küçük baskı)
  failureRate: 0.08,       // FDM prosumer %8–10
  resinFailureRate: 0.12,  // reçine %10–20
  markup: 0.5,
  timeMultiplier: 1.0,
  fdmPartSpacingMm: 3,     // Bambu Studio auto-arrange varsayılanı 2 mm + skirt payı
  resinPartSpacingMm: 5,   // küçük parçalar; büyük taban alanlı parçalarda otomatik 15 mm
  plateMarginMm: 3,
  fdmPerPartMinutes: 1.5,  // tabladan alma + temizlik
  resinPerPartMinutes: 5,  // destek sökme 2–15 dk (tipik 4–8)
  resinLiftAreaPenalty: 0.15, // T_plate × (1 + 0.15 × kaplama), üst sınır +%30; tilt-release makinelerde 0
  discountTiers: [
    { minQty: 10, pct: 0.05 },
    { minQty: 50, pct: 0.10 },
    { minQty: 100, pct: 0.15 },
    { minQty: 500, pct: 0.20 },
  ],
  printerCount: 1,
  workHoursPerDay: 20,
  displayCurrency: 'TRY',
  fxRates: { EUR: 48, USD: 41, updatedAt: '' }, // yaklaşık başlangıç değeri; Ayarlar › Kurları güncelle ile çekilir
  showVatIncl: false,
  companyName: '',
  companyContact: '',
  quoteValidityDays: 15,
  quoteNote: 'Fiyatlar tahmini olup dilimleyici sonucu ve modelin baskı uygunluğuna göre değişebilir. Teslim süresi sipariş onayı sonrasında bildirilir.',
  vat: 0.2,
  minimumPriceTRY: 150,
  packagingTRY: 0,
  quantity: 1,
}

export const FDM_PRESETS: Record<string, Partial<FdmPrintParams> & { label: string }> = {
  draft: { label: 'Taslak (0.28 mm, %10)', layerHeight: 0.28, infillDensity: 0.1, wallLoops: 2, topBottomLayers: 3 },
  standard: { label: 'Standart (0.20 mm, %15)', layerHeight: 0.2, infillDensity: 0.15, wallLoops: 2, topBottomLayers: 4 },
  quality: { label: 'Kalite (0.12 mm, %20)', layerHeight: 0.12, infillDensity: 0.2, wallLoops: 3, topBottomLayers: 6 },
  strong: { label: 'Dayanıklı (0.20 mm, %40, 4 duvar)', layerHeight: 0.2, infillDensity: 0.4, wallLoops: 4, topBottomLayers: 5 },
}
