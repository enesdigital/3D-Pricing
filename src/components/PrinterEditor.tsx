import { useEffect, useState } from 'react'
import type { FdmPrinterSpec, PrinterProfile, ResinPrinterSpec, Tech } from '../lib/cost/types.ts'
import { Button, Field, NumberInput, Select, Toggle } from './ui.tsx'

interface Props {
  open: boolean
  /** Düzenlenen profil; yeni ekleme için null */
  initial: PrinterProfile | null
  /** Şablon olarak kopyalanabilecek profiller */
  templates: PrinterProfile[]
  onSave: (p: PrinterProfile) => void
  onDelete?: (id: string) => void
  onClose: () => void
}

const FDM_DEFAULT: FdmPrinterSpec = {
  tech: 'fdm', maxFlow: 20, efficiencyScale: 0.9, outerWallSpeed: 150, layerChangeSec: 1.5, jobOverheadSec: 300,
  jobWasteGrams: 1, colorChangeWasteGrams: 0.5, colorChangeTimeSec: 75, nozzleDiameter: 0.4, supportsMultiColor: false,
  dualNozzle: false, nozzleSwitchWasteGrams: 0.03, nozzleSwitchTimeSec: 8,
  avgPowerW: 120, heatupPowerW: 400,
}
const RESIN_DEFAULT: ResinPrinterSpec = {
  tech: 'resin', pixelSizeMm: 0.035, defaultLayerHeight: 0.05, exposureSec: 2.5, bottomExposureSec: 25, bottomLayers: 6,
  liftCycleSec: 7, vatCapacityMl: 500, avgPowerW: 80, postPowerW: 50, tiltRelease: false,
}

const blank = (tech: Tech): PrinterProfile => ({
  id: '', name: '', brand: '', tech,
  bed: tech === 'fdm' ? { x: 220, y: 220, z: 250 } : { x: 130, y: 80, z: 160 },
  priceTRY: 20000, lifetimeHours: tech === 'fdm' ? 5000 : 3000, maintenanceTRYPerHour: tech === 'fdm' ? 2.5 : 6,
  spec: tech === 'fdm' ? { ...FDM_DEFAULT } : { ...RESIN_DEFAULT },
})

type NumKey<T> = { [K in keyof T]: T[K] extends number ? K : never }[keyof T]
interface NumField<T> { key: NumKey<T>; label: string; hint?: string; suffix?: string; step?: number }

