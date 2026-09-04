import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_PLACEMENT, type MeshStats, type Placement, type ThicknessData, type WorkerRequest, type WorkerResponse } from './types.ts'
import type { Translate } from '../cost/types.ts'
import type { OrientationMetrics } from './orient.ts'

export const MAX_FILE_BYTES = 200 * 1024 * 1024 // 200 MB üst sınır
/** Bir projedeki en fazla parça (bellek: her parçanın görüntü kopyası ana iş parçacığında, orijinali worker'da) */
export const MAX_PARTS = 24
export const ACCEPTED_EXT = ['stl', 'obj', '3mf', 'step', 'stp', 'iges', 'igs', 'brep', 'brp']

export interface LoadedModel {
  fileName: string
  fileSize: number
  format: string
  triangleCount: number
  /** Görüntüleme konumları (çok büyük mesh'te sadeleştirilmiş); hesap worker'daki orijinalde */
  positions: Float32Array
  /** 3MF birimi (mm çarpanı), renk ipucu, nesne sayısı, görüntü sadeleştirildi mi */
  unit?: number
  colorHint?: number | null
  objectCount?: number
  decimated?: boolean
}

export interface AnalysisState {
  stats: MeshStats | null
  overhangMask: Uint8Array | null
  thickness: ThicknessData | null
  placement: Placement
}

/** Projedeki bir parça: yüklenen model + analiz + yerleşim + adet */
export interface MeshPart {
  id: string
  model: LoadedModel
  analysis: AnalysisState
  placement: Placement
  quantity: number
  /** Parça worker'da ayrıştırıldı mı (positions dolu) */
  loaded: boolean
  /** Bu parça için bekleyen istek var mı */
  pending: boolean
}

