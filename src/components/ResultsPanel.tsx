import type { Estimate, Material, PrinterProfile, BusinessSettings } from '../lib/cost/types.ts'
import { fmtTRY, formatDuration } from '../lib/cost/engine.ts'
import { Stat } from './ui.tsx'

export function ResultsPanel({ est, printer, material, settings }: { est: Estimate; printer: PrinterProfile; material: Material; settings: BusinessSettings }) {
  const qty = Math.max(1, Math.floor(settings.quantity))
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
        <div className="text-xs uppercase tracking-wide text-sky-300/80">Tahmini satış fiyatı (KDV hariç)</div>
        <div className="mt-1 text-3xl font-bold tabular-nums text-white">{fmtTRY(est.pricePerUnit)}<span className="ml-1 text-sm font-normal text-zinc-400">/ adet</span></div>
        <div className="mt-1 text-sm text-zinc-300">KDV dahil {fmtTRY(est.pricePerUnitWithVat)}{qty > 1 && <> · {qty} adet toplam <b>{fmtTRY(est.totalPriceWithVat)}</b></>}</div>
        <div className="mt-2 text-xs text-zinc-400">Maliyet {fmtTRY(est.costPerUnit)} · kâr %{Math.round(settings.markup * 100)}{est.pricePerUnit * qty <= settings.minimumPriceTRY + 0.001 ? ' · minimum sipariş tutarı uygulandı' : ''}</div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Malzeme" value={`${est.materialGrams.toFixed(1)} g`} sub={est.supportGrams > 0 ? `destek ${est.supportGrams.toFixed(1)} g` : material.name} />
        <Stat label="Süre" value={formatDuration(est.printTimeSec)} sub={`${est.layerCount} katman`} />
        <Stat label="Enerji" value={`${est.energyKWh.toFixed(2)} kWh`} sub={`${printer.spec.avgPowerW} W ort.`} />
        <Stat label="Hacim" value={`${(est.materialVolumeMm3 / 1000).toFixed(1)} cm³`} sub="basılan malzeme" />
      </div>

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
            <td className="py-2 text-zinc-200">Birim maliyet</td>
            <td className="py-2 text-right tabular-nums">{fmtTRY(est.costPerUnit)}</td>
          </tr>
        </tbody>
      </table>

      {est.tech === 'fdm' && (
        <details className="text-xs text-zinc-400">
          <summary className="cursor-pointer text-zinc-300">Malzeme dağılımı</summary>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
            <span>Duvarlar</span><span className="text-right tabular-nums">{(est.breakdown.wallVolume / 1000).toFixed(2)} cm³</span>
            <span>Üst/alt kabuk</span><span className="text-right tabular-nums">{(est.breakdown.skinVolume / 1000).toFixed(2)} cm³</span>
            <span>Dolgu</span><span className="text-right tabular-nums">{(est.breakdown.infillVolume / 1000).toFixed(2)} cm³</span>
            <span>Destek</span><span className="text-right tabular-nums">{(est.breakdown.supportVolume / 1000).toFixed(2)} cm³</span>
            {est.breakdown.colorChanges > 0 && <><span>Renk değişimi</span><span className="text-right tabular-nums">{est.breakdown.colorChanges}</span></>}
          </div>
        </details>
      )}
    </div>
  )
}
