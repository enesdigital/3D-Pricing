import * as THREE from 'three'
import { analyzeMesh, rotationMatrix } from '../src/lib/mesh/analyze.ts'
import { sliceLayers } from '../src/lib/mesh/slice.ts'
import { estimateFdm, estimateResin, formatDuration, plateLayout } from '../src/lib/cost/engine.ts'
import { printerById } from '../src/data/printers.ts'
import { MATERIALS } from '../src/data/materials.ts'
import { DEFAULT_FDM_PARAMS, DEFAULT_RESIN_PARAMS, DEFAULT_SETTINGS } from '../src/data/defaults.ts'
import { makeSamplePawnStl } from '../src/lib/mesh/sample.ts'
import { parseStl } from '../src/lib/mesh/parseStl.ts'
import { normalizeCustomPrinters } from '../src/lib/cost/normalize.ts'
import { tr } from '../src/lib/i18n/tr.ts'
// index.tsx Node'da yüklenemez (JSX); sözlük çözümleyici burada yinelenir
const t = (key: string, params?: Record<string, string | number>) => {
  let cur: unknown = tr
  for (const p of key.split('.')) cur = cur && typeof cur === 'object' ? (cur as Record<string, unknown>)[p] : undefined
  const str = typeof cur === 'string' ? cur : key
  return params ? str.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : str
}
const DEG = Math.PI / 180
// 3. Döndürme sırası: analyze R = Rz·Ry·Rx vs three Euler ZYX
{
  const p = { rotX: 90, rotY: 90, rotZ: 30, unit: 1, scalePct: 100 }
  const m = rotationMatrix(p)
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(90 * DEG, 90 * DEG, 30 * DEG, 'ZYX'))
  const v = new THREE.Vector3(0.3, -0.7, 1).applyQuaternion(q)
  const a = [m[0]*0.3 + m[1]*-0.7 + m[2]*1, m[3]*0.3 + m[4]*-0.7 + m[5]*1, m[6]*0.3 + m[7]*-0.7 + m[8]*1]
  console.log('rotasyon uyumu (fark):', Math.hypot(v.x - a[0], v.y - a[1], v.z - a[2]).toExponential(2))
}
// 2. Dilimleyici sırası bağımsızlığı
const parsed = parseStl(await makeSamplePawnStl().arrayBuffer())
const pos = parsed.positions
const shuffled = new Float32Array(pos.length)
{ const idx = [...Array(pos.length / 9).keys()].sort(() => Math.random() - 0.5); idx.forEach((src, dst) => shuffled.set(pos.subarray(src * 9, src * 9 + 9), dst * 9)) }
for (const scale of [1, 0.1, 0.05]) {
  const sp = new Float32Array(pos.map((v) => v * scale)), ss = new Float32Array(shuffled.map((v) => v * scale))
  const { stats: a } = analyzeMesh(sp, { overhangThresholdDeg: 45, manifoldCheck: false, layerHeight: 0.2 })
  const { stats: b } = analyzeMesh(ss, { overhangThresholdDeg: 45, manifoldCheck: false, layerHeight: 0.2 })
  console.log(`dilim ölçek ${scale}: hacim ${a.volume.toFixed(2)} | dilim-hacim orijinal ${a.layers.volume.toFixed(2)} karışık ${b.layers.volume.toFixed(2)} | fark %${(100 * Math.abs(a.layers.volume - b.layers.volume) / a.layers.volume).toFixed(3)} | analitik sapma %${(100 * Math.abs(a.layers.volume - a.volume) / a.volume).toFixed(2)}`)
}
// 1. layerHeight 0 → donmamalı
{ const t0 = performance.now(); const L = sliceLayers(pos, 0, 71, 0); console.log('lh=0:', L.layerCount, 'katman', L.layerHeight, 'mm,', (performance.now() - t0).toFixed(0), 'ms') }
{ const t0 = performance.now(); const L = sliceLayers(pos, 0, 71, NaN); console.log('lh=NaN:', L.layerCount, 'katman', (performance.now() - t0).toFixed(0), 'ms') }
const { stats } = analyzeMesh(pos, { overhangThresholdDeg: 45, manifoldCheck: true, layerHeight: 0.2 })
const A1 = printerById('bambu-a1-combo'), JUP = printerById('elegoo-jupiter-2')
const mat = MATERIALS.find((m) => m.id === 'pla-bambu')!
// 1b. engine lh 0
{ const e = estimateFdm({ stats, printer: A1, material: mat, settings: DEFAULT_SETTINGS, params: { ...DEFAULT_FDM_PARAMS, layerHeight: 0 } }, t); console.log('engine lh=0 fiyat:', e.perUnit.price.toFixed(2), 'katman', e.layerCount) }
// 5. büyük adet hızlı
{ const t0 = performance.now(); const e = estimateFdm({ stats, printer: A1, material: mat, settings: { ...DEFAULT_SETTINGS, quantity: 1e9 }, params: DEFAULT_FDM_PARAMS }, t); console.log('qty=1e9:', e.quantity, 'adet', e.plates, 'tabla', (performance.now() - t0).toFixed(0), 'ms, toplam', e.total.price.toFixed(0)) }
{ const e = estimateFdm({ stats, printer: A1, material: mat, settings: { ...DEFAULT_SETTINGS, quantity: Infinity }, params: DEFAULT_FDM_PARAMS }, t); console.log('qty=Inf:', e.quantity) }
// planPlates eşdeğerliği: 37 adet, kapasite 25 → 2 tabla (25 + 12)
{ const e = estimateFdm({ stats, printer: A1, material: mat, settings: { ...DEFAULT_SETTINGS, quantity: 37 }, params: DEFAULT_FDM_PARAMS }, t); console.log('qty=37: tabla', e.plates, 'ppp', e.partsPerPlate, 'süre', formatDuration(e.total.printTimeSec, t)) }
// 6. sıfır girişler
{ const e = estimateFdm({ stats, printer: { ...A1, lifetimeHours: 0 }, material: mat, settings: DEFAULT_SETTINGS, params: { ...DEFAULT_FDM_PARAMS, lineWidth: 0 } }, t); console.log('lineWidth=0, ömür=0:', Number.isFinite(e.perUnit.price) ? 'sonlu ' + e.perUnit.price.toFixed(0) : 'HATA ' + e.perUnit.price) }
// 4. eski özel yazıcı (nozul alanları yok)
{ const old = [{ id: 'custom-x', name: 'Eski', brand: 'X', tech: 'fdm', bed: { x: 200, y: 200, z: 200 }, priceTRY: 10000, lifetimeHours: 3000, maintenanceTRYPerHour: 1, spec: { tech: 'fdm', maxFlow: 20, efficiencyScale: 1, outerWallSpeed: 150, layerChangeSec: 1, jobOverheadSec: 100, jobWasteGrams: 1, colorChangeWasteGrams: 0.5, colorChangeTimeSec: 60, nozzleDiameter: 0.4, supportsMultiColor: true, avgPowerW: 100, heatupPowerW: 300 } }]
  const n = normalizeCustomPrinters(old, [])[0]; const e = estimateFdm({ stats, printer: n, material: mat, settings: DEFAULT_SETTINGS, params: { ...DEFAULT_FDM_PARAMS, colorCount: 2 } }, t)
  console.log('eski özel yazıcı: dualNozzle', (n.spec as any).dualNozzle, 'nozzleSwitchTimeSec', (n.spec as any).nozzleSwitchTimeSec, 'fiyat', e.perUnit.price.toFixed(0)) }
