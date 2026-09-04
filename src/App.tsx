import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PRINTERS, ALL_PRINTERS, DEFAULT_PRINTER_ID } from './data/printers.ts'
import { MATERIALS, ALL_MATERIALS } from './data/materials.ts'
import { DEFAULT_FDM_PARAMS, DEFAULT_RESIN_PARAMS, DEFAULT_SETTINGS } from './data/defaults.ts'
import { estimateFdm, estimateResin, checkFit, plateLayout, resinSpacing, MAX_QUANTITY, formatDurationCompact, fmtMoney } from './lib/cost/engine.ts'
import { estimateProject, type ProjectEstimate, type ProjectPart } from './lib/cost/project.ts'
import { gridInstances, packedInstances } from './lib/cost/pack.ts'
import type { BusinessSettings, Estimate, FdmPrintParams, Material, PrinterProfile, ResinPrintParams, Translate } from './lib/cost/types.ts'
import { DEFAULT_PLACEMENT, type Placement } from './lib/mesh/types.ts'
import { useMeshWorker } from './lib/mesh/useMeshWorker.ts'
import { shallowMerge, useLocalStorage, STORAGE_QUOTA_EVENT } from './lib/useLocalStorage.ts'
import { normalizeCustomMaterials, normalizeCustomPrinters } from './lib/cost/normalize.ts'
import { thinFraction, thinMask as buildThinMask } from './lib/mesh/thickness.ts'
import { FileDrop } from './components/FileDrop.tsx'
import { makeSamplePawnStl } from './lib/mesh/sample.ts'
import { Viewer3D, MAX_INSTANCES, type ViewerInstance, type ViewerPart } from './components/Viewer3D.tsx'
import { ProjectPanel } from './components/ProjectPanel.tsx'
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
import { SharedQuoteView } from './components/SharedQuoteView.tsx'
import { HistoryDialog } from './components/HistoryDialog.tsx'
import { PwaToast } from './components/PwaToast.tsx'
import { buildQuoteRecord, historyAvailable, makeThumb, saveQuote, upsertCustomerByName } from './lib/history/index.ts'
import { makeQuoteNo } from './lib/pdf/quote.ts'
import { readShareFromHash, type SharedQuote } from './lib/share.ts'
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
  const [thicknessCheck, setThicknessCheck] = useLocalStorage<boolean>(LS + 'thicknessCheck', true)
  // Kullanıcının eklediği yazıcılar: yalnızca bu tarayıcıda (localStorage) saklanır
  const [customPrinters, setCustomPrinters] = useLocalStorage<PrinterProfile[]>(LS + 'customPrinters', [], normalizeCustomPrinters)
  const [customMaterials, setCustomMaterials] = useLocalStorage<Material[]>(LS + 'customMaterials', [], normalizeCustomMaterials)

  // --- Oturum durumu ---
  const [plateIndex, setPlateIndex] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editor, setEditor] = useState<{ open: boolean; printer: PrinterProfile | null }>({ open: false, printer: null })
  const [matEditor, setMatEditor] = useState<{ open: boolean; material: Material | null }>({ open: false, material: null })
  const [customer, setCustomer] = useState('')
  const [shared, setShared] = useState<SharedQuote | null>(() => readShareFromHash())
  // Dilimleyici verisi ve kalibrasyon
  const [slicerData, setSlicerData] = useState<SlicerData | null>(null)
  const [partsInFile, setPartsInFile] = useState(1)
  const [useSlicer, setUseSlicer] = useState(false)
  const [calibAdded, setCalibAdded] = useState(false)
  const [calibrations, setCalibrations] = useLocalStorage<CalibrationRecord[]>(LS + 'calibrations', [], (st, init) => (Array.isArray(st) ? (st as CalibrationRecord[]) : init))
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  // localStorage kotası dolduğunda kullanıcıya bildirim (useLocalStorage olay gönderir)
  const [quotaError, setQuotaError] = useState(false)
  useEffect(() => {
    const on = () => setQuotaError(true)
    window.addEventListener(STORAGE_QUOTA_EVENT, on)
    return () => window.removeEventListener(STORAGE_QUOTA_EVENT, on)
  }, [])
  // Aynı teklif hem Kaydet hem PDF ile iki kez yazılmasın: pencere açıkken kaydedilen numara hatırlanır
  const savedQuoteNo = useRef<string | null>(null)
  const [modelImage, setModelImage] = useState<QuoteImage | null>(null)
  const [logo, setLogo] = useLocalStorage<QuoteImage | null>(LS + 'quoteLogo', null)
  const captureRef = useRef<(() => string | null) | null>(null)
  const mesh = useMeshWorker(t)
  const active = mesh.active
  const activeId = mesh.activeId
  // Yerleşim etkin parçaya aittir (çok parçalı projede her parçanın kendi döndürme/ölçeği vardır)
  const placement = active?.placement ?? DEFAULT_PLACEMENT
  const { setPlacement: meshSetPlacement } = mesh
  const setPlacement = useCallback((p: Placement) => { if (activeId) meshSetPlacement(activeId, p) }, [activeId, meshSetPlacement])
  /** İki ve daha fazla parça: proje modu (karışık tabla, parça başına adet) */
  const projectMode = mesh.parts.length >= 2

  // --- Tema (açık / koyu) ---
  // next-themes yerine düz DOM + localStorage: aynı kod hem bu uygulamada hem GitHub sürümünde çalışır.
  const [theme, setThemeState] = useState<'light' | 'dark'>('dark')
  useEffect(() => {
    const stored = (localStorage.getItem(LS + 'theme') ?? 'dark').replace(/"/g, '') === 'light' ? 'light' : 'dark'
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
  /** "Yazıcı ekle" şablonları: aktif liste, eklenenler ve tüm katalog (150+ profil) */
  const templatePrinters = useMemo<PrinterProfile[]>(() => {
    const seen = new Set(printers.map((p) => p.id))
    return [...printers, ...ALL_PRINTERS.filter((p) => !seen.has(p.id))]
  }, [printers])
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
  /** "Malzeme ekle" şablonları: menüdekiler + eklenenler + tüm katalog */
  const materialTemplates = useMemo<Material[]>(() => { const seen = new Set(materials.map((m) => m.id)); return [...materials, ...ALL_MATERIALS.filter((m) => !seen.has(m.id))] }, [materials])
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
  // Kayıtlı yazıcı artık aktif listede değilse (katalog daraltıldı) sessizce A1'e düşmek yerine "eklediğim yazıcılar"a taşı;
  // böylece override/kalibrasyon kayıtları aynı kimlikle çalışmaya devam eder.
  useEffect(() => {
    if (printers.some((p) => p.id === printerId)) return
    const legacy = ALL_PRINTERS.find((p) => p.id === printerId)
    if (legacy) setCustomPrinters((list) => (list.some((x) => x.id === legacy.id) ? list : [...list, legacy]))
  }, [printerId, printers, setCustomPrinters])
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

  // Parçalar yüklendiğinde / yerleşim, katman, eşik değiştiğinde yeniden analiz (debounce). Her parça kendi anahtarıyla izlenir.
  const modelLoaded = !!active && active.loaded && active.model.positions.length > 0
  // 3MF proje dosyasındaki renk/ekstruder sayısını FDM parametresine uygula (dosya başına bir kez)
  const appliedHintFor = useRef<string | null>(null)
  useEffect(() => {
    const m = mesh.model
    if (!m || !modelLoaded || !m.colorHint || m.colorHint <= 1) return
    const key = m.fileName + ':' + m.fileSize
    if (appliedHintFor.current === key) return
    appliedHintFor.current = key
    setFdmParams((p) => ({ ...p, colorCount: Math.min(16, m.colorHint!) }))
  }, [mesh.model, modelLoaded, setFdmParams])
  const analysisKey = `${layerHeight}|${overhangThresholdDeg}|${manifoldCheck}|${thicknessCheck}`
  const analyzedKeys = useRef(new Map<string, string>())
  const { analyze: meshAnalyze } = mesh
  useEffect(() => {
    const keyOf = (p: { placement: Placement }) => `${analysisKey}|${p.placement.rotX},${p.placement.rotY},${p.placement.rotZ},${p.placement.unit},${p.placement.scalePct}`
    const ids = new Set(mesh.parts.map((p) => p.id))
    for (const k of [...analyzedKeys.current.keys()]) if (!ids.has(k)) analyzedKeys.current.delete(k)
    const todo = mesh.parts.filter((p) => p.loaded && p.model.positions.length > 0 && analyzedKeys.current.get(p.id) !== keyOf(p))
    if (todo.length === 0) return
    const timer = setTimeout(() => {
      for (const p of todo) {
        analyzedKeys.current.set(p.id, keyOf(p))
        meshAnalyze(p.id, { placement: p.placement, overhangThresholdDeg, layerHeight, manifoldCheck, thickness: thicknessCheck })
      }
    }, 120)
    return () => clearTimeout(timer)
  }, [mesh.parts, analysisKey, overhangThresholdDeg, layerHeight, manifoldCheck, thicknessCheck, meshAnalyze])

  const { loadFile } = mesh
  /** Etkin parçanın yerine yükle (tek modelli akış) */
  const onFile = useCallback(async (file: File) => {
    setSlicerData(null); setUseSlicer(false); setCalibAdded(false)
    await loadFile(file, { quantity: Math.max(1, Math.floor(settings.quantity)) })
  }, [loadFile, settings.quantity])
  /** Projeye yeni parça ekle */
  const onAddPart = useCallback(async (file: File) => {
    setSlicerData(null); setUseSlicer(false); setCalibAdded(false)
    await loadFile(file, { add: true, quantity: 1 })
  }, [loadFile])

  const stats = mesh.analysis.stats
  // Adet etkin parçaya aittir; ayarlardaki adet yeni yüklenen dosyanın varsayılanıdır
  const qty = Math.max(1, Math.floor(active?.quantity ?? settings.quantity))
  const settingsQ = useMemo<BusinessSettings>(() => (settings.quantity === qty ? settings : { ...settings, quantity: qty }), [settings, qty])
  const { setQuantity: meshSetQuantity } = mesh
  const setQty = useCallback((v: number) => {
    const q = Math.min(MAX_QUANTITY, Math.max(1, Math.round(v)))
    if (activeId) meshSetQuantity(activeId, q)
    setSettings((st) => ({ ...st, quantity: q }))
  }, [activeId, meshSetQuantity, setSettings])
  // Duvar kalınlığı: FDM eşiği 2 hat genişliği (en az 0.8 mm), reçine 0.6 mm
  const thinThreshold = printer.tech === 'fdm' ? Math.max(0.8, 2 * fdmParams.lineWidth) : 0.6
  const thickness = mesh.analysis.thickness
  const thinness = useMemo(() => (thickness && !thickness.skipped && thickness.sampleCount > 0 ? { fraction: thinFraction(thickness, thinThreshold), thresholdMm: thinThreshold, p5: thickness.p5 } : null), [thickness, thinThreshold])
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
      ? estimateFdm({ stats, printer, material, settings: settingsQ, params: fdmParams, thinness }, t)
      : estimateResin({ stats, printer, material, settings: settingsQ, params: resinParams, thinness }, t)
  }, [stats, printer, material, settingsQ, fdmParams, resinParams, t, thinness])
  const estimate = useMemo<Estimate | null>(() => {
    if (!stats || !material) return null
    if (!slicerOverride && (!calibration || calibration.samples === 0)) return modelEstimate
    return printer.tech === 'fdm'
      ? estimateFdm({ stats, printer, material, settings: settingsQ, params: fdmParams, slicer: slicerOverride, calibration, thinness }, t)
      : estimateResin({ stats, printer, material, settings: settingsQ, params: resinParams, calibration, thinness }, t)
  }, [stats, printer, material, settingsQ, fdmParams, resinParams, t, slicerOverride, calibration, modelEstimate, thinness])
  // Çok parçalı proje tahmini: analizi bitmiş tüm parçalar, aynı yazıcı/malzeme, karışık tablalar
  const projectParts = useMemo<ProjectPart[]>(() => mesh.parts.filter((p) => p.analysis.stats).map((p) => ({ id: p.id, name: p.model.fileName, stats: p.analysis.stats!, quantity: p.quantity })), [mesh.parts])
  const projectEstimate = useMemo<ProjectEstimate | null>(() => {
    if (!projectMode || projectParts.length === 0 || !material) return null
    return estimateProject({ parts: projectParts, printer, material, settings, fdmParams, resinParams, calibration }, t)
  }, [projectMode, projectParts, printer, material, settings, fdmParams, resinParams, calibration, t])
  /** Ekranda gösterilen tahmin: proje modunda proje, aksi halde etkin parça */
  const shownEstimate: Estimate | null = projectMode ? projectEstimate : estimate
  const projectFileName = useMemo(() => (projectMode ? t('pdf.projectModel', { n: mesh.parts.length, names: mesh.parts.map((p) => p.model.fileName).join(', ') }) : (mesh.model?.fileName ?? '')), [projectMode, mesh.parts, mesh.model, t])
  // Adet fiyat merdiveni: 1 / 10 / 50 / 100 (+ mevcut adet)
  const ladder = useMemo(() => {
    if (!stats || !material || projectMode) return []
    const qtys = [...new Set([1, 10, 50, 100, qty])].sort((a, b) => a - b)
    return qtys.map((q) => {
      const s = { ...settings, quantity: q }
      const e = printer.tech === 'fdm'
        ? estimateFdm({ stats, printer, material, settings: s, params: fdmParams, slicer: slicerOverride, calibration }, t)
        : estimateResin({ stats, printer, material, settings: s, params: resinParams, calibration }, t)
      return { qty: q, unit: e.perUnit.price, total: e.total.price }
    })
  }, [stats, printer, material, settings, qty, projectMode, fdmParams, resinParams, t, slicerOverride, calibration])
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
    // Aktif liste (atölyedeki yazıcılar) + eklediğiniz yazıcılar
    return printers.map((p) => {
      const mats = materials.filter((m) => m.tech === p.tech)
      const m = p.tech === printer.tech && material ? material : mats[0]
      // Seçili yazıcının satırı ana panelle aynı girdileri (kalibrasyon, dilimleyici, ince duvar) alır
      const sel = p.id === printer.id
      const est: Estimate = projectMode && projectParts.length > 0
        ? estimateProject({ parts: projectParts, printer: p, material: m, settings, fdmParams, resinParams, calibration: sel ? calibration : null }, t)
        : p.tech === 'fdm'
          ? estimateFdm({ stats, printer: p, material: m, settings: settingsQ, params: fdmParams, slicer: sel ? slicerOverride : null, calibration: sel ? calibration : null, thinness: sel ? thinness : null }, t)
          : estimateResin({ stats, printer: p, material: m, settings: settingsQ, params: resinParams, calibration: sel ? calibration : null, thinness: sel ? thinness : null }, t)
      return { printer: p, material: m, est }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats, printers, materials, printer.id, printer.tech, material, settingsQ, settings, fdmParams, resinParams, t, projectMode, projectParts, calibration, slicerOverride, thinness])

  const fits = projectMode ? (projectEstimate ? projectEstimate.fitsRotated : true) : stats ? checkFit(stats, printer).fits : true
  const layout = useMemo(() => {
    if (!stats) return null
    const spacing = printer.tech === 'fdm' ? settings.fdmPartSpacingMm : resinSpacing(stats, settings.resinPartSpacingMm)
    return plateLayout(stats, printer, spacing, settings.plateMarginMm)
  }, [stats, printer, settings.fdmPartSpacingMm, settings.resinPartSpacingMm, settings.plateMarginMm])
  const bedForViewer = useMemo(() => ({ x: printer.bed.x, y: printer.bed.y, z: printer.bed.z }), [printer])
  // 3B sahne: proje modunda seçili tabladaki tüm parçalar, tek modelde etkin parça + ızgara kopyaları
  const thinMasks = useMemo(() => new Map(mesh.parts.map((p) => {
    const th = p.analysis.thickness, st = p.analysis.stats
    return [p.id, th && !th.skipped && st ? buildThinMask(th, thinThreshold, st.triangleCount) : null] as const
  })), [mesh.parts, thinThreshold])
  const plates = useMemo(() => projectEstimate?.project.plates ?? [], [projectEstimate])
  const plateIdx = plates.length > 0 ? Math.min(plateIndex, plates.length - 1) : 0
  useEffect(() => { if (plateIndex !== plateIdx) setPlateIndex(plateIdx) }, [plateIndex, plateIdx])
  const viewerParts = useMemo<ViewerPart[]>(() => (projectMode ? mesh.parts : active ? [active] : [])
    .filter((p) => p.loaded && p.model.positions.length > 0)
    .map((p) => ({
      key: p.id, positions: p.model.positions, placement: p.analysis.stats ? p.analysis.placement : p.placement,
      bboxMin: p.analysis.stats?.min ?? null, bboxMax: p.analysis.stats?.max ?? null,
      overhangMask: p.analysis.overhangMask, thinMask: thinMasks.get(p.id) ?? null, active: p.id === activeId,
    })), [projectMode, mesh.parts, active, thinMasks, activeId])
  const viewerInstances = useMemo<ViewerInstance[]>(() => {
    if (projectMode) {
      const plate = plates[plateIdx]
      if (!plate || !projectEstimate) return viewerParts.map((_, i) => ({ part: i, x: bedForViewer.x / 2, y: bedForViewer.y / 2, rotated: false })).slice(0, 0)
      const idx = new Map(viewerParts.map((p, i) => [p.key, i]))
      return packedInstances(plate, projectEstimate.project.margin).filter((i) => idx.has(i.key)).map((i) => ({ part: idx.get(i.key)!, x: i.x, y: i.y, rotated: i.rotated }))
    }
    if (!stats || !layout || layout.capacity === 0) return [{ part: 0, x: bedForViewer.x / 2, y: bedForViewer.y / 2, rotated: false }]
    return gridInstances(layout, Math.min(qty, MAX_INSTANCES), bedForViewer).map((g) => ({ part: 0, ...g }))
  }, [projectMode, plates, plateIdx, projectEstimate, viewerParts, stats, layout, qty, bedForViewer])
  const busyLabel = mesh.busy === 'reading' ? t('busy.reading') : mesh.busy === 'parsing' ? t('busy.parsing') : mesh.busy === 'analyzing' ? t('busy.analyzing') : ''

  /** Teklifi geçmişe (IndexedDB) yazar; müşteri adı varsa kartı oluşturur/bağlar. Hata sessizce yutulur (konsola). */
  const persistQuote = useCallback(async (pricing: QuotePricing, quoteNo: string): Promise<boolean> => {
    if (!shownEstimate || !material || !historyAvailable()) return false
    try {
      const cust = await upsertCustomerByName(customer)
      const partList = projectMode && projectEstimate
        ? projectEstimate.project.parts.filter((p) => p.placed > 0).map((p) => ({ name: p.name, quantity: p.placed, size: projectParts.find((x) => x.id === p.id)!.stats.size }))
        : stats ? [{ name: mesh.model?.fileName ?? '', quantity: qty, size: stats.size }] : []
      const thumb = modelImage ? await makeThumb(modelImage.dataUrl) : null
      const rec = buildQuoteRecord({ est: shownEstimate, pricing, settings, printer, material, fileName: projectFileName, customer, customerId: cust?.id ?? null, size: stats ? stats.size : { x: 0, y: 0, z: 0 }, parts: partList, quoteNo, thumb })
      await saveQuote(rec)
      return true
    } catch (e) { console.warn('quote history save failed', e); return false }
  }, [shownEstimate, material, customer, projectMode, projectEstimate, projectParts, stats, mesh.model, qty, modelImage, settings, printer, projectFileName])
  const cmpQty = shownEstimate?.quantity ?? qty
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
            <Button onClick={() => setHistoryOpen(true)} ariaLabel={t('history.buttonAria')} title={t('history.title')}>{t('history.button')}</Button>
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
              <Card title={t('project.title', { n: mesh.parts.length })}>
                <ProjectPanel
                  parts={mesh.parts} activeId={activeId} onActive={mesh.setActive} onQuantity={(id, q) => { mesh.setQuantity(id, q); if (id === activeId) setSettings((st) => ({ ...st, quantity: q })) }}
                  onRemove={mesh.remove} onAdd={onAddPart} est={projectEstimate} settings={settings} plateIndex={plateIdx} onPlateIndex={setPlateIndex}
                />
              </Card>
              <Card title={projectMode ? `${t('cards.model')} · ${mesh.model.fileName}` : t('cards.model')}>
                <ModelPanel
                  model={mesh.model} stats={stats} placement={placement} onPlacement={setPlacement}
                  manifoldCheck={manifoldCheck} onManifoldCheck={setManifoldCheck} onClear={() => (projectMode && activeId ? mesh.remove(activeId) : mesh.clear())}
                  thicknessCheck={thicknessCheck} onThicknessCheck={setThicknessCheck} thickness={thickness} thinness={thinness}
                />
              </Card>
              <FileDrop onFile={onFile} compact />
              {projectMode ? (
                <p className="text-[11px] text-zinc-500">{t('project.slicerHidden')}</p>
              ) : (
                <Card title={t('slicer.title')}>
                  <SlicerImport
                    material={material ?? null} data={slicerData} partsInFile={partsInFile} useIt={useSlicer} modelEstimate={modelEstimate}
                    onData={(d) => { setSlicerData(d); setCalibAdded(false); setUseSlicer(!!d && d.printTimeSec != null && d.filamentGrams != null) }}
                    onPartsInFile={(n) => { setPartsInFile(n); setCalibAdded(false) }} onUse={setUseSlicer}
                    onAddCalibration={addCalibrationFromSlicer} calibAdded={calibAdded}
                  />
                </Card>
              )}
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
              {!projectMode && <Field label={t('fields.quantity')}><NumberInput value={qty} onChange={setQty} min={1} max={MAX_QUANTITY} step={1} /></Field>}
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
            <Viewer3D parts={viewerParts} instances={viewerInstances} bed={bedForViewer} fits={fits} captureRef={captureRef} ariaLabel={t('viewer.aria', { printer: `${printer.brand} ${printer.name}`, n: viewerInstances.length })} />
            <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-zinc-950/70 px-2 py-1 text-[11px] text-zinc-400">
              {printer.brand} {printer.name} · {t('viewer.bed')} {printer.bed.x}×{printer.bed.y}×{printer.bed.z} mm
              {stats && !fits && <span className="ml-2 text-red-300">{t('viewer.notFit')}</span>}
              {projectMode && plates.length > 0 && (
                <span className="ml-2 text-emerald-300">{t('viewer.plateOf', { i: plateIdx + 1, n: plates.length })} · {t('viewer.projectShowing', { parts: Object.keys(plates[plateIdx].counts).length, inst: plates[plateIdx].partCount })}</span>
              )}
              {!projectMode && stats && layout && layout.capacity > 0 && qty > 1 && (
                <span className={`ml-2 ${qty > layout.capacity ? 'text-amber-300' : 'text-emerald-300'}`}>
                  {t('viewer.showing', { shown: Math.min(qty, layout.capacity), qty, cols: layout.cols, rows: layout.rows, rot: layout.rotated ? t('viewer.rotated90') : '' })}
                  {qty > layout.capacity && t('viewer.platesNeeded', { n: Math.ceil(qty / layout.capacity) })}
                </span>
              )}
            </div>
            {!projectMode && stats && layout && qty > layout.capacity && layout.capacity > 0 && (
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
                      <th className="py-1 pr-2 text-right">{t('compare.gramPer')}</th><th className="py-1 pr-2 text-right">{cmpQty > 1 ? t('compare.totalTime') : t('compare.time')}</th>
                      {cmpQty > 1 && <th className="py-1 pr-2 text-right">{t('compare.plate')}</th>}
                      <th className="py-1 pr-2 text-right">{t('compare.pricePer')}</th>
                      {cmpQty > 1 && <th className="py-1 text-right">{t('compare.total', { qty: cmpQty })}</th>}
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
                        {cmpQty > 1 && <td className="py-1.5 pr-2 text-right tabular-nums text-xs text-zinc-400">{est.plates} × {est.partsPerPlate}</td>}
                        <td className="py-1.5 pr-2 text-right tabular-nums">{fmtMoney(est.perUnit.price, settings, 0)}</td>
                        {cmpQty > 1 && <td className="py-1.5 text-right font-semibold tabular-nums">{fmtMoney(est.total.price, settings, 0)}</td>}
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
          <Card title={t('cards.priceEstimate')} right={shownEstimate && (
            <div className="flex gap-1">
              <Button variant="ghost" onClick={() => window.print()} ariaLabel={t('actions.printAria')} title={t('actions.printTitle')}>{t('actions.print')}</Button>
              <Button variant="primary" ariaLabel={t('actions.quotePdfAria')} title={t('actions.quotePdfTitle')} onClick={async () => {
                setPdfError(null)
                const url = captureRef.current?.()
                if (url) { try { const { w, h } = await imageSize(url); setModelImage({ dataUrl: url, w, h }) } catch { setModelImage(null) } } else setModelImage(null)
                savedQuoteNo.current = null
                setQuoteOpen(true)
              }}>{t('actions.quotePdf')}</Button>
            </div>
          )}>
            {shownEstimate && material ? (
              <ResultsPanel est={shownEstimate} printer={printer} material={material} settings={settings} calibSamples={calibration?.samples} ladder={ladder} />
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

      {shownEstimate && material && quoteOpen && (
        <QuoteDialog
          onSave={async (pricing: QuotePricing) => {
            const quoteNo = savedQuoteNo.current ?? makeQuoteNo()
            const ok = await persistQuote(pricing, quoteNo)
            if (ok) savedQuoteNo.current = quoteNo
            return ok ? quoteNo : null
          }}
          open={quoteOpen} est={shownEstimate} settings={settings}
          customer={customer} onCustomer={setCustomer}
          logo={logo} onLogo={setLogo} modelImage={modelImage}
          share={{ printer, material, fileName: projectFileName, size: stats ? stats.size : { x: 0, y: 0, z: 0 } }}
          busy={pdfBusy} error={pdfError}
          onClose={() => setQuoteOpen(false)}
          onGenerate={async (pricing: QuotePricing, includeProduction: boolean) => {
            const pdfStats = stats ?? projectParts[0]?.stats
            if (!pdfStats || !mesh.model) return
            setPdfBusy(true); setPdfError(null)
            try {
              const parts = projectMode && projectEstimate
                ? projectEstimate.project.parts.filter((p) => p.placed > 0).map((p) => ({ name: p.name, quantity: p.placed, size: projectParts.find((x) => x.id === p.id)!.stats.size, unitPrice: p.unitPrice, total: p.price }))
                : undefined
              const quoteNo = savedQuoteNo.current ?? makeQuoteNo()
              await downloadQuotePdf({ est: shownEstimate, stats: pdfStats, printer, material, settings, fdmParams, resinParams, placement, fileName: projectFileName, triangleCount: mesh.model.triangleCount, customer, pricing, logo, modelImage, includeProduction, parts, quoteNo }, t)
              void persistQuote(pricing, quoteNo).then((ok) => { if (ok) savedQuoteNo.current = quoteNo })
              setQuoteOpen(false)
            } catch (e) {
              setPdfError(e instanceof Error ? e.message : String(e))
            } finally { setPdfBusy(false) }
          }}
        />
      )}
      <PwaToast />
      {quotaError && (
        <div role="alert" className="fixed bottom-4 left-4 z-50 flex max-w-md items-start gap-3 rounded-xl border border-amber-800 bg-amber-950/95 px-4 py-3 text-sm text-amber-100 shadow-2xl backdrop-blur">
          <span>⚠ {t('storage.quota')}</span>
          <Button variant="ghost" onClick={() => setQuotaError(false)} ariaLabel={t('share.close')}>✕</Button>
        </div>
      )}
      <HistoryDialog open={historyOpen} onClose={() => setHistoryOpen(false)} whatsappNumber={settings.whatsappNumber ?? ''} />
      {shared && <SharedQuoteView quote={shared} onClose={() => { setShared(null); history.replaceState(null, '', location.pathname + location.search) }} />}
      <PrinterEditor
        key={`printer-${editor.open ? (editor.printer?.id ?? 'new') : 'closed'}`}
        open={editor.open} initial={editor.printer} templates={templatePrinters}
        onSave={savePrinter} onDelete={deletePrinter} onClose={() => setEditor({ open: false, printer: null })}
      />
      <MaterialEditor
        key={`material-${matEditor.open ? (matEditor.material?.id ?? 'new') : 'closed'}`}
        open={matEditor.open} initial={matEditor.material} templates={materialTemplates} defaultTech={printer.tech}
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
