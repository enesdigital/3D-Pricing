import { analyzeMesh } from '../src/lib/mesh/analyze.ts'
import { estimateFdm, estimateResin } from '../src/lib/cost/engine.ts'
import { estimateProject } from '../src/lib/cost/project.ts'
import { packPlates } from '../src/lib/cost/pack.ts'
import { printerById } from '../src/data/printers.ts'
import { MATERIALS } from '../src/data/materials.ts'
import { DEFAULT_FDM_PARAMS, DEFAULT_RESIN_PARAMS, DEFAULT_SETTINGS } from '../src/data/defaults.ts'
import { makeSamplePawnStl } from '../src/lib/mesh/sample.ts'
import { parseStl } from '../src/lib/mesh/parseStl.ts'
import { tr } from '../src/lib/i18n/tr.ts'

const t = (key: string, params?: Record<string, string | number>) => {
  let cur: unknown = tr
  for (const p of key.split('.')) cur = cur && typeof cur === 'object' ? (cur as Record<string, unknown>)[p] : undefined
  const str = typeof cur === 'string' ? cur : key
  return params ? str.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : str
}
const assert = (c: boolean, msg: string) => { if (!c) { console.error('FAIL:', msg); process.exit(1) } }

// --- Paketleme: çakışma yok, tabla içinde, sayılar tutarlı
{
  const bed = { x: 256, y: 256, z: 256 }
  const r = packPlates([
    { key: 'a', w: 60, h: 40, z: 30, count: 12 },
    { key: 'b', w: 100, h: 100, z: 50, count: 3 },
    { key: 'c', w: 300, h: 20, z: 10, count: 2 }, // sığmaz
    { key: 'd', w: 250, h: 250, z: 10, count: 1 }, // yalnızca kenar payı ihlaliyle
  ], bed, 5, 5)
  let placed = 0
  for (const pl of r.plates) {
    for (const n of Object.values(pl.counts)) placed += n
    const it = pl.items
    for (let i = 0; i < it.length; i++) {
      const a = it[i]
      assert(a.x >= -5 - 1e-6 && a.y >= -5 - 1e-6 && a.x + a.w <= 256 - 5 + 1e-6 && a.y + a.h <= 256 - 5 + 1e-6, `tabla dışı: ${JSON.stringify(a)}`)
      for (let j = i + 1; j < it.length; j++) {
        const b = it[j]
        const overlap = a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6
        assert(!overlap, `çakışma: ${JSON.stringify(a)} / ${JSON.stringify(b)}`)
        // boşluk kontrolü (aynı eksende komşuysa ≥ spacing)
        const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w)), gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h))
        assert(Math.max(gapX, gapY) >= 5 - 1e-6, `boşluk < 5: ${JSON.stringify(a)} / ${JSON.stringify(b)}`)
      }
    }
  }
  assert(placed === 16, `yerleşen ${placed} ≠ 16`)
  assert(r.unplaced.c === 2, 'c sığmamalı')
  assert(r.marginViolated, 'd kenar payı ihlali bekleniyor')
  console.log(`pack: ${r.plates.length} tabla | yerleşen ${placed} | sığmayan ${JSON.stringify(r.unplaced)} | ilk tabla ${r.plates[0].items.length} kutu`)
}

// --- Yüksek adet: 2500 üstü ızgara kestirimi, toplam sayı korunur
{
  const r = packPlates([{ key: 'a', w: 20, h: 20, z: 10, count: 6000 }], { x: 256, y: 256, z: 256 }, 5, 5)
  const total = r.plates.reduce((s, p) => s + Object.values(p.counts).reduce((a, b) => a + b, 0), 0)
  assert(total === 6000, `yüksek adet toplam ${total}`)
  console.log(`pack 6000: ${r.plates.length} tabla (${r.plates.filter((p) => p.synthetic).length} sentetik)`)
}

