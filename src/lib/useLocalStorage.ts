import { useCallback, useEffect, useState } from 'react'

/**
 * Versiyonlu localStorage; okuma/yazma hataları (gizli mod vb.) sessizce yutulur.
 * localStorage yalnızca mount sonrasında okunur: ilk render her zaman `initial`
 * değeri kullanır; kayıtlı değer bir sonraki render'da uygulanır. (Abacus/Next.js
 * sürümünde bu, SSR hidrasyon uyuşmazlığını önler; kod iki hedefte ortak kalsın diye
 * Vite sürümünde de aynı tutulur.)
 */
export function useLocalStorage<T>(key: string, initial: T, merge?: (stored: unknown, initial: T) => T) {
  const [value, setValue] = useState<T>(initial)
  const [loaded, setLoaded] = useState(false)
  // Kayıtlı değeri yalnızca istemcide, mount sonrasında oku.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw != null) {
        const parsed = JSON.parse(raw)
        setValue(merge ? merge(parsed, initial) : (parsed as T))
      }
    } catch { /* yok say */ }
    setLoaded(true)
    // key sabittir; yalnızca ilk mount'ta oku.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Kayıtlı değer yüklenmeden yazma; aksi halde ilk render'daki varsayılan, saklanan veriyi ezerdi.
  useEffect(() => {
    if (!loaded) return
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch (e) {
      // Kota dolduysa (ör. büyük logo/görsel) uygulamayı çökertmeden uyar.
      const quota = e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22)
      if (quota) console.warn(`[useLocalStorage] "${key}" kaydedilemedi: tarayıcı depolama kotası dolu. Daha küçük bir logo/görsel kullanmayı deneyin.`)
    }
  }, [key, value, loaded])
  const reset = useCallback(() => setValue(initial), [initial])
  return [value, setValue, reset] as const
}

/** Düz nesneler için: saklanan alanları varsayılanların üstüne yaz (yeni alanlar eksik kalmasın). */
export const shallowMerge = <T extends object>(stored: unknown, initial: T): T =>
  stored && typeof stored === 'object' ? { ...initial, ...(stored as Partial<T>) } : initial
