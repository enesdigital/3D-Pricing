import { useEffect, useRef, type MutableRefObject } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { effectiveScale, type Placement, type Vec3 } from '../lib/mesh/types.ts'

/** Sahnede çizilecek bir parça (görüntü konumları + yerleşim + renk maskeleri) */
export interface ViewerPart {
  key: string
  positions: Float32Array
  placement: Placement
  /** Yerleştirilmiş bounding box (mm) — tabla merkezleme için; analiz bitmeden null */
  bboxMin: Vec3 | null
  bboxMax: Vec3 | null
  overhangMask: Uint8Array | null
  thinMask: Uint8Array | null
  /** Etkin parça hafif vurgulanır */
  active?: boolean
}
/** Tabla üzerindeki bir kopya: parça indeksi ve bounding box merkezinin tabla koordinatı (mm) */
export interface ViewerInstance { part: number; x: number; y: number; rotated: boolean }

interface Props {
  parts: ViewerPart[]
  instances: ViewerInstance[]
  bed: { x: number; y: number; z: number; shape?: 'rect' }
  fits: boolean
  /** Açık zeminli PNG yakalama fonksiyonu buraya yazılır */
  captureRef?: MutableRefObject<(() => string | null) | null>
}

const COLOR_NORMAL = new THREE.Color('#60a5fa')
const COLOR_DIM = new THREE.Color('#7dd3fc')
const COLOR_OVERHANG = new THREE.Color('#f97316')
const COLOR_BED = new THREE.Color('#22c55e')
const COLOR_THIN = new THREE.Color('#ef4444')
export const MAX_INSTANCES = 400
/** Parça sırasına göre hafif renk ayrımı (projede parçaları ayırt etmek için) */
const PART_TINTS = ['#60a5fa', '#a78bfa', '#34d399', '#fbbf24', '#f472b6', '#22d3ee', '#fb923c', '#a3e635']

interface PartEntry { positions: Float32Array; mesh: THREE.InstancedMesh }

