import { useCallback, useEffect, useMemo, useState } from 'react'
import { PRINTERS } from './data/printers.ts'
import { MATERIALS } from './data/materials.ts'
import { DEFAULT_FDM_PARAMS, DEFAULT_RESIN_PARAMS, DEFAULT_SETTINGS } from './data/defaults.ts'
import { estimateFdm, estimateResin, checkFit } from './lib/cost/engine.ts'
import type { BusinessSettings, Estimate, FdmPrintParams, Material, PrinterProfile, ResinPrintParams } from './lib/cost/types.ts'
import { DEFAULT_PLACEMENT, type Placement } from './lib/mesh/types.ts'
import { useMeshWorker } from './lib/mesh/useMeshWorker.ts'
import { shallowMerge, useLocalStorage } from './lib/useLocalStorage.ts'
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
import { downloadQuotePdf } from './lib/pdf/quote.ts'

const LS = 'fdm-sla-calc:v1:'

export default function App() {
  // --- Kalıcı ayarlar ---
  const [settings, setSettings, resetSettings] = useLocalStorage<BusinessSettings>(LS + 'settings', DEFAULT_SETTINGS, shallowMerge)
  const [materialPrices, setMaterialPrices, resetMaterialPrices] = useLocalStorage<Record<string, number>>(LS + 'materialPrices', {})
  const [printerOverrides, setPrinterOverrides, resetPrinterOverrides] = useLocalStorage<Record<string, PrinterOverride>>(LS + 'printerOverrides', {})
  const [fdmParams, setFdmParams] = useLocalStorage<FdmPrintParams>(LS + 'fdmParams', DEFAULT_FDM_PARAMS, shallowMerge)
  const [resinParams, setResinParams] = useLocalStorage<ResinPrintParams>(LS + 'resinParams', DEFAULT_RESIN_PARAMS, shallowMerge)
  const [printerId, setPrinterId] = useLocalStorage<string>(LS + 'printerId', PRINTERS[0].id)
  const [materialId, setMaterialId] = useLocalStorage<string>(LS + 'materialId', MATERIALS[0].id)
  const [manifoldCheck, setManifoldCheck] = useLocalStorage<boolean>(LS + 'manifoldCheck', true)
  // Kullanıcının eklediği yazıcılar: yalnızca bu tarayıcıda (localStorage) saklanır
  const [customPrinters, setCustomPrinters] = useLocalStorage<PrinterProfile[]>(LS + 'customPrinters', [], (st, init) => (Array.isArray(st) ? (st as PrinterProfile[]) : init))
  const [customMaterials, setCustomMaterials] = useLocalStorage<Material[]>(LS + 'customMaterials', [], (st, init) => (Array.isArray(st) ? (st as Material[]) : init))

  // --- Oturum durumu ---
  const [placement, setPlacement] = useState<Placement>(DEFAULT_PLACEMENT)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editor, setEditor] = useState<{ open: boolean; printer: PrinterProfile | null }>({ open: false, printer: null })
  const [matEditor, setMatEditor] = useState<{ open: boolean; material: Material | null }>({ open: false, material: null })
  const [customer, setCustomer] = useState('')
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const mesh = useMeshWorker()

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
    if (printerId === id) setPrinterId(PRINTERS[0].id)
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
  const material = techMaterials.find((m) => m.id === materialId) ?? techMaterials[0]
  useEffect(() => { if (material && material.id !== materialId) setMaterialId(material.id) }, [material, materialId, setMaterialId])

  // Analiz parametreleri: yazıcı teknolojisine göre
  const layerHeight = printer.tech === 'fdm' ? fdmParams.layerHeight : resinParams.layerHeight
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
    await mesh.loadFile(file)
  }, [mesh])

  const stats = mesh.analysis.stats
  const estimate = useMemo<Estimate | null>(() => {
    if (!stats || !material) return null
    return printer.tech === 'fdm'
      ? estimateFdm({ stats, printer, material, settings, params: fdmParams })
      : estimateResin({ stats, printer, material, settings, params: resinParams })
  }, [stats, printer, material, settings, fdmParams, resinParams])

  // Tüm yazıcılar için hızlı karşılaştırma
  const comparison = useMemo(() => {
    if (!stats) return []
    return printers.map((p) => {
      const mats = materials.filter((m) => m.tech === p.tech)
      const m = p.tech === printer.tech && material ? material : mats[0]
      const est = p.tech === 'fdm'
        ? estimateFdm({ stats, printer: p, material: m, settings, params: fdmParams })
        : estimateResin({ stats, printer: p, material: m, settings, params: resinParams })
      return { printer: p, material: m, est }
    })
  }, [stats, printers, materials, printer.tech, material, settings, fdmParams, resinParams])

  const fits = stats ? checkFit(stats, printer).fits : true
  const bedForViewer = useMemo(() => ({ x: printer.bed.x, y: printer.bed.y, z: printer.bed.z }), [printer])
  const busyLabel = mesh.busy === 'reading' ? 'Dosya okunuyor' : mesh.busy === 'parsing' ? 'STL ayrıştırılıyor' : mesh.busy === 'analyzing' ? 'Geometri analiz ediliyor' : ''

  const resetAll = () => { resetSettings(); resetMaterialPrices(); resetPrinterOverrides() }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="flex w-full items-center justify-between gap-4 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-600 text-base font-bold">3D</div>
            <div>
              <h1 className="text-sm font-semibold leading-tight">FDM / SLA Baskı Fiyat Hesaplama</h1>
              <p className="text-[11px] text-zinc-500">STL yükle → yazıcı seç → maliyet ve satış fiyatını gör</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {busyLabel && (
              <div className="hidden items-center gap-2 text-xs text-zinc-400 sm:flex">
                <span className="h-2 w-2 animate-pulse rounded-full bg-sky-400" />
                {busyLabel} {Math.round(mesh.progress * 100)}%
              </div>
            )}
            <Button onClick={() => setSettingsOpen(true)}>⚙ Ayarlar</Button>
          </div>
        </div>
        {mesh.busy !== 'idle' && (
          <div className="h-0.5 w-full bg-zinc-800"><div className="h-full bg-sky-500 transition-[width]" style={{ width: `${Math.round(mesh.progress * 100)}%` }} /></div>
        )}
      </header>

      <main className="grid w-full flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[340px_minmax(0,1fr)_400px] 2xl:grid-cols-[380px_minmax(0,1fr)_460px]">
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
            </>
          )}
          {mesh.error && <div className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">{mesh.error}</div>}

          <Card title="Yazıcı ve malzeme">
            <div className="space-y-3">
              <Field label="Yazıcı">
                <Select value={printer.id} onChange={setPrinterId} options={printers.map((p) => ({ value: p.id, label: `${isCustom(p.id) ? '★ ' : ''}${p.brand} ${p.name} · ${p.tech === 'fdm' ? 'FDM' : 'Reçine'} · ${p.bed.x}×${p.bed.y}×${p.bed.z} mm` }))} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setEditor({ open: true, printer: null })}>+ Yazıcı ekle</Button>
                {isCustom(printer.id) && <Button variant="ghost" onClick={() => setEditor({ open: true, printer })}>Düzenle / Sil</Button>}
              </div>
              {printer.notes && <p className="text-[11px] leading-snug text-zinc-500">{printer.notes}</p>}
              <Field label="Malzeme">
                <Select value={material?.id ?? ''} onChange={setMaterialId} options={techMaterials.map((m) => ({ value: m.id, label: `${isCustomMaterial(m.id) ? '★ ' : ''}${m.name} · ${m.pricePerKgTRY.toLocaleString('tr-TR')} ₺/kg` }))} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => setMatEditor({ open: true, material: null })}>+ Malzeme ekle</Button>
                {material && isCustomMaterial(material.id) && <Button variant="ghost" onClick={() => setMatEditor({ open: true, material })}>Düzenle / Sil</Button>}
              </div>
              <Field label="Adet"><NumberInput value={settings.quantity} onChange={(v) => setSettings({ ...settings, quantity: Math.max(1, Math.round(v)) })} min={1} step={1} /></Field>
            </div>
          </Card>

          <Card title={printer.tech === 'fdm' ? 'Baskı ayarları (FDM)' : 'Baskı ayarları (Reçine)'}>
            {printer.tech === 'fdm'
              ? <FdmParamsPanel params={fdmParams} onChange={setFdmParams} printer={printer} />
              : <ResinParamsPanel params={resinParams} onChange={setResinParams} />}
          </Card>
        </div>

        {/* Orta: 3B görünüm */}
        <div className="flex min-h-[520px] flex-col gap-4 lg:min-h-[calc(100vh-7rem)]">
          <div className="relative flex-1 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
            <Viewer3D
              positions={modelLoaded ? mesh.model!.positions : null}
              overhangMask={mesh.analysis.overhangMask}
              placement={placement}
              bboxMin={stats?.min ?? null}
              bboxMax={stats?.max ?? null}
              bed={bedForViewer}
              fits={fits}
            />
            <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-zinc-950/70 px-2 py-1 text-[11px] text-zinc-400">
              {printer.brand} {printer.name} · tabla {printer.bed.x}×{printer.bed.y}×{printer.bed.z} mm
              {stats && !fits && <span className="ml-2 text-red-300">— model sığmıyor</span>}
            </div>
            {!modelLoaded && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-zinc-600">
                Model yüklendiğinde burada görünecek · sürükle: döndür · tekerlek: yakınlaştır
              </div>
            )}
          </div>

          {comparison.length > 0 && (
            <Card title="Yazıcı karşılaştırması">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-[11px] uppercase text-zinc-500">
                    <tr>
                      <th className="py-1 pr-2">Yazıcı</th><th className="py-1 pr-2">Malzeme</th>
                      <th className="py-1 pr-2 text-right">Gram/adet</th><th className="py-1 pr-2 text-right">{settings.quantity > 1 ? 'Toplam süre' : 'Süre'}</th>
                      {settings.quantity > 1 && <th className="py-1 pr-2 text-right">Tabla</th>}
                      <th className="py-1 pr-2 text-right">Fiyat/adet</th>
                      {settings.quantity > 1 && <th className="py-1 text-right">Toplam ({settings.quantity} adet)</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {comparison.map(({ printer: p, material: m, est }) => (
                      <tr key={p.id} className={`border-t border-zinc-800 ${p.id === printer.id ? 'bg-sky-950/30' : ''} ${!est.fitsRotated ? 'opacity-50' : ''}`}>
                        <td className="py-1.5 pr-2 whitespace-nowrap">
                          <button className="text-left hover:text-sky-300" onClick={() => setPrinterId(p.id)}>{p.brand} {p.name}</button>
                          {!est.fitsRotated && <span className="ml-1 text-[11px] text-red-300">sığmaz</span>}
                        </td>
                        <td className="py-1.5 pr-2 text-xs text-zinc-400">{m.name}</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{est.perUnit.materialGrams.toFixed(0)} g</td>
                        <td className="py-1.5 pr-2 text-right tabular-nums">{fmtDur(est.total.printTimeSec)}</td>
                        {settings.quantity > 1 && <td className="py-1.5 pr-2 text-right tabular-nums text-xs text-zinc-400">{est.plates} × {est.partsPerPlate}</td>}
                        <td className="py-1.5 pr-2 text-right tabular-nums">{est.perUnit.price.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺</td>
                        {settings.quantity > 1 && <td className="py-1.5 text-right font-semibold tabular-nums">{est.total.price.toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺</td>}
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
          <Card title="Fiyat tahmini" right={estimate && (
            <div className="flex gap-1">
              <Button variant="ghost" onClick={() => window.print()}>🖨 Yazdır</Button>
              <Button variant="primary" disabled={pdfBusy} onClick={async () => {
                if (!estimate || !stats || !material || !mesh.model) return
                setPdfBusy(true); setPdfError(null)
                try {
                  await downloadQuotePdf({ est: estimate, stats, printer, material, settings, fdmParams, resinParams, placement, fileName: mesh.model.fileName, triangleCount: mesh.model.triangleCount, customer })
                } catch (e) {
                  setPdfError(e instanceof Error ? e.message : String(e))
                } finally { setPdfBusy(false) }
              }}>{pdfBusy ? 'Hazırlanıyor…' : '⬇ PDF indir'}</Button>
            </div>
          )}>
            {estimate && material ? (
              <>
                <div className="mb-3 flex items-center gap-2">
                  <input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Müşteri adı (teklif PDF'i için, isteğe bağlı)" className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm outline-none focus:border-sky-500" />
                </div>
                {pdfError && <div className="mb-3 rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-xs text-red-200">PDF oluşturulamadı: {pdfError}</div>}
                <ResultsPanel est={estimate} printer={printer} material={material} settings={settings} />
              </>
            ) : (
              <div className="text-sm text-zinc-500">
                {mesh.error ? (
                  <p className="text-red-300">Hesaplama yapılamadı: {mesh.error}</p>
                ) : mesh.model ? (
                  <>
                    <p>{busyLabel || 'Hesaplanıyor'}… {mesh.busy !== 'idle' && `${Math.round(mesh.progress * 100)}%`}</p>
                    <p className="mt-1 text-[11px]">Büyük dosyalarda bu adım birkaç saniye sürebilir.</p>
                  </>
                ) : 'Bir STL dosyası yükleyin.'}
              </div>
            )}
          </Card>
          <Card title="Nasıl hesaplanıyor?">
            <ul className="list-disc space-y-1 pl-4 text-[12px] leading-snug text-zinc-400">
              <li><b>Geometri:</b> STL üçgenlerinden hacim (işaretli tetrahedron toplamı), yüzey alanı, sarkma yüzeyleri ve katman katman kesit/çevre hesaplanır.</li>
              <li><b>FDM malzeme:</b> duvar (çevre × duvar kalınlığı) + üst/alt kabuk + dolgu (%) + destek sütunları + purge/flush israfı.</li>
              <li><b>FDM süre:</b> katman bazlı hacim ÷ efektif akış (makine ve malzeme tavanı × geometri karmaşıklığı), min. katman süresi, katman geçişi, ısınma/kalibrasyon ve renk değişimleri.</li>
              <li><b>Reçine:</b> hacim (+destek, +boşaltma) × yoğunluk; süre = katman × (pozlama + kaldırma döngüsü).</li>
              <li><b>Maliyet:</b> malzeme + elektrik + amortisman + bakım + işçilik + başarısızlık riski → kâr marjı → KDV.</li>
              <li>Tahminler dilimleyici yerine geçmez; Ayarlar › Süre kalibrasyonu ile kendi sonuçlarınıza göre ayarlayın.</li>
            </ul>
          </Card>
        </div>
      </main>

      <footer className="border-t border-zinc-800 px-4 py-3 text-center text-[11px] text-zinc-600">
        Tüm hesaplamalar tarayıcınızda yapılır; dosyalar sunucuya gönderilmez. Fiyat verileri Eylül 2026 Türkiye perakende referanslıdır.
      </footer>

      <PrinterEditor
        key={editor.open ? (editor.printer?.id ?? 'new') : 'closed'}
        open={editor.open} initial={editor.printer} templates={printers}
        onSave={savePrinter} onDelete={deletePrinter} onClose={() => setEditor({ open: false, printer: null })}
      />
      <MaterialEditor
        key={matEditor.open ? (matEditor.material?.id ?? 'new') : 'closed'}
        open={matEditor.open} initial={matEditor.material} templates={materials} defaultTech={printer.tech}
        onSave={saveMaterial} onDelete={deleteMaterial} onClose={() => setMatEditor({ open: false, material: null })}
      />
      <SettingsDialog
        open={settingsOpen} onClose={() => setSettingsOpen(false)}
        settings={settings} onSettings={setSettings}
        materials={MATERIALS} materialPrices={materialPrices} onMaterialPrice={(id, price) => setMaterialPrices({ ...materialPrices, [id]: price })}
        printers={PRINTERS} printerOverrides={printerOverrides} onPrinterOverride={(id, o) => setPrinterOverrides({ ...printerOverrides, [id]: o })}
        onReset={resetAll}
      />
    </div>
  )
}

function fmtDur(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60)
  return h ? `${h}s ${m}d` : `${m} dk`
}
