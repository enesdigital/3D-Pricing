import { effectiveScale, type MeshStats, type Placement } from '../lib/mesh/types.ts'
import type { LoadedModel } from '../lib/mesh/useMeshWorker.ts'
import { Button, NumberInput, Toggle } from './ui.tsx'
import { useI18n } from '../lib/i18n/index.tsx'

interface Props {
  model: LoadedModel
  stats: MeshStats | null
  placement: Placement
  onPlacement: (p: Placement) => void
  manifoldCheck: boolean
  onManifoldCheck: (v: boolean) => void
  onClear: () => void
}

const fmt = (n: number, d = 1) => n.toLocaleString('tr-TR', { maximumFractionDigits: d })

export function ModelPanel({ model, stats, placement, onPlacement, manifoldCheck, onManifoldCheck, onClear }: Props) {
  const { t } = useI18n()
  const rot = (axis: 'rotX' | 'rotY' | 'rotZ', d: number) => onPlacement({ ...placement, [axis]: ((placement[axis] + d) % 360 + 360) % 360 })
  const inch = placement.unit === 25.4
  const scale = effectiveScale(placement)
  // Ölçeksiz (yalnızca döndürülmüş) boyut: hedef boyut girişleri için
  const base = stats ? { x: stats.size.x / scale, y: stats.size.y / scale, z: stats.size.z / scale } : null
  const setPct = (pct: number) => onPlacement({ ...placement, scalePct: Math.max(0.1, Math.min(10000, pct)) })
  const setTarget = (axis: 'x' | 'y' | 'z', mm: number) => {
    if (!base || base[axis] <= 0 || mm <= 0) return
    setPct((mm / (base[axis] * placement.unit)) * 100)
  }
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium text-zinc-100" title={model.fileName}>{model.fileName}</div>
          <div className="text-xs text-zinc-500">{(model.fileSize / 1048576).toFixed(2)} MB · {t('model.triangles', { n: model.triangleCount.toLocaleString('tr-TR') })}{model.format ? ` · ${model.format}` : ''}</div>
        </div>
        <Button variant="ghost" onClick={onClear} className="shrink-0">{t('model.remove')}</Button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-zinc-950/60 p-3 text-xs">
          <span className="text-zinc-500">{t('model.size')}</span>
          <span className="text-right tabular-nums text-zinc-200">{fmt(stats.size.x)} × {fmt(stats.size.y)} × {fmt(stats.size.z)} mm</span>
          <span className="text-zinc-500">{t('model.volume')}</span>
          <span className="text-right tabular-nums text-zinc-200">{fmt(stats.volume / 1000, 2)} cm³</span>
          <span className="text-zinc-500">{t('model.surfaceArea')}</span>
          <span className="text-right tabular-nums text-zinc-200">{fmt(stats.surfaceArea / 100, 1)} cm²</span>
          <span className="text-zinc-500">{t('model.bedContact')}</span>
          <span className="text-right tabular-nums text-zinc-200">{fmt(stats.bedContactArea / 100, 1)} cm²</span>
          <span className="text-zinc-500">{t('model.overhangArea', { deg: stats.overhangThresholdDeg })}</span>
          <span className={`text-right tabular-nums ${stats.overhangArea > 4 ? 'text-orange-300' : 'text-zinc-200'}`}>{fmt(stats.overhangArea / 100, 1)} cm²</span>
          <span className="text-zinc-500">{t('model.mesh')}</span>
          <span className={`text-right ${stats.manifold.checked ? (stats.manifold.isClosed ? 'text-emerald-300' : 'text-amber-300') : 'text-zinc-500'}`}>
            {stats.manifold.checked ? (stats.manifold.isClosed ? t('model.closed') : t('model.openEdges', { n: stats.manifold.openEdges })) : t('model.notChecked')}{stats.manifold.checked && stats.manifold.components > 1 ? ` · ${stats.manifold.components} ${t('model.shells')}` : ''}
          </span>
        </div>
      )}

      <div>
        <div className="mb-1 text-xs font-medium text-zinc-400">{t('model.placement')}</div>
        <div className="grid grid-cols-3 gap-1">
          {(['rotX', 'rotY', 'rotZ'] as const).map((a) => (
            <div key={a} className="flex items-center rounded-md border border-zinc-700 bg-zinc-950">
              <button type="button" aria-label={t('model.rotBack', { axis: a.slice(-1).toUpperCase() })} title={t('model.rotBackTitle', { axis: a.slice(-1).toUpperCase() })} className="px-2 py-1 text-zinc-300 hover:bg-zinc-800" onClick={() => rot(a, -90)}><span aria-hidden="true">−</span></button>
              <span className="flex-1 text-center text-xs text-zinc-400">{a.slice(-1)} {placement[a]}°</span>
              <button type="button" aria-label={t('model.rotFwd', { axis: a.slice(-1).toUpperCase() })} title={t('model.rotFwdTitle', { axis: a.slice(-1).toUpperCase() })} className="px-2 py-1 text-zinc-300 hover:bg-zinc-800" onClick={() => rot(a, 90)}><span aria-hidden="true">+</span></button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-400">{t('model.scale')}</span>
          {placement.scalePct !== 100 && <button className="text-[11px] text-sky-300 hover:underline" onClick={() => setPct(100)}>{t('model.resetScale')}</button>}
        </div>
        <div className="grid grid-cols-4 gap-1">
          <NumberInput value={Math.round(placement.scalePct * 100) / 100} onChange={setPct} min={0.1} max={10000} step={1} suffix="%" />
          {(['x', 'y', 'z'] as const).map((a) => (
            <NumberInput key={a} value={stats ? Math.round(stats.size[a] * 100) / 100 : 0} onChange={(v) => setTarget(a, v)} min={0.01} step={1} suffix={a.toUpperCase()} />
          ))}
        </div>
        <p className="mt-1 text-[11px] text-zinc-500">{t('model.scaleHint')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Toggle checked={inch} onChange={(v) => onPlacement({ ...placement, unit: v ? 25.4 : 1 })} label={t('model.inchUnit')} />
        <Toggle checked={manifoldCheck} onChange={onManifoldCheck} label={t('model.manifoldCheck')} />
      </div>
      <p className="text-[11px] leading-snug text-zinc-500">{t('model.colorsPrefix')}<span className="text-sky-300">{t('model.colorBlue')}</span>{t('model.colorBlueDesc')}<span className="text-orange-300">{t('model.colorOrange')}</span>{t('model.colorOrangeDesc')}<span className="text-emerald-300">{t('model.colorGreen')}</span>{t('model.colorGreenDesc')}</p>
    </div>
  )
}
