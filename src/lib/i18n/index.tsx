import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { Translate } from '../cost/types.ts'
import { tr } from './tr.ts'
import { en } from './en.ts'

export type Lang = 'tr' | 'en'

export const LANGS: { code: Lang; label: string }[] = [
  { code: 'tr', label: 'Türkçe' },
  { code: 'en', label: 'English' },
]

const LS_LANG = 'fdm-sla-calc:v1:lang'

const DICTS: Record<Lang, Record<string, unknown>> = { tr, en }

/** Nested dot-path çözümleyici */
function lookup(dict: Record<string, unknown>, key: string): string | undefined {
  const parts = key.split('.')
  let cur: unknown = dict
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p]
    } else {
      return undefined
    }
  }
  return typeof cur === 'string' ? cur : undefined
}

function interpolate(str: string, params?: Record<string, string | number>): string {
  if (!params) return str
  return str.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m))
}

/** Belirli bir dil için çeviri fonksiyonu üretir (tr fallback) */
export function makeTranslate(lang: Lang): Translate {
  return (key, params) => {
    const val = lookup(DICTS[lang], key) ?? lookup(DICTS.tr, key) ?? key
    return interpolate(val, params)
  }
}

interface I18nContextValue {
  lang: Lang
  setLang: (l: Lang) => void
  t: Translate
}

const I18nContext = createContext<I18nContextValue | null>(null)

function detectLang(): Lang {
  if (typeof navigator === 'undefined') return 'tr'
  const nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'tr'
  return nav.toLowerCase().startsWith('tr') ? 'tr' : 'en'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // SSR ve ilk render daima 'tr' (layout lang="tr" ile uyumlu); mount sonrası ayarlanır.
  const [lang, setLangState] = useState<Lang>('tr')

  useEffect(() => {
    let initial: Lang | null = null
    try {
      const saved = localStorage.getItem(LS_LANG)
      if (saved === 'tr' || saved === 'en') initial = saved
    } catch { /* ignore */ }
    if (!initial) initial = detectLang()
    setLangState(initial)
    try { document.documentElement.setAttribute('lang', initial) } catch { /* ignore */ }
  }, [])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try { localStorage.setItem(LS_LANG, l) } catch { /* ignore */ }
    try { document.documentElement.setAttribute('lang', l) } catch { /* ignore */ }
  }, [])

  const t = useCallback<Translate>((key, params) => makeTranslate(lang)(key, params), [lang])

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used within I18nProvider')
  return ctx
}
