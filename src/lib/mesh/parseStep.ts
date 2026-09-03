/**
 * STEP/IGES/BREP içe aktarma — occt-import-js (LGPL-2.1, ayrı WASM ~7 MB, yalnızca gerektiğinde yüklenir).
 * Çıktı mm cinsinden indexsiz üçgen çorbası. Worker içinde çalışır.
 */
import type { ParsedMesh, ProgressFn } from './parseStl.ts'

type OcctMesh = { attributes: { position: { array: number[] | Float32Array } }; index: { array: number[] | Uint32Array } }
type OcctResult = { success: boolean; meshes: OcctMesh[] }
type Occt = { ReadStepFile: (buf: Uint8Array, params: unknown) => OcctResult; ReadIgesFile: (buf: Uint8Array, params: unknown) => OcctResult; ReadBrepFile: (buf: Uint8Array, params: unknown) => OcctResult }

let occtPromise: Promise<Occt> | null = null
async function loadOcct(): Promise<Occt> {
  if (!occtPromise) {
    occtPromise = (async () => {
      const [{ default: factory }, wasm] = await Promise.all([
        import('occt-import-js') as Promise<{ default: (opts?: { locateFile?: (p: string) => string }) => Promise<Occt> }>,
        import('occt-import-js/dist/occt-import-js.wasm?url'),
      ])
      return factory({ locateFile: (p: string) => (p.endsWith('.wasm') ? wasm.default : p) })
    })()
  }
  return occtPromise
}

export async function parseStep(buffer: ArrayBuffer, fileName: string, onProgress?: ProgressFn): Promise<ParsedMesh> {
  onProgress?.(0.05)
  const occt = await loadOcct()
  onProgress?.(0.3)
  const ext = fileName.toLowerCase().split('.').pop()
  const bytes = new Uint8Array(buffer)
  // linearDeflection: mm cinsinden örgü hassasiyeti (küçük = daha çok üçgen); açısal 0.5 rad
  const params = { linearUnit: 'millimeter', linearDeflectionType: 'absolute_value', linearDeflection: 0.05, angularDeflection: 0.5 }
  const res = ext === 'igs' || ext === 'iges' ? occt.ReadIgesFile(bytes, params) : ext === 'brep' || ext === 'brp' ? occt.ReadBrepFile(bytes, params) : occt.ReadStepFile(bytes, params)
  if (!res.success || !res.meshes?.length) throw new Error('STEP/IGES dosyası okunamadı ya da katı gövde içermiyor.')
  onProgress?.(0.8)
  let total = 0
  for (const m of res.meshes) total += m.index.array.length
  const out = new Float32Array(total * 3)
  let o = 0
  for (const m of res.meshes) {
    const p = m.attributes.position.array, idx = m.index.array
    for (let i = 0; i < idx.length; i++) { const vi = idx[i] * 3; out[o++] = p[vi]; out[o++] = p[vi + 1]; out[o++] = p[vi + 2] }
  }
  onProgress?.(1)
  return { positions: out, triangleCount: total / 3, format: 'binary' }
}