export interface MeshWorkerState {
  parts: MeshPart[]
  activeId: string | null
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

let seq = 0
const newPartId = () => `part-${Date.now().toString(36)}-${(++seq).toString(36)}`

export function useMeshWorker(t: Translate) {
  const workerRef = useRef<Worker | null>(null)
  // t'nin güncel değerini callback'lerde deps churn'ü olmadan kullanmak için ref
  const tRef = useRef(t)
  useEffect(() => { tRef.current = t }, [t])
  // İstek kimlikleri: parça başına en son yükleme/analiz kimliği tutulur; eski cevaplar yok sayılır.
  const reqSeq = useRef(0)
  const latest = useRef(new Map<string, { load: number; analyze: number }>())
  const pending = useRef(new Map<number, { partId: string; kind: 'load' | 'analyze' | 'orient'; placement?: Placement }>())
  const orientWaiters = useRef(new Map<number, { resolve: (c: OrientationMetrics[]) => void; reject: (e: Error) => void }>())
  const [state, setState] = useState<MeshWorkerState>({ parts: [], activeId: null, busy: 'idle', progress: 0, error: null })
  // Olay işleyicilerinde güncel state'i senkron okumak için (setState güncelleyicisi ertelenebilir)
  const stateRef = useRef(state)
  stateRef.current = state

  const idleIfDone = (s: MeshWorkerState): MeshWorkerState => (pending.current.size === 0 ? { ...s, busy: 'idle', progress: 1 } : s)
  const markPending = (parts: MeshPart[]) => parts.map((p) => {
    const pend = [...pending.current.values()].some((x) => x.partId === p.id)
    return pend === p.pending ? p : { ...p, pending: pend }
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
          if (!pending.current.has(msg.id)) return
          setState((s) => ({ ...s, progress: msg.fraction }))
          return
        }
        case 'loaded': {
          const req = pending.current.get(msg.id)
          pending.current.delete(msg.id)
          if (!req || latest.current.get(req.partId)?.load !== msg.id) { setState((s) => idleIfDone({ ...s, parts: markPending(s.parts) })); return }
          setState((s) => idleIfDone({
            ...s,
            parts: markPending(s.parts.map((p) => (p.id === req.partId
              ? { ...p, loaded: true, model: { ...p.model, positions: msg.positions, triangleCount: msg.triangleCount, format: msg.format, unit: msg.unit, colorHint: msg.colorHint ?? null, objectCount: msg.objectCount, decimated: msg.decimated } }
              : p))),
            error: null,
          }))
          return
        }
        case 'oriented': {
          pending.current.delete(msg.id)
          orientWaiters.current.get(msg.id)?.resolve(msg.candidates)
          orientWaiters.current.delete(msg.id)
          setState((s) => idleIfDone({ ...s, parts: markPending(s.parts) }))
          return
        }
        case 'analyzed': {
          const req = pending.current.get(msg.id)
          pending.current.delete(msg.id)
          if (!req || latest.current.get(req.partId)?.analyze !== msg.id) { setState((s) => idleIfDone({ ...s, parts: markPending(s.parts) })); return }
          setState((s) => idleIfDone({
            ...s,
            parts: markPending(s.parts.map((p) => (p.id === req.partId
              ? { ...p, analysis: { stats: msg.stats, overhangMask: msg.overhangMask, thickness: msg.thickness, placement: req.placement ?? p.placement } }
              : p))),
            error: null,
          }))
          return
        }
        case 'error': {
          // Eski bir isteğin hatası bile olsa göster; kullanıcı ne olduğunu bilmeli.
          // Yükleme sırasında hata: yarım kalan (0 üçgenli) hayalet parçayı kaldır.
          // id -1: worker genel hatası (self.onerror) → hangi istek olduğu bilinmez, bekleyenlerin hepsi düşer
          const req = pending.current.get(msg.id)
          if (msg.id === -1) pending.current.clear(); else pending.current.delete(msg.id)
          const waiter = orientWaiters.current.get(msg.id)
          if (waiter) { waiter.reject(new Error(msg.message)); orientWaiters.current.delete(msg.id); setState((s) => idleIfDone({ ...s, parts: markPending(s.parts) })); return }
          setState((s) => {
            let parts = s.parts
            if (req?.kind === 'load') parts = parts.filter((p) => !(p.id === req.partId && !p.loaded))
            const activeId = parts.some((p) => p.id === s.activeId) ? s.activeId : (parts[0]?.id ?? null)
            return idleIfDone({ ...s, parts: markPending(parts), activeId, error: msg.message })
          })
          return
        }
      }
    }
    w.onerror = (e) => {
      setState((s) => ({ ...s, busy: 'idle', error: tRef.current('mesh.workerError', { message: e.message || tRef.current('mesh.workerErrorUnknown') }) }))
    }
    return () => { w.terminate(); workerRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const send = (msg: WorkerRequest, transfer?: Transferable[]) => {
    if (!workerRef.current) throw new Error(tRef.current('mesh.notReady'))
    workerRef.current.postMessage(msg, transfer ?? [])
  }

  /**
   * Dosya yükler. `add: false` (varsayılan) etkin parçanın yerine geçer (tek modelli akış);
   * `add: true` projeye yeni parça ekler. Dönüş: parça kimliği ya da hata durumunda null.
   */
  const loadFile = useCallback(async (file: File, opts: { add?: boolean; quantity?: number } = {}): Promise<string | null> => {
    if (file.size > MAX_FILE_BYTES) {
      setState((s) => ({ ...s, error: tRef.current('mesh.tooBig', { size: (file.size / 1048576).toFixed(1) }) }))
      return null
    }
    if (file.size === 0) {
      setState((s) => ({ ...s, error: tRef.current('mesh.empty') }))
      return null
    }
    const ext = file.name.toLowerCase().split('.').pop() ?? ''
    if (!ACCEPTED_EXT.includes(ext)) {
      setState((s) => ({ ...s, error: tRef.current('mesh.unsupported') }))
      return null
    }
    const cur = stateRef.current
    const add = !!opts.add && cur.parts.length > 0
    if (add && cur.parts.length >= MAX_PARTS) {
      setState((s) => ({ ...s, error: tRef.current('project.maxParts', { n: MAX_PARTS }) }))
      return null
    }
    // Yerine geçilecek parça senkron belirlenir (güncelleyici içinde atamak güvenilmez: React erteleyebilir)
    const replacedId: string | null = add ? null : cur.activeId
    const partId = newPartId()
    const id = ++reqSeq.current
    latest.current.set(partId, { load: id, analyze: 0 })
    pending.current.set(id, { partId, kind: 'load' })
    setState((s) => {
      const part: MeshPart = {
        id: partId,
        model: { fileName: file.name, fileSize: file.size, format: '', triangleCount: 0, positions: new Float32Array(0) },
        analysis: { stats: null, overhangMask: null, thickness: null, placement: DEFAULT_PLACEMENT },
        placement: DEFAULT_PLACEMENT, quantity: Math.max(1, Math.floor(opts.quantity ?? 1)), loaded: false, pending: true,
      }
      let parts: MeshPart[]
      if (add) parts = [...s.parts, part]
      else {
        const idx = s.parts.findIndex((p) => p.id === replacedId)
        parts = idx >= 0 ? s.parts.map((p, i) => (i === idx ? part : p)) : [...s.parts, part]
      }
      return { ...s, parts, activeId: partId, busy: 'reading', progress: 0, error: null }
    })
    // Yerine geçilen parçanın bekleyen isteklerini geçersiz kıl ve worker'dan bırak
    if (replacedId) {
      latest.current.delete(replacedId)
      for (const [k, v] of pending.current) if (v.partId === replacedId) pending.current.delete(k)
      try { send({ type: 'unload', partId: replacedId }) } catch { /* yoksay */ }
    }
    try {
      const buffer = await file.arrayBuffer()
      if (latest.current.get(partId)?.load !== id) { pending.current.delete(id); return null } // bu arada parça kaldırıldı/değişti
      setState((s) => ({ ...s, busy: 'parsing' }))
      send({ type: 'load', id, partId, buffer, fileName: file.name }, [buffer])
      return partId
    } catch (e) {
      pending.current.delete(id)
      setState((s) => idleIfDone({ ...s, parts: markPending(s.parts.filter((p) => p.id !== partId)), error: tRef.current('mesh.readFailed', { message: e instanceof Error ? e.message : String(e) }) }))
      return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const analyze = useCallback((partId: string, params: AnalyzeParams) => {
    const cur = latest.current.get(partId)
    if (!cur) return
    const id = ++reqSeq.current
    // Aynı parçanın önceki analiz isteği geçersiz olur
    for (const [k, v] of pending.current) if (v.partId === partId && v.kind === 'analyze') pending.current.delete(k)
    cur.analyze = id
    pending.current.set(id, { partId, kind: 'analyze', placement: params.placement })
    setState((s) => ({ ...s, parts: markPending(s.parts), busy: 'analyzing', progress: 0 }))
    try {
      send({ type: 'analyze', id, partId, ...params })
    } catch (e) {
      pending.current.delete(id)
      setState((s) => idleIfDone({ ...s, parts: markPending(s.parts), error: e instanceof Error ? e.message : String(e) }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Otomatik yönlendirme adayları (puan sırasıyla) */
  const orient = useCallback((partId: string, opts: { placement: Placement; overhangThresholdDeg: number; tech: 'fdm' | 'resin' }): Promise<OrientationMetrics[]> => {
    return new Promise((resolve, reject) => {
      if (!latest.current.has(partId)) { reject(new Error('part')); return }
      const id = ++reqSeq.current
      pending.current.set(id, { partId, kind: 'orient' })
      orientWaiters.current.set(id, { resolve, reject })
      setState((s) => ({ ...s, parts: markPending(s.parts), busy: 'analyzing', progress: 0 }))
      try { send({ type: 'orient', id, partId, ...opts }) } catch (e) { pending.current.delete(id); orientWaiters.current.delete(id); reject(e instanceof Error ? e : new Error(String(e))) }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const remove = useCallback((partId: string) => {
    latest.current.delete(partId)
    for (const [k, v] of pending.current) if (v.partId === partId) pending.current.delete(k)
    try { send({ type: 'unload', partId }) } catch { /* worker yoksa sorun değil */ }
    setState((s) => {
      const parts = s.parts.filter((p) => p.id !== partId)
      const activeId = s.activeId === partId ? (parts[parts.length - 1]?.id ?? null) : s.activeId
      return idleIfDone({ ...s, parts: markPending(parts), activeId, error: null })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const clear = useCallback(() => {
    latest.current.clear()
    pending.current.clear()
    try { send({ type: 'unload' }) } catch { /* worker yoksa sorun değil */ }
    setState({ parts: [], activeId: null, busy: 'idle', progress: 0, error: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setActive = useCallback((partId: string) => setState((s) => (s.parts.some((p) => p.id === partId) ? { ...s, activeId: partId } : s)), [])
  const setQuantity = useCallback((partId: string, quantity: number) => setState((s) => ({ ...s, parts: s.parts.map((p) => (p.id === partId ? { ...p, quantity } : p)) })), [])
  const setPlacement = useCallback((partId: string, placement: Placement) => setState((s) => ({ ...s, parts: s.parts.map((p) => (p.id === partId ? { ...p, placement } : p)) })), [])

  const active = useMemo(() => state.parts.find((p) => p.id === state.activeId) ?? null, [state.parts, state.activeId])
  const emptyAnalysis = useMemo<AnalysisState>(() => ({ stats: null, overhangMask: null, thickness: null, placement: DEFAULT_PLACEMENT }), [])
  return {
    ...state,
    active,
    /** Etkin parçanın modeli (tek modelli akışla uyumluluk) */
    model: active?.model ?? null,
    analysis: active?.analysis ?? emptyAnalysis,
    loadFile, analyze, orient, remove, clear, setActive, setQuantity, setPlacement,
  }
}