const FDM_FIELDS: NumField<FdmPrinterSpec>[] = [
  { key: 'maxFlow', label: 'Maks. hacimsel akış', hint: 'Üretici spec, 0.4 nozul', suffix: 'mm³/s', step: 1 },
  { key: 'efficiencyScale', label: 'Verimlilik ölçeği', hint: 'Bedslinger ≈ 0.7, CoreXY ≈ 1.0, hızlı CoreXY ≈ 1.15', step: 0.05 },
  { key: 'outerWallSpeed', label: 'Dış duvar hızı', suffix: 'mm/s', step: 10 },
  { key: 'layerChangeSec', label: 'Katman geçişi', suffix: 'sn', step: 0.1 },
  { key: 'jobOverheadSec', label: 'İş başlangıcı (ısınma+kalibrasyon)', suffix: 'sn', step: 30 },
  { key: 'jobWasteGrams', label: 'İş başına israf', hint: 'Purge hattı, skirt', suffix: 'g', step: 0.1 },
  { key: 'colorChangeWasteGrams', label: 'Renk değişimi israfı', suffix: 'g', step: 0.1 },
  { key: 'colorChangeTimeSec', label: 'Renk değişimi süresi', hint: 'AMS/MMU yükle-boşalt', suffix: 'sn', step: 5 },
  { key: 'nozzleSwitchWasteGrams', label: 'Nozul değişimi israfı', hint: 'Çift nozul: prime tower payı', suffix: 'g', step: 0.01 },
  { key: 'nozzleSwitchTimeSec', label: 'Nozul değişimi süresi', hint: 'Çift nozul', suffix: 'sn', step: 1 },
  { key: 'nozzleDiameter', label: 'Nozul çapı', suffix: 'mm', step: 0.1 },
  { key: 'avgPowerW', label: 'Ortalama baskı gücü', suffix: 'W', step: 5 },
  { key: 'heatupPowerW', label: 'Isınma gücü', suffix: 'W', step: 50 },
]
const RESIN_FIELDS: NumField<ResinPrinterSpec>[] = [
  { key: 'pixelSizeMm', label: 'XY piksel boyutu', suffix: 'mm', step: 0.001 },
  { key: 'defaultLayerHeight', label: 'Varsayılan katman', suffix: 'mm', step: 0.01 },
  { key: 'exposureSec', label: 'Pozlama', suffix: 'sn', step: 0.1 },
  { key: 'bottomExposureSec', label: 'Taban pozlama', suffix: 'sn', step: 1 },
  { key: 'bottomLayers', label: 'Taban katman', step: 1 },
  { key: 'liftCycleSec', label: 'Kaldırma döngüsü', hint: 'Kaldır + in + bekle', suffix: 'sn', step: 0.5 },
  { key: 'vatCapacityMl', label: 'Vat kapasitesi', suffix: 'ml', step: 50 },
  { key: 'avgPowerW', label: 'Ortalama baskı gücü', suffix: 'W', step: 5 },
  { key: 'postPowerW', label: 'Yıkama/kürleme gücü', suffix: 'W', step: 5 },
]

