import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { Hand, RotateCcw, RotateCw } from 'lucide-react'
import type { LessonColor, LessonDirections, LessonModel, ModelObject } from '@shared/lesson'
import { LabelPlacer } from '@shared/label-layout'
import { compileExpression } from '@shared/whiteboard'

/** Element colours (CPK) and sizes for molecules. */
const ELEMENTS: Record<string, [string, number]> = {
  H: ['#f4f4f4', 0.28],
  C: ['#4a4a4a', 0.42],
  N: ['#3b6fe0', 0.42],
  O: ['#e2463b', 0.42],
  F: ['#8fe36b', 0.38],
  Cl: ['#3fcf4a', 0.5],
  Br: ['#a8322a', 0.55],
  I: ['#8a3fbf', 0.6],
  S: ['#f2d03b', 0.5],
  P: ['#f29a3b', 0.5],
  Na: ['#a965e8', 0.6],
  K: ['#8f4fd6', 0.65],
  Mg: ['#7fd34f', 0.55],
  Ca: ['#9fb8a0', 0.62],
  Fe: ['#e08a3b', 0.55],
  Cu: ['#d9873f', 0.55],
  Zn: ['#8e93b5', 0.55],
}

/** Lesson space is [x, y, z] with z up; three.js has y up. */
const v3 = (p: readonly [number, number, number]): THREE.Vector3 =>
  new THREE.Vector3(p[0], p[2], -p[1])

/** One scene's directions for the model, placed on the model's clock (seconds). */
export type ModelCue = LessonDirections & { at: number; len: number }

/** Size of the handwritten labels on a 3D model, in CSS pixels. */
const LABEL_SIZE = 27
const clamp01 = (k: number): number => Math.max(0, Math.min(1, k))
/** Smooth start and stop, for camera glides and moving parts. */
const smooth = (k: number): number => {
  const x = clamp01(k)
  return x * x * x * (x * (x * 6 - 15) + 10)
}

/** Where a camera glide or a slide happens inside its scene: most of it, easing in and out. */
function glide(cue: ModelCue, time: number, share = 0.7, maxSeconds = 4): number {
  const len = Math.min(maxSeconds, Math.max(0.6, cue.len * share))
  return smooth((time - cue.at - 0.15) / len)
}

/** A point `u` (0 to 1) of the way along a path. */
function along(points: THREE.Vector3[], lengths: number[], u: number, out: THREE.Vector3): void {
  const total = lengths[lengths.length - 1] ?? 0
  const want = u * total
  for (let i = 1; i < points.length; i++) {
    const end = lengths[i] ?? 0
    if (want <= end || i === points.length - 1) {
      const startLen = lengths[i - 1] ?? 0
      const a = points[i - 1] ?? out
      const b = points[i] ?? out
      const k = end > startLen ? (want - startLen) / (end - startLen) : 0
      out.copy(a).lerp(b, clamp01(k))
      return
    }
  }
}

/**
 * When, in seconds after its scene starts, a cue list brings in or takes away `id`. Entries may
 * say "id@2.5" for an exact time; plain ids that appear are staggered so they arrive in turn.
 */
function when(list: string[], id: string, stagger: boolean): number | null {
  for (let j = 0; j < list.length; j++) {
    const entry = list[j] ?? ''
    const [name, at] = entry.split('@')
    if (name !== id) continue
    const exact = at !== undefined ? Number(at) : NaN
    if (Number.isFinite(exact)) return Math.max(0, exact)
    return 0.2 + (stagger ? j * 0.45 : 0)
  }
  return null
}

interface Tagged {
  /** The lesson's id for the object this part belongs to. */
  id?: string
  object: THREE.Object3D
  label: string
  /** Where the label points, relative to the object. */
  anchor: THREE.Vector3
  draggable: boolean
  /** When it appears, 0 to 1 through the scene that brought in the model. */
  at: number
}

function material(colour: string, opacity = 1): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: colour,
    roughness: 0.45,
    metalness: 0.05,
    transparent: opacity < 1,
    opacity,
    // Faint glass must not hide what is inside it.
    depthWrite: opacity > 0.5,
    side: THREE.DoubleSide,
  })
}

