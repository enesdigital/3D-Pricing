import type { BusinessSettings, Estimate, Material, PrinterProfile } from '../cost/types.ts'
import type { QuotePricing } from '../pdf/quote.ts'
import { buildSharedQuote, type SharedQuote } from '../share.ts'
import { STORE_CUSTOMERS, STORE_QUOTES, dbClear, dbDelete, dbGet, dbGetAll, dbPut, dbPutMany, hasIndexedDb } from './db.ts'

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected'
export const QUOTE_STATUSES: QuoteStatus[] = ['draft', 'sent', 'accepted', 'rejected']

/** Teklif geçmişi kaydı (mesh saklanmaz; özet + paylaşım özeti + küçük görsel) */
export interface QuoteRecord {
  id: string
  quoteNo: string
  /** ISO tarih-saat */
  date: string
  customerId: string | null
  customerName: string
  status: QuoteStatus
  note: string
  model: string
  parts: { name: string; quantity: number; size: [number, number, number] }[]
  printer: string
  tech: 'fdm' | 'resin'
  material: string
  qty: number
  /** KDV hariç, TRY */
  unit: number
  total: number
  vatRate: number
  currency: 'TRY' | 'EUR' | 'USD'
  fxRate: number
  leadDays: number
  basis: string
  /** Maliyet ve üretim özeti (TRY, g, sn) */
  cost: number
  grams: number
  timeSec: number
  plates: number
  /** Paylaşım bağlantısını yeniden üretmek için */
  shared: SharedQuote
  /** Küçük JPEG data URL (≤ 160 px) ya da null */
  thumb: string | null
}

export interface CustomerRecord {
  id: string
  name: string
  company: string
  phone: string
  email: string
  note: string
  createdAt: string
  updatedAt: string
}

export const historyAvailable = hasIndexedDb

const newId = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
export const normName = (s: string) => s.trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ')

/** Tahmin + fiyatlandırmadan kayıt üretir (saf; test edilebilir) */
export function buildQuoteRecord(a: {
  est: Estimate; pricing: QuotePricing; settings: BusinessSettings; printer: PrinterProfile; material: Material
  fileName: string; customer: string; customerId?: string | null; size: { x: number; y: number; z: number }
  parts: { name: string; quantity: number; size: { x: number; y: number; z: number } }[]
  quoteNo: string; thumb?: string | null; note?: string; date?: Date
}): QuoteRecord {
  const { est, pricing, settings, printer, material } = a
  const shared = buildSharedQuote({ est, pricing, settings, printer, material, fileName: a.fileName, customer: a.customer, size: a.size })
  const cur = settings.displayCurrency ?? 'TRY'
  return {
    id: newId('q'), quoteNo: a.quoteNo, date: (a.date ?? new Date()).toISOString(), customerId: a.customerId ?? null, customerName: a.customer.trim(),
    status: 'draft', note: a.note ?? '', model: a.fileName,
    parts: a.parts.map((p) => ({ name: p.name, quantity: p.quantity, size: [r1(p.size.x), r1(p.size.y), r1(p.size.z)] })),
    printer: `${printer.brand} ${printer.name}`, tech: printer.tech, material: material.name, qty: est.quantity,
    unit: r2(pricing.unitPrice), total: r2(pricing.total), vatRate: pricing.vatRate, currency: cur, fxRate: cur === 'TRY' ? 1 : (settings.fxRates?.[cur] ?? 1),
    leadDays: est.leadDays, basis: pricing.basis, cost: r2(est.total.cost), grams: r1(est.total.materialGrams), timeSec: Math.round(est.total.printTimeSec), plates: est.plates,
    shared, thumb: a.thumb ?? null,
  }
}
const r1 = (n: number) => Math.round(n * 10) / 10
const r2 = (n: number) => Math.round(n * 100) / 100

// ---- Teklifler
export async function listQuotes(): Promise<QuoteRecord[]> {
  const all = await dbGetAll<QuoteRecord>(STORE_QUOTES)
  return all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}