// 9. kenar payı ihlali: 256 mm plaka
{ const big = new Float32Array([0,0,0, 256,0,0, 256,256,0, 0,0,0, 256,256,0, 0,256,0, 0,0,5, 256,256,5, 256,0,5, 0,0,5, 0,256,5, 256,256,5])
  const { stats: bs } = analyzeMesh(big, { overhangThresholdDeg: 45, manifoldCheck: false, layerHeight: 0.2 })
  const l = plateLayout(bs, A1, 3, 3); const e = estimateFdm({ stats: bs, printer: A1, material: mat, settings: DEFAULT_SETTINGS, params: DEFAULT_FDM_PARAMS }, t)
  console.log('256mm plaka: kapasite', l.capacity, 'marginViolated', l.marginViolated, '| uyarılar:', e.warnings.map((w) => w.slice(0, 40))) }
// 10. süre
console.log('7199 s →', formatDuration(7199, t), '| 3599 s →', formatDuration(3599, t), '| 29 s →', formatDuration(29, t))
// reçine regresyon
{ const e = estimateResin({ stats, printer: JUP, material: MATERIALS.find((m) => m.id === 'resin-standard')!, settings: { ...DEFAULT_SETTINGS, quantity: 10 }, params: DEFAULT_RESIN_PARAMS }, t); console.log('reçine 10 adet:', formatDuration(e.total.printTimeSec, t), e.perUnit.price.toFixed(0), '₺/adet') }

// Sprint 2: kademeli indirim, teslim süresi, döviz
{
  const { fmtMoney, toDisplay, fromDisplay } = await import('../src/lib/cost/engine.ts')
  const e1 = estimateFdm({ stats, printer: A1, material: mat, settings: { ...DEFAULT_SETTINGS, quantity: 1 }, params: DEFAULT_FDM_PARAMS }, t)
  const e50 = estimateFdm({ stats, printer: A1, material: mat, settings: { ...DEFAULT_SETTINGS, quantity: 50 }, params: DEFAULT_FDM_PARAMS }, t)
  const e50n = estimateFdm({ stats, printer: A1, material: mat, settings: { ...DEFAULT_SETTINGS, quantity: 50, discountTiers: [] }, params: DEFAULT_FDM_PARAMS }, t)
  console.log('indirim: qty1', e1.discountPct, '| qty50', e50.discountPct, '| fiyat oranı (indirimli/indirimsiz)', (e50.total.price / e50n.total.price).toFixed(3), '| teslim qty1', e1.leadDays, 'gün, qty50', e50.leadDays, 'gün (2 yazıcı:', estimateFdm({ stats, printer: A1, material: mat, settings: { ...DEFAULT_SETTINGS, quantity: 50, printerCount: 2 }, params: DEFAULT_FDM_PARAMS }, t).leadDays, ')')
  const s = { displayCurrency: 'EUR' as const, fxRates: { EUR: 48, USD: 41, updatedAt: '2026-09-03' } }
  console.log('döviz: 480 ₺ →', fmtMoney(480, s), '| toDisplay', toDisplay(480, s), '| fromDisplay(10)', fromDisplay(10, s), '| TRY', fmtMoney(480, { displayCurrency: 'TRY', fxRates: s.fxRates }))
}
