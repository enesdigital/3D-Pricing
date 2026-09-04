import type { SharedQuote } from '../lib/share.ts'
import { useI18n } from '../lib/i18n/index.tsx'
import { Button } from './ui.tsx'

const money = (n: number, cur: string) => new Intl.NumberFormat(cur === 'TRY' ? 'tr-TR' : 'en-US', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(cur === 'TRY' ? n : n / 1)

export function SharedQuoteView({ quote: q, onClose }: { quote: SharedQuote; onClose: () => void }) {
  const { t } = useI18n()
  const f = (k: string) => t(`share.fields.${k}`)
  const toCur = (tryAmt: number) => money(q.currency === 'TRY' ? tryAmt : tryAmt / (q.fxRate || 1), q.currency)
  const rows: [string, string][] = [
    [f('date'), q.date], [f('company'), q.company || '—'], [f('customer'), q.customer || '—'], [f('model'), q.model],
    [f('size'), `${q.sizeMm[0]} × ${q.sizeMm[1]} × ${q.sizeMm[2]} mm`], [f('printer'), `${q.printer} (${q.tech === 'fdm' ? 'FDM' : 'SLA'})`], [f('material'), q.material],
    [f('qty'), String(q.qty)], [f('unit'), toCur(q.unit)], [f('total'), toCur(q.total)], [f('vat'), `%${Math.round(q.vatRate * 100)} · ${toCur(q.total * q.vatRate)}`],
    [f('gross'), toCur(q.total * (1 + q.vatRate))], [f('lead'), `${q.leadDays} gün`],
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm">
      <div className="my-8 w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl" role="dialog" aria-modal="true" aria-label={t('share.sharedTitle')}>
        <header className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
          <div><h2 className="text-base font-semibold">{t('share.sharedTitle')}</h2><p className="text-[11px] text-zinc-500">{t('share.sharedHint')}</p></div>
          <Button variant="primary" onClick={onClose}>{t('share.close')}</Button>
        </header>
        <table className="w-full text-sm">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k} className="border-t border-zinc-800/80"><td className="px-5 py-1.5 text-zinc-400">{k}</td><td className="px-5 py-1.5 text-right font-medium tabular-nums">{v}</td></tr>
            ))}
            {q.note && <tr className="border-t border-zinc-800/80"><td className="px-5 py-2 text-zinc-400">{f('note')}</td><td className="px-5 py-2 text-right text-xs text-zinc-300">{q.note}</td></tr>}
          </tbody>
        </table>
        {q.contact && <p className="px-5 pb-4 pt-2 text-xs text-zinc-500">{q.contact}</p>}
      </div>
    </div>
  )
}
