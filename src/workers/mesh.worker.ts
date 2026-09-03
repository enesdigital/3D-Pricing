/// <reference lib="webworker" />
import { parseStl } from '../lib/mesh/parseStl.ts'
import { parseObj } from '../lib/mesh/parseObj.ts'
import { parse3mf } from '../lib/mesh/parse3mf.ts'
import { parseStep } from '../lib/mesh/parseStep.ts'
import { decimateForDisplay } from '../lib/mesh/decimate.ts'
import { analyzeMesh, transformPositions } from '../lib/mesh/analyze.ts'
import { computeThickness } from '../lib/mesh/thickness.ts'
import type { WorkerRequest, WorkerResponse } from '../lib/mesh/types.ts'

let original: Float32Array | null = null

const post = (msg: WorkerResponse, transfer?: Transferable[]) =>
  (self as unknown as Worker).postMessage(msg, transfer ?? [])

self.onerror = (e) => {
  post({ type: 'error', id: -1, message: typeof e === 'string' ? e : (e as ErrorEvent).message ?? 'Worker içinde beklenmeyen hata' })
}

self.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data
  try {
    if (msg.type === 'unload') {
      original = null
      return
    }
    if (msg.type === 'load') {
      original = null
      const ext = msg.fileName.toLowerCase().split('.').pop()
      const onProgress = (f: number) => post({ type: 'progress', id: msg.id, phase: 'parse', fraction: f })
      let unit = 1, colorHint: number | null = null, objectCount = 1
      let parsed
      if (ext === '3mf') { const p = parse3mf(msg.buffer, onProgress); parsed = p; unit = p.unit; colorHint = p.colorHint; objectCount = p.objectCount }
      else if (ext === 'step' || ext === 'stp' || ext === 'iges' || ext === 'igs' || ext === 'brep' || ext === 'brp') parsed = await parseStep(msg.buffer, msg.fileName, onProgress)
      else if (ext === 'obj') parsed = parseObj(msg.buffer, onProgress)
      else parsed = parseStl(msg.buffer, onProgress)
      original = parsed.positions
      // Render için kopya (çok büyük mesh'te sadeleştirilmiş); orijinal worker'da kalır.
      const DISPLAY_MAX = 1_500_000
      const copy = parsed.triangleCount > DISPLAY_MAX ? await decimateForDisplay(parsed.positions, 1_000_000) : parsed.positions.slice()
      post({ type: 'loaded', id: msg.id, positions: copy, triangleCount: parsed.triangleCount, format: parsed.format, unit, colorHint, objectCount, decimated: parsed.triangleCount > DISPLAY_MAX }, [copy.buffer])
      return
    }
    if (msg.type === 'analyze') {
      if (!original) throw new Error('Önce bir model yüklenmeli.')
      const placed = transformPositions(original, msg.placement)
      const result = analyzeMesh(placed, {
        overhangThresholdDeg: msg.overhangThresholdDeg,
        manifoldCheck: msg.manifoldCheck,
        layerHeight: msg.layerHeight,
        onProgress: (f) => post({ type: 'progress', id: msg.id, phase: 'analyze', fraction: f }),
      })
      let thickness = null
      if (msg.thickness) {
        try {
          thickness = computeThickness(placed, 20000, 1_500_000, (f) => post({ type: 'progress', id: msg.id, phase: 'analyze', fraction: 0.95 + 0.05 * f }))
        } catch (e) {
          thickness = null
          post({ type: 'progress', id: msg.id, phase: 'analyze', fraction: 1 })
          console.warn('thickness failed', e)
        }
      }
      const transfer: Transferable[] = [result.overhangMask.buffer]
      if (thickness) transfer.push(thickness.samples.buffer, thickness.tri.buffer)
      post({ type: 'analyzed', id: msg.id, stats: result.stats, overhangMask: result.overhangMask, thickness }, transfer)
    }
  } catch (e) {
    post({ type: 'error', id: (msg as { id?: number }).id ?? -1, message: e instanceof Error ? e.message : String(e) })
  }
}
