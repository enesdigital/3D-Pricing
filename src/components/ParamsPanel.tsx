import type { FdmPrintParams, PrinterProfile, ResinPrintParams } from '../lib/cost/types.ts'
import { FDM_PRESETS } from '../data/defaults.ts'
import { Field, NumberInput, Select, Toggle } from './ui.tsx'

export function FdmParamsPanel({ params, onChange, printer }: { params: FdmPrintParams; onChange: (p: FdmPrintParams) => void; printer: PrinterProfile }) {
  const set = <K extends keyof FdmPrintParams>(k: K, v: FdmPrintParams[K]) => onChange({ ...params, [k]: v })
  const multi = printer.spec.tech === 'fdm' && printer.spec.supportsMultiColor
  return (
    <div className="space-y-3">
      <Field label="Kalite ön ayarı">
        <Select
          value=""
          onChange={(k) => { if (k) { const { label: _l, ...rest } = FDM_PRESETS[k]; onChange({ ...params, ...rest }) } }}
          options={[{ value: '', label: 'Seçin…' }, ...Object.entries(FDM_PRESETS).map(([k, v]) => ({ value: k, label: v.label }))]}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Katman kalınlığı"><NumberInput value={params.layerHeight} onChange={(v) => set('layerHeight', v)} min={0.05} max={0.35} step={0.02} suffix="mm" /></Field>
        <Field label="Hat genişliği"><NumberInput value={params.lineWidth} onChange={(v) => set('lineWidth', v)} min={0.2} max={1} step={0.02} suffix="mm" /></Field>
        <Field label="Duvar sayısı"><NumberInput value={params.wallLoops} onChange={(v) => set('wallLoops', Math.round(v))} min={1} max={10} step={1} /></Field>
        <Field label="Üst/alt katman"><NumberInput value={params.topBottomLayers} onChange={(v) => set('topBottomLayers', Math.round(v))} min={0} max={20} step={1} /></Field>
        <Field label="Dolgu yoğunluğu"><NumberInput value={Math.round(params.infillDensity * 100)} onChange={(v) => set('infillDensity', v / 100)} min={0} max={100} step={5} suffix="%" /></Field>
        <Field label="Destek">
          <Select value={params.supports} onChange={(v) => set('supports', v)} options={[{ value: 'auto', label: 'Otomatik (sarkma varsa)' }, { value: 'on', label: 'Açık' }, { value: 'off', label: 'Kapalı' }]} />
        </Field>
        <Field label="Sarkma eşiği"><NumberInput value={params.overhangThresholdDeg} onChange={(v) => set('overhangThresholdDeg', v)} min={10} max={80} step={5} suffix="°" /></Field>
        <Field label="Destek yoğunluğu" hint="Ağaç ≈ %15, ızgara ≈ %20"><NumberInput value={Math.round(params.supportDensity * 100)} onChange={(v) => set('supportDensity', v / 100)} min={5} max={60} step={5} suffix="%" /></Field>
      </div>
      {multi && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
          <div className="mb-2 text-xs font-medium text-zinc-300">Çok renkli baskı (AMS)</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Renk sayısı"><NumberInput value={params.colorCount} onChange={(v) => set('colorCount', Math.max(1, Math.round(v)))} min={1} max={16} step={1} /></Field>
            <Field label="Katman başına değişim" hint="Her katmanda tüm renkler varsa 1"><NumberInput value={params.colorChangesPerLayer} onChange={(v) => set('colorChangesPerLayer', v)} min={0} max={4} step={0.1} /></Field>
          </div>
          {params.colorCount > 1 && (
            <p className="mt-2 text-[11px] leading-snug text-zinc-500">
              {printer.id === 'bambu-x2d-combo'
                ? 'X2D çift nozul: 2 renkte flush yok, yalnızca prime tower; 3+ renkte AMS purge israfı artar.'
                : 'Tek nozul + AMS: her renk değişiminde flush israfı ve ~1 dk süre eklenir; küçük çok renkli parçalarda israf malzemenin yarısını aşabilir.'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export function ResinParamsPanel({ params, onChange }: { params: ResinPrintParams; onChange: (p: ResinPrintParams) => void }) {
  const set = <K extends keyof ResinPrintParams>(k: K, v: ResinPrintParams[K]) => onChange({ ...params, [k]: v })
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Katman kalınlığı"><NumberInput value={params.layerHeight} onChange={(v) => set('layerHeight', v)} min={0.01} max={0.2} step={0.01} suffix="mm" /></Field>
        <Field label="Pozlama"><NumberInput value={params.exposureSec} onChange={(v) => set('exposureSec', v)} min={0.5} max={30} step={0.1} suffix="sn" /></Field>
        <Field label="Taban pozlama"><NumberInput value={params.bottomExposureSec} onChange={(v) => set('bottomExposureSec', v)} min={1} max={120} step={1} suffix="sn" /></Field>
        <Field label="Taban katman"><NumberInput value={params.bottomLayers} onChange={(v) => set('bottomLayers', Math.round(v))} min={1} max={20} step={1} /></Field>
        <Field label="Kaldırma döngüsü" hint="Kaldır + in + bekle (pozlama hariç)"><NumberInput value={params.liftCycleSec} onChange={(v) => set('liftCycleSec', v)} min={1} max={30} step={0.5} suffix="sn" /></Field>
        <Field label="Destek">
          <Select value={params.supports} onChange={(v) => set('supports', v)} options={[{ value: 'auto', label: 'Otomatik' }, { value: 'on', label: 'Açık' }, { value: 'off', label: 'Kapalı' }]} />
        </Field>
        <Field label="Destek reçine oranı" hint="Tipik %10–30"><NumberInput value={Math.round(params.supportRatio * 100)} onChange={(v) => set('supportRatio', v / 100)} min={0} max={60} step={5} suffix="%" /></Field>
        <Field label="Sarkma eşiği"><NumberInput value={params.overhangThresholdDeg} onChange={(v) => set('overhangThresholdDeg', v)} min={10} max={80} step={5} suffix="°" /></Field>
      </div>
      <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
        <Toggle checked={params.hollow} onChange={(v) => set('hollow', v)} label="Modeli boşalt (hollow)" />
        {params.hollow && (
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Field label="Duvar kalınlığı"><NumberInput value={params.hollowWallMm} onChange={(v) => set('hollowWallMm', v)} min={1} max={6} step={0.5} suffix="mm" /></Field>
            <Field label="İçeride kalan reçine"><NumberInput value={Math.round(params.hollowResidualRatio * 100)} onChange={(v) => set('hollowResidualRatio', v / 100)} min={0} max={50} step={5} suffix="%" /></Field>
          </div>
        )}
      </div>
    </div>
  )
}
