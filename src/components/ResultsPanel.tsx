import type { Estimate, Material, PrinterProfile, BusinessSettings } from '../lib/cost/types.ts'
import { fmtMoney, formatDuration } from '../lib/cost/engine.ts'
import { Stat } from './ui.tsx'
import { useI18n } from '../lib/i18n/index.tsx'

const fmtGrams = (g: number) => (g >= 1000 ? `${(g / 1000).toFixed(2)} kg` : `${g.toFixed(1)} g`)

export interface LadderRow { qty: number; unit: number; total: number }
export function ResultsPanel({ est, printer, material, settings, calibSamples, ladder }: { est: Estimate; printer: PrinterProfile; material: Material; settings: BusinessSettings; calibSamples?: number; ladder?: LadderRow[] }) {
  const fmtTRY = (n: number) => fmtMoney(n, settings)
  const vatIncl = !!settings.showVatIncl
  const { t: tr } = useI18n()
  const qty = est.quantity
  const u = est.perUnit
  const t = est.total
  return (
    <div className="space-y-4">
      {est.warnings.length > 0 && (
        <ul className="space-y-1">
          {est.warnings.map((w, i) => (
            <li key={i} className="rounded-md border border-amber-900/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">⚠ {w}</li>
          ))}
        </ul>
      )}

      <div className="rounded-xl bg-gradient-to-br from-sky-950/60 to-zinc-900 p-4 ring-1 ring-sky-900/50">
        {est.basis !== 'model' && (
          <div className="mb-1 inline-block rounded bg-emerald-900/50 px-2 py-0.5 text-[11px] text-emerald-200">
            {est.basis === 'slicer' ? tr('slicer.basisSlicer') : tr('slicer.basisCalibrated', { n: calibSamples ?? 0 })}
          </div>
        )}
        <div className="text-xs uppercase tracking-wide text-sky-300/80">{tr('results.salePrice')}</div>
        <div className="mt-1 text-3xl font-bold tabular-nums text-white">{fmtTRY(vatIncl ? u.priceWithVat : u.price)}<span className="ml-1 text-sm font-normal text-zinc-400">{tr('results.perUnit')}{vatIncl ? ' · KDV dahil' : ''}</span></div>
        <div className="mt-1 text-sm text-zinc-300">
          {tr('results.vatInclPerUnit', { x: fmtTRY(u.priceWithVat) })}
          {qty > 1 && <> · <b>{tr('results.totalForQty', { qty, t: fmtTRY(t.price) })}</b> {tr('results.vatIncl', { tv: fmtTRY(t.priceWithVat) })}</>}
        </div>
        <div className="mt-2 text-xs text-zinc-400">
          {tr('results.costPerUnit', { c: fmtTRY(u.cost), m: Math.round(settings.markup * 100) })}
          {t.price <= settings.minimumPriceTRY + 0.001 ? tr('results.minApplied') : ''}
        </div>
      </div>

      {(est.discountPct > 0 || est.leadDays > 0) && (
        <div className="flex flex-wrap gap-2 text-xs">
          {est.discountPct > 0 && <span className="rounded bg-emerald-900/40 px-2 py-1 text-emerald-200">{tr('resultsExtra.discount', { pct: Math.round(est.discountPct * 100) })}</span>}
          <span className="rounded bg-zinc-800 px-2 py-1 text-zinc-300">{tr('resultsExtra.lead')}: {tr('resultsExtra.leadDays', { n: est.leadDays })}</span>
          {settings.displayCurrency && settings.displayCurrency !== 'TRY' && <span className="rounded bg-zinc-800 px-2 py-1 text-zinc-400">{tr('resultsExtra.fxNote', { cur: settings.displayCurrency, rate: (settings.fxRates?.[settings.displayCurrency] ?? 0).toFixed(2), date: settings.fxRates?.updatedAt || '—' })}</span>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label={tr('results.statMaterialPer')} value={fmtGrams(u.materialGrams)} sub={u.supportGrams > 0 ? tr('results.statSupport', { g: u.supportGrams.toFixed(1) }) : material.name} />
        <Stat label={qty > 1 ? tr('results.statTimePerAvg') : tr('results.statTime')} value={formatDuration(u.printTimeSec, tr)} sub={tr('results.statLayers', { n: est.layerCount })} />
        <Stat label={tr('results.statEnergyPer')} value={`${u.energyKWh.toFixed(2)} kWh`} sub={tr('results.statWattAvg', { w: printer.spec.avgPowerW })} />
        <Stat label={tr('results.statVolumePer')} value={`${(est.materialVolumeMm3 / 1000).toFixed(1)} cm³`} sub={tr('results.statPrinted')} />
      </div>

      {qty > 1 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-zinc-500">{tr('results.totalHeader', { qty, plates: est.plates, n: est.partsPerPlate })}</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 tabular-nums sm:grid-cols-4">
            <div><span className="text-zinc-500">{tr('results.material')}</span> <b>{fmtGrams(t.materialGrams)}</b></div>
            <div><span className="text-zinc-500">{tr('results.totalTime')}</span> <b>{formatDuration(t.printTimeSec, tr)}</b></div>
            <div><span className="text-zinc-500">{tr('results.energy')}</span> <b>{t.energyKWh.toFixed(2)} kWh</b></div>
            <div><span className="text-zinc-500">{tr('results.cost')}</span> <b>{fmtTRY(t.cost)}</b></div>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-zinc-500">
            {tr('results.plateTimeNote', { x: formatDuration(est.plateTimeSec, tr), y: formatDuration(est.single.printTimeSec, tr) })}
            {est.tech === 'resin' ? tr('results.resinNote') : tr('results.fdmNote')}
          </p>
        </div>
      )}

      {ladder && ladder.length > 1 && (
        <details className="text-xs text-zinc-400" open>
          <summary className="cursor-pointer text-zinc-300">{tr('resultsExtra.ladder')}</summary>
          <table className="mt-1 w-full text-xs">
            <thead className="text-left text-[11px] uppercase text-zinc-500"><tr><th className="py-1">{tr('resultsExtra.ladderQty')}</th><th className="py-1 text-right">{tr('resultsExtra.ladderUnit')}</th><th className="py-1 text-right">{tr('resultsExtra.ladderTotal')}</th></tr></thead>
            <tbody>
              {ladder.map((r) => (
                <tr key={r.qty} className={`border-t border-zinc-800/80 ${r.qty === est.quantity ? 'text-sky-300' : ''}`}>
                  <td className="py-1 tabular-nums">{r.qty}</td><td className="py-1 text-right tabular-nums">{fmtTRY(r.unit)}</td><td className="py-1 text-right tabular-nums">{fmtTRY(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      <table className="w-full text-sm">
        <tbody>
          {est.lines.map((l) => (
            <tr key={l.key} className="border-t border-zinc-800/80">
              <td className="py-1.5 pr-2 text-zinc-300">
                {l.label}
                {l.detail && <span className="ml-1 text-[11px] text-zinc-500">{l.detail}</span>}
              </td>
              <td className="py-1.5 text-right tabular-nums text-zinc-100">{fmtTRY(l.amount)}</td>
            </tr>
          ))}
          <tr className="border-t border-zinc-700 font-semibold">
            <td className="py-2 text-zinc-200">{qty > 1 ? tr('results.totalCostQty', { qty }) : tr('results.unitCost')}</td>
            <td className="py-2 text-right tabular-nums">{fmtTRY(t.cost)}</td>
          </tr>
        </tbody>
      </table>

      {est.tech === 'fdm' && (
        <details className="text-xs text-zinc-400">
          <summary className="cursor-pointer text-zinc-300">{tr('results.breakdownTitle')}</summary>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
            <span>{tr('results.walls')}</span><span className="text-right tabular-nums">{(est.breakdown.wallVolume / 1000).toFixed(2)} cm³</span>
            <span>{tr('results.skin')}</span><span className="text-right tabular-nums">{(est.breakdown.skinVolume / 1000).toFixed(2)} cm³</span>
            <span>{tr('results.infill')}</span><span className="text-right tabular-nums">{(est.breakdown.infillVolume / 1000).toFixed(2)} cm³</span>
            <span>{tr('results.support')}</span><span className="text-right tabular-nums">{(est.breakdown.supportVolume / 1000).toFixed(2)} cm³</span>
            {est.breakdown.colorChanges > 0 && <><span>{tr('results.amsChange')}</span><span className="text-right tabular-nums">{est.breakdown.colorChanges}</span></>}
            {est.breakdown.nozzleSwitches > 0 && <><span>{tr('results.nozzleChange')}</span><span className="text-right tabular-nums">{est.breakdown.nozzleSwitches}</span></>}
          </div>
        </details>
      )}
    </div>
  )
}
