/// <reference lib="webworker" />
import { parseStl } from '../lib/mesh/parseStl.ts'
import { parseObj } from '../lib/mesh/parseObj.ts'
import { analyzeMesh, transformPositions } from '../lib/mesh/analyze.ts'
import type { WorkerRequest, WorkerResponse } from '../lib/mesh/types.ts'

let original: Float32Array | null = null

const post = (msg: WorkerResponse, transfer?: Transferable[]) =>
  (self as unknown as Worker).postMessage(msg, transfer ?? [])

self.onerror = (e) => {
  post({ type: 'error', id: -1, message: typeof e === 'string' ? e : (e as ErrorEvent).message ?? 'Worker içinde beklenmeyen hata' })
}

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
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
      const parsed = ext === 'obj' ? parseObj(msg.buffer, onProgress) : parseStl(msg.buffer, onProgress)
      original = parsed.positions
      // Render için bir kopya ana thread'e gönderilir (transfer), orijinal worker'da kalır.
      const copy = parsed.positions.slice()
      post({ type: 'loaded', id: msg.id, positions: copy, triangleCount: parsed.triangleCount, format: parsed.format }, [copy.buffer])
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
      post({ type: 'analyzed', id: msg.id, stats: result.stats, overhangMask: result.overhangMask }, [result.overhangMask.buffer])
    }
  } catch (e) {
    post({ type: 'error', id: (msg as { id?: number }).id ?? -1, message: e instanceof Error ? e.message : String(e) })
  }
}