export const saveQuote = (q: QuoteRecord) => dbPut(STORE_QUOTES, q)
export async function updateQuote(id: string, patch: Partial<QuoteRecord>): Promise<QuoteRecord | null> {
  const cur = await dbGet<QuoteRecord>(STORE_QUOTES, id)
  if (!cur) return null
  const next = { ...cur, ...patch, id }
  await dbPut(STORE_QUOTES, next)
  return next
}
export const deleteQuote = (id: string) => dbDelete(STORE_QUOTES, id)

// ---- Müşteriler
export async function listCustomers(): Promise<CustomerRecord[]> {
  const all = await dbGetAll<CustomerRecord>(STORE_CUSTOMERS)
  return all.sort((a, b) => a.name.localeCompare(b.name, 'tr'))
}
export const saveCustomer = (c: CustomerRecord) => dbPut(STORE_CUSTOMERS, c)
export const deleteCustomer = (id: string) => dbDelete(STORE_CUSTOMERS, id)
export function newCustomer(name: string, extra: Partial<CustomerRecord> = {}): CustomerRecord {
  const now = new Date().toISOString()
  return { id: newId('c'), name: name.trim(), company: '', phone: '', email: '', note: '', createdAt: now, updatedAt: now, ...extra }
}
/** Ada göre müşteri bul ya da oluştur (boş ad → null) */
export async function upsertCustomerByName(name: string): Promise<CustomerRecord | null> {
  const n = normName(name)
  if (!n) return null
  const all = await listCustomers()
  const found = all.find((c) => normName(c.name) === n)
  if (found) return found
  const c = newCustomer(name)
  await saveCustomer(c)
  return c
}

// ---- Yedek
export interface HistoryBackup { quotes: QuoteRecord[]; customers: CustomerRecord[] }
export async function exportHistory(): Promise<HistoryBackup> {
  if (!hasIndexedDb()) return { quotes: [], customers: [] }
  const [quotes, customers] = await Promise.all([listQuotes(), listCustomers()])
  return { quotes, customers }
}
/** Yedekteki kayıtları ekler/günceller (aynı kimlik üzerine yazılır); `replace` ile önce temizler */
export async function importHistory(h: Partial<HistoryBackup>, replace = false): Promise<number> {
  if (!hasIndexedDb()) return 0
  if (replace) { await dbClear(STORE_QUOTES); await dbClear(STORE_CUSTOMERS) }
  const quotes = Array.isArray(h.quotes) ? h.quotes.filter((q) => q && typeof q.id === 'string' && typeof q.total === 'number') : []
  const customers = Array.isArray(h.customers) ? h.customers.filter((c) => c && typeof c.id === 'string' && typeof c.name === 'string') : []
  await dbPutMany(STORE_QUOTES, quotes)
  await dbPutMany(STORE_CUSTOMERS, customers)
  return quotes.length + customers.length
}

/** Teklif listesi CSV'si (Excel ; ayracı, UTF-8 BOM) */
export function quotesCsv(rows: QuoteRecord[], statusLabel: (s: QuoteStatus) => string): string {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const head = ['Tarih', 'Teklif No', 'Müşteri', 'Model', 'Yazıcı', 'Malzeme', 'Adet', 'Birim (KDV hariç)', 'Toplam (KDV hariç)', 'KDV %', 'Para birimi', 'Maliyet (TRY)', 'Teslim (gün)', 'Durum', 'Not']
  const toCur = (q: QuoteRecord, tryAmt: number) => (q.currency === 'TRY' ? tryAmt : tryAmt / (q.fxRate || 1)).toFixed(2)
  const lines = rows.map((q) => [q.date.slice(0, 10), q.quoteNo, q.customerName, q.model, q.printer, q.material, q.qty, toCur(q, q.unit), toCur(q, q.total), Math.round(q.vatRate * 100), q.currency, q.cost.toFixed(2), q.leadDays, statusLabel(q.status), q.note])
  return '﻿' + [head, ...lines].map((r) => r.map(esc).join(';')).join('\r\n')
}

/** Görseli küçültüp JPEG data URL üretir (geçmiş listesi için); tarayıcı gerektirir */
export async function makeThumb(dataUrl: string, max = 160): Promise<string | null> {
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('img')); i.src = dataUrl })
    const k = Math.min(1, max / Math.max(img.width, img.height))
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k))
    const ctx = c.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.7)
  } catch { return null }
}
