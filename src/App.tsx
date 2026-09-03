import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PRINTERS, CURATED_PRINTERS, DEFAULT_PRINTER_ID } from './data/printers.ts'
import { MATERIALS } from './data/materials.ts'
import { DEFAULT_FDM_PARAMS, DEFAULT_RESIN_PARAMS, DEFAULT_SETTINGS } from './data/defaults.ts'
import { estimateFdm, estimateResin, checkFit, plateLayout, resinSpacing, MAX_QUANTITY, formatDurationCompact, fmtMoney } from './lib/cost/engine.ts'
import type { BusinessSettings, Estimate, FdmPrintParams, Material, PrinterProfile, ResinPrintParams, Translate } from './lib/cost/types.ts'
import { DEFAULT_PLACEMENT, type Placement } from './lib/mesh/types.ts'
import { useMeshWorker } from './lib/mesh/useMeshWorker.ts'
import { shallowMerge, useLocalStorage } from './lib/useLocalStorage.ts'
import { normalizeCustomMaterials, normalizeCustomPrinters } from './lib/cost/normalize.ts'
import { FileDrop } from './components/FileDrop.tsx'
import { makeSamplePawnStl } from './lib/mesh/sample.ts'
import { Viewer3D } from './components/Viewer3D.tsx'
import { ModelPanel } from './components/ModelPanel.tsx'
import { FdmParamsPanel, ResinParamsPanel } from './components/ParamsPanel.tsx'
import { ResultsPanel } from './components/ResultsPanel.tsx'
import { SettingsDialog, type PrinterOverride } from './components/SettingsDialog.tsx'
import { PrinterEditor } from './components/PrinterEditor.tsx'
import { MaterialEditor } from './components/MaterialEditor.tsx'
import { Button, Card, Field, NumberInput, Select } from './components/ui.tsx'
import { downloadQuotePdf, type QuoteImage, type QuotePricing } from './lib/pdf/quote.ts'
import { imageSize } from './lib/pdf/image.ts'
import { QuoteDialog } from './components/QuoteDialog.tsx'
import { SlicerImport } from './components/SlicerImport.tsx'
import { calibrationFactors, type CalibrationRecord, type SlicerData, type SlicerOverride } from './lib/slicer/index.ts'
import { useI18n, LANGS } from './lib/i18n/index.tsx'

const LS = 'fdm-sla-calc:v1:'

