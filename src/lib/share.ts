import LZ from 'lz-string'
const { compressToEncodedURIComponent, decompressFromEncodedURIComponent } = LZ
import type { BusinessSettings, Estimate, Material, PrinterProfile } from './cost/types.ts'
import type { QuotePricing } from './pdf/quote.ts'

/** Sunucusuz paylaşım için teklif özeti (URL hash'ine sıkıştırılır) */
export interface SharedQuote {
  v: 1
  date: string
  company: string
  contact: string
  customer: string
  model: string
  sizeMm: [number, number, number]
  printer: string
  tech: 'fdm' | 'resin'
  material: string
  qty: number
  unit: number
  total: number
  vatRate: number
  currency: 'TRY' | 'EUR' | 'USD'
  fxRate: number
  leadDays: number
  note: string
}

export function buildSharedQuote(a: { est: Estimate; pricing: QuotePricing; settings: BusinessSettings; printer: PrinterProfile; material: Material; fileName: string; customer: string; size: { x: number; y: number; z: number } }): SharedQuote {
  const { est, pricing, settings, printer, material } = a
  const cur = settings.displayCurrency ?? 'TRY'
  return {
    v: 1, date: new Date().toISOString().slice(0, 10), company: settings.companyName, contact: settings.companyContact, customer: a.customer,
    model: a.fileName, sizeMm: [Math.round(a.size.x * 10) / 10, Math.round(a.size.y * 10) / 10, Math.round(a.size.z * 10) / 10],
    printer: `${printer.brand} ${printer.name}`, tech: printer.tech, material: material.name, qty: est.quantity,
    unit: Math.round(pricing.unitPrice * 100) / 100, total: Math.round(pricing.total * 100) / 100, vatRate: pricing.vatRate,
    currency: cur, fxRate: cur === 'TRY' ? 1 : (settings.fxRates?.[cur] ?? 1), leadDays: est.leadDays, note: settings.quoteNote,
  }
}

export function encodeShare(q: SharedQuote): string {
  return compressToEncodedURIComponent(JSON.stringify(q))
}
export function decodeShare(s: string): SharedQuote | null {
  try {
    const j = JSON.parse(decompressFromEncodedURIComponent(s) || '')
    return j && j.v === 1 && typeof j.total === 'number' ? (j as SharedQuote) : null
  } catch { return null }
}
export function shareUrl(q: SharedQuote): string {
  const base = `${location.origin}${location.pathname}`
  return `${base}#q=${encodeShare(q)}`
}
export function readShareFromHash(): SharedQuote | null {
  const m = location.hash.match(/#q=([A-Za-z0-9+\-$_.!*'()]+)/)
  return m ? decodeShare(m[1]) : null
}

/** WhatsApp metni (wa.me) */
export function whatsappUrl(number: string, text: string): string {
  const digits = number.replace(/[^\d]/g, '')
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}

/** Kalemler + toplamlar CSV (Excel'in ; ayracı ve UTF-8 BOM ile) */
export function quoteCsv(est: Estimate, pricing: QuotePricing, meta: { model: string; printer: string; material: string; currency: string }): string {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const rows: (string | number)[][] = [
    ['Model', meta.model], ['Yazıcı', meta.printer], ['Malzeme', meta.material], ['Adet', est.quantity], ['Para birimi (hesap)', 'TRY'], [],
    ['Kalem', 'Açıklama', 'Tutar (TRY)'],
    ...est.lines.map((l) => [l.label, l.detail ?? '', l.amount.toFixed(2)]),
    ['Toplam maliyet', '', est.total.cost.toFixed(2)],
    ['Birim fiyat (KDV hariç)', '', pricing.unitPrice.toFixed(2)],
    ['Toplam (KDV hariç)', '', pricing.total.toFixed(2)],
    [`KDV %${Math.round(pricing.vatRate * 100)}`, '', (pricing.total * pricing.vatRate).toFixed(2)],
    ['Genel toplam', '', (pricing.total * (1 + pricing.vatRate)).toFixed(2)],
    [], ['Malzeme toplam (g)', est.total.materialGrams.toFixed(1)], ['Süre toplam (sa)', (est.total.printTimeSec / 3600).toFixed(2)], ['Enerji (kWh)', est.total.energyKWh.toFixed(2)], ['Tabla', est.plates], ['Teslim (iş günü)', est.leadDays],
  ]
  return '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n')
}

export function downloadText(name: string, text: string, type = 'text/plain') {
  const blob = new Blob([text], { type: `${type};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Ayar/veri yedeği: uygulamanın tüm localStorage anahtarları */
export const BACKUP_KEYS = ['settings', 'materialPrices', 'printerOverrides', 'customPrinters', 'customMaterials', 'calibrations', 'fdmParams', 'resinParams', 'printerId', 'materialIdByTech', 'manifoldCheck', 'thicknessCheck', 'quoteLogo', 'theme', 'lang']
export function exportBackup(prefix: string): string {
  const out: Record<string, unknown> = { app: '3D-Pricing', version: 1, exportedAt: new Date().toISOString(), data: {} }
  for (const k of BACKUP_KEYS) {
    const raw = localStorage.getItem(prefix + k)
    if (raw != null) { try { (out.data as Record<string, unknown>)[k] = JSON.parse(raw) } catch { (out.data as Record<string, unknown>)[k] = raw } }
  }
  return JSON.stringify(out, null, 2)
}
export function importBackup(prefix: string, text: string): number {
  const j = JSON.parse(text) as { app?: string; data?: Record<string, unknown> }
  if (j.app !== '3D-Pricing' || !j.data || typeof j.data !== 'object') throw new Error('Geçersiz yedek dosyası')
  let n = 0
  for (const k of BACKUP_KEYS) {
    if (k in j.data) { localStorage.setItem(prefix + k, JSON.stringify(j.data[k])); n++ }
  }
  return n
}
