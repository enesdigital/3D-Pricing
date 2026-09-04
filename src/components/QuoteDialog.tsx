import { useEffect, useMemo, useState } from 'react'
import type { BusinessSettings, Estimate } from '../lib/cost/types.ts'
import type { QuoteImage, QuotePricing } from '../lib/pdf/quote.ts'
import { fmtMoney, toDisplay, fromDisplay, currencySymbol } from '../lib/cost/engine.ts'
import { fileToPngDataUrl, imageSize } from '../lib/pdf/image.ts'
import { Button, Field, NumberInput, Toggle } from './ui.tsx'
import { buildSharedQuote, shareUrl, whatsappUrl, quoteCsv, downloadText } from '../lib/share.ts'
import type { Material, PrinterProfile } from '../lib/cost/types.ts'
import { useI18n } from '../lib/i18n/index.tsx'
import { historyAvailable, listCustomers, normName, type CustomerRecord } from '../lib/history/index.ts'

interface Props {
  open: boolean
  est: Estimate
  settings: BusinessSettings
  customer: string
  onCustomer: (v: string) => void
  logo: QuoteImage | null
  onLogo: (l: QuoteImage | null) => void
  modelImage: QuoteImage | null
  busy: boolean
  error: string | null
  onGenerate: (pricing: QuotePricing, includeProduction: boolean) => void
  /** PDF indirmeden geçmişe kaydet; kaydedilen teklif numarasını döndürür */
  onSave: (pricing: QuotePricing) => Promise<string | null>
  share: { printer: PrinterProfile; material: Material; fileName: string; size: { x: number; y: number; z: number } }
  onClose: () => void
}

type Mode = 'markup' | 'unit' | 'total'

