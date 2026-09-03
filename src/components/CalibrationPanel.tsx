import { useState } from 'react'
import type { CalibrationRecord, CalibrationFactors } from '../lib/slicer/types.ts'
import type { Material, PrinterProfile } from '../lib/cost/types.ts'
import { formatDuration } from '../lib/cost/engine.ts'
import { useI18n } from '../lib/i18n/index.tsx'
import { Button, NumberInput } from './ui.tsx'

interface Props {
  records: CalibrationRecord[]
  factors: CalibrationFactors
  printers: PrinterProfile[]
  materials: Material[]
  /** Elle kayıt için mevcut model tahmini (yoksa elle ekleme kapalı) */
  current: { printerId: string; materialId: string; presetKey: string; modelName: string; modelTimeSec: number; modelGrams: number } | null
  onAdd: (r: CalibrationRecord) => void
  onDelete: (id: string) => void
}

export function CalibrationPanel({ records, factors, printers, materials, current, onAdd, onDelete }: Props) {
  const { t } = useI18n()
  const [actualMin, setActualMin] = useState(0)
  const [actualG, setActualG] = useState(0)
  const name = (id: string, list: { id: string; name: string; brand?: string }[]) => { const x = list.find((p) => p.id === id); return x ? `${x.brand ? x.brand + ' ' : ''}${x.name}` : id }
  const scope = factors.scope === 'printer+material' ? t('calibration.scopePM') : factors.scope === 'printer' ? t('calibration.scopeP') : t('calibration.scopeNone')
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-zinc-500">{t('calibration.hint')}</p>
      <p className="text-xs text-sky-300">{t('calibration.factors', { t: factors.timeFactor.toFixed(2), g: factors.gramsFactor.toFixed(2), n: factors.samples, scope })}</p>
      {records.length === 0 ? <p className="text-xs text-zinc-500">{t('calibration.empty')}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-left text-[11px] uppercase text-zinc-500">
              <tr><th className="py-1 pr-2">{t('calibration.colDate')}</th><th className="py-1 pr-2">{t('calibration.colPrinter')}</th><th className="py-1 pr-2">{t('calibration.colMaterial')}</th><th className="py-1 pr-2">{t('calibration.colModel')}</th><th className="py-1 pr-2">{t('calibration.colTime')}</th><th className="py-1 pr-2">{t('calibration.colGrams')}</th><th /></tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-t border-zinc-800">
                  <td className="py-1 pr-2 whitespace-nowrap">{new Date(r.date).toLocaleDateString()}</td>
                  <td className="py-1 pr-2">{name(r.printerId, printers)}</td>
                  <td className="py-1 pr-2">{name(r.materialId, materials)}</td>
                  <td className="py-1 pr-2 max-w-[140px] truncate" title={r.modelName}>{r.modelName}</td>
                  <td className="py-1 pr-2 tabular-nums">{formatDuration(r.modelTimeSec, t)} → {formatDuration(r.actualTimeSec, t)} (×{(r.actualTimeSec / r.modelTimeSec).toFixed(2)})</td>
                  <td className="py-1 pr-2 tabular-nums">{r.modelGrams.toFixed(1)} → {r.actualGrams.toFixed(1)} g (×{(r.actualGrams / r.modelGrams).toFixed(2)})</td>
                  <td className="py-1"><button className="text-red-300 hover:underline" onClick={() => onDelete(r.id)}>{t('calibration.delete')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {current && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
          <div className="mb-2 text-xs font-medium text-zinc-300">{t('calibration.manual')} — {current.modelName}: {formatDuration(current.modelTimeSec, t)}, {current.modelGrams.toFixed(1)} g</div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-zinc-400">{t('calibration.actualTime')}<NumberInput value={actualMin} onChange={setActualMin} min={0} step={1} suffix="dk" className="w-28" /></label>
            <label className="text-xs text-zinc-400">{t('calibration.actualGrams')}<NumberInput value={actualG} onChange={setActualG} min={0} step={0.1} suffix="g" className="w-28" /></label>
            <Button variant="primary" disabled={actualMin <= 0 || actualG <= 0} onClick={() => {
              onAdd({ id: `cal-${Date.now().toString(36)}`, date: new Date().toISOString(), ...current, actualTimeSec: actualMin * 60, actualGrams: actualG })
              setActualMin(0); setActualG(0)
            }}>{t('slicer.addCalib')}</Button>
          </div>
        </div>
      )}
    </div>
  )
}
