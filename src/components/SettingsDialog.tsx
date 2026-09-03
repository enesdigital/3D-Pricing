import { useEffect } from 'react'
import type { BusinessSettings, Material, PrinterProfile } from '../lib/cost/types.ts'
import { Button, Field, NumberInput } from './ui.tsx'
import { useI18n } from '../lib/i18n/index.tsx'

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
  const { t } = useI18n()
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
          <h2 className="text-base font-semibold">{t('settings.title')}</h2>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={p.onReset}>{t('settings.reset')}</Button>
            <Button variant="primary" onClick={p.onClose}>{t('settings.close')}</Button>
          </div>
        </header>
        <div className="space-y-6 p-5">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-zinc-200">{t('settings.secBusiness')}</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <Field label={t('settings.electricity')} hint={t('settings.electricityHint')}><NumberInput value={s.electricityTRYPerKWh} onChange={(v) => set('electricityTRYPerKWh', v)} min={0} step={0.1} suffix="₺/kWh" /></Field>
              <Field label={t('settings.labor')}><NumberInput value={s.laborTRYPerHour} onChange={(v) => set('laborTRYPerHour', v)} min={0} step={10} suffix="₺/sa" /></Field>
              <Field label={t('settings.markup')}><NumberInput value={Math.round(s.markup * 100)} onChange={(v) => set('markup', v / 100)} min={0} max={500} step={5} suffix="%" /></Field>
              <Field label={t('settings.vat')}><NumberInput value={Math.round(s.vat * 100)} onChange={(v) => set('vat', v / 100)} min={0} max={50} step={1} suffix="%" /></Field>
              <Field label={t('settings.failureFdm')} hint={t('settings.failureFdmHint')}><NumberInput value={Math.round(s.failureRate * 100)} onChange={(v) => set('failureRate', Math.min(0.9, v / 100))} min={0} max={50} step={1} suffix="%" /></Field>
              <Field label={t('settings.failureResin')} hint={t('settings.failureResinHint')}><NumberInput value={Math.round(s.resinFailureRate * 100)} onChange={(v) => set('resinFailureRate', Math.min(0.9, v / 100))} min={0} max={50} step={1} suffix="%" /></Field>
              <Field label={t('settings.minimum')}><NumberInput value={s.minimumPriceTRY} onChange={(v) => set('minimumPriceTRY', v)} min={0} step={10} suffix="₺" /></Field>
              <Field label={t('settings.packaging')}><NumberInput value={s.packagingTRY} onChange={(v) => set('packagingTRY', v)} min={0} step={5} suffix="₺" /></Field>
              <Field label={t('settings.fdmSetup')} hint={t('settings.perPlate')}><NumberInput value={s.fdmSetupMinutes} onChange={(v) => set('fdmSetupMinutes', v)} min={0} step={1} suffix={t('units.min')} /></Field>
              <Field label={t('settings.resinSetup')} hint={t('settings.perPlate')}><NumberInput value={s.resinSetupMinutes} onChange={(v) => set('resinSetupMinutes', v)} min={0} step={1} suffix={t('units.min')} /></Field>
              <Field label={t('settings.resinPost')} hint={t('settings.resinPostHint')}><NumberInput value={s.resinPostMinutes} onChange={(v) => set('resinPostMinutes', v)} min={0} step={1} suffix={t('units.min')} /></Field>
              <Field label={t('settings.ipaPrice')}><NumberInput value={s.ipaTRYPerLiter} onChange={(v) => set('ipaTRYPerLiter', v)} min={0} step={10} suffix="₺/L" /></Field>
              <Field label={t('settings.ipaConsumption')} hint={t('settings.ipaConsumptionHint')}><NumberInput value={Math.round(s.ipaLitersPerPrintBase * 1000)} onChange={(v) => set('ipaLitersPerPrintBase', v / 1000)} min={0} step={5} suffix="ml" /></Field>
              <Field label={t('settings.fdmPerPart')} hint={t('settings.fdmPerPartHint')}><NumberInput value={s.fdmPerPartMinutes} onChange={(v) => set('fdmPerPartMinutes', v)} min={0} step={0.5} suffix={t('units.min')} /></Field>
              <Field label={t('settings.resinPerPart')} hint={t('settings.resinPerPartHint')}><NumberInput value={s.resinPerPartMinutes} onChange={(v) => set('resinPerPartMinutes', v)} min={0} step={0.5} suffix={t('units.min')} /></Field>
              <Field label={t('settings.fdmSpacing')} hint={t('settings.fdmSpacingHint')}><NumberInput value={s.fdmPartSpacingMm} onChange={(v) => set('fdmPartSpacingMm', v)} min={0} step={1} suffix="mm" /></Field>
              <Field label={t('settings.resinSpacing')} hint={t('settings.resinSpacingHint')}><NumberInput value={s.resinPartSpacingMm} onChange={(v) => set('resinPartSpacingMm', v)} min={0} step={1} suffix="mm" /></Field>
              <Field label={t('settings.plateMargin')}><NumberInput value={s.plateMarginMm} onChange={(v) => set('plateMarginMm', v)} min={0} step={1} suffix="mm" /></Field>
              <Field label={t('settings.resinLiftPenalty')} hint={t('settings.resinLiftPenaltyHint')}><NumberInput value={Math.round(s.resinLiftAreaPenalty * 100)} onChange={(v) => set('resinLiftAreaPenalty', v / 100)} min={0} max={200} step={5} suffix="%" /></Field>
              <Field label={t('settings.timeCalibration')} hint={t('settings.timeCalibrationHint')}><NumberInput value={s.timeMultiplier} onChange={(v) => set('timeMultiplier', v)} min={0.3} max={3} step={0.05} suffix="×" /></Field>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-zinc-200">{t('settings.secPdf')}</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label={t('settings.companyName')} hint={t('settings.companyNameHint')}><input value={s.companyName} onChange={(e) => set('companyName', e.target.value)} placeholder={t('settings.companyNamePlaceholder')} className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm outline-none focus:border-sky-500" /></Field>
              <Field label={t('settings.contact')} hint={t('settings.contactHint')}><input value={s.companyContact} onChange={(e) => set('companyContact', e.target.value)} placeholder={t('settings.contactPlaceholder')} className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm outline-none focus:border-sky-500" /></Field>
              <Field label={t('settings.quoteValidity')}><NumberInput value={s.quoteValidityDays} onChange={(v) => set('quoteValidityDays', Math.max(1, Math.round(v)))} min={1} step={1} suffix={t('units.days')} /></Field>
              <div className="md:col-span-2"><Field label={t('settings.quoteNote')}><textarea value={s.quoteNote} onChange={(e) => set('quoteNote', e.target.value)} rows={2} className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm outline-none focus:border-sky-500" /></Field></div>
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-zinc-200">{t('settings.secPrinters')}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase text-zinc-500">
                  <tr><th className="py-1 pr-2">{t('settings.thPrinter')}</th><th className="py-1 pr-2">{t('settings.thPrice')}</th><th className="py-1 pr-2">{t('settings.thLifetime')}</th><th className="py-1 pr-2">{t('settings.thMaintenance')}</th><th className="py-1">{t('settings.thPower')}</th></tr>
                </thead>
                <tbody>
                  {p.printers.map((pr) => {
                    const o = p.printerOverrides[pr.id] ?? {}
                    const upd = (k: keyof PrinterOverride, v: number) => p.onPrinterOverride(pr.id, { ...o, [k]: v })
                    return (
                      <tr key={pr.id} className="border-t border-zinc-800">
                        <td className="py-1.5 pr-2 whitespace-nowrap">{pr.brand} {pr.name}</td>
                        <td className="py-1.5 pr-2"><NumberInput value={o.priceTRY ?? pr.priceTRY} onChange={(v) => upd('priceTRY', v)} min={0} step={100} className="w-28" /></td>
                        <td className="py-1.5 pr-2"><NumberInput value={o.lifetimeHours ?? pr.lifetimeHours} onChange={(v) => upd('lifetimeHours', Math.max(100, v))} min={100} step={100} className="w-24" /></td>
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
            <h3 className="mb-2 text-sm font-semibold text-zinc-200">{t('settings.secMaterials')}</h3>
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