export function QuoteDialog(p: Props) {
  const { t } = useI18n()
  const { est, settings } = p
  const qty = est.quantity
  const [mode, setMode] = useState<Mode>('markup')
  const [markupPct, setMarkupPct] = useState(Math.round(settings.markup * 100))
  const fmtTRY = (n: number) => fmtMoney(n, settings)
  const sym = currencySymbol(settings.displayCurrency ?? 'TRY')
  // Elle girişler gösterim para birimindedir; hesaba TRY olarak çevrilir
  const [unitPrice, setUnitPrice] = useState(Math.round(toDisplay(est.perUnit.price, settings) * 100) / 100)
  const [totalPrice, setTotalPrice] = useState(Math.round(toDisplay(est.total.price, settings) * 100) / 100)
  const [includeProduction, setIncludeProduction] = useState(true)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [customers, setCustomers] = useState<CustomerRecord[]>([])
  const [savedNo, setSavedNo] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (p.open && historyAvailable()) listCustomers().then(setCustomers).catch(() => setCustomers([])) }, [p.open])
  const matchedCustomer = useMemo(() => { const n = normName(p.customer); return n ? customers.find((c) => normName(c.name) === n) ?? null : null }, [customers, p.customer])

  useEffect(() => {
    if (!p.open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !p.busy) p.onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [p.open, p.busy, p])

  const pricing = useMemo<QuotePricing>(() => {
    let total: number
    let basis: string
    if (mode === 'markup') {
      // Motorla aynı: marj → kademeli adet indirimi → minimum sipariş
      total = Math.max(est.total.cost * (1 + markupPct / 100) * (1 - (est.discountPct || 0)), settings.minimumPriceTRY)
      basis = t('quoteDialog.basisMarkup', { pct: markupPct })
    } else if (mode === 'unit') {
      total = fromDisplay(unitPrice, settings) * qty
      basis = t('quoteDialog.basisUnit')
    } else {
      total = fromDisplay(totalPrice, settings)
      basis = t('quoteDialog.basisTotal')
    }
    return { unitPrice: total / qty, total, vatRate: settings.vat, basis }
  }, [mode, markupPct, unitPrice, totalPrice, est.total.cost, est.discountPct, qty, settings, t])

  if (!p.open) return null
  const margin = pricing.total - est.total.cost
  const marginPct = est.total.cost > 0 ? (margin / est.total.cost) * 100 : 0

  const onLogoFile = async (f: File | undefined) => {
    if (!f) return
    setLogoError(null)
    try {
      const dataUrl = await fileToPngDataUrl(f, 800, 400)
      const { w, h } = await imageSize(dataUrl)
      p.onLogo({ dataUrl, w, h })
    } catch (e) { setLogoError(e instanceof Error ? e.message : String(e)) }
  }

  const radio = (m: Mode, label: string) => (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-200">
      <input type="radio" name="pricing-mode" checked={mode === m} onChange={() => setMode(m)} className="accent-sky-500" />{label}
    </label>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onClick={() => { if (!p.busy) p.onClose() }}>
      <div className="my-6 w-full max-w-2xl rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
          <div>
            <h2 className="text-base font-semibold">{t('quoteDialog.title')}</h2>
            <p className="text-[11px] text-zinc-500">{t('quoteDialog.subtitle')}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={p.onClose} disabled={p.busy}>{t('quoteDialog.cancel')}</Button>
            {historyAvailable() && <Button disabled={p.busy || saving || pricing.total <= 0} title={t('history.saveHint')} onClick={async () => { setSaving(true); try { const no = await p.onSave(pricing); setSavedNo(no) } finally { setSaving(false) } }}>{t('history.saveBtn')}</Button>}
            <Button variant="primary" disabled={p.busy || pricing.total <= 0} onClick={() => p.onGenerate(pricing, includeProduction)}>{p.busy ? t('quoteDialog.busy') : t('quoteDialog.download')}</Button>
          </div>
        </header>
        <div className="space-y-5 p-5">
          {p.error && <div className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">{t('quoteDialog.genError', { error: p.error })}</div>}
          {savedNo && <div className="rounded-md border border-emerald-900 bg-emerald-950/50 px-3 py-2 text-sm text-emerald-200">{t('history.saved', { no: savedNo })}</div>}

          <Field label={t('quoteDialog.customer')} hint={matchedCustomer ? [matchedCustomer.company, matchedCustomer.phone, matchedCustomer.email].filter(Boolean).join(' · ') : undefined}>
            <input value={p.customer} onChange={(e) => p.onCustomer(e.target.value)} placeholder={t('quoteDialog.customerPlaceholder')} list="quote-customers" className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm outline-none focus:border-sky-500" />
            {customers.length > 0 && <datalist id="quote-customers">{customers.map((c) => <option key={c.id} value={c.name}>{c.company || c.phone || ''}</option>)}</datalist>}
          </Field>

          <section className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
            <div className="mb-2 text-xs font-medium text-zinc-400">{t('quoteDialog.pricingLabel', { cost: fmtTRY(est.total.cost) })}{qty > 1 && t('quoteDialog.pricingPerUnit', { unit: fmtTRY(est.perUnit.cost) })}</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                {radio('markup', t('quoteDialog.modeMarkup'))}
                <NumberInput value={markupPct} onChange={setMarkupPct} min={0} max={1000} step={5} suffix="%" className={mode !== 'markup' ? 'opacity-50' : ''} />
              </div>
              <div className="space-y-1">
                {radio('unit', t('quoteDialog.modeUnit'))}
                <NumberInput value={unitPrice} onChange={setUnitPrice} min={0} step={1} suffix={sym} className={mode !== 'unit' ? 'opacity-50' : ''} />
              </div>
              <div className="space-y-1">
                {radio('total', t('quoteDialog.modeTotal'))}
                <NumberInput value={totalPrice} onChange={setTotalPrice} min={0} step={1} suffix={sym} className={mode !== 'total' ? 'opacity-50' : ''} />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums sm:grid-cols-4">
              <div><div className="text-[11px] text-zinc-500">{t('quoteDialog.unitExVat')}</div><b>{fmtTRY(pricing.unitPrice)}</b></div>
              <div><div className="text-[11px] text-zinc-500">{t('quoteDialog.totalExVat')}</div><b>{fmtTRY(pricing.total)}</b></div>
              <div><div className="text-[11px] text-zinc-500">{t('quoteDialog.vat', { n: Math.round(settings.vat * 100) })}</div><b>{fmtTRY(pricing.total * settings.vat)}</b></div>
              <div><div className="text-[11px] text-zinc-500">{t('quoteDialog.grandTotal')}</div><b className="text-sky-300">{fmtTRY(pricing.total * (1 + settings.vat))}</b></div>
            </div>
            <p className={`mt-2 text-[11px] ${margin < 0 ? 'text-red-300' : 'text-zinc-500'}`}>
              {t('quoteDialog.margin', { margin: fmtTRY(margin), pct: marginPct.toFixed(0) })}{margin < 0 && t('quoteDialog.marginBelow')}
            </p>
          </section>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-400">{t('quoteDialog.logo')}</div>
              <div className="flex items-center gap-3">
                {p.logo
                  ? <img src={p.logo.dataUrl} alt="logo" className="h-12 max-w-[140px] rounded bg-white object-contain p-1" />
                  : <div className="flex h-12 w-24 items-center justify-center rounded border border-dashed border-zinc-700 text-[11px] text-zinc-500">{t('quoteDialog.logoNone')}</div>}
                <div className="flex flex-col gap-1">
                  <label className="cursor-pointer rounded-md border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs text-zinc-100 hover:bg-zinc-700">
                    {p.logo ? t('quoteDialog.logoChange') : t('quoteDialog.logoUpload')}
                    <input type="file" accept=".png,.jpg,.jpeg,.svg,.webp,image/*" className="hidden" onChange={(e) => onLogoFile(e.target.files?.[0])} />
                  </label>
                  {p.logo && <button className="text-[11px] text-zinc-400 hover:text-red-300" onClick={() => p.onLogo(null)}>{t('quoteDialog.logoRemove')}</button>}
                </div>
              </div>
              {logoError && <p className="mt-1 text-[11px] text-red-300">{logoError}</p>}
              <p className="mt-1 text-[11px] text-zinc-500">{t('quoteDialog.logoHint')}</p>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-400">{t('quoteDialog.modelImage')}</div>
              {p.modelImage
                ? <img src={p.modelImage.dataUrl} alt="model" className="h-24 rounded border border-zinc-700 bg-zinc-100 object-contain" />
                : <div className="flex h-24 w-full items-center justify-center rounded border border-dashed border-zinc-700 text-[11px] text-zinc-500">{t('quoteDialog.modelImageNone')}</div>}
              <p className="mt-1 text-[11px] text-zinc-500">{t('quoteDialog.modelImageHint')}</p>
            </div>
          </section>

          <Toggle checked={includeProduction} onChange={setIncludeProduction} label={t('quoteDialog.includeProduction')} />

          <div className="flex flex-wrap gap-2 border-t border-zinc-800 pt-3">
            {(() => {
              const sq = buildSharedQuote({ est, pricing, settings, printer: p.share.printer, material: p.share.material, fileName: p.share.fileName, customer: p.customer, size: p.share.size })
              const link = shareUrl(sq)
              const text = t('share.waText', { name: p.customer.trim() ? ` ${p.customer.trim()}` : '', model: sq.model, printer: sq.printer, material: sq.material, qty: sq.qty, unit: fmtTRY(pricing.unitPrice), total: fmtTRY(pricing.total), gross: fmtTRY(pricing.total * (1 + pricing.vatRate)), lead: est.leadDays, link })
              return (
                <>
                  <Button onClick={() => window.open(whatsappUrl(matchedCustomer?.phone || settings.whatsappNumber || '', text), '_blank', 'noopener')}>💬 {t('share.whatsapp')}{matchedCustomer?.phone ? ` → ${matchedCustomer.phone}` : ''}</Button>
                  <Button onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { prompt('URL', link) } }}>🔗 {copied ? t('share.linkCopied') : t('share.copyLink')}</Button>
                  <Button onClick={() => downloadText(`teklif_${sq.model.replace(/\.[^.]+$/, '')}.csv`, quoteCsv(est, pricing, { model: sq.model, printer: sq.printer, material: sq.material, currency: sq.currency }), 'text/csv')}>📊 {t('share.csv')}</Button>
                </>
              )
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}