export default function App() {
  const { lang, setLang, t } = useI18n()
  // --- Kalıcı ayarlar ---
  const [settings, setSettings, resetSettings] = useLocalStorage<BusinessSettings>(LS + 'settings', DEFAULT_SETTINGS, shallowMerge)
  const [materialPrices, setMaterialPrices, resetMaterialPrices] = useLocalStorage<Record<string, number>>(LS + 'materialPrices', {})
  const [printerOverrides, setPrinterOverrides, resetPrinterOverrides] = useLocalStorage<Record<string, PrinterOverride>>(LS + 'printerOverrides', {})
  const [fdmParams, setFdmParams] = useLocalStorage<FdmPrintParams>(LS + 'fdmParams', DEFAULT_FDM_PARAMS, shallowMerge)
  const [resinParams, setResinParams] = useLocalStorage<ResinPrintParams>(LS + 'resinParams', DEFAULT_RESIN_PARAMS, shallowMerge)
  const [printerId, setPrinterId] = useLocalStorage<string>(LS + 'printerId', DEFAULT_PRINTER_ID)
  const [materialIdByTech, setMaterialIdByTech] = useLocalStorage<Record<string, string>>(LS + 'materialIdByTech', {}, shallowMerge)
  const [manifoldCheck, setManifoldCheck] = useLocalStorage<boolean>(LS + 'manifoldCheck', true)
  // Kullanıcının eklediği yazıcılar: yalnızca bu tarayıcıda (localStorage) saklanır
  const [customPrinters, setCustomPrinters] = useLocalStorage<PrinterProfile[]>(LS + 'customPrinters', [], normalizeCustomPrinters)
  const [customMaterials, setCustomMaterials] = useLocalStorage<Material[]>(LS + 'customMaterials', [], normalizeCustomMaterials)

  // --- Oturum durumu ---
  const [placement, setPlacement] = useState<Placement>(DEFAULT_PLACEMENT)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editor, setEditor] = useState<{ open: boolean; printer: PrinterProfile | null }>({ open: false, printer: null })
  const [matEditor, setMatEditor] = useState<{ open: boolean; material: Material | null }>({ open: false, material: null })
  const [customer, setCustomer] = useState('')
  // Dilimleyici verisi ve kalibrasyon
  const [slicerData, setSlicerData] = useState<SlicerData | null>(null)
  const [partsInFile, setPartsInFile] = useState(1)
  const [useSlicer, setUseSlicer] = useState(false)
  const [calibAdded, setCalibAdded] = useState(false)
  const [calibrations, setCalibrations] = useLocalStorage<CalibrationRecord[]>(LS + 'calibrations', [], (st, init) => (Array.isArray(st) ? (st as CalibrationRecord[]) : init))
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [modelImage, setModelImage] = useState<QuoteImage | null>(null)
  const [logo, setLogo] = useLocalStorage<QuoteImage | null>(LS + 'quoteLogo', null)
  const captureRef = useRef<(() => string | null) | null>(null)
  const mesh = useMeshWorker(t)

  // --- Tema (açık / koyu) ---
  // next-themes yerine düz DOM + localStorage: aynı kod hem bu uygulamada hem GitHub sürümünde çalışır.
  const [theme, setThemeState] = useState<'light' | 'dark'>('dark')
  useEffect(() => {
    const stored = (localStorage.getItem(LS + 'theme') as 'light' | 'dark' | null) ?? 'dark'
    setThemeState(stored)
    const el = document.documentElement
    el.classList.remove('light', 'dark')
    el.classList.add(stored)
  }, [])
  const toggleTheme = () => {
    setThemeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark'
      const el = document.documentElement
      el.classList.remove('light', 'dark')
      el.classList.add(next)
      try { localStorage.setItem(LS + 'theme', next) } catch { /* yoksay */ }
      return next
    })
  }

  // Etkin yazıcı / malzeme (override'lar uygulanmış)
  const printers = useMemo<PrinterProfile[]>(() => [
    ...PRINTERS.map((p) => {
      const o = printerOverrides[p.id]
      if (!o) return p
      return { ...p, priceTRY: o.priceTRY ?? p.priceTRY, lifetimeHours: o.lifetimeHours ?? p.lifetimeHours, maintenanceTRYPerHour: o.maintenanceTRYPerHour ?? p.maintenanceTRYPerHour, spec: { ...p.spec, avgPowerW: o.avgPowerW ?? p.spec.avgPowerW } }
    }),
    ...customPrinters,
  ], [printerOverrides, customPrinters])
  const isCustom = (id: string) => customPrinters.some((p) => p.id === id)
  const savePrinter = (p: PrinterProfile) => {
    setCustomPrinters((list) => (list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p]))
    setPrinterId(p.id)
    setEditor({ open: false, printer: null })
  }
  const deletePrinter = (id: string) => {
    setCustomPrinters((list) => list.filter((x) => x.id !== id))
    if (printerId === id) setPrinterId(DEFAULT_PRINTER_ID)
    setEditor({ open: false, printer: null })
  }
  const materials = useMemo(() => [
    ...MATERIALS.map((m) => ({ ...m, pricePerKgTRY: materialPrices[m.id] ?? m.pricePerKgTRY })),
    ...customMaterials,
  ], [materialPrices, customMaterials])
  const isCustomMaterial = (id: string) => customMaterials.some((m) => m.id === id)
  const saveMaterial = (m: Material) => {
    setCustomMaterials((list) => (list.some((x) => x.id === m.id) ? list.map((x) => (x.id === m.id ? m : x)) : [...list, m]))
    if (m.tech === printer.tech) setMaterialId(m.id)
    setMatEditor({ open: false, material: null })
  }
  const deleteMaterial = (id: string) => {
    setCustomMaterials((list) => list.filter((x) => x.id !== id))
    setMatEditor({ open: false, material: null })
  }
  const printer = printers.find((p) => p.id === printerId) ?? printers[0]
  const techMaterials = materials.filter((m) => m.tech === printer.tech)
  const materialGroups = useMemo(() => {
    const label = (m: Material) => `${m.name} · ${m.pricePerKgTRY.toLocaleString('tr-TR')} ₺/kg`
    const custom = techMaterials.filter((m) => isCustomMaterial(m.id))
    const rest = techMaterials.filter((m) => !isCustomMaterial(m.id))
    const byBrand = new Map<string, Material[]>()
    for (const m of rest) {
      const brand = m.brand ?? m.name.split(' ')[0]
      byBrand.set(brand, [...(byBrand.get(brand) ?? []), m])
    }
    return [
      { label: t('fields.groupCustomMaterial'), options: custom.map((m) => ({ value: m.id, label: `★ ${label(m)}` })) },
      ...[...byBrand.entries()].sort((a, b) => a[0].localeCompare(b[0], 'tr')).map(([brand, ms]) => ({ label: brand, options: ms.map((m) => ({ value: m.id, label: label(m) })) })),
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [techMaterials, customMaterials, t])
  const materialId = materialIdByTech[printer.tech]
  const material = techMaterials.find((m) => m.id === materialId) ?? techMaterials[0]
  const setMaterialId = useCallback((id: string) => setMaterialIdByTech((m) => ({ ...m, [printer.tech]: id })), [printer.tech, setMaterialIdByTech])

  // Analiz parametreleri: yazıcı teknolojisine göre
  const layerHeight = Math.max(0.01, printer.tech === 'fdm' ? fdmParams.layerHeight : resinParams.layerHeight)
  const overhangThresholdDeg = printer.tech === 'fdm' ? fdmParams.overhangThresholdDeg : resinParams.overhangThresholdDeg

  // Model yüklendiğinde / yerleşim, katman, eşik değiştiğinde yeniden analiz (debounce)
  const modelLoaded = !!mesh.model && mesh.model.positions.length > 0
  useEffect(() => {
    if (!modelLoaded) return
    const t = setTimeout(() => mesh.analyze({ placement, overhangThresholdDeg, layerHeight, manifoldCheck }), 120)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelLoaded, placement, overhangThresholdDeg, layerHeight, manifoldCheck])

  const onFile = useCallback(async (file: File) => {
    setPlacement((p) => (p.rotX === 0 && p.rotY === 0 && p.rotZ === 0 && p.unit === 1 && p.scalePct === 100 ? p : DEFAULT_PLACEMENT))
    setSlicerData(null); setUseSlicer(false); setCalibAdded(false)
    await mesh.loadFile(file)
  }, [mesh])

  const stats = mesh.analysis.stats
  const calibration = useMemo(() => (material ? calibrationFactors(calibrations, printer.id, material.id) : null), [calibrations, printer.id, material])
  const slicerOverride = useMemo<SlicerOverride | null>(() => {
    if (!useSlicer || !slicerData || slicerData.printTimeSec == null || slicerData.filamentGrams == null) return null
    const n = Math.max(1, partsInFile)
    return { partsInFile: n, partTimeSec: slicerData.printTimeSec / n, partGrams: slicerData.filamentGrams / n, fileName: slicerData.fileName }
  }, [useSlicer, slicerData, partsInFile])
  // Saf model tahmini (dilimleyici/kalibrasyon uygulanmadan) — fark göstermek ve kalibrasyon kaydı için
  const modelEstimate = useMemo<Estimate | null>(() => {
    if (!stats || !material) return null
    return printer.tech === 'fdm'
      ? estimateFdm({ stats, printer, material, settings, params: fdmParams }, t)
      : estimateResin({ stats, printer, material, settings, params: resinParams }, t)
  }, [stats, printer, material, settings, fdmParams, resinParams, t])
  const estimate = useMemo<Estimate | null>(() => {
    if (!stats || !material) return null
    if (!slicerOverride && (!calibration || calibration.samples === 0)) return modelEstimate
    return printer.tech === 'fdm'
      ? estimateFdm({ stats, printer, material, settings, params: fdmParams, slicer: slicerOverride, calibration }, t)
      : estimateResin({ stats, printer, material, settings, params: resinParams, calibration }, t)
  }, [stats, printer, material, settings, fdmParams, resinParams, t, slicerOverride, calibration, modelEstimate])
  // Adet fiyat merdiveni: 1 / 10 / 50 / 100 (+ mevcut adet)
  const ladder = useMemo(() => {
    if (!stats || !material) return []
    const qtys = [...new Set([1, 10, 50, 100, Math.max(1, Math.floor(settings.quantity))])].sort((a, b) => a - b)
    return qtys.map((q) => {
      const s = { ...settings, quantity: q }
      const e = printer.tech === 'fdm'
        ? estimateFdm({ stats, printer, material, settings: s, params: fdmParams, slicer: slicerOverride, calibration }, t)
        : estimateResin({ stats, printer, material, settings: s, params: resinParams, calibration }, t)
      return { qty: q, unit: e.perUnit.price, total: e.total.price }
    })
  }, [stats, printer, material, settings, fdmParams, resinParams, t, slicerOverride, calibration])
  const presetKey = printer.tech === 'fdm' ? `${fdmParams.layerHeight}mm/${Math.round(fdmParams.infillDensity * 100)}%/${fdmParams.wallLoops}w` : `${resinParams.layerHeight}mm`
  const addCalibrationFromSlicer = () => {
    if (!modelEstimate || !material || !slicerOverride || !mesh.model) return
    const rec: CalibrationRecord = {
      id: `cal-${Date.now().toString(36)}`, date: new Date().toISOString(), printerId: printer.id, materialId: material.id, presetKey,
      modelName: mesh.model.fileName, modelTimeSec: modelEstimate.single.printTimeSec, actualTimeSec: slicerOverride.partTimeSec,
      modelGrams: modelEstimate.single.materialGrams, actualGrams: slicerOverride.partGrams, note: slicerOverride.fileName,
    }
    setCalibrations((list) => [...list, rec]); setCalibAdded(true)
  }

  // Tüm yazıcılar için hızlı karşılaştırma
  const comparison = useMemo(() => {
    if (!stats) return []
    // Tüm katalog (160+ yazıcı) yerine: seçilmiş profiller + eklediğiniz yazıcılar + seçili yazıcı
    const curatedIds = new Set(CURATED_PRINTERS.map((p) => p.id))
    const subset = printers.filter((p) => curatedIds.has(p.id) || isCustom(p.id) || p.id === printer.id)
    return subset.map((p) => {
      const mats = materials.filter((m) => m.tech === p.tech)
      const m = p.tech === printer.tech && material ? material : mats[0]
      const est = p.tech === 'fdm'
        ? estimateFdm({ stats, printer: p, material: m, settings, params: fdmParams }, t)
        : estimateResin({ stats, printer: p, material: m, settings, params: resinParams }, t)
      return { printer: p, material: m, est }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats, printers, materials, printer.id, printer.tech, material, settings, fdmParams, resinParams, t])

  const fits = stats ? checkFit(stats, printer).fits : true
  const layout = useMemo(() => {
    if (!stats) return null
    const spacing = printer.tech === 'fdm' ? settings.fdmPartSpacingMm : resinSpacing(stats, settings.resinPartSpacingMm)
    return plateLayout(stats, printer, spacing, settings.plateMarginMm)
  }, [stats, printer, settings.fdmPartSpacingMm, settings.resinPartSpacingMm, settings.plateMarginMm])
  const qty = Math.max(1, Math.floor(settings.quantity))
  const bedForViewer = useMemo(() => ({ x: printer.bed.x, y: printer.bed.y, z: printer.bed.z }), [printer])
  const busyLabel = mesh.busy === 'reading' ? t('busy.reading') : mesh.busy === 'parsing' ? t('busy.parsing') : mesh.busy === 'analyzing' ? t('busy.analyzing') : ''

  const resetAll = () => { resetSettings(); resetMaterialPrices(); resetPrinterOverrides() }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="flex w-full items-center justify-between gap-4 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-600 text-base font-bold text-white">3D</div>
            <div>
              <h1 className="text-sm font-semibold leading-tight">{t('app.title')}</h1>
              <p className="text-[11px] text-zinc-500">{t('app.subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {busyLabel && (
              <div className="hidden items-center gap-2 text-xs text-zinc-400 sm:flex">
                <span className="h-2 w-2 animate-pulse rounded-full bg-sky-400" />
                {busyLabel} {Math.round(mesh.progress * 100)}%
              </div>
            )}
            <Select className="w-auto" value={lang} onChange={(v) => setLang(v)} options={LANGS.map((l) => ({ value: l.code, label: l.label }))} ariaLabel={t('header.langAria')} title={t('header.langAria')} />
            <Button variant="ghost" onClick={toggleTheme} ariaLabel={theme === 'dark' ? t('header.themeToLight') : t('header.themeToDark')} title={theme === 'dark' ? t('header.themeToLight') : t('header.themeToDark')}>
              <span aria-hidden="true">{theme === 'dark' ? '☀️' : '🌙'}</span>
            </Button>
            <Button onClick={() => setSettingsOpen(true)} ariaLabel={t('header.settingsAria')} title={t('header.settingsTitle')}>{t('header.settings')}</Button>
          </div>
        </div>
        {mesh.busy !== 'idle' && (
          <div className="h-0.5 w-full bg-zinc-800"><div className="h-full bg-sky-500 transition-[width]" style={{ width: `${Math.round(mesh.progress * 100)}%` }} /></div>
        )}
      </header>

      <main className="grid w-full flex-1 grid-cols-1 gap-4 p-4 xl:grid-cols-[340px_minmax(0,1fr)_400px] 2xl:grid-cols-[380px_minmax(0,1fr)_460px]">
        {/* Sol: model */}
        <div className="space-y-4">
          {!mesh.model ? (
            <FileDrop onFile={onFile} onSample={() => onFile(makeSamplePawnStl())} />
          ) : (
            <>
              <Card title="Model">
                <ModelPanel
                  model={mesh.model} stats={stats} placement={placement} onPlacement={setPlacement}
                  manifoldCheck={manifoldCheck} onManifoldCheck={setManifoldCheck} onClear={mesh.clear}
                />
              </Card>
              <FileDrop onFile={onFile} compact />
              <Card title={t('slicer.title')}>
                <SlicerImport
                  material={material ?? null} data={slicerData} partsInFile={partsInFile} useIt={useSlicer} modelEstimate={modelEstimate}
                  onData={(d) => { setSlicerData(d); setCalibAdded(false); setUseSlicer(!!d && d.printTimeSec != null && d.filamentGrams != null) }}
                  onPartsInFile={(n) => { setPartsInFile(n); setCalibAdded(false) }} onUse={setUseSlicer}
                  onAddCalibration={addCalibrationFromSlicer} calibAdded={calibAdded}
                />
              </Card>
            </>
          )}
          {mesh.error && <div className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">{mesh.error}</div>}

          <Card title={t('cards.printerMaterial')}>
            <div className="space-y-3">
              <Field label={t('fields.printer')}>
                <Select value={printer.id} onChange={setPrinterId} groups={[
                  { label: t('fields.groupCustom'), options: printers.filter((p) => isCustom(p.id)).map((p) => ({ value: p.id, label: `★ ${p.brand} ${p.name} · ${p.tech === 'fdm' ? t('tech.fdm') : t('tech.resin')} · ${p.bed.x}×${p.bed.y}×${p.bed.z} mm` })) },
                  { label: t('fields.groupFdm'), options: printers.filter((p) => !isCustom(p.id) && p.tech === 'fdm').map((p) => ({ value: p.id, label: `${p.brand} ${p.name} · ${p.bed.x}×${p.bed.y}×${p.bed.z} mm` })) },
                  { label: t('fields.groupResin'), options: printers.filter((p) => !isCustom(p.id) && p.tech === 'resin').map((p) => ({ value: p.id, label: `${p.brand} ${p.name} · ${p.bed.x}×${p.bed.y}×${p.bed.z} mm` })) },
                ]} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setEditor({ open: true, printer: null })}>{t('actions.addPrinter')}</Button>
                {isCustom(printer.id) && <Button variant="ghost" onClick={() => setEditor({ open: true, printer })}>{t('actions.editDelete')}</Button>}
              </div>
              {printer.notes && <p className="text-[11px] leading-snug text-zinc-500">{printer.notes}</p>}
              <Field label={t('fields.material')}>
                <Select value={material?.id ?? ''} onChange={setMaterialId} groups={materialGroups} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setMatEditor({ open: true, material: null })}>{t('actions.addMaterial')}</Button>
                {material && isCustomMaterial(material.id) && <Button variant="ghost" onClick={() => setMatEditor({ open: true, material })}>{t('actions.editDelete')}</Button>}
              </div>
              <Field label={t('fields.quantity')}><NumberInput value={settings.quantity} onChange={(v) => setSettings({ ...settings, quantity: Math.min(MAX_QUANTITY, Math.max(1, Math.round(v))) })} min={1} max={MAX_QUANTITY} step={1} /></Field>
            </div>
          </Card>

          <Card title={printer.tech === 'fdm' ? t('cards.fdmSettings') : t('cards.resinSettings')}>
            {printer.tech === 'fdm'
              ? <FdmParamsPanel params={fdmParams} onChange={setFdmParams} printer={printer} />
              : <ResinParamsPanel params={resinParams} onChange={setResinParams} />}
          </Card>
        </div>

        {/* Orta: 3B görünüm */}
        <div className="flex min-h-[520px] flex-col gap-4 xl:min-h-[calc(100vh-7rem)]">
          <div className="relative flex-1 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
            <Viewer3D
              positions={modelLoaded ? mesh.model!.positions : null}
              overhangMask={mesh.analysis.overhangMask}
              placement={stats ? mesh.analysis.placement : placement}
              bboxMin={stats?.min ?? null}
              bboxMax={stats?.max ?? null}
              bed={bedForViewer}
              fits={fits}
              copies={qty}
              layout={layout}
              captureRef={captureRef}
            />
            <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-zinc-950/70 px-2 py-1 text-[11px] text-zinc-400">
              {printer.brand} {printer.name} · {t('viewer.bed')} {printer.bed.x}×{printer.bed.y}×{printer.bed.z} mm
              {stats && !fits && <span className="ml-2 text-red-300">{t('viewer.notFit')}</span>}
              {stats && layout && layout.capacity > 0 && qty > 1 && (
                <span className={`ml-2 ${qty > layout.capacity ? 'text-amber-300' : 'text-emerald-300'}`}>
                  {t('viewer.showing', { shown: Math.min(qty, layout.capacity), qty, cols: layout.cols, rows: layout.rows, rot: layout.rotated ? t('viewer.rotated90') : '' })}
                  {qty > layout.capacity && t('viewer.platesNeeded', { n: Math.ceil(qty / layout.capacity) })}
                </span>
              )}
            </div>
            {stats && layout && qty > layout.capacity && layout.capacity > 0 && (
              <div className="pointer-events-none absolute bottom-3 left-3 right-3 rounded-md border border-amber-900/60 bg-amber-950/70 px-3 py-2 text-xs text-amber-200">
                {t('viewer.overCapacity', { qty, cap: layout.capacity, cols: layout.cols, rows: layout.rows, plates: Math.ceil(qty / layout.capacity) })}
              </div>
            )}
            {!modelLoaded && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-zinc-600">
                {t('viewer.placeholder')}
              </div>
            )}
          </div>

          {comparison.length > 0 && (
            <Card title={t('cards.comparison')} right={<span className="text-[11px] text-zinc-500">{t('cards.comparisonHint')}</span>}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-[11px] uppercase text-zinc-500">
                    <tr>
                      <th className="py-1 pr-2">{t('compare.printer')}</th><th className="py-1 pr-2">{t('compare.material')}</th>
                      <th className="py-1 pr-2 text-right">{t('compare.gramPer')}</th><th className="py-1 pr-2 text-right">{settings.quantity > 1 ? t('compare.totalTime') : t('compare.time')}</th>
                      {settings.quantity > 1 && <th className="py-1 pr-2 text-right">{t('compare.plate')}</th>}
                      <th className="py-1 pr-2 text-right">{t('compare.pricePer')}</th>
                      {settings.quantity > 1 && <th className="py-1 text-right">{t('compare.total', { qty: settings.quantity })}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.map(({ printer: p, material: m, est }) => (
                      <tr key={p.id} className={`border-t border-zinc-800 ${p.id === printer.id ? 'bg-sky-950/30' : ''} ${!est.fitsRotated ? 'opacity-50' : ''}`}>
                        <td className="py-1.5 pr-2 whitespace-nowrap">
                          <button className="text-left hover:text-sky-300" onClick={() => setPrinterId(p.id)}>{p.brand} {p.name}</button>
                          {!est.fitsRotated && <span className="ml-1 text-[11px] text-red-300">{t('compare.notFit')}</span>}
                        </td>
                        <td className="py-1.5 pr-2 text-xs text-zinc-400">{m.name}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{est.perUnit.materialGrams.toFixed(0)} g</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{fmtDur(est.total.printTimeSec, t)}</td>
                        {settings.quantity > 1 && <td className="py-1.5 pr-2 text-right tabular-nums text-xs text-zinc-400">{est.plates} × {est.partsPerPlate}</td>}
                        <td className="py-1.5 pr-2 text-right tabular-nums">{fmtMoney(est.perUnit.price, settings, 0)}</td>
                        {settings.quantity > 1 && <td className="py-1.5 text-right font-semibold tabular-nums">{fmtMoney(est.total.price, settings, 0)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        {/* Sağ: sonuç */}
        <div className="space-y-4">
          <Card title={t('cards.priceEstimate')} right={estimate && (
            <div className="flex gap-1">
              <Button variant="ghost" onClick={() => window.print()} ariaLabel={t('actions.printAria')} title={t('actions.printTitle')}>{t('actions.print')}</Button>
              <Button variant="primary" ariaLabel={t('actions.quotePdfAria')} title={t('actions.quotePdfTitle')} onClick={async () => {
                setPdfError(null)
                const url = captureRef.current?.()
                if (url) { try { const { w, h } = await imageSize(url); setModelImage({ dataUrl: url, w, h }) } catch { setModelImage(null) } } else setModelImage(null)
                setQuoteOpen(true)
              }}>{t('actions.quotePdf')}</Button>
            </div>
          )}>
            {estimate && material ? (
              <ResultsPanel est={estimate} printer={printer} material={material} settings={settings} calibSamples={calibration?.samples} ladder={ladder} />
            ) : (
              <div className="text-sm text-zinc-500">
                {mesh.error ? (
                  <p className="text-red-300">{t('status.calcFailed', { e: mesh.error })}</p>
                ) : mesh.model ? (
                  <>
                    <p>{busyLabel || t('status.calculating')}... {mesh.busy !== 'idle' && `${Math.round(mesh.progress * 100)}%`}</p>
                    <p className="mt-1 text-[11px]">{t('status.largeFileHint')}</p>
                  </>
                ) : t('status.uploadStl')}
              </div>
            )}
          </Card>
          <Card title={t('cards.how')}>
            <ul className="list-disc space-y-1 pl-4 text-[12px] leading-snug text-zinc-400">
              {(['item1', 'item2', 'item3', 'item4', 'item5', 'item6'] as const).map((k) => (
                <li key={k} dangerouslySetInnerHTML={{ __html: t('how.' + k) }} />
              ))}
            </ul>
          </Card>
        </div>
      </main>

      <footer className="border-t border-zinc-800 px-4 py-3 text-center text-[11px] text-zinc-600">
        {t('footer.text')}
      </footer>

      {estimate && material && quoteOpen && (
        <QuoteDialog
          open={quoteOpen} est={estimate} settings={settings}
          customer={customer} onCustomer={setCustomer}
          logo={logo} onLogo={setLogo} modelImage={modelImage}
          busy={pdfBusy} error={pdfError}
          onClose={() => setQuoteOpen(false)}
          onGenerate={async (pricing: QuotePricing, includeProduction: boolean) => {
            if (!stats || !mesh.model) return
            setPdfBusy(true); setPdfError(null)
            try {
              await downloadQuotePdf({ est: estimate, stats, printer, material, settings, fdmParams, resinParams, placement, fileName: mesh.model.fileName, triangleCount: mesh.model.triangleCount, customer, pricing, logo, modelImage, includeProduction }, t)
              setQuoteOpen(false)
            } catch (e) {
              setPdfError(e instanceof Error ? e.message : String(e))
            } finally { setPdfBusy(false) }
          }}
        />
      )}
      <PrinterEditor
        key={`printer-${editor.open ? (editor.printer?.id ?? 'new') : 'closed'}`}
        open={editor.open} initial={editor.printer} templates={printers}
        onSave={savePrinter} onDelete={deletePrinter} onClose={() => setEditor({ open: false, printer: null })}
      />
      <MaterialEditor
        key={`material-${matEditor.open ? (matEditor.material?.id ?? 'new') : 'closed'}`}
        open={matEditor.open} initial={matEditor.material} templates={materials} defaultTech={printer.tech}
        onSave={saveMaterial} onDelete={deleteMaterial} onClose={() => setMatEditor({ open: false, material: null })}
      />
      <SettingsDialog
        open={settingsOpen} onClose={() => setSettingsOpen(false)}
        settings={settings} onSettings={setSettings}
        materials={MATERIALS} materialPrices={materialPrices} onMaterialPrice={(id, price) => setMaterialPrices({ ...materialPrices, [id]: price })}
        printers={PRINTERS} printerOverrides={printerOverrides} onPrinterOverride={(id, o) => setPrinterOverrides({ ...printerOverrides, [id]: o })}
        calibration={{
          records: calibrations, factors: calibration ?? { timeFactor: 1, gramsFactor: 1, samples: 0, scope: 'none' }, printers, materials,
          current: modelEstimate && material && mesh.model ? { printerId: printer.id, materialId: material.id, presetKey, modelName: mesh.model.fileName, modelTimeSec: modelEstimate.single.printTimeSec, modelGrams: modelEstimate.single.materialGrams } : null,
          onAdd: (r) => setCalibrations((list) => [...list, r]), onDelete: (id) => setCalibrations((list) => list.filter((x) => x.id !== id)),
        }}
        onReset={resetAll}
      />
    </div>
  )
}

function fmtDur(sec: number, t: Translate) { return formatDurationCompact(sec, t) }
