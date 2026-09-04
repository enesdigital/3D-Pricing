import { useRef } from 'react'
import type { MeshPart } from '../lib/mesh/useMeshWorker.ts'
import { ACCEPTED_EXT, MAX_PARTS } from '../lib/mesh/useMeshWorker.ts'
import type { ProjectEstimate } from '../lib/cost/project.ts'
import type { BusinessSettings } from '../lib/cost/types.ts'
import { MAX_QUANTITY, fmtMoney, formatDurationCompact } from '../lib/cost/engine.ts'
import { NumberInput } from './ui.tsx'
import { useI18n } from '../lib/i18n/index.tsx'

interface Props {
  parts: MeshPart[]
  activeId: string | null
  onActive: (id: string) => void
  onQuantity: (id: string, q: number) => void
  onRemove: (id: string) => void
  onAdd: (file: File) => void
  est: ProjectEstimate | null
  settings: BusinessSettings
  plateIndex: number
  onPlateIndex: (i: number) => void
}

const fmt = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 0 })

export function ProjectPanel({ parts, activeId, onActive, onQuantity, onRemove, onAdd, est, settings, plateIndex, onPlateIndex }: Props) {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const results = new Map(est?.project.parts.map((r) => [r.id, r]) ?? [])
  const plates = est?.project.plates ?? []
  const full = parts.length >= MAX_PARTS
  return (
    <div className="space-y-3 text-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-[11px] uppercase text-zinc-500">
            <tr><th className="py-1 pr-2">{t('project.colPart')}</th><th className="py-1 pr-2">{t('project.colSize')}</th><th className="py-1 pr-2 text-right">{t('project.colQty')}</th><th className="py-1 pr-2 text-right">{t('project.colUnit')}</th><th /></tr>
          </thead>
          <tbody>
            {parts.map((p) => {
              const st = p.analysis.stats
              const r = results.get(p.id)
              const active = p.id === activeId
              return (
                <tr key={p.id} className={`border-t border-zinc-800 ${active ? 'bg-sky-950/40' : ''}`}>
                  <td className="max-w-[140px] py-1.5 pr-2">
                    <button type="button" className={`block w-full truncate text-left hover:text-sky-300 ${active ? 'font-medium text-sky-200' : 'text-zinc-200'}`} title={p.model.fileName} aria-label={t('project.selectAria', { name: p.model.fileName })} onClick={() => onActive(p.id)}>{p.model.fileName}</button>
                    {r && !r.fitsRotated && <span className="text-[11px] text-red-300">{t('project.notFit')}</span>}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-2 tabular-nums text-zinc-400">{st ? `${fmt(st.size.x)}×${fmt(st.size.y)}×${fmt(st.size.z)}` : (p.pending || !p.loaded ? t('project.analyzing') : '—')}</td>
                  <td className="py-1.5 pr-2 text-right"><NumberInput className="w-20" value={p.quantity} onChange={(v) => onQuantity(p.id, Math.min(MAX_QUANTITY, Math.max(1, Math.round(v))))} min={1} max={MAX_QUANTITY} step={1} /></td>
                  <td className="whitespace-nowrap py-1.5 pr-2 text-right tabular-nums">{r && r.placed > 0 ? fmtMoney(r.unitPrice, settings, 0) : '—'}</td>
                  <td className="py-1.5 text-right"><button type="button" className="rounded px-1.5 py-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-300" title={t('project.remove')} aria-label={t('project.removeAria', { name: p.model.fileName })} onClick={() => onRemove(p.id)}><span aria-hidden="true">✕</span></button></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault() }}
        onDrop={(e) => { e.preventDefault(); if (!full && e.dataTransfer.files[0]) onAdd(e.dataTransfer.files[0]) }}
        className={`rounded-lg border border-dashed px-3 py-2 text-center text-xs ${full ? 'border-zinc-800 text-zinc-600' : 'cursor-pointer border-zinc-700 text-zinc-300 hover:border-zinc-500'}`}
        onClick={() => { if (!full) inputRef.current?.click() }}
        role="button" tabIndex={0} onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !full) { e.preventDefault(); inputRef.current?.click() } }}
      >
        <input ref={inputRef} type="file" accept={ACCEPTED_EXT.map((e) => '.' + e).join(',')} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onAdd(f); e.target.value = '' }} />
        {full ? t('project.maxParts', { n: MAX_PARTS }) : t('project.addPart')}
      </div>

      {est && (
        <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-zinc-400">{t('project.total')}</span>
            <b className="tabular-nums text-zinc-100">{fmtMoney(settings.showVatIncl ? est.total.priceWithVat : est.total.price, settings, 0)}</b>
          </div>
          {plates.length > 1 && (
            <div className="flex flex-wrap items-center gap-1">
              <select className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200" value={plateIndex} onChange={(e) => onPlateIndex(Number(e.target.value))} aria-label={t('project.plate', { i: plateIndex + 1, n: plates.length })}>
                {plates.map((pl) => <option key={pl.index} value={pl.index}>{t('project.plate', { i: pl.index + 1, n: plates.length })} — {t('project.plateInfo', { parts: pl.partCount, time: formatDurationCompact(pl.timeSec, t) })}</option>)}
              </select>
              {plates[plateIndex]?.synthetic && <span className="text-[11px] text-zinc-500">{t('project.plateSynthetic')}</span>}
            </div>
          )}
          {est.project.unplaced > 0 && <p className="text-amber-300">{t('project.unplaced', { n: est.project.unplaced })}</p>}
        </div>
      )}
      <p className="text-[11px] leading-snug text-zinc-500">{t('project.hint')}</p>
    </div>
  )
}
