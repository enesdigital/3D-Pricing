import { useEffect, useState } from 'react'
import type { Material, Tech } from '../lib/cost/types.ts'
import { Button, Field, NumberInput, Select } from './ui.tsx'
import { useI18n } from '../lib/i18n/index.tsx'

interface Props {
  open: boolean
  initial: Material | null
  templates: Material[]
  /** Yeni malzeme için başlangıç teknolojisi (seçili yazıcıya göre) */
  defaultTech: Tech
  onSave: (m: Material) => void
  onDelete?: (id: string) => void
  onClose: () => void
}

const blank = (tech: Tech): Material =>
  tech === 'fdm'
    ? { id: '', name: '', tech, density: 1.24, pricePerKgTRY: 600, maxFlow: 15, minLayerTime: 6, powerFactor: 1 }
    : { id: '', name: '', tech, density: 1.1, pricePerKgTRY: 1000, maxFlow: 0, minLayerTime: 0, powerFactor: 1 }

export function MaterialEditor({ open, initial, templates, defaultTech, onSave, onDelete, onClose }: Props) {
  const { t } = useI18n()
  // App tarafında `key` ile her açılışta yeniden oluşturulur
  const [m, setM] = useState<Material>(() => initial ?? blank(defaultTech))
  const [templateId, setTemplateId] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null

  const applyTemplate = (id: string) => {
    setTemplateId(id)
    const tpl = templates.find((x) => x.id === id)
    if (!tpl) return
    setM({ ...tpl, id: m.id, name: m.name || t('materialEditor.copySuffix', { name: tpl.name }) })
  }
  const changeTech = (tech: Tech) => { if (tech !== m.tech) setM({ ...blank(tech), id: m.id, name: m.name, notes: m.notes }) }
  const save = () => {
    if (!m.name.trim()) { setError(t('materialEditor.errNameRequired')); return }
    if (m.density <= 0 || m.pricePerKgTRY < 0) { setError(t('materialEditor.errDensityPrice')); return }
    if (m.tech === 'fdm' && m.maxFlow <= 0) { setError(t('materialEditor.errMaxFlow')); return }
    onSave({ ...m, id: m.id || `custom-${Date.now().toString(36)}`, name: m.name.trim() })
  }
  const input = (value: string, set: (v: string) => void, placeholder?: string) => (
    <input value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder} className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm outline-none focus:border-sky-500" />
  )

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="my-6 w-full max-w-2xl rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl" role="dialog" aria-modal="true" aria-label={t('materialEditor.addTitle')} onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
          <div>
            <h2 className="text-base font-semibold">{initial ? t('materialEditor.editTitle') : t('materialEditor.addTitle')}</h2>
            <p className="text-[11px] text-zinc-500">{t('materialEditor.subtitle')}</p>
          </div>
          <div className="flex gap-2">
            {initial && onDelete && <Button variant="danger" onClick={() => { if (confirm(t('materialEditor.confirmDelete', { name: initial.name }))) onDelete(initial.id) }}>{t('materialEditor.delete')}</Button>}
            <Button variant="ghost" onClick={onClose}>{t('materialEditor.cancel')}</Button>
            <Button variant="primary" onClick={save}>{t('materialEditor.save')}</Button>
          </div>
        </header>
        <div className="space-y-5 p-5">
          {error && <div className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</div>}
          {!initial && (
            <Field label={t('materialEditor.fromTemplate')} hint={t('materialEditor.fromTemplateHint')}>
              <Select value={templateId} onChange={applyTemplate} options={[{ value: '', label: t('materialEditor.blank') }, ...templates.map((x) => ({ value: x.id, label: `${x.name} (${x.tech === 'fdm' ? t('tech.fdm') : t('tech.resin')})` }))]} />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <div className="col-span-2"><Field label={t('materialEditor.name')}>{input(m.name, (v) => setM({ ...m, name: v }), t('materialEditor.namePlaceholder'))}</Field></div>
            <Field label={t('materialEditor.tech')}><Select value={m.tech} onChange={changeTech} options={[{ value: 'fdm', label: t('materialEditor.techFdm') }, { value: 'resin', label: t('materialEditor.techResin') }]} /></Field>
            <Field label={t('materialEditor.density')} hint={t('materialEditor.densityHint')}><NumberInput value={m.density} onChange={(v) => setM({ ...m, density: v })} min={0.5} max={3} step={0.01} suffix="g/cm³" /></Field>
            <Field label={t('materialEditor.price')} hint={t('materialEditor.priceHint')}><NumberInput value={m.pricePerKgTRY} onChange={(v) => setM({ ...m, pricePerKgTRY: v })} min={0} step={10} suffix="₺/kg" /></Field>
            <Field label={t('materialEditor.powerFactor')} hint={t('materialEditor.powerFactorHint')}><NumberInput value={m.powerFactor} onChange={(v) => setM({ ...m, powerFactor: v })} min={0.5} max={3} step={0.05} suffix="×" /></Field>
            {m.tech === 'fdm' && (
              <>
                <Field label={t('materialEditor.maxFlow')} hint={t('materialEditor.maxFlowHint')}><NumberInput value={m.maxFlow} onChange={(v) => setM({ ...m, maxFlow: v })} min={0.5} max={60} step={0.5} suffix="mm³/s" /></Field>
                <Field label={t('materialEditor.minLayerTime')} hint={t('materialEditor.minLayerTimeHint')}><NumberInput value={m.minLayerTime} onChange={(v) => setM({ ...m, minLayerTime: v })} min={0} max={60} step={1} suffix="sn" /></Field>
              </>
            )}
          </div>
          <Field label={t('materialEditor.note')}>{input(m.notes ?? '', (v) => setM({ ...m, notes: v }))}</Field>
        </div>
      </div>
    </div>
  )
}
