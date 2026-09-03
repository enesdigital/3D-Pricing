export type Tech = 'fdm' | 'resin'

export interface BedSize { x: number; y: number; z: number }

export interface FdmPrinterSpec {
  tech: 'fdm'
  /** Makinenin maksimum hacimsel akışı (mm³/s, resmi spec) */
  maxFlow: number
  /** Verimlilik ölçeği: ivme/kinematik kalitesi (A1 = 1.0, X2D ≈ 1.15) */
  efficiencyScale: number
  /** Dış duvar hızı (mm/s, 0.20 Standard profili) */
  outerWallSpeed: number
  /** Katman değişimi + Z hareketi + travel sabiti, sn */
  layerChangeSec: number
  /** İş başlangıcı sabit süre (ısıtma, kalibrasyon, purge), sn */
  jobOverheadSec: number
  /** Başlangıç sabit filament israfı (purge hattı vb.), g */
  jobWasteGrams: number
  /** Renk değişimi başına israf, g (flush + prime tower) */
  colorChangeWasteGrams: number
  /** Renk değişimi başına süre, sn */
  colorChangeTimeSec: number
  nozzleDiameter: number
  supportsMultiColor: boolean
  /** Ortalama baskı gücü W (PLA, sürekli) */
  avgPowerW: number
  /** Isınma/kalibrasyon evresi ortalama gücü W */
  heatupPowerW: number
}

export interface ResinPrinterSpec {
  tech: 'resin'
  /** XY piksel boyutu, mm */
  pixelSizeMm: number
  /** Varsayılan katman kalınlığı, mm */
  defaultLayerHeight: number
  /** Normal katman pozlama, sn */
  exposureSec: number
  /** Taban katman pozlama, sn */
  bottomExposureSec: number
  bottomLayers: number
  /** Katman başına kaldırma+inme+bekleme süresi (pozlama hariç), sn */
  liftCycleSec: number
  /** Vat kapasitesi, ml */
  vatCapacityMl: number
  avgPowerW: number
  /** Yıkama+kürleme istasyonu gücü, W (varsa) */
  postPowerW: number
}

export interface PrinterProfile {
  id: string
  name: string
  brand: string
  tech: Tech
  bed: BedSize
  /** Satın alma fiyatı (TRY) — amortisman için */
  priceTRY: number
  /** Beklenen kullanım ömrü, saat */
  lifetimeHours: number
  /** Saatlik bakım/sarf maliyeti (nozul, plaka, FEP, filtre…), TRY/saat */
  maintenanceTRYPerHour: number
  spec: FdmPrinterSpec | ResinPrinterSpec
  notes?: string
}

export interface Material {
  id: string
  name: string
  tech: Tech
  /** g/cm³ */
  density: number
  /** TRY / kg */
  pricePerKgTRY: number
  /** Malzemenin maksimum hacimsel akışı (mm³/s, 0.4 nozul; BambuStudio profili). Reçinede kullanılmaz. */
  maxFlow: number
  /** Minimum katman süresi (soğutma), sn (BambuStudio slow_down_layer_time). Reçinede kullanılmaz. */
  minLayerTime: number
  /** Güç çarpanı: yüksek sıcaklık malzemelerde ısıtma daha fazla */
  powerFactor: number
  /** Reçine için: karışık kimyasal/atık çarpanı vb. */
  notes?: string
}

export interface FdmPrintParams {
  layerHeight: number
  lineWidth: number
  wallLoops: number
  topBottomLayers: number
  /** 0..1 */
  infillDensity: number
  supports: 'auto' | 'on' | 'off'
  /** Destek malzeme yoğunluğu 0..1 (ağaç ~0.15) */
  supportDensity: number
  overhangThresholdDeg: number
  /** Çok renkli baskı: renk sayısı (1 = tek renk) ve tahmini değişim sayısı */
  colorCount: number
  colorChangesPerLayer: number
}

export interface ResinPrintParams {
  layerHeight: number
  exposureSec: number
  bottomExposureSec: number
  bottomLayers: number
  liftCycleSec: number
  supports: 'auto' | 'on' | 'off'
  /** Destek reçine oranı (model hacminin yüzdesi) 0..1 */
  supportRatio: number
  overhangThresholdDeg: number
  hollow: boolean
  hollowWallMm: number
  /** Boşaltmada içeride kalan reçine (drenaj sonrası) oranı */
  hollowResidualRatio: number
}

export interface BusinessSettings {
  currency: 'TRY'
  electricityTRYPerKWh: number
  laborTRYPerHour: number
  /** Hazırlık (dilimleme, yükleme, çıkarma) dakika — FDM */
  fdmSetupMinutes: number
  /** Reçine hazırlık + yıkama/kürleme/destek sökme dakika */
  resinSetupMinutes: number
  resinPostMinutes: number
  /** Yıkama sarfı (IPA) TRY / baskı (hacme göre ölçeklenir) */
  ipaTRYPerLiter: number
  ipaLitersPerPrintBase: number
  /** Başarısız baskı oranı 0..1 (malzeme+süre kaybı) */
  failureRate: number
  /** Kâr marjı 0..1 (maliyet üstüne) */
  markup: number
  /** KDV 0..1 (fiyat üstüne ayrı gösterilir) */
  vat: number
  minimumPriceTRY: number
  /** Ambalaj/sarf sabit ücret */
  packagingTRY: number
  quantity: number
  /** Süre kalibrasyon çarpanı (dilimleyici/gerçek baskıya göre ayarlayın), 1 = model tahmini */
  timeMultiplier: number
}

export interface CostLine {
  key: string
  label: string
  amount: number
  detail?: string
}

export interface Estimate {
  tech: Tech
  /** Malzeme */
  materialGrams: number
  materialVolumeMm3: number
  supportGrams: number
  wasteGrams: number
  /** Süre */
  printTimeSec: number
  layerCount: number
  /** Enerji */
  energyKWh: number
  /** Maliyet kalemleri (tek parça) */
  lines: CostLine[]
  costPerUnit: number
  pricePerUnit: number
  pricePerUnitWithVat: number
  totalPrice: number
  totalPriceWithVat: number
  warnings: string[]
  /** Sığdı mı */
  fits: boolean
  fitsRotated: boolean
  breakdown: Record<string, number>
}