/** A rod from a to b (bonds, arrow shafts, cylinders). */
function rod(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material): THREE.Mesh {
  const length = Math.max(0.001, a.distanceTo(b))
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, length, 24), mat)
  mesh.position.copy(a).add(b).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize())
  return mesh
}

function build(o: ModelObject, col: (c: LessonColor) => string, ink: string): Omit<Tagged, 'at'>[] {
  switch (o.k) {
    case 'flow': {
      const group = new THREE.Group()
      const points = o.path.map((p) => v3(p))
      const lengths = [0]
      points.forEach((p, i) => {
        const prev = points[i - 1]
        if (prev) lengths.push((lengths[i - 1] ?? 0) + p.distanceTo(prev))
      })
      const count = Math.max(1, Math.min(24, Math.round(o.count)))
      const mat = material(col(o.c))
      mat.emissive = new THREE.Color(col(o.c))
      mat.emissiveIntensity = 0.45
      for (let j = 0; j < count; j++)
        group.add(new THREE.Mesh(new THREE.SphereGeometry(Math.max(0.03, o.r), 24, 16), mat))
      group.userData.flow = { points, lengths, speed: o.speed, count }
      const mid = new THREE.Vector3()
      along(points, lengths, 0.5, mid)
      return [{ object: group, label: o.label, anchor: mid, draggable: false }]
    }
    case 'sphere': {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(0.05, o.r), 48, 32),
        material(col(o.c), o.opacity),
      )
      mesh.position.copy(v3(o.at))
      return [
        { object: mesh, label: o.label, anchor: new THREE.Vector3(0, o.r, 0), draggable: true },
      ]
    }
    case 'box': {
      const [w, d, h] = o.size
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(col(o.c), o.opacity))
      mesh.position.copy(v3(o.at))
      return [
        { object: mesh, label: o.label, anchor: new THREE.Vector3(0, h / 2, 0), draggable: true },
      ]
    }
    case 'cylinder': {
      const a = v3(o.from)
      const b = v3(o.to)
      const mesh = rod(a, b, Math.max(0.02, o.r), material(col(o.c), o.opacity))
      return [{ object: mesh, label: o.label, anchor: new THREE.Vector3(), draggable: true }]
    }
    case 'cone': {
      const mesh = new THREE.Mesh(
        new THREE.ConeGeometry(o.r, o.h, 64),
        material(col(o.c), o.opacity),
      )
      mesh.position.copy(v3(o.at))
      if (o.down) mesh.rotation.x = Math.PI
      return [
        { object: mesh, label: o.label, anchor: new THREE.Vector3(0, o.h / 2, 0), draggable: true },
      ]
    }
    case 'torus': {
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(o.r, o.tube, 24, 96), material(col(o.c)))
      mesh.position.copy(v3(o.at))
      mesh.rotation.x = Math.PI / 2
      return [
        { object: mesh, label: o.label, anchor: new THREE.Vector3(o.r, 0, 0), draggable: true },
      ]
    }
    case 'arrow': {
      const a = v3(o.from)
      const b = v3(o.to)
      const dir = b.clone().sub(a)
      const length = dir.length()
      const head = Math.min(0.5, length * 0.3)
      const mat = material(col(o.c))
      const group = new THREE.Group()
      const tip = a.clone().add(
        dir
          .clone()
          .normalize()
          .multiplyScalar(length - head),
      )
      group.add(rod(a, tip, 0.05, mat))
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, head, 24), mat)
      cone.position.copy(tip).add(
        dir
          .clone()
          .normalize()
          .multiplyScalar(head / 2),
      )
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
      group.add(cone)
      return [{ object: group, label: o.label, anchor: b.clone(), draggable: false }]
    }
    case 'plane': {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(o.size, o.size),
        material(col(o.c), o.opacity),
      )
      mesh.position.copy(v3(o.at))
      const n = v3(o.normal)
      if (n.lengthSq() > 0)
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n.normalize())
      return [
        {
          object: mesh,
          label: o.label,
          anchor: new THREE.Vector3(o.size / 2, 0, 0),
          draggable: false,
        },
      ]
    }
    case 'surface': {
      const f = compileExpression(o.fn, ['x', 'y'])
      if (!f) return []
      const n = 64
      const [x0, x1] = o.x
      const [y0, y1] = o.y
      const geo = new THREE.PlaneGeometry(1, 1, n, n)
      const pos = geo.getAttribute('position')
      const colours: number[] = []
      const base = new THREE.Color(col(o.c))
      let lo = Infinity
      let hi = -Infinity
      const heights: number[] = []
      for (let i = 0; i < pos.count; i++) {
        const x = x0 + (pos.getX(i) + 0.5) * (x1 - x0)
        const y = y0 + (pos.getY(i) + 0.5) * (y1 - y0)
        let z = f([x, y])
        if (!Number.isFinite(z)) z = 0
        z = Math.max(-6, Math.min(6, z))
        heights.push(z)
        lo = Math.min(lo, z)
        hi = Math.max(hi, z)
        pos.setXYZ(i, x, z, -y)
      }
      for (const z of heights) {
        const k = hi > lo ? (z - lo) / (hi - lo) : 0.5
        const c = base.clone().offsetHSL(0, 0, (k - 0.5) * 0.35)
        colours.push(c.r, c.g, c.b)
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3))
      geo.computeVertexNormals()
      const mat = material('#ffffff', o.opacity)
      mat.vertexColors = true
      const mesh = new THREE.Mesh(geo, mat)
      const wire = new THREE.LineSegments(
        new THREE.WireframeGeometry(new THREE.PlaneGeometry(1, 1, 16, 16)),
        new THREE.LineBasicMaterial({ color: ink, transparent: true, opacity: 0.12 }),
      )
      // The wire grid follows the same surface.
      const wpos = wire.geometry.getAttribute('position')
      for (let i = 0; i < wpos.count; i++) {
        const x = x0 + (wpos.getX(i) + 0.5) * (x1 - x0)
        const y = y0 + (wpos.getY(i) + 0.5) * (y1 - y0)
        const z = f([x, y])
        wpos.setXYZ(i, x, Number.isFinite(z) ? Math.max(-6, Math.min(6, z)) + 0.01 : 0, -y)
      }
      const group = new THREE.Group()
      group.add(mesh, wire)
      const top = Math.max(0, Math.min(6, hi))
      return [
        {
          object: group,
          label: o.label,
          anchor: new THREE.Vector3(x1, top, -y1),
          draggable: false,
        },
      ]
    }
    case 'curve': {
      const fx = compileExpression(o.fn[0], ['t'])
      const fy = compileExpression(o.fn[1], ['t'])
      const fz = compileExpression(o.fn[2], ['t'])
      if (!fx || !fy || !fz) return []
      const pts: THREE.Vector3[] = []
      const [t0, t1] = o.t
      for (let i = 0; i <= 240; i++) {
        const t = t0 + ((t1 - t0) * i) / 240
        const p: [number, number, number] = [fx([t]), fy([t]), fz([t])]
        if (p.every(Number.isFinite)) pts.push(v3(p))
      }
      if (pts.length < 2) return []
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 400, 0.05, 10),
        material(col(o.c)),
      )
      const last = pts[pts.length - 1] ?? new THREE.Vector3()
      return [{ object: tube, label: o.label, anchor: last, draggable: false }]
    }
    case 'axes': {
      const group = new THREE.Group()
      const out: Omit<Tagged, 'at'>[] = [
        { object: group, label: '', anchor: new THREE.Vector3(), draggable: false },
      ]
      const mat = new THREE.LineBasicMaterial({ color: ink, transparent: true, opacity: 0.55 })
      const axes: [string, [number, number, number]][] = [
        ['x', [o.size, 0, 0]],
        ['y', [0, o.size, 0]],
        ['z', [0, 0, o.size]],
      ]
      for (const [name, end] of axes) {
        const a = v3([-end[0], -end[1], -end[2]])
        const b = v3(end)
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), mat))
        const cone = new THREE.Mesh(
          new THREE.ConeGeometry(0.08, 0.25, 16),
          new THREE.MeshBasicMaterial({ color: ink }),
        )
        cone.position.copy(b)
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().normalize())
        group.add(cone)
        if (o.labels)
          out.push({ object: cone, label: name, anchor: new THREE.Vector3(), draggable: false })
      }
      return out
    }
    case 'molecule': {
      const group = new THREE.Group()
      group.position.copy(v3(o.at))
      const out: Omit<Tagged, 'at'>[] = [
        { object: group, label: '', anchor: new THREE.Vector3(), draggable: true },
      ]
      const centres = o.atoms.map((a) => v3(a.at).multiplyScalar(o.scale))
      o.atoms.forEach((a, i) => {
        const el = a.el.charAt(0).toUpperCase() + a.el.slice(1).toLowerCase()
        const [colour, r] = ELEMENTS[el] ?? ['#e58fd0', 0.45]
        const ball = new THREE.Mesh(new THREE.SphereGeometry(r * o.scale, 40, 28), material(colour))
        ball.position.copy(centres[i] ?? new THREE.Vector3())
        group.add(ball)
        out.push({
          object: ball,
          label: a.label || el,
          anchor: new THREE.Vector3(0, r * o.scale, 0),
          draggable: false,
        })
      })
      const stick = material('#b9bcc4')
      for (const bond of o.bonds) {
        const a = centres[bond[0]]
        const b = centres[bond[1]]
        const order = Math.max(1, Math.min(3, Math.round(bond[2] ?? 1)))
        if (!a || !b) continue
        const side = new THREE.Vector3()
          .crossVectors(b.clone().sub(a), new THREE.Vector3(0, 1, 0.3))
          .normalize()
          .multiplyScalar(0.12 * o.scale)
        for (let k = 0; k < order; k++) {
          const shift = side.clone().multiplyScalar(k - (order - 1) / 2)
          group.add(rod(a.clone().add(shift), b.clone().add(shift), 0.07 * o.scale, stick))
        }
      }
      return out
    }
    case 'label': {
      const dot = new THREE.Object3D()
      dot.position.copy(v3(o.at))
      return [{ object: dot, label: o.text, anchor: new THREE.Vector3(), draggable: false }]
    }
  }
}

