import { useRef, useState } from 'react'
import type { Estimate, Material } from '../lib/cost/types.ts'
import { formatDuration } from '../lib/cost/engine.ts'
import { parseSlicerFile, gramsFromLength, type SlicerData } from '../lib/slicer/index.ts'
import { useI18n } from '../lib/i18n/index.tsx'
import { Button, NumberInput, Toggle } from './ui.tsx'

interface Props {
  material: Material | null
  data: SlicerData | null
  partsInFile: number
  useIt: boolean
  /** Model tahmini (dilimleyici verisi kapalıyken) — fark için */
  modelEstimate: Estimate | null
  onData: (d: SlicerData | null) => void
  onPartsInFile: (n: number) => void
  onUse: (v: boolean) => void
  onAddCalibration: () => void
  calibAdded: boolean
}

export function SlicerImport({ material, data, partsInFile, useIt, modelEstimate, onData, onPartsInFile, onUse, onAddCalibration, calibAdded }: Props) {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [over, setOver] = useState(false)

  const handle = async (file: File | undefined) => {
    if (!file) return
    setBusy(true); setError(null)
    try {
      const d = await parseSlicerFile(file)
      if (d.filamentGrams == null && d.filamentMm != null) {
        d.filamentGrams = gramsFromLength(d.filamentMm, d.filamentDensity ?? material?.density ?? 1.24)
        if (d.source === 'cura') d.notes.push('cura-weight-derived')
      }
      onData(d)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg === 'BGCODE' ? t('slicer.errBgcode') : t('slicer.errParse', { e: msg }))
    } finally { setBusy(false) }
  }

  const grams = data?.filamentGrams ?? null
  const time = data?.printTimeSec ?? null
  const perTime = time != null ? time / Math.max(1, partsInFile) : null
  const perGrams = grams != null ? grams / Math.max(1, partsInFile) : null
  const diff = (a: number | null, b: number | null) => (a != null && b != null && b > 0 ? ((a - b) / b) * 100 : null)
  const dTime = modelEstimate && perTime != null ? diff(perTime, modelEstimate.single.printTimeSec) : null
  const dGrams = modelEstimate && perGrams != null ? diff(perGrams, modelEstimate.single.materialGrams) : null
  const fmtDiff = (d: number | null) => (d == null ? '–' : `${d >= 0 ? '+' : ''}${d.toFixed(0)} %`)

  return (
    <div className="space-y-3 text-sm">
      {!data ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files?.[0]) }}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-lg border-2 border-dashed p-4 text-center text-xs ${over ? 'border-sky-400 bg-sky-400/10' : 'border-zinc-700 hover:border-zinc-500'}`}
        >
          <input ref={inputRef} type="file" accept=".gcode,.3mf,.gco,.g,.bgcode" className="hidden" onChange={(e) => { handle(e.target.files?.[0]); e.target.value = '' }} />
          <div className="text-zinc-300">{busy ? '…' : t('slicer.drop')}</div>
          <div className="mt-1 text-[11px] text-zinc-500">{t('slicer.hint')}</div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-medium text-zinc-100" title={data.fileName}>{data.fileName}</div>
              <div className="text-[11px] text-zinc-500">
                {t('slicer.source')}: {data.source}{data.printerModel ? ` · ${data.printerModel}` : ''}{data.filamentType ? ` · ${data.filamentType}` : ''}
                {data.layerHeight ? ` · ${data.layerHeight} mm` : ''}{data.layerCount ? ` · ${t('results.statLayers', { n: data.layerCount })}` : ''}{data.plateCount && data.plateCount > 1 ? ` · ${data.plateCount} plaka` : ''}
              </div>
            </div>
            <Button variant="ghost" onClick={() => { onData(null); onUse(false) }}>{t('slicer.remove')}</Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-zinc-950/60 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-zinc-500">{t('slicer.time')}</div>
              <div className="font-semibold tabular-nums">{perTime != null ? formatDuration(perTime, t) : '–'}</div>
              {dTime != null && <div className={`text-[11px] ${Math.abs(dTime) > 25 ? 'text-amber-300' : 'text-zinc-500'}`}>{t('slicer.diffTime')}: {fmtDiff(dTime)}</div>}
            </div>
            <div className="rounded-lg bg-zinc-950/60 px-3 py-2">
              <div className="text-[11px] uppercase tracking-wide text-zinc-500">{t('slicer.grams')}</div>
              <div className="font-semibold tabular-nums">{perGrams != null ? `${perGrams.toFixed(1)} g` : '–'}</div>
              {dGrams != null && <div className={`text-[11px] ${Math.abs(dGrams) > 25 ? 'text-amber-300' : 'text-zinc-500'}`}>{t('slicer.diffGrams')}: {fmtDiff(dGrams)}</div>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              {t('slicer.partsInFile')}
              <NumberInput value={partsInFile} onChange={(v) => onPartsInFile(Math.max(1, Math.round(v)))} min={1} step={1} className="w-20" />
            </label>
            <span className="text-[11px] text-zinc-500">{t('slicer.partsHint')}</span>
          </div>
          {data.notes.includes('no-time') && <p className="text-xs text-amber-300">{t('slicer.noTime')}</p>}
          {data.notes.includes('no-filament') && <p className="text-xs text-amber-300">{t('slicer.noFilament')}</p>}
          {data.notes.includes('cura-weight-derived') && <p className="text-[11px] text-zinc-500">{t('slicer.curaWeight')}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Toggle checked={useIt} onChange={onUse} label={t('slicer.use')} />
            <Button disabled={calibAdded || perTime == null || perGrams == null || !modelEstimate} onClick={onAddCalibration}>{calibAdded ? `✓ ${t('slicer.added')}` : t('slicer.addCalib')}</Button>
          </div>
        </>
      )}
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  )
}
