import { useCallback, useEffect, useState } from 'react'

/** Versiyonlu localStorage; okuma/yazma hataları (gizli mod vb.) sessizce yutulur. */
export function useLocalStorage<T>(key: string, initial: T, merge?: (stored: unknown, initial: T) => T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw == null) return initial
      const parsed = JSON.parse(raw)
      return merge ? merge(parsed, initial) : (parsed as T)
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* yok say */ }
  }, [key, value])
  const reset = useCallback(() => setValue(initial), [initial])
  return [value, setValue, reset] as const
}

/** Düz nesneler için: saklanan alanları varsayılanların üstüne yaz (yeni alanlar eksik kalmasın). */
export const shallowMerge = <T extends object>(stored: unknown, initial: T): T =>
  stored && typeof stored === 'object' ? { ...initial, ...(stored as Partial<T>) } : initial