/**
 * A 3D model on the lesson board. Drag empty space to turn it, scroll to zoom, and grab an object
 * to move it around, like a simple modelling app. Labels follow their objects and are placed so
 * they never sit on each other; a thin line points back when one has to move away.
 */
export function Model3D({
  model,
  progress,
  colors,
  ink,
  width,
  height,
  time = 0,
  cues = [],
  still = false,
}: {
  model: LessonModel
  /** How far the scene that brought in the model has played, 0 to 1. */
  progress: number
  /** Seconds since the scene that brought in the model began. */
  time?: number
  /** Camera shots and part changes asked for by the scenes so far. */
  cues?: ModelCue[]
  /** Making a video: no buttons or hints, and everything moves by the lesson's clock. */
  still?: boolean
  colors: Record<LessonColor, string>
  ink: string
  width: number
  height: number
}) {
  const host = useRef<HTMLDivElement>(null)
  const labelLayer = useRef<HTMLDivElement>(null)
  const lineLayer = useRef<SVGSVGElement>(null)
  const progressRef = useRef(progress)
  const timeRef = useRef(time)
  const cuesRef = useRef(cues)
  const [spin, setSpin] = useState(model.spin)
  const spinRef = useRef(spin)
  useEffect(() => {
    progressRef.current = progress
    timeRef.current = time
    cuesRef.current = cues
    spinRef.current = spin
  }, [progress, time, cues, spin])
  const resetRef = useRef<() => void>(() => undefined)
  const [hint, setHint] = useState(true)

  useEffect(() => {
    const el = host.current
    const labels = labelLayer.current
    const lines = lineLayer.current
    if (!el || !labels || !lines) return

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    renderer.setSize(width, height, false)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    el.prepend(renderer.domElement)

    const scene = new THREE.Scene()
    // Soft studio light: a room reflected in glossy parts, a sky light and one key light with
    // soft shadows on an invisible floor.
    const pmrem = new THREE.PMREMGenerator(renderer)
    const room = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = room
    scene.environmentIntensity = 0.45
    scene.add(new THREE.HemisphereLight('#ffffff', '#3a4656', 1.1))
    const sun = new THREE.DirectionalLight('#ffffff', 2.2)
    sun.position.set(5, 10, 7)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    sun.shadow.radius = 6
    sun.shadow.bias = -0.0004
    const shadowCam = sun.shadow.camera
    shadowCam.left = -9
    shadowCam.right = 9
    shadowCam.top = 9
    shadowCam.bottom = -9
    shadowCam.near = 0.5
    shadowCam.far = 40
    scene.add(sun)
    const rim = new THREE.DirectionalLight('#9fc6ff', 0.6)
    rim.position.set(-6, 4, -8)
    scene.add(rim)

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 200)
    const home = v3(model.camera)
    const homeLook = v3(model.look)
    camera.position.copy(home)
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.copy(homeLook)
    // The lesson drives the camera until the student turns it themselves.
    let driven = true
    resetRef.current = () => {
      camera.position.copy(home)
      controls.target.copy(homeLook)
      driven = true
      for (const t of tagged) {
        t.object.position.copy(t.object.userData.home as THREE.Vector3)
        t.object.userData.dragged = false
      }
    }

    const col = (c: LessonColor): string => colors[c]
    const tagged: Tagged[] = []
    const n = model.objects.length
    model.objects.forEach((o, i) => {
      for (const part of build(o, col, ink)) {
        const at = n > 1 ? (i / n) * 0.8 : 0
        if (!part.object.parent) scene.add(part.object)
        part.object.userData.home = part.object.position.clone()
        part.object.userData.scale = part.object.scale.clone()
        part.object.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const transparent = (child.material as THREE.Material).transparent
            child.castShadow = !transparent
            child.receiveShadow = true
          }
        })
        tagged.push({ ...part, at, id: o.id })
      }
    })
    const hidden = new Set(model.hidden)
    // A floor that only shows shadows, just under the lowest part.
    const bounds = new THREE.Box3()
    for (const t of tagged) if (t.object instanceof THREE.Mesh) bounds.expandByObject(t.object)
    if (!bounds.isEmpty()) {
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(40, 40),
        new THREE.ShadowMaterial({ opacity: 0.22 }),
      )
      floor.rotation.x = -Math.PI / 2
      floor.position.y = bounds.min.y - 0.02
      floor.receiveShadow = true
      scene.add(floor)
    }

    // Grab and move objects on a plane facing the camera.
    const ray = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const dragPlane = new THREE.Plane()
    const hit = new THREE.Vector3()
    const offset = new THREE.Vector3()
    let dragging: THREE.Object3D | null = null
    const ndc = (e: PointerEvent): void => {
      const r = renderer.domElement.getBoundingClientRect()
      pointer.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      )
    }
    const rootOf = (obj: THREE.Object3D): Tagged | undefined => {
      let cur: THREE.Object3D | null = obj
      while (cur) {
        const found = tagged.find((t) => t.object === cur && t.draggable)
        if (found) return found
        cur = cur.parent
      }
      return undefined
    }
    const down = (e: PointerEvent): void => {
      setHint(false)
      ndc(e)
      ray.setFromCamera(pointer, camera)
      const hits = ray.intersectObjects(scene.children, true)
      const target = hits.map((h) => rootOf(h.object)).find(Boolean)
      if (!target) return
      dragging = target.object
      dragging.userData.dragged = true
      controls.enabled = false
      dragPlane.setFromNormalAndCoplanarPoint(
        camera.getWorldDirection(new THREE.Vector3()).negate(),
        dragging.getWorldPosition(new THREE.Vector3()),
      )
      if (ray.ray.intersectPlane(dragPlane, hit)) offset.copy(dragging.position).sub(hit)
      renderer.domElement.setPointerCapture(e.pointerId)
      renderer.domElement.style.cursor = 'grabbing'
    }
    const move = (e: PointerEvent): void => {
      ndc(e)
      if (!dragging) {
        ray.setFromCamera(pointer, camera)
        const over = ray.intersectObjects(scene.children, true).some((h) => rootOf(h.object))
        renderer.domElement.style.cursor = over ? 'grab' : 'default'
        return
      }
      ray.setFromCamera(pointer, camera)
      if (ray.ray.intersectPlane(dragPlane, hit)) dragging.position.copy(hit).add(offset)
    }
    const up = (): void => {
      dragging = null
      controls.enabled = true
      renderer.domElement.style.cursor = 'default'
    }
    renderer.domElement.addEventListener('pointerdown', down)
    renderer.domElement.addEventListener('pointermove', move)
    renderer.domElement.addEventListener('pointerup', up)
    controls.addEventListener('start', () => {
      setHint(false)
      driven = false
    })

    // One label element per tagged object, positioned every frame.
    labels.replaceChildren()
    lines.replaceChildren()
    const onScreen = new Set<number>()
    const els = tagged.map((t) => {
      if (!t.label) return null
      const div = document.createElement('div')
      div.textContent = t.label
      div.className = 'lesson-hand'
      Object.assign(div.style, {
        position: 'absolute',
        left: '0',
        top: '0',
        whiteSpace: 'nowrap',
        color: ink,
        fontSize: `${LABEL_SIZE}px`,
        fontFamily: '"Kalam", cursive',
        // A dark halo keeps white labels readable over bright parts (water, a glowing disc).
        textShadow:
          '0 0 2px rgba(0,0,0,0.95), 0 1px 3px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.55)',
        pointerEvents: 'none',
      })
      labels.appendChild(div)
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
      line.setAttribute('stroke', ink)
      line.setAttribute('stroke-opacity', '0.5')
      line.setAttribute('stroke-dasharray', '4 4')
      lines.appendChild(line)
      return { div, line }
    })

    const world = new THREE.Vector3()
    let frame = 0
    const clock = new THREE.Clock()
    const up3 = new THREE.Vector3(0, 1, 0)
    const pos = new THREE.Vector3()
    const look = new THREE.Vector3()
    const goal = new THREE.Vector3()
    const glowing = new Set<THREE.Object3D>()
    const tick = (): void => {
      const dt = clock.getDelta()
      const T = timeRef.current
      const list = cuesRef.current
      if (driven && !dragging) {
        // Glide from shot to shot, then turn slowly around what we look at if asked.
        pos.copy(home)
        look.copy(homeLook)
        for (const c of list) {
          if (!c.shot || T < c.at) continue
          const k = glide(c, T)
          pos.lerp(goal.copy(v3(c.shot.camera)), k)
          look.lerp(goal.copy(v3(c.shot.look)), k)
        }
        if (spinRef.current)
          pos
            .sub(look)
            .applyAxisAngle(up3, T * 0.16)
            .add(look)
        camera.position.copy(pos)
        controls.target.copy(look)
        camera.lookAt(look)
      } else {
        if (spinRef.current && controls.enabled && !dragging) {
          const p = camera.position.clone().sub(controls.target)
          p.applyAxisAngle(up3, dt * 0.35)
          camera.position.copy(controls.target).add(p)
        }
        controls.update()
      }
      const prog = progressRef.current
      const current = [...list].reverse().find((c) => T >= c.at)
      for (const t of tagged) {
        let v = t.id && hidden.has(t.id) ? 0 : clamp01((prog - t.at) / 0.2)
        if (t.id) {
          for (const c of list) {
            const shown = when(c.show, t.id, true)
            if (shown !== null) v = Math.max(v, clamp01((T - c.at - shown) / 0.6))
            const gone = when(c.hide, t.id, false)
            if (gone !== null) v = Math.min(v, 1 - clamp01((T - c.at - gone) / 0.5))
          }
        }
        const e = 1 - (1 - v) ** 3
        const base = t.object.userData.scale as THREE.Vector3
        t.object.scale.copy(base).multiplyScalar(Math.max(0.0001, e))
        t.object.visible = v > 0
        if (t.id && !t.object.userData.dragged) {
          const at = goal.copy(t.object.userData.home as THREE.Vector3)
          for (const c of list) {
            const m = c.move.find((x) => x.id === t.id)
            if (m && T >= c.at) at.lerp(v3(m.to), glide(c, T, 0.75, 6))
          }
          t.object.position.copy(at)
        }
        const flow = t.object.userData.flow as
          { points: THREE.Vector3[]; lengths: number[]; speed: number; count: number } | undefined
        if (flow) {
          t.object.children.forEach((ball, j) => {
            const u = (((T * flow.speed + j / flow.count) % 1) + 1) % 1
            along(flow.points, flow.lengths, u, ball.position)
          })
        }
        // Parts the scene is talking about glow gently.
        const glow = !!t.id && !!current?.glow.includes(t.id)
        if (glow || glowing.has(t.object)) {
          const level = glow ? 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(T * 4)) : 0
          t.object.traverse((child) => {
            if (
              child instanceof THREE.Mesh &&
              child.material instanceof THREE.MeshStandardMaterial
            ) {
              child.material.emissive.copy(child.material.color)
              child.material.emissiveIntensity = level
            }
          })
          if (glow) glowing.add(t.object)
          else glowing.delete(t.object)
        }
      }
      renderer.render(scene, camera)

      // Labels are placed in priority order: what the narrator is talking about, then what was
      // already on screen (so labels do not flicker), then the rest. A label with no clear spot
      // waits off screen instead of landing on another one.
      const placer = new LabelPlacer({ x: 8, y: 8, w: width - 16, h: height - 16 })
      const talking = new Set(current?.glow ?? [])
      const rank = (i: number): number =>
        tagged[i]?.id && talking.has(tagged[i]?.id ?? '') ? 0 : onScreen.has(i) ? 1 : 2
      const order = tagged.map((_, i) => i).sort((a, b) => rank(a) - rank(b) || a - b)
      for (const i of order) {
        const t = tagged[i]
        const pair = els[i]
        if (!t || !pair) continue
        const hide = (): void => {
          onScreen.delete(i)
          pair.div.style.opacity = '0'
          pair.line.setAttribute('stroke-opacity', '0')
        }
        const shown =
          t.object.visible && t.object.scale.x > 0.6 * (t.object.userData.scale as THREE.Vector3).x
        if (!shown) {
          hide()
          continue
        }
        world.copy(t.anchor)
        t.object.localToWorld(world)
        const s = world.project(camera)
        if (s.z > 1) {
          hide()
          continue
        }
        const x = ((s.x + 1) / 2) * width
        const y = ((1 - s.y) / 2) * height
        const spot =
          rank(i) === 0
            ? placer.place(x + 10, y - 10, t.label, LABEL_SIZE, 'start')
            : placer.placeIfClear(x + 10, y - 10, t.label, LABEL_SIZE, 'start')
        if (!spot) {
          hide()
          continue
        }
        onScreen.add(i)
        pair.div.style.opacity = '1'
        pair.div.style.transform = `translate(${spot.box.x + 6}px, ${spot.box.y}px)`
        const moved = Math.hypot(spot.x - (x + 10), spot.y - (y - 10)) > 30
        pair.line.setAttribute('x1', String(x))
        pair.line.setAttribute('y1', String(y))
        pair.line.setAttribute('x2', String(spot.box.x + 6))
        pair.line.setAttribute('y2', String(spot.box.y + spot.box.h / 2))
        pair.line.setAttribute('stroke-opacity', moved ? '0.5' : '0')
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      controls.dispose()
      renderer.domElement.removeEventListener('pointerdown', down)
      renderer.domElement.removeEventListener('pointermove', move)
      renderer.domElement.removeEventListener('pointerup', up)
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
          obj.geometry.dispose()
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
          for (const m of mats) (m as THREE.Material).dispose()
        }
      })
      room.dispose()
      pmrem.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [model, colors, ink, width, height])

  return (
    <div
      ref={host}
      data-interactive
      className="absolute inset-0"
      onClick={(e) => e.stopPropagation()}
    >
      <svg
        ref={lineLayer}
        className="pointer-events-none absolute inset-0"
        width={width}
        height={height}
      />
      <div ref={labelLayer} className="pointer-events-none absolute inset-0" />
      <div className={still ? 'hidden' : 'absolute right-3 bottom-3 flex gap-1.5'}>
        <button
          type="button"
          aria-label="Reset the view"
          title="Reset the view"
          onClick={() => resetRef.current()}
          className="grid size-16 place-items-center rounded-full bg-black/45 text-white hover:bg-black/65"
        >
          <RotateCcw className="size-7" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={spin ? 'Stop turning' : 'Turn slowly'}
          aria-pressed={spin}
          title={spin ? 'Stop turning' : 'Turn slowly'}
          onClick={() => setSpin((s) => !s)}
          className="grid size-16 place-items-center rounded-full bg-black/45 text-white hover:bg-black/65"
        >
          <RotateCw
            className={spin ? 'size-7 animate-spin [animation-duration:3s]' : 'size-7'}
            aria-hidden
          />
        </button>
      </div>
      {hint && !still ? (
        <div
          className="pointer-events-none absolute top-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/50 px-4 py-2 text-white"
          style={{ fontSize: 26 }}
        >
          <Hand className="size-5" aria-hidden /> Drag to turn · scroll to zoom · grab a part to
          move it
        </div>
      ) : null}
    </div>
  )
}
