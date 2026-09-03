/** Dilimleyici (Bambu Studio / OrcaSlicer / PrusaSlicer / Cura) çıktısından okunan gerçek veriler. */
export interface SlicerData {
  source: 'bambu' | 'orca' | 'prusa' | 'cura' | 'unknown'
  fileName: string
  /** Toplam tahmini baskı süresi, sn (dosyadaki tüm parçalar/plaka) */
  printTimeSec: number | null
  /** Toplam filament ağırlığı, g */
  filamentGrams: number | null
  /** Toplam filament uzunluğu, mm */
  filamentMm: number | null
  filamentType: string | null
  filamentDensity: number | null
  printerModel: string | null
  layerHeight: number | null
  layerCount: number | null
  nozzleDiameter: number | null
  /** Renk/filament sayısı (çok renkli) */
  filamentCount: number | null
  supportUsed: boolean | null
  /** 3MF'te birden çok plaka varsa plaka sayısı */
  plateCount: number | null
  /** Ayrıştırma notları (eksik alanlar vb.) */
  notes: string[]
}

/** Motorun kullanacağı, parça başına normalize edilmiş dilimleyici değerleri */
export interface SlicerOverride {
  /** Dosyadaki parça sayısı (kullanıcı girer; süre/gram buna bölünür) */
  partsInFile: number
  /** Parça başına baskı süresi (dosya süresi ÷ parça), sn */
  partTimeSec: number
  /** Parça başına filament, g (destek ve purge dahil) */
  partGrams: number
  fileName: string
}

/** Kullanıcının kaydettiği kalibrasyon örneği: model tahmini vs gerçek/dilimleyici */
export interface CalibrationRecord {
  id: string
  date: string
  printerId: string
  materialId: string
  /** Katman kalınlığı + dolgu gibi ayırt edici anahtar */
  presetKey: string
  modelName: string
  modelTimeSec: number
  actualTimeSec: number
  modelGrams: number
  actualGrams: number
  note?: string
}

export interface CalibrationFactors {
  timeFactor: number
  gramsFactor: number
  samples: number
  /** 'printer+material' | 'printer' | 'none' */
  scope: 'printer+material' | 'printer' | 'none'
}

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Kayıtlardan yazıcı(+malzeme) için medyan düzeltme katsayıları. Önce yazıcı+malzeme, yoksa yazıcı geneli. */
export function calibrationFactors(records: CalibrationRecord[], printerId: string, materialId: string): CalibrationFactors {
  const valid = records.filter((r) => r.modelTimeSec > 0 && r.actualTimeSec > 0 && r.modelGrams > 0 && r.actualGrams > 0)
  const pick = (rs: CalibrationRecord[], scope: CalibrationFactors['scope']): CalibrationFactors | null => {
    if (rs.length === 0) return null
    const tf = median(rs.map((r) => r.actualTimeSec / r.modelTimeSec))
    const gf = median(rs.map((r) => r.actualGrams / r.modelGrams))
    // Aşırı uç değerlere karşı sınır (0.25×–4×)
    const clamp = (x: number) => Math.min(4, Math.max(0.25, x))
    return { timeFactor: clamp(tf), gramsFactor: clamp(gf), samples: rs.length, scope }
  }
  return (
    pick(valid.filter((r) => r.printerId === printerId && r.materialId === materialId), 'printer+material')
    ?? pick(valid.filter((r) => r.printerId === printerId), 'printer')
    ?? { timeFactor: 1, gramsFactor: 1, samples: 0, scope: 'none' }
  )
}
