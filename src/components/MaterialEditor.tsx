import { useEffect, useState } from 'react'
import type { Material, Tech } from '../lib/cost/types.ts'
import { Button, Field, NumberInput, Select } from './ui.tsx'

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
    const t = templates.find((x) => x.id === id)
    if (!t) return
    setM({ ...t, id: m.id, name: m.name || `${t.name} (kopya)` })
  }
  const changeTech = (tech: Tech) => { if (tech !== m.tech) setM({ ...blank(tech), id: m.id, name: m.name, notes: m.notes }) }
  const save = () => {
    if (!m.name.trim()) { setError('Malzeme adı gerekli.'); return }
    if (m.density <= 0 || m.pricePerKgTRY < 0) { setError('Yoğunluk pozitif, fiyat negatif olmayan bir değer olmalı.'); return }
    if (m.tech === 'fdm' && m.maxFlow <= 0) { setError('FDM malzeme için maksimum akış pozitif olmalı.'); return }
    onSave({ ...m, id: m.id || `custom-${Date.now().toString(36)}`, name: m.name.trim() })
  }
  const input = (value: string, set: (v: string) => void, placeholder?: string) => (
    <input value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder} className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm outline-none focus:border-sky-500" />
  )

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="my-6 w-full max-w-2xl rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
          <div>
            <h2 className="text-base font-semibold">{initial ? 'Malzemeyi düzenle' : 'Malzeme ekle'}</h2>
            <p className="text-[11px] text-zinc-500">Yalnızca bu tarayıcıda saklanır; başka kimse görmez.</p>
          </div>
          <div className="flex gap-2">
            {initial && onDelete && <Button variant="danger" onClick={() => { if (confirm(`"${initial.name}" silinsin mi?`)) onDelete(initial.id) }}>Sil</Button>}
            <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
            <Button variant="primary" onClick={save}>Kaydet</Button>
          </div>
        </header>
        <div className="space-y-5 p-5">
          {error && <div className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</div>}
          {!initial && (
            <Field label="Şablondan başla (isteğe bağlı)" hint="Benzer bir malzemenin değerlerini kopyalar.">
              <Select value={templateId} onChange={applyTemplate} options={[{ value: '', label: 'Boş' }, ...templates.map((t) => ({ value: t.id, label: `${t.name} (${t.tech === 'fdm' ? 'FDM' : 'Reçine'})` }))]} />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <div className="col-span-2"><Field label="Malzeme adı *">{input(m.name, (v) => setM({ ...m, name: v }), 'Örn. Porima PLA Mat Siyah')}</Field></div>
            <Field label="Teknoloji"><Select value={m.tech} onChange={changeTech} options={[{ value: 'fdm', label: 'FDM (filament)' }, { value: 'resin', label: 'Reçine' }]} /></Field>
            <Field label="Yoğunluk" hint="PLA 1.24 · PETG 1.27 · ABS 1.04 · TPU 1.21 · reçine ~1.10"><NumberInput value={m.density} onChange={(v) => setM({ ...m, density: v })} min={0.5} max={3} step={0.01} suffix="g/cm³" /></Field>
            <Field label="Fiyat" hint="1 kg, KDV dahil"><NumberInput value={m.pricePerKgTRY} onChange={(v) => setM({ ...m, pricePerKgTRY: v })} min={0} step={10} suffix="₺/kg" /></Field>
            <Field label="Güç çarpanı" hint="PLA 1.0 · PETG 1.15 · ABS/ASA 1.9 · PC/PA 2.0"><NumberInput value={m.powerFactor} onChange={(v) => setM({ ...m, powerFactor: v })} min={0.5} max={3} step={0.05} suffix="×" /></Field>
            {m.tech === 'fdm' && (
              <>
                <Field label="Maks. hacimsel akış" hint="Dilimleyici filament profili (0.4 nozul); PLA 15–21, PETG 8–12, TPU 3.6"><NumberInput value={m.maxFlow} onChange={(v) => setM({ ...m, maxFlow: v })} min={0.5} max={60} step={0.5} suffix="mm³/s" /></Field>
                <Field label="Min. katman süresi" hint="Soğutma için; PLA 4–6 s, PETG/ABS 12 s"><NumberInput value={m.minLayerTime} onChange={(v) => setM({ ...m, minLayerTime: v })} min={0} max={60} step={1} suffix="sn" /></Field>
              </>
            )}
          </div>
          <Field label="Not (isteğe bağlı)">{input(m.notes ?? '', (v) => setM({ ...m, notes: v }))}</Field>
        </div>
      </div>
    </div>
  )
}
