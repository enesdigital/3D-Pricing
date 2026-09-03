import type { FdmPrintParams, PrinterProfile, ResinPrintParams } from '../lib/cost/types.ts'
import { FDM_PRESETS } from '../data/defaults.ts'
import { Field, NumberInput, Select, Toggle } from './ui.tsx'
import { useI18n } from '../lib/i18n/index.tsx'

export function FdmParamsPanel({ params, onChange, printer }: { params: FdmPrintParams; onChange: (p: FdmPrintParams) => void; printer: PrinterProfile }) {
  const { t } = useI18n()
  const MIN: Partial<Record<keyof FdmPrintParams, number>> = { layerHeight: 0.01, lineWidth: 0.1, wallLoops: 1, topBottomLayers: 0, infillDensity: 0, supportDensity: 0.01, overhangThresholdDeg: 1, colorCount: 1, colorChangesPerLayer: 0 }
  const set = <K extends keyof FdmPrintParams>(k: K, v: FdmPrintParams[K]) => {
    const min = MIN[k]
    const val = typeof v === 'number' && min !== undefined ? (Number.isFinite(v) ? Math.max(min, v) : min) : v
    onChange({ ...params, [k]: val })
  }
  const multi = printer.spec.tech === 'fdm' && printer.spec.supportsMultiColor
  // Seçili ön ayarı, mevcut parametrelerden türet: bir preset'in tüm alanları eşleşiyorsa o seçili görünür,
  // kullanıcı elle bir değer değiştirdiğinde otomatik olarak "Özel"e döner.
  const presetKey = Object.entries(FDM_PRESETS).find(([, v]) =>
    v.layerHeight === params.layerHeight &&
    v.infillDensity === params.infillDensity &&
    v.wallLoops === params.wallLoops &&
    v.topBottomLayers === params.topBottomLayers,
  )?.[0] ?? ''
  return (
    <div className="space-y-3">
      <Field label={t('params.qualityPreset')}>
        <Select
          value={presetKey}
          onChange={(k) => { if (k) { const { label: _l, ...rest } = FDM_PRESETS[k]; onChange({ ...params, ...rest }) } }}
          options={[{ value: '', label: t('params.custom') }, ...Object.entries(FDM_PRESETS).map(([k]) => ({ value: k, label: t('params.presets.' + k) }))]}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('params.layerHeight')}><NumberInput value={params.layerHeight} onChange={(v) => set('layerHeight', v)} min={0.05} max={0.35} step={0.02} suffix="mm" /></Field>
        <Field label={t('params.lineWidth')}><NumberInput value={params.lineWidth} onChange={(v) => set('lineWidth', v)} min={0.2} max={1} step={0.02} suffix="mm" /></Field>
        <Field label={t('params.wallLoops')}><NumberInput value={params.wallLoops} onChange={(v) => set('wallLoops', Math.round(v))} min={1} max={10} step={1} /></Field>
        <Field label={t('params.topBottom')}><NumberInput value={params.topBottomLayers} onChange={(v) => set('topBottomLayers', Math.round(v))} min={0} max={20} step={1} /></Field>
        <Field label={t('params.infill')}><NumberInput value={Math.round(params.infillDensity * 100)} onChange={(v) => set('infillDensity', v / 100)} min={0} max={100} step={5} suffix="%" /></Field>
        <Field label={t('params.support')}>
          <Select value={params.supports} onChange={(v) => set('supports', v)} options={[{ value: 'auto', label: t('params.supportAuto') }, { value: 'on', label: t('params.on') }, { value: 'off', label: t('params.off') }]} />
        </Field>
        <Field label={t('params.overhangThreshold')}><NumberInput value={params.overhangThresholdDeg} onChange={(v) => set('overhangThresholdDeg', v)} min={10} max={80} step={5} suffix="°" /></Field>
        <Field label={t('params.supportDensity')} hint={t('params.supportDensityHint')}><NumberInput value={Math.round(params.supportDensity * 100)} onChange={(v) => set('supportDensity', v / 100)} min={5} max={60} step={5} suffix="%" /></Field>
      </div>
      {multi && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
          <div className="mb-2 text-xs font-medium text-zinc-300">{t('params.multiColor')}</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('params.colorCount')}><NumberInput value={params.colorCount} onChange={(v) => set('colorCount', Math.max(1, Math.round(v)))} min={1} max={16} step={1} /></Field>
            <Field label={t('params.changesPerLayer')} hint={t('params.changesPerLayerHint')}><NumberInput value={params.colorChangesPerLayer} onChange={(v) => set('colorChangesPerLayer', v)} min={0} max={4} step={0.1} /></Field>
          </div>
          {params.colorCount > 1 && (
            <p className="mt-2 text-[11px] leading-snug text-zinc-500">
              {printer.spec.tech === 'fdm' && printer.spec.dualNozzle
                ? t('params.dualNozzleNote')
                : t('params.singleNozzleNote')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export function ResinParamsPanel({ params, onChange }: { params: ResinPrintParams; onChange: (p: ResinPrintParams) => void }) {
  const { t } = useI18n()
  const MIN: Partial<Record<keyof ResinPrintParams, number>> = { layerHeight: 0.01, exposureSec: 0.1, bottomExposureSec: 0.1, bottomLayers: 0, liftCycleSec: 0, supportRatio: 0, overhangThresholdDeg: 1, hollowWallMm: 0.5, hollowResidualRatio: 0 }
  const set = <K extends keyof ResinPrintParams>(k: K, v: ResinPrintParams[K]) => {
    const min = MIN[k]
    const val = typeof v === 'number' && min !== undefined ? (Number.isFinite(v) ? Math.max(min, v) : min) : v
    onChange({ ...params, [k]: val })
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('params.layerHeight')}><NumberInput value={params.layerHeight} onChange={(v) => set('layerHeight', v)} min={0.01} max={0.2} step={0.01} suffix="mm" /></Field>
        <Field label={t('params.exposure')}><NumberInput value={params.exposureSec} onChange={(v) => set('exposureSec', v)} min={0.5} max={30} step={0.1} suffix="sn" /></Field>
        <Field label={t('params.bottomExposure')}><NumberInput value={params.bottomExposureSec} onChange={(v) => set('bottomExposureSec', v)} min={1} max={120} step={1} suffix="sn" /></Field>
        <Field label={t('params.bottomLayers')}><NumberInput value={params.bottomLayers} onChange={(v) => set('bottomLayers', Math.round(v))} min={1} max={20} step={1} /></Field>
        <Field label={t('params.liftCycle')} hint={t('params.liftCycleHint')}><NumberInput value={params.liftCycleSec} onChange={(v) => set('liftCycleSec', v)} min={1} max={30} step={0.5} suffix="sn" /></Field>
        <Field label={t('params.support')}>
          <Select value={params.supports} onChange={(v) => set('supports', v)} options={[{ value: 'auto', label: t('params.supportAutoResin') }, { value: 'on', label: t('params.on') }, { value: 'off', label: t('params.off') }]} />
        </Field>
        <Field label={t('params.supportResinRatio')} hint={t('params.supportResinRatioHint')}><NumberInput value={Math.round(params.supportRatio * 100)} onChange={(v) => set('supportRatio', v / 100)} min={0} max={60} step={5} suffix="%" /></Field>
        <Field label={t('params.overhangThreshold')}><NumberInput value={params.overhangThresholdDeg} onChange={(v) => set('overhangThresholdDeg', v)} min={10} max={80} step={5} suffix="°" /></Field>
      </div>
      <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
        <Toggle checked={params.hollow} onChange={(v) => set('hollow', v)} label={t('params.hollow')} />
        {params.hollow && (
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Field label={t('params.hollowWall')}><NumberInput value={params.hollowWallMm} onChange={(v) => set('hollowWallMm', v)} min={1} max={6} step={0.5} suffix="mm" /></Field>
            <Field label={t('params.hollowResidual')}><NumberInput value={Math.round(params.hollowResidualRatio * 100)} onChange={(v) => set('hollowResidualRatio', v / 100)} min={0} max={50} step={5} suffix="%" /></Field>
          </div>
        )}
      </div>
    </div>
  )
}
