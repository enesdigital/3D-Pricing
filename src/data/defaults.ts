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
  fdmSetupMinutes: 15,
  resinSetupMinutes: 10,
  resinPostMinutes: 20,
  ipaTRYPerLiter: 250,
  ipaLitersPerPrintBase: 0.05,
  failureRate: 0.05,
  markup: 0.5,
  timeMultiplier: 1.0,
  fdmPartSpacingMm: 6,
  resinPartSpacingMm: 5,
  plateMarginMm: 4,
  fdmPerPartMinutes: 1.5,
  resinPerPartMinutes: 4,
  resinLiftAreaPenalty: 0.25,
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