export function Viewer3D({ parts, instances, bed, fits, captureRef }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    controls: OrbitControls
    root: THREE.Group   // Z-up → Y-up dönüşümü
    bedGroup: THREE.Group
    modelGroup: THREE.Group
    entries: Map<string, PartEntry>
    plate: THREE.Mesh | null
  } | null>(null)

  // Sahne kurulumu
  useEffect(() => {
    const el = mountRef.current
    if (!el) return
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(el.clientWidth, el.clientHeight)
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 1, 20000)
    camera.position.set(350, 300, 400)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.1

    scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 1.4))
    const dir = new THREE.DirectionalLight(0xffffff, 1.6)
    dir.position.set(300, 500, 200)
    scene.add(dir)
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.5)
    dir2.position.set(-300, 200, -300)
    scene.add(dir2)

    const root = new THREE.Group()
    root.rotation.x = -Math.PI / 2 // Yazıcı Z-up, three Y-up
    scene.add(root)
    const bedGroup = new THREE.Group()
    const modelGroup = new THREE.Group()
    root.add(bedGroup, modelGroup)

    sceneRef.current = { renderer, scene, camera, controls, root, bedGroup, modelGroup, entries: new Map(), plate: null }

    let raf = 0
    const loop = () => {
      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(loop)
    }
    loop()

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight
      if (w === 0 || h === 0) return
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    })
    ro.observe(el)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      const s = sceneRef.current
      if (s) for (const e of s.entries.values()) { e.mesh.geometry.dispose(); (e.mesh.material as THREE.Material).dispose() }
      controls.dispose()
      renderer.dispose()
      el.removeChild(renderer.domElement)
      sceneRef.current = null
    }
  }, [])

  // Tabla çizimi
  useEffect(() => {
    const s = sceneRef.current
    if (!s) return
    for (const child of [...s.bedGroup.children]) {
      const o = child as THREE.Mesh
      o.geometry?.dispose?.()
      const m = o.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(m)) m.forEach((mm) => mm.dispose()); else m?.dispose?.()
    }
    s.bedGroup.clear()
    const { x, y, z } = bed
    const grid = new THREE.GridHelper(Math.max(x, y), Math.round(Math.max(x, y) / 10), 0x475569, 0x1f2937)
    grid.rotation.x = Math.PI / 2 // Z-up düzleme
    grid.position.set(x / 2, y / 2, 0)
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(x, y),
      new THREE.MeshBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    )
    plate.position.set(x / 2, y / 2, -0.05)
    const vol = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(x, y, z)),
      new THREE.LineBasicMaterial({ color: fits ? 0x334155 : 0xef4444, transparent: true, opacity: 0.8 }),
    )
    vol.position.set(x / 2, y / 2, z / 2)
    const axes = new THREE.AxesHelper(Math.min(x, y) * 0.25)
    s.bedGroup.add(plate, grid, vol, axes)
    s.plate = plate

    // Kamerayı tablaya göre konumla
    const d = Math.max(x, y, z) * 1.8
    s.controls.target.set(x / 2, z / 4, -y / 2)
    s.camera.position.set(x / 2 + d * 0.7, d * 0.6, -y / 2 + d * 0.7)
    s.camera.far = d * 20
    s.camera.updateProjectionMatrix()
  }, [bed.x, bed.y, bed.z, fits, bed])

  // Geometri: her parça için bir InstancedMesh; yalnızca konumları değişen/eklenen/kaldırılan parçalar yeniden kurulur
  useEffect(() => {
    const s = sceneRef.current
    if (!s) return
    const keep = new Set(parts.map((p) => p.key))
    for (const [key, e] of s.entries) {
      const p = parts.find((x) => x.key === key)
      if (!p || p.positions !== e.positions || p.positions.length === 0) {
        s.modelGroup.remove(e.mesh); e.mesh.geometry.dispose(); (e.mesh.material as THREE.Material).dispose(); s.entries.delete(key)
      }
    }
    for (const p of parts) {
      if (!keep.has(p.key) || s.entries.has(p.key) || p.positions.length === 0) continue
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(p.positions, 3))
      geo.computeVertexNormals()
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(p.positions.length), 3))
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05, side: THREE.DoubleSide })
      const mesh = new THREE.InstancedMesh(geo, mat, MAX_INSTANCES)
      mesh.count = 0
      mesh.frustumCulled = false
      s.modelGroup.add(mesh)
      s.entries.set(p.key, { positions: p.positions, mesh })
    }
  }, [parts])

  // Renkler: sarkma / tabla teması / ince duvar; projede parça başına hafif ton
  useEffect(() => {
    const s = sceneRef.current
    if (!s) return
    const multi = parts.length > 1
    parts.forEach((p, idx) => {
      const e = s.entries.get(p.key)
      if (!e) return
      // Maskeler worker'dan yeni dizi olarak gelir; her seferinde yazmak ucuz (O(üçgen)), önbellek tutulmaz
      const attr = e.mesh.geometry.getAttribute('color') as THREE.BufferAttribute
      const colors = attr.array as Float32Array
      const triCount = colors.length / 9
      const maskOk = p.overhangMask && p.overhangMask.length === triCount ? p.overhangMask : null
      const thinOk = p.thinMask && p.thinMask.length === triCount ? p.thinMask : null
      const base = multi ? new THREE.Color(PART_TINTS[idx % PART_TINTS.length]) : COLOR_NORMAL
      const normal = multi && !p.active ? base.clone().lerp(COLOR_DIM, 0.15) : base
      for (let t = 0; t < triCount; t++) {
        const m = maskOk ? maskOk[t] : 0
        const c = thinOk && thinOk[t] ? COLOR_THIN : m === 1 ? COLOR_OVERHANG : m === 2 ? COLOR_BED : normal
        for (let k = 0; k < 3; k++) {
          colors[t * 9 + k * 3] = c.r
          colors[t * 9 + k * 3 + 1] = c.g
          colors[t * 9 + k * 3 + 2] = c.b
        }
      }
      attr.needsUpdate = true
    })
  }, [parts])

  // Yerleşim: her kopya için T(tabla konumu)·Rz(90°?)·T(-bbox merkezi)·R(yerleşim)·S(ölçek) + kamera odağı
  useEffect(() => {
    const s = sceneRef.current
    if (!s) return
    const DEG = Math.PI / 180
    const tmp = new THREE.Matrix4()
    let maxH = 0, focusW = 0
    const single = instances.length <= 1
    parts.forEach((p, idx) => {
      const e = s.entries.get(p.key)
      if (!e) return
      const base = new THREE.Matrix4().compose(
        new THREE.Vector3(0, 0, 0),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(p.placement.rotX * DEG, p.placement.rotY * DEG, p.placement.rotZ * DEG, 'ZYX') /* analyze.ts: R = Rz·Ry·Rx */),
        new THREE.Vector3().setScalar(effectiveScale(p.placement)),
      )
      const mine = instances.filter((i) => i.part === idx).slice(0, MAX_INSTANCES)
      if (!p.bboxMin || !p.bboxMax) {
        // Analiz bitmeden: tabla merkezinde ham konum (yalnızca tek kopya)
        e.mesh.count = mine.length > 0 || single ? 1 : 0
        if (e.mesh.count) e.mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(bed.x / 2, bed.y / 2, 0).multiply(base))
        e.mesh.instanceMatrix.needsUpdate = true
        return
      }
      const bcx = (p.bboxMin.x + p.bboxMax.x) / 2, bcy = (p.bboxMin.y + p.bboxMax.y) / 2
      const h = p.bboxMax.z - p.bboxMin.z
      maxH = Math.max(maxH, h)
      focusW = Math.max(focusW, p.bboxMax.x - p.bboxMin.x, p.bboxMax.y - p.bboxMin.y)
      const toOrigin = new THREE.Matrix4().makeTranslation(-bcx, -bcy, -p.bboxMin.z)
      const rot90 = new THREE.Matrix4().makeRotationZ(Math.PI / 2)
      mine.forEach((inst, i) => {
        tmp.makeTranslation(inst.x, inst.y, 0)
        if (inst.rotated) tmp.multiply(rot90)
        tmp.multiply(toOrigin).multiply(base)
        e.mesh.setMatrixAt(i, tmp)
      })
      e.mesh.count = mine.length
      e.mesh.instanceMatrix.needsUpdate = true
    })

    // Kamerayı sahneye odakla (tek parça: modele; çoklu: tablaya)
    const focus = single ? Math.max(focusW, maxH) : Math.max(bed.x, bed.y, maxH)
    const d = Math.max(focus * (single ? 3.2 : 2.4), 120)
    s.controls.target.set(bed.x / 2, maxH / 2, -bed.y / 2)
    s.camera.position.set(bed.x / 2 + d * 0.6, maxH / 2 + d * 0.45, -bed.y / 2 + d * 0.6)
  }, [parts, instances, bed.x, bed.y])

  // Teklif PDF'i için açık zeminli görüntü yakalama
  useEffect(() => {
    if (!captureRef) return
    captureRef.current = () => {
      const s = sceneRef.current
      if (!s || s.entries.size === 0) return null
      const plateMat = s.plate?.material as THREE.MeshBasicMaterial | undefined
      const oldPlate = plateMat?.color.clone()
      const oldOpacity = plateMat?.opacity
      s.scene.background = new THREE.Color('#ffffff')
      if (plateMat) { plateMat.color.set('#e2e8f0'); plateMat.opacity = 1 }
      s.renderer.render(s.scene, s.camera)
      const url = s.renderer.domElement.toDataURL('image/png')
      s.scene.background = null
      if (plateMat && oldPlate) { plateMat.color.copy(oldPlate); plateMat.opacity = oldOpacity ?? 0.9 }
      return url
    }
    return () => { captureRef.current = null }
  }, [captureRef])

  return <div ref={mountRef} className="h-full w-full" />
}
