import { useEffect } from 'react'
import type { BusinessSettings, Material, PrinterProfile } from '../lib/cost/types.ts'
import { Button, Field, NumberInput } from './ui.tsx'

export interface PrinterOverride { priceTRY?: number; lifetimeHours?: number; maintenanceTRYPerHour?: number; avgPowerW?: number }

interface Props {
  open: boolean
  onClose: () => void
  settings: BusinessSettings
  onSettings: (s: BusinessSettings) => void
  materials: Material[]
  materialPrices: Record<string, number>
  onMaterialPrice: (id: string, price: number) => void
  printers: PrinterProfile[]
  printerOverrides: Record<string, PrinterOverride>
  onPrinterOverride: (id: string, o: PrinterOverride) => void
  onReset: () => void
}

export function SettingsDialog(p: Props) {
  useEffect(() => {
    if (!p.open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') p.onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [p.open, p])
  if (!p.open) return null
  const s = p.settings
  const set = <K extends keyof BusinessSettings>(k: K, v: BusinessSettings[K]) => p.onSettings({ ...s, [k]: v })

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onClick={p.onClose}>
      <div className="my-6 w-full max-w-3xl rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
          <h2 className="text-base font-semibold">Ayarlar</h2>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={p.onReset}>Varsayılanlara dön</Button>
            <Button variant="primary" onClick={p.onClose}>Kapat</Button>
          </div>
        </header>
        <div className="space-y-6 p-5">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-zinc-200">İşletme</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Field label="Elektrik" hint="EPDK 2026: mesken ≈3.2 / kademe 2 ≈4.7–5.9 / ticarethane ≈6.5 ₺"><NumberInput value={s.electricityTRYPerKWh} onChange={(v) => set('electricityTRYPerKWh', v)} min={0} step={0.1} suffix="₺/kWh" /></Field>
              <Field label="İşçilik ücreti"><NumberInput value={s.laborTRYPerHour} onChange={(v) => set('laborTRYPerHour', v)} min={0} step={10} suffix="₺/sa" /></Field>
              <Field label="Kâr marjı"><NumberInput value={Math.round(s.markup * 100)} onChange={(v) => set('markup', v / 100)} min={0} max={500} step={5} suffix="%" /></Field>
              <Field label="KDV"><NumberInput value={Math.round(s.vat * 100)} onChange={(v) => set('vat', v / 100)} min={0} max={50} step={1} suffix="%" /></Field>
              <Field label="Başarısız baskı oranı"><NumberInput value={Math.round(s.failureRate * 100)} onChange={(v) => set('failureRate', Math.min(0.9, v / 100))} min={0} max={50} step={1} suffix="%" /></Field>
              <Field label="Minimum sipariş"><NumberInput value={s.minimumPriceTRY} onChange={(v) => set('minimumPriceTRY', v)} min={0} step={10} suffix="₺" /></Field>
              <Field label="Ambalaj (adet)"><NumberInput value={s.packagingTRY} onChange={(v) => set('packagingTRY', v)} min={0} step={5} suffix="₺" /></Field>
              <Field label="FDM hazırlık işçiliği" hint="Tabla başına"><NumberInput value={s.fdmSetupMinutes} onChange={(v) => set('fdmSetupMinutes', v)} min={0} step={1} suffix="dk" /></Field>
              <Field label="Reçine hazırlık" hint="Tabla başına"><NumberInput value={s.resinSetupMinutes} onChange={(v) => set('resinSetupMinutes', v)} min={0} step={1} suffix="dk" /></Field>
              <Field label="Reçine yıkama/kürleme" hint="Tabla başına"><NumberInput value={s.resinPostMinutes} onChange={(v) => set('resinPostMinutes', v)} min={0} step={1} suffix="dk" /></Field>
              <Field label="IPA fiyatı"><NumberInput value={s.ipaTRYPerLiter} onChange={(v) => set('ipaTRYPerLiter', v)} min={0} step={10} suffix="₺/L" /></Field>
              <Field label="IPA tüketimi (taban)" hint="Yüzey alanına göre artar"><NumberInput value={Math.round(s.ipaLitersPerPrintBase * 1000)} onChange={(v) => set('ipaLitersPerPrintBase', v / 1000)} min={0} step={10} suffix="ml/baskı" /></Field>
              <Field label="FDM parça başına işçilik" hint="Tabladan alma, temizlik"><NumberInput value={s.fdmPerPartMinutes} onChange={(v) => set('fdmPerPartMinutes', v)} min={0} step={0.5} suffix="dk" /></Field>
              <Field label="Reçine parça başına işçilik" hint="Destek sökme, kontrol"><NumberInput value={s.resinPerPartMinutes} onChange={(v) => set('resinPerPartMinutes', v)} min={0} step={0.5} suffix="dk" /></Field>
              <Field label="FDM parça aralığı" hint="Tabla yerleşimi (Bambu Studio arrange)"><NumberInput value={s.fdmPartSpacingMm} onChange={(v) => set('fdmPartSpacingMm', v)} min={0} step={1} suffix="mm" /></Field>
              <Field label="Reçine parça aralığı"><NumberInput value={s.resinPartSpacingMm} onChange={(v) => set('resinPartSpacingMm', v)} min={0} step={1} suffix="mm" /></Field>
              <Field label="Tabla kenar payı"><NumberInput value={s.plateMarginMm} onChange={(v) => set('plateMarginMm', v)} min={0} step={1} suffix="mm" /></Field>
              <Field label="Reçine kaplama cezası" hint="Tabla tamamen doluyken kaldırma döngüsü uzaması"><NumberInput value={Math.round(s.resinLiftAreaPenalty * 100)} onChange={(v) => set('resinLiftAreaPenalty', v / 100)} min={0} max={200} step={5} suffix="%" /></Field>
              <Field label="Süre kalibrasyonu" hint="Dilimleyici sonucunuza göre çarpan (Bambu Studio gerçekte %15–20 kısa tahmin eder)"><NumberInput value={s.timeMultiplier} onChange={(v) => set('timeMultiplier', v)} min={0.3} max={3} step={0.05} suffix="×" /></Field>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-zinc-200">Yazıcılar</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase text-zinc-500">
                  <tr><th className="py-1 pr-2">Yazıcı</th><th className="py-1 pr-2">Fiyat (₺)</th><th className="py-1 pr-2">Ömür (sa)</th><th className="py-1 pr-2">Bakım (₺/sa)</th><th className="py-1">Ort. güç (W)</th></tr>
                </thead>
                <tbody>
                  {p.printers.map((pr) => {
                    const o = p.printerOverrides[pr.id] ?? {}
                    const upd = (k: keyof PrinterOverride, v: number) => p.onPrinterOverride(pr.id, { ...o, [k]: v })
                    return (
                      <tr key={pr.id} className="border-t border-zinc-800">
                        <td className="py-1.5 pr-2 whitespace-nowrap">{pr.brand} {pr.name}</td>
                        <td className="py-1.5 pr-2"><NumberInput value={o.priceTRY ?? pr.priceTRY} onChange={(v) => upd('priceTRY', v)} min={0} step={100} className="w-28" /></td>
                        <td className="py-1.5 pr-2"><NumberInput value={o.lifetimeHours ?? pr.lifetimeHours} onChange={(v) => upd('lifetimeHours', v)} min={100} step={100} className="w-24" /></td>
                        <td className="py-1.5 pr-2"><NumberInput value={o.maintenanceTRYPerHour ?? pr.maintenanceTRYPerHour} onChange={(v) => upd('maintenanceTRYPerHour', v)} min={0} step={0.5} className="w-24" /></td>
                        <td className="py-1.5"><NumberInput value={o.avgPowerW ?? pr.spec.avgPowerW} onChange={(v) => upd('avgPowerW', v)} min={0} step={5} className="w-24" /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-zinc-200">Malzeme fiyatları (₺/kg, KDV dahil)</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {p.materials.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 rounded-md bg-zinc-950/60 px-3 py-1.5">
                  <span className="truncate text-sm text-zinc-300">{m.name} <span className="text-[11px] text-zinc-500">{m.density} g/cm³</span></span>
                  <NumberInput value={p.materialPrices[m.id] ?? m.pricePerKgTRY} onChange={(v) => p.onMaterialPrice(m.id, v)} min={0} step={10} suffix="₺" className="w-32 shrink-0" />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
