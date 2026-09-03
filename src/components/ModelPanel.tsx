import type { MeshStats, Placement } from '../lib/mesh/types.ts'
import type { LoadedModel } from '../lib/mesh/useMeshWorker.ts'
import { Button, Toggle } from './ui.tsx'

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
  const rot = (axis: 'rotX' | 'rotY' | 'rotZ', d: number) => onPlacement({ ...placement, [axis]: ((placement[axis] + d) % 360 + 360) % 360 })
  const inch = Math.abs(placement.scale - 25.4) < 1e-6
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium text-zinc-100" title={model.fileName}>{model.fileName}</div>
          <div className="text-xs text-zinc-500">{(model.fileSize / 1048576).toFixed(2)} MB · {model.triangleCount.toLocaleString('tr-TR')} üçgen{model.format ? ` · ${model.format}` : ''}</div>
        </div>
        <Button variant="ghost" onClick={onClear} className="shrink-0">Kaldır</Button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-zinc-950/60 p-3 text-xs">
          <span className="text-zinc-500">Boyut (X×Y×Z)</span>
          <span className="text-right tabular-nums text-zinc-200">{fmt(stats.size.x)} × {fmt(stats.size.y)} × {fmt(stats.size.z)} mm</span>
          <span className="text-zinc-500">Hacim</span>
          <span className="text-right tabular-nums text-zinc-200">{fmt(stats.volume / 1000, 2)} cm³</span>
          <span className="text-zinc-500">Yüzey alanı</span>
          <span className="text-right tabular-nums text-zinc-200">{fmt(stats.surfaceArea / 100, 1)} cm²</span>
          <span className="text-zinc-500">Tabla teması</span>
          <span className="text-right tabular-nums text-zinc-200">{fmt(stats.bedContactArea / 100, 1)} cm²</span>
          <span className="text-zinc-500">Sarkma alanı (&gt;{stats.overhangThresholdDeg}°)</span>
          <span className={`text-right tabular-nums ${stats.overhangArea > 4 ? 'text-orange-300' : 'text-zinc-200'}`}>{fmt(stats.overhangArea / 100, 1)} cm²</span>
          <span className="text-zinc-500">Mesh</span>
          <span className={`text-right ${stats.manifold.checked ? (stats.manifold.isClosed ? 'text-emerald-300' : 'text-amber-300') : 'text-zinc-500'}`}>
            {stats.manifold.checked ? (stats.manifold.isClosed ? 'kapalı (manifold)' : `${stats.manifold.openEdges} açık kenar`) : 'kontrol edilmedi'}
          </span>
        </div>
      )}

      <div>
        <div className="mb-1 text-xs font-medium text-zinc-400">Yerleşim (90° döndür)</div>
        <div className="grid grid-cols-3 gap-1">
          {(['rotX', 'rotY', 'rotZ'] as const).map((a) => (
            <div key={a} className="flex items-center rounded-md border border-zinc-700 bg-zinc-950">
              <button className="px-2 py-1 text-zinc-300 hover:bg-zinc-800" onClick={() => rot(a, -90)}>−</button>
              <span className="flex-1 text-center text-xs text-zinc-400">{a.slice(-1)} {placement[a]}°</span>
              <button className="px-2 py-1 text-zinc-300 hover:bg-zinc-800" onClick={() => rot(a, 90)}>+</button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Toggle checked={inch} onChange={(v) => onPlacement({ ...placement, scale: v ? 25.4 : 1 })} label="Dosya inç birimli" />
        <Toggle checked={manifoldCheck} onChange={onManifoldCheck} label="Manifold kontrolü" />
      </div>
      <p className="text-[11px] leading-snug text-zinc-500">Renkler: <span className="text-sky-300">mavi</span> normal yüzey, <span className="text-orange-300">turuncu</span> destek gerektiren sarkma, <span className="text-emerald-300">yeşil</span> tabla teması.</p>
    </div>
  )
}
