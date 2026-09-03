/**
 * 3MF ayrıştırıcı (worker uyumlu, DOMParser gerektirmez): 3D/3dmodel.model ve production-extension
 * parça dosyalarındaki <object> mesh'leri, <components> ve <build><item> dönüşümleri okunur;
 * çıktı mm cinsinden indexsiz üçgen çorbası. Bambu/Orca proje dosyalarında renk sayısı
 * Metadata/model_settings.config'deki farklı filament (extruder) id'lerinden türetilir.
 */
import { unzipSync, strFromU8 } from 'three/examples/jsm/libs/fflate.module.js'
import type { ParsedMesh, ProgressFn } from './parseStl.ts'

const UNIT: Record<string, number> = { micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 }

type Mat = number[] // 12 değer: 3x4 satır-major (a b c d e f g h i tx ty tz) — 3MF: "m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32"
const I: Mat = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]
const parseMat = (s: string | undefined): Mat => {
  if (!s) return I
  const v = s.trim().split(/\s+/).map(Number)
  return v.length === 12 && v.every(Number.isFinite) ? v : I
}
// 3MF dönüşümü: p' = p·M (satır vektör) → x' = x*m00 + y*m10 + z*m20 + m30
const apply = (m: Mat, x: number, y: number, z: number): [number, number, number] => [
  x * m[0] + y * m[3] + z * m[6] + m[9],
  x * m[1] + y * m[4] + z * m[7] + m[10],
  x * m[2] + y * m[5] + z * m[8] + m[11],
]
const mul = (a: Mat, b: Mat): Mat => { // önce a sonra b uygulanır: p·a·b
  const r = (i: number, j: number) => a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]
  return [r(0, 0), r(0, 1), r(0, 2), r(1, 0), r(1, 1), r(1, 2), r(2, 0), r(2, 1), r(2, 2),
    a[9] * b[0] + a[10] * b[3] + a[11] * b[6] + b[9], a[9] * b[1] + a[10] * b[4] + a[11] * b[7] + b[10], a[9] * b[2] + a[10] * b[5] + a[11] * b[8] + b[11]]
}

interface Obj { verts: Float32Array; tris: Uint32Array; components: { id: string; transform: Mat }[]; pidCount: number }

function parseModelXml(xml: string, objects: Map<string, Obj>, prefix: string): { unit: number; items: { id: string; transform: Mat }[] } {
  const unitM = xml.match(/<model[^>]*\bunit="([^"]+)"/i)
  const unit = UNIT[(unitM?.[1] ?? 'millimeter').toLowerCase()] ?? 1
  // Nesneler
  const objRe = /<object\b([^>]*)>([\s\S]*?)<\/object>/gi
  let om: RegExpExecArray | null
  while ((om = objRe.exec(xml)) !== null) {
    const attrs = om[1], body = om[2]
    const id = attrs.match(/\bid="([^"]+)"/)?.[1]
    if (!id) continue
    const vx: number[] = []
    const vRe = /<vertex\b[^>]*\bx="([^"]+)"[^>]*\by="([^"]+)"[^>]*\bz="([^"]+)"/g
    let vm: RegExpExecArray | null
    while ((vm = vRe.exec(body)) !== null) vx.push(+vm[1], +vm[2], +vm[3])
    const tr: number[] = []
    const pids = new Set<string>()
    const tRe = /<triangle\b([^>]*)\/?>/g
    let tm: RegExpExecArray | null
    while ((tm = tRe.exec(body)) !== null) {
      const a = tm[1]
      const v1 = a.match(/\bv1="(\d+)"/), v2 = a.match(/\bv2="(\d+)"/), v3 = a.match(/\bv3="(\d+)"/)
      if (v1 && v2 && v3) tr.push(+v1[1], +v2[1], +v3[1])
      const p = a.match(/\bp1="(\d+)"/); const pid = a.match(/\bpid="(\d+)"/)
      if (p || pid) pids.add(`${pid?.[1] ?? ''}:${p?.[1] ?? ''}`)
    }
    const components: Obj['components'] = []
    const cRe = /<component\b([^>]*)\/?>/g
    let cm: RegExpExecArray | null
    while ((cm = cRe.exec(body)) !== null) {
      const cid = cm[1].match(/\bobjectid="([^"]+)"/)?.[1]
      const path = cm[1].match(/\bp:path="([^"]+)"/)?.[1]
      if (cid) components.push({ id: (path ? path + '#' : prefix) + cid, transform: parseMat(cm[1].match(/\btransform="([^"]+)"/)?.[1]) })
    }
    objects.set(prefix + id, { verts: new Float32Array(vx), tris: new Uint32Array(tr), components, pidCount: pids.size })
  }
  // Build items
  const items: { id: string; transform: Mat }[] = []
  const buildM = xml.match(/<build\b[^>]*>([\s\S]*?)<\/build>/i)
  if (buildM) {
    const iRe = /<item\b([^>]*)\/?>/g
    let im: RegExpExecArray | null
    while ((im = iRe.exec(buildM[1])) !== null) {
      const oid = im[1].match(/\bobjectid="([^"]+)"/)?.[1]
      const path = im[1].match(/\bp:path="([^"]+)"/)?.[1]
      if (oid) items.push({ id: (path ? path + '#' : prefix) + oid, transform: parseMat(im[1].match(/\btransform="([^"]+)"/)?.[1]) })
    }
  }
  return { unit, items }
}