export function PrinterEditor({ open, initial, templates, onSave, onDelete, onClose }: Props) {
  // Bileşen, App tarafında `key` ile her açılışta yeniden oluşturulur; bu yüzden state doğrudan initial'dan başlar.
  const [p, setP] = useState<PrinterProfile>(() => initial ?? blank('fdm'))
  const [templateId, setTemplateId] = useState('')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null

  const setBed = (k: 'x' | 'y' | 'z', v: number) => setP({ ...p, bed: { ...p.bed, [k]: v } })
  const setSpec = (k: string, v: number | boolean) => setP({ ...p, spec: { ...p.spec, [k]: v } as PrinterProfile['spec'] })
  const applyTemplate = (id: string) => {
    setTemplateId(id)
    const t = templates.find((x) => x.id === id)
    if (!t) return
    setP({ ...structuredClone(t), id: p.id, name: p.name || `${t.name} (kopya)`, brand: p.brand || t.brand })
  }
  const changeTech = (tech: Tech) => {
    if (tech === p.tech) return
    const b = blank(tech)
    setP({ ...p, tech, bed: b.bed, lifetimeHours: b.lifetimeHours, maintenanceTRYPerHour: b.maintenanceTRYPerHour, spec: b.spec })
  }
  const save = () => {
    if (!p.name.trim()) { setError('Yazıcı adı gerekli.'); return }
    if (p.bed.x <= 0 || p.bed.y <= 0 || p.bed.z <= 0) { setError('Tabla ölçüleri pozitif olmalı.'); return }
    if (p.priceTRY < 0 || p.lifetimeHours <= 0) { setError('Fiyat ve ömür geçerli olmalı.'); return }
    onSave({ ...p, id: p.id || `custom-${Date.now().toString(36)}`, name: p.name.trim(), brand: p.brand.trim() })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="my-6 w-full max-w-3xl rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
          <div>
            <h2 className="text-base font-semibold">{initial ? 'Yazıcıyı düzenle' : 'Yazıcı ekle'}</h2>
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
            <Field label="Şablondan başla (isteğe bağlı)" hint="Benzer bir yazıcının değerlerini kopyalar; sonra düzenleyebilirsiniz.">
              <Select value={templateId} onChange={applyTemplate} options={[{ value: '', label: 'Boş' }, ...templates.map((t) => ({ value: t.id, label: `${t.brand} ${t.name} (${t.tech === 'fdm' ? 'FDM' : 'Reçine'})` }))]} />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <Field label="Marka"><input value={p.brand} onChange={(e) => setP({ ...p, brand: e.target.value })} placeholder="Creality" className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm outline-none focus:border-sky-500" /></Field>
            <Field label="Model adı *"><input value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="Ender 3 V3" className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm outline-none focus:border-sky-500" /></Field>
            <Field label="Teknoloji">
              <Select value={p.tech} onChange={changeTech} options={[{ value: 'fdm', label: 'FDM (filament)' }, { value: 'resin', label: 'Reçine (MSLA/SLA)' }]} />
            </Field>
            <Field label="Tabla X"><NumberInput value={p.bed.x} onChange={(v) => setBed('x', v)} min={1} step={1} suffix="mm" /></Field>
            <Field label="Tabla Y"><NumberInput value={p.bed.y} onChange={(v) => setBed('y', v)} min={1} step={1} suffix="mm" /></Field>
            <Field label="Yükseklik Z"><NumberInput value={p.bed.z} onChange={(v) => setBed('z', v)} min={1} step={1} suffix="mm" /></Field>
            <Field label="Satın alma fiyatı"><NumberInput value={p.priceTRY} onChange={(v) => setP({ ...p, priceTRY: v })} min={0} step={500} suffix="₺" /></Field>
            <Field label="Kullanım ömrü" hint="Amortisman için"><NumberInput value={p.lifetimeHours} onChange={(v) => setP({ ...p, lifetimeHours: v })} min={100} step={100} suffix="sa" /></Field>
            <Field label="Bakım & sarf"><NumberInput value={p.maintenanceTRYPerHour} onChange={(v) => setP({ ...p, maintenanceTRYPerHour: v })} min={0} step={0.5} suffix="₺/sa" /></Field>
          </div>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-zinc-200">{p.tech === 'fdm' ? 'FDM parametreleri' : 'Reçine parametreleri'}</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {p.tech === 'fdm'
                ? FDM_FIELDS.map((f) => (
                    <Field key={f.key} label={f.label} hint={f.hint}>
                      <NumberInput value={(p.spec as FdmPrinterSpec)[f.key]} onChange={(v) => setSpec(f.key, v)} step={f.step} suffix={f.suffix} />
                    </Field>
                  ))
                : RESIN_FIELDS.map((f) => (
                    <Field key={f.key} label={f.label} hint={f.hint}>
                      <NumberInput value={(p.spec as ResinPrinterSpec)[f.key]} onChange={(v) => setSpec(f.key, v)} step={f.step} suffix={f.suffix} />
                    </Field>
                  ))}
            </div>
            <div className="mt-3">
              {p.tech === 'fdm'
                ? <div className="space-y-2">
                    <Toggle checked={(p.spec as FdmPrinterSpec).supportsMultiColor} onChange={(v) => setSpec('supportsMultiColor', v)} label="Çok renkli sistem var (AMS / MMU / CFS)" />
                    <Toggle checked={(p.spec as FdmPrinterSpec).dualNozzle} onChange={(v) => setSpec('dualNozzle', v)} label="Çift nozul / IDEX (2 renk flush'sız basılır)" />
                  </div>
                : <Toggle checked={(p.spec as ResinPrinterSpec).tiltRelease} onChange={(v) => setSpec('tiltRelease', v)} label="Tilt-release (eğimli ayırma) var — dolu tablada kaldırma cezası uygulanmaz" />}
            </div>
          </section>
          <Field label="Not (isteğe bağlı)">
            <input value={p.notes ?? ''} onChange={(e) => setP({ ...p, notes: e.target.value })} className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm outline-none focus:border-sky-500" />
          </Field>
        </div>
      </div>
    </div>
  )
}
