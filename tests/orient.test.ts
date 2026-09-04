import { rankOrientations, quickMetrics } from '../src/lib/mesh/orient.ts'
import { analyzeMesh, transformPositions } from '../src/lib/mesh/analyze.ts'
import { recommendedExposure, classifyResin } from '../src/data/resinExposure.ts'
import { printerById } from '../src/data/printers.ts'
import { MATERIALS } from '../src/data/materials.ts'
import { makeSamplePawnStl } from '../src/lib/mesh/sample.ts'
import { parseStl } from '../src/lib/mesh/parseStl.ts'
import { DEFAULT_PLACEMENT } from '../src/lib/mesh/types.ts'
const assert = (c: boolean, msg: string) => { if (!c) { console.error('FAIL:', msg); process.exit(1) } }

// T şeklinde bir parça: ters (kol altta) konumda ağır sarkma, doğru konumda yok
function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number[] {
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]
  return f.flatMap((t) => t.flatMap((i) => v[i]))
}
// Kol yukarıda (mantar): gövde 10×10×30, kol 40×10×5 üstte → ters çevrilince kol altta olur ve gövde altında boşluk kalmaz; kol üstteyken kolun altı sarkar
const T = new Float32Array([...box(15, 0, 0, 25, 10, 30), ...box(0, 0, 30, 40, 10, 35)])
const m0 = quickMetrics(T, 45)
const m180 = quickMetrics(transformPositions(T, { ...DEFAULT_PLACEMENT, rotX: 180 }), 45)
console.log(`T: dik sarkma ${m0.overhangArea.toFixed(0)} mm² destek ${(m0.supportColumnVolume / 1000).toFixed(1)} cm³ | ters sarkma ${m180.overhangArea.toFixed(0)} mm² destek ${(m180.supportColumnVolume / 1000).toFixed(1)} cm³`)
// Kutular birleştirilmediği için ters konumda gövde–kol arasındaki iç yüz (100 mm²) sarkma sayılır; gerçek sarkma yok
assert(m0.overhangArea > 250 && m180.overhangArea <= 100 && m180.supportColumnVolume < m0.supportColumnVolume / 10, 'T parçası: kol üstteyken sarkma var, ters çevrilince yok')
const ranked = rankOrientations(T, { overhangThresholdDeg: 45, tech: 'fdm', placement: DEFAULT_PLACEMENT })
assert(ranked[0].supportColumnVolume <= 600 && ranked[0].overhangArea <= 100, 'en iyi aday desteksiz olmalı')
assert(ranked.length >= 4 && ranked.every((c, i) => i === 0 || c.score >= ranked[i - 1].score), 'adaylar puan sırasında ve tekilleştirilmiş')
console.log(`orient: ${ranked.length} aday | en iyi X${ranked[0].rotX} Y${ranked[0].rotY} (yükseklik ${ranked[0].height} mm, tabla ${ranked[0].bedContactArea.toFixed(0)} mm²) | en kötü X${ranked.at(-1)!.rotX} Y${ranked.at(-1)!.rotY}`)

// quickMetrics analyzeMesh ile tutarlı (piyon)
const pawn = parseStl(await makeSamplePawnStl().arrayBuffer()).positions
const q = quickMetrics(pawn, 45), a = analyzeMesh(pawn, { overhangThresholdDeg: 45, manifoldCheck: false, layerHeight: 0.2 }).stats
assert(Math.abs(q.overhangArea - a.overhangArea) < 1e-6 && Math.abs(q.supportColumnVolume - a.supportColumnVolume) < 1e-3 && Math.abs(q.bedContactArea - a.bedContactArea) < 1e-6, 'quickMetrics = analyzeMesh')

// Pozlama önerisi
const j2 = printerById('elegoo-jupiter-2'), p1 = printerById('cat-anycubic-photon-p1'), a1 = printerById('bambu-a1-combo')
const std = MATERIALS.find((m) => m.id === 'resin-standard')!, water = MATERIALS.find((m) => m.id === 'resin-water')!
const r1 = recommendedExposure(j2, std, 0.05)!, r2 = recommendedExposure(j2, water, 0.05)!, r3 = recommendedExposure(p1, std, 0.1)!, r4 = recommendedExposure(j2, std, 0.03)!
assert(r1.base.label.includes('Jupiter 2') && r1.exposureSec === 2.7 && r1.bottomExposureSec === 28 && r1.confidence === 'official', 'Jupiter 2 standart')
assert(r2.resinType === 'water' && r2.exposureSec === 3 && r2.bottomExposureSec === 28, 'su ile yıkanabilir +0,3 s')
assert(r3.base.label.includes('Photon P1') && r3.exposureSec > 2.2 * 1.6 && r3.exposureSec < 2.2 * 1.75 && r3.bottomExposureSec === 28, 'Photon P1 0,1 mm ölçek')
assert(r4.exposureSec < r1.exposureSec && recommendedExposure(a1, std, 0.05) === null, '0,03 mm daha kısa; FDM için öneri yok')
assert(classifyResin({ ...std, name: 'ABS-like Pro 2 Grey' }) === 'abslike' && classifyResin({ ...std, name: 'Standard Resin+ 14K Grey' }) !== 'water', 'reçine sınıflandırma')
console.log(`exposure: J2 std ${r1.exposureSec}/${r1.bottomExposureSec}×${r1.bottomLayers} | J2 water ${r2.exposureSec} | P1 0.1mm ${r3.exposureSec} | J2 0.03mm ${r4.exposureSec}`)
console.log('orient: OK')