export interface Parsed3mf extends ParsedMesh { unit: number; objectCount: number; colorHint: number | null }

export function parse3mf(buffer: ArrayBuffer, onProgress?: ProgressFn): Parsed3mf {
  const files = unzipSync(new Uint8Array(buffer))
  const names = Object.keys(files)
  const rootName = names.find((n) => /^3D\/3dmodel\.model$/i.test(n)) ?? names.find((n) => /\.model$/i.test(n))
  if (!rootName) throw new Error('3MF içinde 3D/3dmodel.model bulunamadı.')
  onProgress?.(0.1)
  const objects = new Map<string, Obj>()
  const root = parseModelXml(strFromU8(files[rootName]), objects, '')
  // Production extension: diğer .model dosyaları (p:path="/3D/Objects/x.model")
  for (const n of names) {
    if (n === rootName || !/\.model$/i.test(n)) continue
    parseModelXml(strFromU8(files[n]), objects, '/' + n.replace(/^\/+/, '') + '#')
  }
  onProgress?.(0.5)
  // Bambu/Orca proje: farklı extruder id sayısı → renk ipucu
  let colorHint: number | null = null
  const ms = names.find((n) => /Metadata\/model_settings\.config$/i.test(n))
  if (ms) {
    const cfg = strFromU8(files[ms])
    const ext = new Set([...cfg.matchAll(/key="extruder"\s+value="(\d+)"/g)].map((m) => m[1]))
    if (ext.size > 0) colorHint = ext.size
  }
  // Öğeleri (yoksa tüm mesh nesnelerini) dönüştürerek üçgen çorbası oluştur
  const out: number[] = []
  let objectCount = 0
  const emit = (id: string, m: Mat, depth: number) => {
    const o = objects.get(id) ?? objects.get(id.replace(/^\/[^#]*#/, ''))
    if (!o || depth > 8) return
    if (o.tris.length > 0) {
      objectCount++
      const v = o.verts, t = o.tris
      for (let i = 0; i < t.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          const vi = t[i + k] * 3
          const p = apply(m, v[vi], v[vi + 1], v[vi + 2])
          out.push(p[0] * root.unit, p[1] * root.unit, p[2] * root.unit)
        }
      }
    }
    for (const c of o.components) emit(c.id, mul(c.transform, m), depth + 1)
  }
  const items = root.items.length ? root.items : [...objects.keys()].filter((k) => !k.includes('#')).map((id) => ({ id, transform: I }))
  for (const it of items) emit(it.id, it.transform, 0)
  onProgress?.(1)
  const positions = new Float32Array(out)
  const triangleCount = positions.length / 9
  if (triangleCount === 0) throw new Error('3MF içinde üçgen bulunamadı.')
  if (colorHint == null) {
    const pidTotal = Math.max(0, ...[...objects.values()].map((o) => o.pidCount))
    if (pidTotal > 1) colorHint = pidTotal
  }
  return { positions, triangleCount, format: 'binary', unit: root.unit, objectCount, colorHint }
}
