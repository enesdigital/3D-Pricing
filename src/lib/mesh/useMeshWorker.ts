import { useCallback, useEffect, useRef, useState } from 'react'
import type { MeshStats, Placement, WorkerRequest, WorkerResponse } from './types.ts'

export const MAX_FILE_BYTES = 200 * 1024 * 1024 // 200 MB üst sınır

export interface LoadedModel {
  fileName: string
  fileSize: number
  format: string
  triangleCount: number
  /** Orijinal (döndürülmemiş) konumlar; render için */
  positions: Float32Array
}

export interface AnalysisState {
  stats: MeshStats | null
  overhangMask: Uint8Array | null
  placement: Placement
}

export interface MeshWorkerState {
  model: LoadedModel | null
  analysis: AnalysisState
  busy: 'idle' | 'parsing' | 'analyzing'
  progress: number
  error: string | null
}

export interface AnalyzeParams {
  placement: Placement
  overhangThresholdDeg: number
  layerHeight: number
  manifoldCheck: boolean
}

export function useMeshWorker() {
  const workerRef = useRef<Worker | null>(null)
  const reqId = useRef(0)
  const [state, setState] = useState<MeshWorkerState>({
    model: null,
    analysis: { stats: null, overhangMask: null, placement: { rotX: 0, rotY: 0, rotZ: 0, scale: 1 } },
    busy: 'idle',
    progress: 0,
    error: null,
  })
  const pendingPlacement = useRef<Placement | null>(null)

  useEffect(() => {
    const w = new Worker(new URL('../../workers/mesh.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = w
    w.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data
      if (msg.id !== reqId.current && msg.type !== 'progress') return // eski cevap
      if (msg.type === 'progress') {
        if (msg.id !== reqId.current) return
        setState((s) => ({ ...s, progress: msg.fraction }))
      } else if (msg.type === 'loaded') {
        setState((s) => ({
          ...s,
          model: s.model ? { ...s.model, positions: msg.positions, triangleCount: msg.triangleCount, format: msg.format } : null,
          busy: 'idle',
          progress: 1,
        }))
      } else if (msg.type === 'analyzed') {
        setState((s) => ({
          ...s,
          analysis: { stats: msg.stats, overhangMask: msg.overhangMask, placement: pendingPlacement.current ?? s.analysis.placement },
          busy: 'idle',
          progress: 1,
          error: null,
        }))
      } else if (msg.type === 'error') {
        setState((s) => ({ ...s, busy: 'idle', error: msg.message }))
      }
    }
    w.onerror = (e) => setState((s) => ({ ...s, busy: 'idle', error: e.message || 'Worker hatası' }))
    return () => { w.terminate(); workerRef.current = null }
  }, [])

  const send = (msg: WorkerRequest, transfer?: Transferable[]) => workerRef.current?.postMessage(msg, transfer ?? [])

  const loadFile = useCallback(async (file: File): Promise<boolean> => {
    if (file.size > MAX_FILE_BYTES) {
      setState((s) => ({ ...s, error: `Dosya çok büyük (${(file.size / 1048576).toFixed(1)} MB). Üst sınır 200 MB.` }))
      return false
    }
    const ext = file.name.toLowerCase().split('.').pop() ?? ''
    if (!['stl', 'obj'].includes(ext)) {
      setState((s) => ({ ...s, error: 'Desteklenen biçimler: .stl (binary/ASCII) ve .obj' }))
      return false
    }
    const id = ++reqId.current
    setState((s) => ({
      ...s,
      model: { fileName: file.name, fileSize: file.size, format: '', triangleCount: 0, positions: new Float32Array(0) },
      analysis: { ...s.analysis, stats: null, overhangMask: null },
      busy: 'parsing',
      progress: 0,
      error: null,
    }))
    const buffer = await file.arrayBuffer()
    send({ type: 'load', id, buffer, fileName: file.name }, [buffer])
    return true
  }, [])

  const analyze = useCallback((params: AnalyzeParams) => {
    const id = ++reqId.current
    pendingPlacement.current = params.placement
    setState((s) => ({ ...s, busy: 'analyzing', progress: 0 }))
    send({ type: 'analyze', id, ...params })
  }, [])

  const clear = useCallback(() => {
    reqId.current++
    send({ type: 'unload' })
    setState((s) => ({ ...s, model: null, analysis: { ...s.analysis, stats: null, overhangMask: null }, busy: 'idle', progress: 0, error: null }))
  }, [])

  return { ...state, loadFile, analyze, clear }
}
