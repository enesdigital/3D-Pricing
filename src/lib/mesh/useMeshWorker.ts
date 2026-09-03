import { useCallback, useEffect, useRef, useState } from 'react'
import { DEFAULT_PLACEMENT, type MeshStats, type Placement, type ThicknessData, type WorkerRequest, type WorkerResponse } from './types.ts'
import type { Translate } from '../cost/types.ts'

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
  thickness: ThicknessData | null
  placement: Placement
}

export interface MeshWorkerState {
  model: LoadedModel | null
  analysis: AnalysisState
  busy: 'idle' | 'reading' | 'parsing' | 'analyzing'
  progress: number
  error: string | null
}

export interface AnalyzeParams {
  placement: Placement
  overhangThresholdDeg: number
  layerHeight: number
  manifoldCheck: boolean
  thickness: boolean
}

export function useMeshWorker(t: Translate) {
  const workerRef = useRef<Worker | null>(null)
  // t'nin güncel değerini callback'lerde deps churn'ü olmadan kullanmak için ref
  const tRef = useRef(t)
  useEffect(() => { tRef.current = t }, [t])
  // Yükleme ve analiz istekleri ayrı sayaçlarla izlenir; böylece araya giren bir analiz isteği
  // "yüklendi" cevabının yok sayılmasına yol açmaz.
  const loadId = useRef(0)
  const analyzeId = useRef(0)
  const pendingPlacement = useRef<Placement | null>(null)
  const [state, setState] = useState<MeshWorkerState>({
    model: null,
    analysis: { stats: null, overhangMask: null, thickness: null, placement: DEFAULT_PLACEMENT },
    busy: 'idle',
    progress: 0,
    error: null,
  })

  useEffect(() => {
    let w: Worker
    try {
      w = new Worker(new URL('../../workers/mesh.worker.ts', import.meta.url), { type: 'module' })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      queueMicrotask(() => setState((s) => ({ ...s, error: tRef.current('mesh.workerInitFailed', { message }) })))
      return
    }
    workerRef.current = w
    w.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data
      switch (msg.type) {
        case 'progress': {
          const current = msg.phase === 'parse' ? loadId.current : analyzeId.current
          if (msg.id !== current) return
          setState((s) => ({ ...s, progress: msg.fraction }))
          return
        }
        case 'loaded': {
          if (msg.id !== loadId.current) return
          setState((s) => ({
            ...s,
            model: s.model ? { ...s.model, positions: msg.positions, triangleCount: msg.triangleCount, format: msg.format } : null,
            busy: 'idle',
            progress: 1,
            error: null,
          }))
          return
        }
        case 'analyzed': {
          if (msg.id !== analyzeId.current) return
          setState((s) => ({
            ...s,
            analysis: { stats: msg.stats, overhangMask: msg.overhangMask, thickness: msg.thickness, placement: pendingPlacement.current ?? s.analysis.placement },
            busy: 'idle',
            progress: 1,
            error: null,
          }))
          return
        }
        case 'error': {
          // Eski bir isteğin hatası bile olsa göster; kullanıcı ne olduğunu bilmeli.
          // Yükleme sırasında hata: yarım kalan (0 üçgenli) hayalet modeli kaldır.
          const loadFailed = msg.id === loadId.current
          setState((s) => ({
            ...s, busy: 'idle', error: msg.message,
            model: loadFailed && s.model && s.model.positions.length === 0 ? null : s.model,
          }))
          return
        }
      }
    }
    w.onerror = (e) => {
      setState((s) => ({ ...s, busy: 'idle', error: tRef.current('mesh.workerError', { message: e.message || tRef.current('mesh.workerErrorUnknown') }) }))
    }
    return () => { w.terminate(); workerRef.current = null }
  }, [])

  const send = (msg: WorkerRequest, transfer?: Transferable[]) => {
    if (!workerRef.current) throw new Error(tRef.current('mesh.notReady'))
    workerRef.current.postMessage(msg, transfer ?? [])
  }

  const loadFile = useCallback(async (file: File): Promise<boolean> => {
    if (file.size > MAX_FILE_BYTES) {
      setState((s) => ({ ...s, error: tRef.current('mesh.tooBig', { size: (file.size / 1048576).toFixed(1) }) }))
      return false
    }
    if (file.size === 0) {
      setState((s) => ({ ...s, error: tRef.current('mesh.empty') }))
      return false
    }
    const ext = file.name.toLowerCase().split('.').pop() ?? ''
    if (!['stl', 'obj'].includes(ext)) {
      setState((s) => ({ ...s, error: tRef.current('mesh.unsupported') }))
      return false
    }
    const id = ++loadId.current
    analyzeId.current++ // bekleyen analiz cevaplarını geçersiz kıl
    setState((s) => ({
      ...s,
      model: { fileName: file.name, fileSize: file.size, format: '', triangleCount: 0, positions: new Float32Array(0) },
      analysis: { ...s.analysis, stats: null, overhangMask: null, thickness: null },
      busy: 'reading',
      progress: 0,
      error: null,
    }))
    try {
      const buffer = await file.arrayBuffer()
      if (id !== loadId.current) return false // bu arada başka dosya seçildi
      setState((s) => ({ ...s, busy: 'parsing' }))
      send({ type: 'load', id, buffer, fileName: file.name }, [buffer])
      return true
    } catch (e) {
      setState((s) => ({ ...s, busy: 'idle', error: tRef.current('mesh.readFailed', { message: e instanceof Error ? e.message : String(e) }) }))
      return false
    }
  }, [])

  const analyze = useCallback((params: AnalyzeParams) => {
    const id = ++analyzeId.current
    pendingPlacement.current = params.placement
    setState((s) => ({ ...s, busy: 'analyzing', progress: 0 }))
    try {
      send({ type: 'analyze', id, ...params })
    } catch (e) {
      setState((s) => ({ ...s, busy: 'idle', error: e instanceof Error ? e.message : String(e) }))
    }
  }, [])

  const clear = useCallback(() => {
    loadId.current++
    analyzeId.current++
    try { send({ type: 'unload' }) } catch { /* worker yoksa sorun değil */ }
    setState((s) => ({ ...s, model: null, analysis: { ...s.analysis, stats: null, overhangMask: null, thickness: null }, busy: 'idle', progress: 0, error: null }))
  }, [])

  return { ...state, loadFile, analyze, clear }
}
