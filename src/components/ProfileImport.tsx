import { useRef, useState } from 'react'
import type { FdmPrintParams, Material, PrinterProfile } from '../lib/cost/types.ts'
import { PROFILE_EXT, parseProfileFile, profileToMaterial, profileToParams, profileToPrinter, type ImportedProfile } from '../lib/slicer/parseProfile.ts'
import { Button } from './ui.tsx'
import { useI18n } from '../lib/i18n/index.tsx'

interface Props {
  /** Etkin yazıcı (makine profili için spec şablonu) ve malzeme (fiyat/eksik alan temeli) */
  printer: PrinterProfile
  material: Material | null
  fdmParams: FdmPrintParams
  onAddMaterial: (m: Material) => void
  onAddPrinter: (p: PrinterProfile) => void
  onParams: (p: FdmPrintParams) => void
}

/** Orca / Bambu Studio / PrusaSlicer profil dosyalarını okuyup malzeme, yazıcı ve baskı ayarlarına uygular */
export function ProfileImport({ printer, material, fdmParams, onAddMaterial, onAddPrinter, onParams }: Props) {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const [profiles, setProfiles] = useState<ImportedProfile[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [applied, setApplied] = useState<Record<string, string>>({})

  const handle = async (file: File | undefined) => {
    if (!file) return
    setBusy(true); setError(null)
    try {
      const list = await parseProfileFile(file)
      setProfiles(list); setApplied({})
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg === 'UNKNOWN' ? t('profile.errUnknown') : msg === 'JSON' ? t('profile.errJson') : t('profile.errParse', { e: msg }))
      setProfiles([])
    } finally { setBusy(false) }
  }
  const key = (p: ImportedProfile, i: number) => `${p.kind}:${p.name}:${i}`
  const mark = (k: string, msg: string) => setApplied((a) => ({ ...a, [k]: msg }))
  const fmt = (v: number | null | undefined, unit = '') => (v == null ? '—' : `${v}${unit}`)

  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-xs text-zinc-300 hover:text-sky-300">{t('profile.summary')}</summary>
      <div className="mt-2 space-y-2">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handle(e.dataTransfer.files[0]) }}
          onClick={() => inputRef.current?.click()}
          role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }}
          className="cursor-pointer rounded-lg border border-dashed border-zinc-700 px-3 py-2 text-center text-xs text-zinc-300 hover:border-zinc-500"
        >
          <input ref={inputRef} type="file" accept={PROFILE_EXT.map((e) => '.' + e).join(',')} className="hidden" onChange={(e) => { handle(e.target.files?.[0]); e.target.value = '' }} />
          {busy ? t('profile.reading') : t('profile.drop')}
        </div>
        <p className="text-[11px] leading-snug text-zinc-500">{t('profile.hint')}</p>
        {error && <p className="text-xs text-red-300">{error}</p>}
        {profiles.map((p, i) => {
          const k = key(p, i)
          return (
            <div key={k} className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <div className="min-w-0">
                  <span className={`mr-1 rounded px-1.5 py-0.5 text-[10px] uppercase ${p.kind === 'filament' ? 'bg-emerald-900/50 text-emerald-200' : p.kind === 'machine' ? 'bg-sky-900/50 text-sky-200' : 'bg-violet-900/50 text-violet-200'}`}>{t(`profile.kind.${p.kind}`)}</span>
                  <span className="font-medium text-zinc-100" title={p.name}>{p.name}</span>
                  <span className="ml-1 text-zinc-500">· {p.source}</span>
                </div>
                {p.kind === 'filament' && p.filament && (
                  <Button onClick={() => { onAddMaterial(profileToMaterial(p.filament!, material)); mark(k, t('profile.addedMaterial')) }}>{t('profile.applyMaterial')}</Button>
                )}
                {p.kind === 'process' && p.process && (
                  <Button onClick={() => { onParams(profileToParams(p.process!, fdmParams)); mark(k, t('profile.appliedParams')) }}>{t('profile.applyParams')}</Button>
                )}
                {p.kind === 'machine' && p.machine && (
                  <Button onClick={() => { onAddPrinter(profileToPrinter(p.machine!, printer)); mark(k, t('profile.addedPrinter')) }} disabled={printer.tech !== 'fdm'}>{t('profile.applyPrinter')}</Button>
                )}
              </div>
              <div className="mt-1 text-zinc-400">
                {p.kind === 'filament' && p.filament && t('profile.filamentLine', { type: p.filament.type ?? '—', density: fmt(p.filament.density, ' g/cm³'), flow: fmt(p.filament.maxVolumetricSpeed, ' mm³/s'), minLayer: fmt(p.filament.minLayerTime, ' s'), temp: fmt(p.filament.nozzleTemp, '°C'), cost: fmt(p.filament.cost) })}
                {p.kind === 'machine' && p.machine && t('profile.machineLine', { bed: p.machine.bed ? `${p.machine.bed.x}×${p.machine.bed.y}×${p.machine.bed.z || '?'} mm` : '—', nozzle: fmt(p.machine.nozzleDiameter, ' mm'), speed: fmt(p.machine.maxSpeed, ' mm/s'), ext: fmt(p.machine.extruders) })}
                {p.kind === 'process' && p.process && t('profile.processLine', { lh: fmt(p.process.layerHeight, ' mm'), walls: fmt(p.process.wallLoops), top: fmt(p.process.topLayers), bottom: fmt(p.process.bottomLayers), infill: p.process.infillDensity != null ? `%${Math.round(p.process.infillDensity * 100)}` : '—', support: p.process.supportEnabled == null ? '—' : p.process.supportEnabled ? (p.process.supportType ?? t('params.on')) : t('params.off') })}
              </div>
              {p.notes.includes('inherits') && <p className="mt-1 text-[11px] text-amber-300/80">{t('profile.inherits', { name: p.inherits ?? '' })}</p>}
              {p.kind === 'filament' && p.filament?.cost != null && <p className="mt-1 text-[11px] text-zinc-500">{t('profile.costNote', { cost: p.filament.cost })}</p>}
              {applied[k] && <p className="mt-1 text-[11px] text-emerald-300">✓ {applied[k]}</p>}
            </div>
          )
        })}
      </div>
    </details>
  )
}
