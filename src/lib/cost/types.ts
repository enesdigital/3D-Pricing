export type Tech = 'fdm' | 'resin'

/** i18n çeviri fonksiyonu (framework-agnostic; engine/pdf'e parametre olarak geçilir) */
export type Translate = (key: string, params?: Record<string, string | number>) => string

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
  /** Çift nozul: katman başına ilk renk geçişi nozul değişimidir (flush yok, sadece prime tower); 3+ renkte kalan geçişler AMS flush */
  dualNozzle: boolean
  /** Çift nozulda nozul değişimi başına israf (prime tower payı), g */
  nozzleSwitchWasteGrams: number
  /** Çift nozulda nozul değişimi süresi, sn */
  nozzleSwitchTimeSec: number
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
  /** Tilt-release (eğimli ayırma) mekanizması: kaplama arttıkça kaldırma cezası uygulanmaz */
  tiltRelease: boolean
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
  /** Marka (menü gruplaması için); yoksa adın ilk kelimesi kullanılır */
  brand?: string
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
  /** IPA tüketimi, parça başına L (yüzey alanına göre artar) */
  ipaLitersPerPrintBase: number
  /** Başarısız baskı oranı 0..1 — FDM */
  failureRate: number
  /** Başarısız baskı oranı 0..1 — reçine */
  resinFailureRate: number
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
  /** Tabla yerleşimi: parçalar arası boşluk (mm) */
  fdmPartSpacingMm: number
  resinPartSpacingMm: number
  /** Tabla kenar payı (mm) */
  plateMarginMm: number
  /** Parça başına ek işçilik (tabladan alma, temizlik) dk — FDM */
  fdmPerPartMinutes: number
  /** Parça başına destek sökme/temizlik dk — reçine */
  resinPerPartMinutes: number
  /** Reçine: tabla kaplama oranı 1.0 iken katman süresine eklenen oran (ayrılma kuvveti için rest/lift yavaşlatma), üst sınır +%30 */
  resinLiftAreaPenalty: number
  /** Teklif PDF'i başlık bilgileri */
  companyName: string
  companyContact: string
  quoteValidityDays: number
  quoteNote: string
}

export interface CostLine {
  key: string
  label: string
  amount: number
  detail?: string
}

export interface EstimateTotals {
  materialGrams: number
  supportGrams: number
  wasteGrams: number
  printTimeSec: number
  energyKWh: number
  cost: number
  price: number
  priceWithVat: number
}

export interface Estimate {
  tech: Tech
  quantity: number
  /** Tabla başına sığan parça sayısı ve gereken tabla (iş) sayısı */
  partsPerPlate: number
  plates: number
  /** Tek parçanın tek başına basılması (referans) */
  single: { printTimeSec: number; materialGrams: number }
  /** Dolu bir tablanın süresi */
  plateTimeSec: number
  /** Sipariş toplamı */
  total: EstimateTotals
  /** Adet başına ortalama (toplam ÷ adet) */
  perUnit: EstimateTotals
  /** Basılan malzeme hacmi, adet başına mm³ */
  materialVolumeMm3: number
  layerCount: number
  /** Maliyet kalemleri (sipariş toplamı) */
  lines: CostLine[]
  warnings: string[]
  fits: boolean
  fitsRotated: boolean
  breakdown: Record<string, number>
}
