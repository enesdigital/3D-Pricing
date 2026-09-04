import { zipSync, strToU8 } from 'three/examples/jsm/libs/fflate.module.js'
import { parse3mf } from '../src/lib/mesh/parse3mf.ts'
import { decimateForDisplay, weld } from '../src/lib/mesh/decimate.ts'
import { analyzeMesh } from '../src/lib/mesh/analyze.ts'
import { makeSamplePawnStl } from '../src/lib/mesh/sample.ts'
import { parseStl } from '../src/lib/mesh/parseStl.ts'
// 3MF: 10 mm küp (inch birimli → 254 mm), bir bileşen nesnesi ve 2 build item (biri 20 mm kaydırılmış), Bambu model_settings 2 ekstruder
const cubeXml = `<?xml version="1.0"?><model unit="inch" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>
<object id="1" type="model"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="1" y="0" z="0"/><vertex x="1" y="1" z="0"/><vertex x="0" y="1" z="0"/><vertex x="0" y="0" z="1"/><vertex x="1" y="0" z="1"/><vertex x="1" y="1" z="1"/><vertex x="0" y="1" z="1"/></vertices>
<triangles><triangle v1="0" v2="2" v3="1"/><triangle v1="0" v2="3" v3="2"/><triangle v1="4" v2="5" v3="6"/><triangle v1="4" v2="6" v3="7"/><triangle v1="0" v2="1" v3="5"/><triangle v1="0" v2="5" v3="4"/><triangle v1="1" v2="2" v3="6"/><triangle v1="1" v2="6" v3="5"/><triangle v1="2" v2="3" v3="7"/><triangle v1="2" v2="7" v3="6"/><triangle v1="3" v2="0" v3="4"/><triangle v1="3" v2="4" v3="7"/></triangles></mesh></object>
<object id="2" type="model"><components><component objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 2"/></components></object>
</resources><build><item objectid="1"/><item objectid="2" transform="1 0 0 0 1 0 0 0 1 3 0 0"/></build></model>`
const cfg = `<config><object id="1"><metadata key="extruder" value="1"/></object><object id="2"><metadata key="extruder" value="2"/></object></config>`
const zip = zipSync({ '3D/3dmodel.model': strToU8(cubeXml), 'Metadata/model_settings.config': strToU8(cfg), '[Content_Types].xml': strToU8('<Types/>') })
const p = parse3mf(zip.buffer as ArrayBuffer)
const { stats } = analyzeMesh(p.positions, { overhangThresholdDeg: 45, manifoldCheck: true, layerHeight: 0.2 })
const assert = (c: boolean, msg: string) => { if (!c) { console.error('FAIL:', msg); process.exit(1) } }
assert(p.triangleCount === 24 && p.unit === 25.4 && p.objectCount === 2 && Math.abs(stats.volume / 1000 - 32.8) < 0.2 && stats.manifold.components === 2, '3mf ayrıştırma (birim, nesne, hacim)')
console.log('3mf: üçgen', p.triangleCount, '| birim ×', p.unit, '| nesne', p.objectCount, '| renk ipucu', p.colorHint, '| boyut', [stats.size.x, stats.size.y, stats.size.z].map((v) => v.toFixed(1)).join('x'), '| hacim', (stats.volume / 1000).toFixed(1), 'cm³ (beklenen 2×16.39=32.8)', '| kabuk', stats.manifold.components)
// Sadeleştirme: piyon 2304 üçgen → 600
const pawn = parseStl(await makeSamplePawnStl().arrayBuffer())
const w = weld(pawn.positions); console.log('weld: köşe', pawn.positions.length / 3, '→', w.positions.length / 3)
const dec = await decimateForDisplay(pawn.positions, 600)
const { stats: sd } = analyzeMesh(dec, { overhangThresholdDeg: 45, manifoldCheck: false, layerHeight: 0.2 })
assert(w.positions.length < pawn.positions.length && dec.length / 9 <= 600 && Math.abs(sd.volume - stats.volume) / stats.volume < 0.02, 'weld/decimate hacmi korunmalı')
console.log('decimate: üçgen', pawn.triangleCount, '→', dec.length / 9, '| hacim', (stats.volume / 1000).toFixed(2), 'vs', (sd.volume / 1000).toFixed(2), 'cm³ (piyon 33.04)')
console.log('import: OK')
