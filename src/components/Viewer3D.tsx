import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { effectiveScale, type Placement, type Vec3 } from '../lib/mesh/types.ts'
import type { PlateLayout } from '../lib/cost/engine.ts'

interface Props {
  positions: Float32Array | null
  overhangMask: Uint8Array | null
  placement: Placement
  /** Modelin yerleştirilmiş bounding box'ı (mm) — bed ortalaması için */
  bboxMin: Vec3 | null
  bboxMax: Vec3 | null
  bed: { x: number; y: number; z: number; shape?: 'rect' }
  fits: boolean
  /** Gösterilecek kopya sayısı ve tabla yerleşimi (adet > 1) */
  copies: number
  layout: PlateLayout | null
}

const COLOR_NORMAL = new THREE.Color('#60a5fa')
const COLOR_OVERHANG = new THREE.Color('#f97316')
const COLOR_BED = new THREE.Color('#22c55e')
const MAX_INSTANCES = 400

export function Viewer3D({ positions, overhangMask, placement, bboxMin, bboxMax, bed, fits, copies, layout }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    controls: OrbitControls
    root: THREE.Group   // Z-up → Y-up dönüşümü
    bedGroup: THREE.Group
    modelGroup: THREE.Group
    mesh: THREE.InstancedMesh | null
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

    sceneRef.current = { renderer, scene, camera, controls, root, bedGroup, modelGroup, mesh: null }

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
    s.bedGroup.clear()
    const { x, y, z } = bed
    const grid = new THREE.GridHelper(Math.max(x, y), Math.round(Math.max(x, y) / 10), 0x475569, 0x1f2937)
    grid.rotation.x = Math.PI / 2 // Z-up düzleme
    grid.position.set(x / 2, y / 2, 0)
    // Kare grid'i tablaya kırp: basit yaklaşım — plaka çiz
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

    // Kamerayı tablaya göre konumla
    const d = Math.max(x, y, z) * 1.8
    s.controls.target.set(x / 2, z / 4, -y / 2)
    s.camera.position.set(x / 2 + d * 0.7, d * 0.6, -y / 2 + d * 0.7)
    s.camera.far = d * 20
    s.camera.updateProjectionMatrix()
  }, [bed.x, bed.y, bed.z, fits, bed])

  // Model çizimi
  useEffect(() => {
    const s = sceneRef.current
    if (!s) return
    if (s.mesh) {
      s.modelGroup.remove(s.mesh)
      s.mesh.geometry.dispose()
      ;(s.mesh.material as THREE.Material).dispose()
      s.mesh = null
    }
    if (!positions || positions.length === 0) return
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.computeVertexNormals()
    const colors = new Float32Array(positions.length)
    const triCount = positions.length / 9
    for (let t = 0; t < triCount; t++) {
      const m = overhangMask ? overhangMask[t] : 0
      const c = m === 1 ? COLOR_OVERHANG : m === 2 ? COLOR_BED : COLOR_NORMAL
      for (let k = 0; k < 3; k++) {
        colors[t * 9 + k * 3] = c.r
        colors[t * 9 + k * 3 + 1] = c.g
        colors[t * 9 + k * 3 + 2] = c.b
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05, side: THREE.DoubleSide })
    const mesh = new THREE.InstancedMesh(geo, mat, MAX_INSTANCES)
    mesh.count = 1
    mesh.frustumCulled = false
    s.modelGroup.add(mesh)
    s.mesh = mesh
  }, [positions, overhangMask])

  // Yerleşim: döndürme/ölçek + tabla ızgarası (adet kopyaları) + kamera odağı
  useEffect(() => {
    const s = sceneRef.current
    if (!s || !s.mesh) return
    const DEG = Math.PI / 180
    const base = new THREE.Matrix4().compose(
      new THREE.Vector3(0, 0, 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(placement.rotX * DEG, placement.rotY * DEG, placement.rotZ * DEG, 'XYZ')),
      new THREE.Vector3().setScalar(effectiveScale(placement)),
    )
    s.modelGroup.position.set(0, 0, 0)
    if (!bboxMin || !bboxMax) {
      s.mesh.count = 1
      s.mesh.setMatrixAt(0, base)
      s.mesh.instanceMatrix.needsUpdate = true
      return
    }
    const bcx = (bboxMin.x + bboxMax.x) / 2, bcy = (bboxMin.y + bboxMax.y) / 2
    const h = bboxMax.z - bboxMin.z
    const toOrigin = new THREE.Matrix4().makeTranslation(-bcx, -bcy, -bboxMin.z)
    const shown = layout && layout.capacity > 0 ? Math.min(copies, layout.capacity, MAX_INSTANCES) : 1
    const tmp = new THREE.Matrix4()
    if (!layout || shown <= 1) {
      // Tek parça: tabla merkezi
      tmp.makeTranslation(bed.x / 2, bed.y / 2, 0).multiply(toOrigin).multiply(base)
      s.mesh.setMatrixAt(0, tmp)
      s.mesh.count = 1
    } else {
      const rot = new THREE.Matrix4().makeRotationZ(layout.rotated ? Math.PI / 2 : 0)
      const cols = Math.max(1, layout.cols)
      const rowsUsed = Math.ceil(shown / cols)
      const colsUsed = Math.min(cols, shown)
      const gridW = colsUsed * layout.cellX + (colsUsed - 1) * layout.spacing
      const gridH = rowsUsed * layout.cellY + (rowsUsed - 1) * layout.spacing
      const x0 = (bed.x - gridW) / 2 + layout.cellX / 2
      const y0 = (bed.y - gridH) / 2 + layout.cellY / 2
      for (let i = 0; i < shown; i++) {
        const c = i % cols, r = Math.floor(i / cols)
        tmp.makeTranslation(x0 + c * (layout.cellX + layout.spacing), y0 + r * (layout.cellY + layout.spacing), 0)
          .multiply(rot).multiply(toOrigin).multiply(base)
        s.mesh.setMatrixAt(i, tmp)
      }
      s.mesh.count = shown
    }
    s.mesh.instanceMatrix.needsUpdate = true

    // Kamerayı sahneye odakla (tek parça: modele; çoklu: tablaya)
    const focus = shown > 1 ? Math.max(bed.x, bed.y, h) : Math.max(bboxMax.x - bboxMin.x, bboxMax.y - bboxMin.y, h)
    const d = Math.max(focus * (shown > 1 ? 1.6 : 3.2), 120)
    s.controls.target.set(bed.x / 2, h / 2, -bed.y / 2)
    s.camera.position.set(bed.x / 2 + d * 0.6, h / 2 + d * 0.45, -bed.y / 2 + d * 0.6)
  }, [placement, bboxMin, bboxMax, bed.x, bed.y, positions, copies, layout])

  return <div ref={mountRef} className="h-full w-full" />
}
