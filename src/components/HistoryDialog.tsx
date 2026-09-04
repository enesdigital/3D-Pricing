import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from './ui.tsx'
import { useI18n } from '../lib/i18n/index.tsx'
import { downloadText, shareUrl, whatsappUrl } from '../lib/share.ts'
import { QUOTE_STATUSES, deleteCustomer, deleteQuote, historyAvailable, listCustomers, listQuotes, newCustomer, quotesCsv, saveCustomer, updateQuote, type CustomerRecord, type QuoteRecord, type QuoteStatus } from '../lib/history/index.ts'

interface Props { open: boolean; onClose: () => void; whatsappNumber: string }

const money = (n: number, cur: string) => new Intl.NumberFormat(cur === 'TRY' ? 'tr-TR' : 'en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n)
const toCur = (q: QuoteRecord, tryAmt: number) => money(q.currency === 'TRY' ? tryAmt : tryAmt / (q.fxRate || 1), q.currency)
const STATUS_CLASS: Record<QuoteStatus, string> = { draft: 'bg-zinc-800 text-zinc-300', sent: 'bg-sky-900/60 text-sky-200', accepted: 'bg-emerald-900/60 text-emerald-200', rejected: 'bg-red-900/50 text-red-200' }

export function HistoryDialog({ open, onClose, whatsappNumber }: Props) {
  const { t } = useI18n()
  const [tab, setTab] = useState<'quotes' | 'customers'>('quotes')
  const [quotes, setQuotes] = useState<QuoteRecord[]>([])
  const [customers, setCustomers] = useState<CustomerRecord[]>([])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'all' | QuoteStatus>('all')
  const [customerFilter, setCustomerFilter] = useState<string>('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<CustomerRecord | null>(null)

  const unavailable = !historyAvailable()
  // Açılışta IndexedDB'den yükle (dış sistemle eşitleme; sonuç asenkron gelir)
  useEffect(() => {
    if (!open || unavailable) return
    let alive = true
    Promise.all([listQuotes(), listCustomers()])
      .then(([qs, cs]) => { if (alive) { setQuotes(qs); setCustomers(cs); setError(null) } })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : String(e)) })
    return () => { alive = false }
  }, [open, unavailable])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const statusLabel = useCallback((s: QuoteStatus) => t(`history.status.${s}`), [t])
  const filtered = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr-TR')
    return quotes.filter((r) => (status === 'all' || r.status === status)
      && (!customerFilter || r.customerId === customerFilter || (!r.customerId && customerFilter === '-'))
      && (!needle || [r.customerName, r.model, r.quoteNo, r.printer, r.material, r.note].some((f) => f.toLocaleLowerCase('tr-TR').includes(needle))))
  }, [quotes, q, status, customerFilter])
  const totals = useMemo(() => {
    const byCur = new Map<string, number>()
    for (const r of filtered) byCur.set(r.currency, (byCur.get(r.currency) ?? 0) + (r.currency === 'TRY' ? r.total : r.total / (r.fxRate || 1)))
    return [...byCur.entries()].map(([c, v]) => money(v, c)).join(' + ')
  }, [filtered])
  const quoteCount = useMemo(() => { const m = new Map<string, number>(); for (const r of quotes) if (r.customerId) m.set(r.customerId, (m.get(r.customerId) ?? 0) + 1); return m }, [quotes])

  if (!open) return null
  const setQuoteStatus = async (id: string, s: QuoteStatus) => { await updateQuote(id, { status: s }); setQuotes((qs) => qs.map((x) => (x.id === id ? { ...x, status: s } : x))) }
  const setQuoteNote = async (id: string, note: string) => { await updateQuote(id, { note }); setQuotes((qs) => qs.map((x) => (x.id === id ? { ...x, note } : x))) }
  const removeQuote = async (r: QuoteRecord) => { if (!confirm(t('history.confirmDelete', { no: r.quoteNo }))) return; await deleteQuote(r.id); setQuotes((qs) => qs.filter((x) => x.id !== r.id)) }
  const waFor = (r: QuoteRecord) => {
    const c = customers.find((x) => x.id === r.customerId)
    const link = shareUrl(r.shared)
    const text = t('share.waText', { name: r.customerName ? ` ${r.customerName}` : '', model: r.model, printer: r.printer, material: r.material, qty: r.qty, unit: toCur(r, r.unit), total: toCur(r, r.total), gross: toCur(r, r.total * (1 + r.vatRate)), lead: r.leadDays, link })
    return whatsappUrl(c?.phone || whatsappNumber || '', text)
  }
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text) } catch { prompt('URL', text) } }
  const saveEditing = async () => { if (!editing || !editing.name.trim()) return; const c = { ...editing, name: editing.name.trim(), updatedAt: new Date().toISOString() }; await saveCustomer(c); setCustomers((cs) => (cs.some((x) => x.id === c.id) ? cs.map((x) => (x.id === c.id ? c : x)) : [...cs, c]).sort((a, b) => a.name.localeCompare(b.name, 'tr'))); setEditing(null) }
  const removeCustomer = async (c: CustomerRecord) => { if (!confirm(t('history.confirmDeleteCustomer', { name: c.name }))) return; await deleteCustomer(c.id); setCustomers((cs) => cs.filter((x) => x.id !== c.id)) }
  const input = 'w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm outline-none focus:border-sky-500'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="my-6 w-full max-w-5xl rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl" role="dialog" aria-modal="true" aria-label={t('history.title')} onClick={(e) => e.stopPropagation()}>
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-5 py-3">
          <div>
            <h2 className="text-base font-semibold">{t('history.title')}</h2>
            <p className="text-[11px] text-zinc-500">{t('history.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-zinc-700 p-0.5 text-xs">
              <button className={`rounded px-2 py-1 ${tab === 'quotes' ? 'bg-zinc-700 text-white' : 'text-zinc-400'}`} onClick={() => setTab('quotes')}>{t('history.tabQuotes', { n: quotes.length })}</button>
              <button className={`rounded px-2 py-1 ${tab === 'customers' ? 'bg-zinc-700 text-white' : 'text-zinc-400'}`} onClick={() => setTab('customers')}>{t('history.tabCustomers', { n: customers.length })}</button>
            </div>
            <Button variant="primary" onClick={onClose}>{t('share.close')}</Button>
          </div>
        </header>
        {(error || unavailable) && <div className="mx-5 mt-4 rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">{unavailable ? t('history.unavailable') : error}</div>}

        {tab === 'quotes' && (
          <div className="space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('history.search')} className={`${input} max-w-xs`} aria-label={t('history.search')} />
              <select value={status} onChange={(e) => setStatus(e.target.value as 'all' | QuoteStatus)} className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs" aria-label={t('history.colStatus')}>
                <option value="all">{t('history.allStatuses')}</option>
                {QUOTE_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
              </select>
              <select value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs" aria-label={t('history.colCustomer')}>
                <option value="">{t('history.allCustomers')}</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <span className="ml-auto text-zinc-400">{t('history.summary', { n: filtered.length, total: totals || '—' })}</span>
              <Button onClick={() => downloadText(`teklifler_${new Date().toISOString().slice(0, 10)}.csv`, quotesCsv(filtered, statusLabel, t), 'text/csv')} disabled={filtered.length === 0}>📊 {t('share.csv')}</Button>
            </div>
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-500">{quotes.length === 0 ? t('history.empty') : t('history.noMatch')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-[11px] uppercase text-zinc-500">
                    <tr><th className="py-1 pr-2">{t('history.colDate')}</th><th className="py-1 pr-2">{t('history.colNo')}</th><th className="py-1 pr-2">{t('history.colCustomer')}</th><th className="py-1 pr-2">{t('history.colModel')}</th><th className="py-1 pr-2 text-right">{t('history.colQty')}</th><th className="py-1 pr-2 text-right">{t('history.colTotal')}</th><th className="py-1 pr-2">{t('history.colStatus')}</th><th /></tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <RowGroup key={r.id} r={r} expanded={expanded === r.id} onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                        onStatus={(s) => setQuoteStatus(r.id, s)} onNote={(n) => setQuoteNote(r.id, n)} onDelete={() => removeQuote(r)}
                        onCopy={() => copy(shareUrl(r.shared))} onWhatsapp={() => window.open(waFor(r), '_blank', 'noopener')} statusLabel={statusLabel} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'customers' && (
          <div className="space-y-3 p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-zinc-500">{t('history.customersHint')}</p>
              <Button onClick={() => setEditing(newCustomer(''))}>{t('history.newCustomer')}</Button>
            </div>
            {editing && (
              <div className="grid grid-cols-1 gap-2 rounded-lg border border-zinc-700 bg-zinc-950/60 p-3 sm:grid-cols-2">
                {(['name', 'company', 'phone', 'email'] as const).map((k) => (
                  <label key={k} className="text-xs text-zinc-400">{t(`history.cust.${k}`)}<input value={editing[k]} onChange={(e) => setEditing({ ...editing, [k]: e.target.value })} className={`${input} mt-0.5`} placeholder={k === 'phone' ? '+90 5xx xxx xx xx' : ''} /></label>
                ))}
                <label className="text-xs text-zinc-400 sm:col-span-2">{t('history.cust.note')}<textarea value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} className={`${input} mt-0.5 h-16`} /></label>
                <div className="flex gap-2 sm:col-span-2">
                  <Button variant="primary" onClick={saveEditing} disabled={!editing.name.trim()}>{t('history.save')}</Button>
                  <Button variant="ghost" onClick={() => setEditing(null)}>{t('quoteDialog.cancel')}</Button>
                </div>
              </div>
            )}
            {customers.length === 0 ? <p className="py-8 text-center text-sm text-zinc-500">{t('history.noCustomers')}</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-[11px] uppercase text-zinc-500"><tr><th className="py-1 pr-2">{t('history.cust.name')}</th><th className="py-1 pr-2">{t('history.cust.company')}</th><th className="py-1 pr-2">{t('history.cust.phone')}</th><th className="py-1 pr-2">{t('history.cust.email')}</th><th className="py-1 pr-2 text-right">{t('history.colQuotes')}</th><th /></tr></thead>
                  <tbody>
                    {customers.map((c) => (
                      <tr key={c.id} className="border-t border-zinc-800">
                        <td className="py-1.5 pr-2 font-medium">{c.name}{c.note && <div className="text-[11px] font-normal text-zinc-500">{c.note}</div>}</td>
                        <td className="py-1.5 pr-2 text-zinc-300">{c.company || '—'}</td>
                        <td className="py-1.5 pr-2 tabular-nums text-zinc-300">{c.phone || '—'}</td>
                        <td className="py-1.5 pr-2 text-zinc-300">{c.email || '—'}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums"><button className="hover:text-sky-300" onClick={() => { setCustomerFilter(c.id); setTab('quotes') }}>{quoteCount.get(c.id) ?? 0}</button></td>
                        <td className="whitespace-nowrap py-1.5 text-right">
                          <button className="px-1.5 text-zinc-400 hover:text-sky-300" onClick={() => setEditing(c)} title={t('history.edit')} aria-label={`${t('history.edit')}: ${c.name}`}>✎</button>
                          <button className="px-1.5 text-zinc-400 hover:text-red-300" onClick={() => removeCustomer(c)} title={t('history.delete')} aria-label={`${t('history.delete')}: ${c.name}`}>🗑</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function RowGroup({ r, expanded, onToggle, onStatus, onNote, onDelete, onCopy, onWhatsapp, statusLabel }: {
  r: QuoteRecord; expanded: boolean; onToggle: () => void; onStatus: (s: QuoteStatus) => void; onNote: (n: string) => void; onDelete: () => void; onCopy: () => void; onWhatsapp: () => void; statusLabel: (s: QuoteStatus) => string
}) {
  const { t } = useI18n()
  const [note, setNote] = useState(r.note)
  const [copied, setCopied] = useState(false)
  const h = Math.round(r.timeSec / 3600 * 10) / 10
  return (
    <>
      <tr className="cursor-pointer border-t border-zinc-800 hover:bg-zinc-800/40 focus:outline-none focus:ring-1 focus:ring-sky-500" onClick={onToggle} tabIndex={0} role="button" aria-expanded={expanded} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onToggle() } }}>
        <td className="whitespace-nowrap py-1.5 pr-2 tabular-nums text-zinc-300">{new Date(r.date).toLocaleDateString(t('locale'))}</td>
        <td className="whitespace-nowrap py-1.5 pr-2 font-mono text-xs text-zinc-400">{r.quoteNo}</td>
        <td className="max-w-[160px] truncate py-1.5 pr-2">{r.customerName || <span className="text-zinc-600">—</span>}</td>
        <td className="max-w-[220px] truncate py-1.5 pr-2 text-zinc-300" title={r.model}>{r.thumb && <img src={r.thumb} alt="" className="mr-1 inline-block h-6 w-6 rounded bg-white object-contain align-middle" />}{r.model}</td>
        <td className="py-1.5 pr-2 text-right tabular-nums">{r.qty}</td>
        <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">{toCur(r, r.total)}</td>
        <td className="py-1.5 pr-2" onClick={(e) => e.stopPropagation()}>
          <select value={r.status} onChange={(e) => onStatus(e.target.value as QuoteStatus)} className={`rounded px-1.5 py-0.5 text-[11px] ${STATUS_CLASS[r.status]} border-0`} aria-label={t('history.colStatus')}>
            {QUOTE_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
        </td>
        <td className="whitespace-nowrap py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
          <button className="px-1.5 text-zinc-400 hover:text-sky-300" onClick={onWhatsapp} title={t('share.whatsapp')} aria-label={t('share.whatsapp')}>💬</button>
          <button className="px-1.5 text-zinc-400 hover:text-sky-300" onClick={() => { onCopy(); setCopied(true); setTimeout(() => setCopied(false), 1500) }} title={t('share.copyLink')} aria-label={t('share.copyLink')}>{copied ? '✓' : '🔗'}</button>
          <button className="px-1.5 text-zinc-400 hover:text-red-300" onClick={onDelete} title={t('history.delete')} aria-label={t('history.delete')}>🗑</button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-zinc-950/60"><td colSpan={8} className="px-3 py-2 text-xs text-zinc-300">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
            <div><span className="text-zinc-500">{t('share.fields.printer')}:</span> {r.printer} · {r.tech === 'fdm' ? 'FDM' : 'SLA'}</div>
            <div><span className="text-zinc-500">{t('share.fields.material')}:</span> {r.material}</div>
            <div><span className="text-zinc-500">{t('share.fields.unit')}:</span> {toCur(r, r.unit)} · {t('history.vatShort', { n: Math.round(r.vatRate * 100) })} {toCur(r, r.total * (1 + r.vatRate))}</div>
            <div><span className="text-zinc-500">{t('history.costMargin')}:</span> {money(r.cost, 'TRY')} · {r.cost > 0 ? `%${Math.round(((r.total - r.cost) / r.cost) * 100)}` : '—'}</div>
            <div><span className="text-zinc-500">{t('history.production')}:</span> {r.grams} g · {h} h · {r.plates} {t('history.plates')}</div>
            <div><span className="text-zinc-500">{t('share.fields.lead')}:</span> {r.leadDays} {t('units.days')}</div>
            <div className="sm:col-span-2"><span className="text-zinc-500">{t('history.basis')}:</span> {r.basis}</div>
          </div>
          {r.parts.length > 1 && (
            <ul className="mt-1 list-disc pl-4 text-zinc-400">{r.parts.map((p, i) => <li key={i}>{p.name} · {p.size.join('×')} mm · ×{p.quantity}</li>)}</ul>
          )}
          <div className="mt-2 flex items-center gap-2">
            <input value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => { if (note !== r.note) onNote(note) }} placeholder={t('history.notePlaceholder')} className="w-full max-w-md rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs outline-none focus:border-sky-500" />
          </div>
        </td></tr>
      )}
    </>
  )
}