// --- Proje vs tekli tahmin
const parsed = parseStl(await makeSamplePawnStl().arrayBuffer())
const { stats } = analyzeMesh(parsed.positions, { overhangThresholdDeg: 45, manifoldCheck: true, layerHeight: 0.2 })
const big = analyzeMesh(new Float32Array(parsed.positions.map((v) => v * 2)), { overhangThresholdDeg: 45, manifoldCheck: true, layerHeight: 0.2 }).stats
const a1 = printerById('bambu-a1-combo')!
const pla = MATERIALS.find((m) => m.id === 'bambu-pla-basic') ?? MATERIALS.find((m) => m.tech === 'fdm')!
for (const qty of [1, 7, 40]) {
  const single = estimateFdm({ stats, printer: a1, material: pla, settings: { ...DEFAULT_SETTINGS, quantity: qty }, params: DEFAULT_FDM_PARAMS }, t)
  const proj = estimateProject({ parts: [{ id: 'p', name: 'piyon.stl', stats, quantity: qty }], printer: a1, material: pla, settings: DEFAULT_SETTINGS, fdmParams: DEFAULT_FDM_PARAMS, resinParams: DEFAULT_RESIN_PARAMS }, t)
  const dPrice = Math.abs(proj.total.price - single.total.price) / single.total.price
  const dTime = Math.abs(proj.total.printTimeSec - single.total.printTimeSec) / single.total.printTimeSec
  console.log(`proje(1 parça×${qty}) vs tekli: fiyat ${proj.total.price.toFixed(0)} / ${single.total.price.toFixed(0)} (%${(dPrice * 100).toFixed(1)}) | süre %${(dTime * 100).toFixed(1)} | tabla ${proj.plates} / ${single.plates} | gram ${proj.total.materialGrams.toFixed(1)} / ${single.total.materialGrams.toFixed(1)}`)
  assert(proj.plates <= single.plates, 'MaxRects ızgaradan fazla tabla kullanmamalı')
  assert(dPrice < 0.08, `fiyat sapması yüksek %${(dPrice * 100).toFixed(1)}`)
  assert(Math.abs(proj.total.materialGrams - single.total.materialGrams) < 0.5 + 0.5 * proj.plates, 'gram uyumsuz')
  assert(proj.project.parts[0].placed === qty, 'yerleşen adet')
  assert(Math.abs(proj.project.parts[0].price - proj.total.price) < 1e-6, 'tek parçada fiyat tamamı parçaya düşmeli')
}
// Karışık FDM projesi
{
  const proj = estimateProject({ parts: [{ id: 'a', name: 'piyon.stl', stats, quantity: 5 }, { id: 'b', name: 'piyon-2x.stl', stats: big, quantity: 2 }], printer: a1, material: pla, settings: DEFAULT_SETTINGS, fdmParams: DEFAULT_FDM_PARAMS, resinParams: DEFAULT_RESIN_PARAMS }, t)
  const sa = estimateFdm({ stats, printer: a1, material: pla, settings: { ...DEFAULT_SETTINGS, quantity: 5 }, params: DEFAULT_FDM_PARAMS }, t)
  const sb = estimateFdm({ stats: big, printer: a1, material: pla, settings: { ...DEFAULT_SETTINGS, quantity: 2 }, params: DEFAULT_FDM_PARAMS }, t)
  console.log(`karışık FDM: ${proj.plates} tabla | toplam ${proj.total.price.toFixed(0)} ₺ (ayrı ayrı ${(sa.total.price + sb.total.price).toFixed(0)} ₺) | süre ${(proj.total.printTimeSec / 3600).toFixed(2)} sa (ayrı ${((sa.total.printTimeSec + sb.total.printTimeSec) / 3600).toFixed(2)} sa) | parça fiyatları ${proj.project.parts.map((p) => `${p.name}=${p.price.toFixed(0)}`).join(', ')} | uyarı ${proj.warnings.length}`)
  assert(Math.abs(proj.project.parts.reduce((s, p) => s + p.price, 0) - proj.total.price) < 1e-6, 'parça fiyatları toplamı')
  assert(proj.quantity === 7, 'adet 7')
  assert(proj.total.printTimeSec <= (sa.total.printTimeSec + sb.total.printTimeSec) * 1.03, 'birlikte basmak ayrı ayrıdan belirgin uzun olmamalı (travel payı ≤ %3)')
  assert(proj.project.plates.every((p) => p.timeSec > 0 && p.layerCount > 0), 'tabla planı')
}
// Reçine projesi: süre parça sayısından bağımsız, en yüksek parça belirler
{
  const j2 = printerById('elegoo-jupiter-2')!
  const resin = MATERIALS.find((m) => m.tech === 'resin')!
  const proj = estimateProject({ parts: [{ id: 'a', name: 'piyon.stl', stats, quantity: 10 }, { id: 'b', name: 'piyon-2x.stl', stats: big, quantity: 1 }], printer: j2, material: resin, settings: DEFAULT_SETTINGS, fdmParams: DEFAULT_FDM_PARAMS, resinParams: DEFAULT_RESIN_PARAMS }, t)
  const sb = estimateResin({ stats: big, printer: j2, material: resin, settings: { ...DEFAULT_SETTINGS, quantity: 1 }, params: DEFAULT_RESIN_PARAMS }, t)
  console.log(`reçine proje: ${proj.plates} tabla | süre ${(proj.total.printTimeSec / 3600).toFixed(2)} sa (büyük parça tek ${(sb.total.printTimeSec / 3600).toFixed(2)} sa) | ${proj.total.price.toFixed(0)} ₺ | katman ${proj.layerCount}`)
  console.log(`  parça boyutları: küçük ${stats.size.x.toFixed(0)}×${stats.size.y.toFixed(0)}×${stats.size.z.toFixed(0)} | büyük ${big.size.x.toFixed(0)}×${big.size.y.toFixed(0)}×${big.size.z.toFixed(0)} | tabla ${j2.bed.x}×${j2.bed.y} | tabla süreleri ${proj.project.plates.map((p) => (p.timeSec / 3600).toFixed(2)).join(', ')} sa`)
  assert(proj.plates <= 2, 'en fazla 2 tabla')
  const bigPlate = proj.project.plates.find((p) => p.counts.b)!
  assert(bigPlate.timeSec >= sb.total.printTimeSec - 1 && bigPlate.timeSec <= sb.total.printTimeSec * 1.35, 'büyük parçanın tablası: süre en yüksek parçaya bağlı, kaplama cezası ≤ %30')
}
// Sığmayan parça dışlanır, uyarı verilir
{
  const huge = analyzeMesh(new Float32Array(parsed.positions.map((v) => v * 10)), { overhangThresholdDeg: 45, manifoldCheck: false, layerHeight: 0.2 }).stats
  const proj = estimateProject({ parts: [{ id: 'a', name: 'piyon.stl', stats, quantity: 2 }, { id: 'h', name: 'dev.stl', stats: huge, quantity: 1 }], printer: a1, material: pla, settings: DEFAULT_SETTINGS, fdmParams: DEFAULT_FDM_PARAMS, resinParams: DEFAULT_RESIN_PARAMS }, t)
  assert(proj.project.unplaced === 1 && proj.quantity === 2, 'sığmayan dışlanmalı')
  assert(proj.warnings.some((w) => w.includes('dev.stl')), 'sığmama uyarısı')
  console.log(`sığmayan: ${proj.warnings[0]}`)
}
console.log('project: OK')
