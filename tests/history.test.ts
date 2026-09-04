import { analyzeMesh } from '../src/lib/mesh/analyze.ts'
import { estimateFdm } from '../src/lib/cost/engine.ts'
import { buildQuoteRecord, quotesCsv, normName } from '../src/lib/history/index.ts'
import { makeQuoteNo } from '../src/lib/pdf/quote.ts'
import { exportBackup, importBackup } from '../src/lib/share.ts'
import { printerById } from '../src/data/printers.ts'
import { MATERIALS } from '../src/data/materials.ts'
import { DEFAULT_FDM_PARAMS, DEFAULT_SETTINGS } from '../src/data/defaults.ts'
import { makeSamplePawnStl } from '../src/lib/mesh/sample.ts'
import { parseStl } from '../src/lib/mesh/parseStl.ts'
import { tr } from '../src/lib/i18n/tr.ts'

const t = (key: string, params?: Record<string, string | number>) => {
  let cur: unknown = tr
  for (const p of key.split('.')) cur = cur && typeof cur === 'object' ? (cur as Record<string, unknown>)[p] : undefined
  const str = typeof cur === 'string' ? cur : key
  return params ? str.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : str
}
const assert = (c: boolean, msg: string) => { if (!c) { console.error('FAIL:', msg); process.exit(1) } }

const parsed = parseStl(await makeSamplePawnStl().arrayBuffer())
const { stats } = analyzeMesh(parsed.positions, { overhangThresholdDeg: 45, manifoldCheck: true, layerHeight: 0.2 })
const printer = printerById('bambu-a1-combo')!
const material = MATERIALS.find((m) => m.tech === 'fdm')!
const settings = { ...DEFAULT_SETTINGS, quantity: 4, displayCurrency: 'EUR' as const, fxRates: { EUR: 40, USD: 36, updatedAt: '2026-09-01' } }
const est = estimateFdm({ stats, printer, material, settings, params: DEFAULT_FDM_PARAMS }, t)
const pricing = { unitPrice: est.perUnit.price, total: est.total.price, vatRate: 0.2, basis: 'kâr marjı %50' }
const no = makeQuoteNo(new Date(2026, 8, 4, 13, 5, 9))
assert(no === 'T-20260904-130509', `teklif no ${no}`)
const rec = buildQuoteRecord({ est, pricing, settings, printer, material, fileName: 'piyon.stl', customer: '  Ahmet  Yılmaz ', size: stats.size, parts: [{ name: 'piyon.stl', quantity: 4, size: stats.size }], quoteNo: no, date: new Date('2026-09-04T10:00:00Z') })
assert(rec.qty === 4 && rec.customerName === 'Ahmet  Yılmaz' && rec.currency === 'EUR' && rec.fxRate === 40, 'kayıt alanları')
assert(rec.shared.v === 1 && rec.shared.total === Math.round(pricing.total * 100) / 100, 'paylaşım özeti')
assert(rec.parts[0].size.length === 3 && rec.timeSec > 0 && rec.plates >= 1, 'üretim özeti')
assert(normName(' Ahmet  YILMAZ ') === normName('ahmet yılmaz'), 'ad normalizasyonu (tr)')
const csv = quotesCsv([rec, { ...rec, id: 'q2', status: 'accepted', currency: 'TRY', fxRate: 1 }], (s) => t(`history.status.${s}`))
const lines = csv.split('\r\n')
assert(lines.length === 3 && lines[0].startsWith('﻿"Tarih"'), 'csv başlık')
assert(lines[1].includes(`"${(pricing.total / 40).toFixed(2)}"`) && lines[2].includes(`"${pricing.total.toFixed(2)}"`), 'csv para birimi dönüşümü')
assert(lines[2].includes('"Kabul"'), 'csv durum etiketi')
console.log(`history: no ${no} | ${rec.customerName} | ${rec.total} TRY = ${(rec.total / rec.fxRate).toFixed(2)} EUR | csv ${lines.length} satır`)

// Yedek: localStorage yoksa exportBackup çalışmaz → sahte localStorage ile
const store = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) }, removeItem: (k: string) => { store.delete(k) }, clear: () => store.clear(), key: () => null, length: 0 } as Storage
localStorage.setItem('p:settings', JSON.stringify({ markup: 0.4 }))
const json = exportBackup('p:', { quotes: [rec], customers: [] })
const back = JSON.parse(json)
assert(back.version === 2 && back.history.quotes.length === 1 && back.data.settings.markup === 0.4, 'yedek içeriği')
store.clear()
const imp = importBackup('p:', json)
assert(imp.n === 1 && imp.history && (imp.history.quotes as unknown[]).length === 1 && JSON.parse(store.get('p:settings')!).markup === 0.4, 'yedek geri yükleme')
console.log('history: OK')
