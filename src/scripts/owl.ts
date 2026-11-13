import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  Bone,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  Skeleton,
  SkinnedMesh,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  WebGLRenderer,
  type MeshStandardMaterial,
} from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/**
 * CORUJA 3D (OwllSkull)
 *
 * O modelo public/owl/owl.glb é uma peça só. Aqui ele ganha:
 *  - um esqueleto com pesos suaves (cabeça e duas asas), para girar sem rasgar a malha;
 *  - uma "tela" sobre o visor, onde os olhos são desenhados ao vivo (olhar, piscar, feliz, falar).
 *
 * A coruja é desenhada num canvas próprio, que desliza e muda de tamanho para ficar sobre o
 * elemento âncora (grande no início, pequena no canto das seções).
 */

const NECK_Y = 0.85 // altura do pescoço no modelo
const FRAME = 2.3 // quanto do "mundo" cabe no canvas (a coruja tem ~1,9 de largura)
const clamp = (v: number, a = -1, b = 1) => Math.min(b, Math.max(a, v))
const sm = (a: number, b: number, x: number) => {
  const k = clamp((x - a) / (b - a), 0, 1)
  return k * k * (3 - 2 * k)
}
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export class Owl {
  /** elemento sobre o qual a coruja fica */
  anchorEl: HTMLElement | null = null
  /** true enquanto o texto está sendo digitado: mostra a onda de voz no visor */
  talking = false

  private renderer: WebGLRenderer
  private scene = new Scene()
  private cam = new PerspectiveCamera(28, 1, 0.1, 30)
  private root = new Group()
  private head!: Bone
  private wingL!: Bone
  private wingR!: Bone
  private coreHalo!: Sprite

  private faceCanvas = document.createElement('canvas')
  private faceCtx: CanvasRenderingContext2D
  private faceTex: CanvasTexture
  private faceKey = ''

  private raf = 0
  private last = 0
  private buffer = 0
  private cur = { cx: 0, cy: 0, side: 0 }
  private speed = 0
  private mouse = { x: 0, y: 0, at: -1e9 }
  private look = { x: 0, y: 0 }
  private talk = 0
  private blinkAt = 0
  private nextBlink = 2500
  private happyUntil = 0

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.toneMapping = ACESFilmicToneMapping
    this.scene.environment = new PMREMGenerator(this.renderer).fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = 0.55
    this.scene.add(new HemisphereLight('#cfe0ff', '#0a1020', 0.45))
    const key = new DirectionalLight('#ffffff', 1.3)
    key.position.set(3, 5, 6)
    const rimC = new DirectionalLight('#28e1ff', 1.6)
    rimC.position.set(-4, 2, -3)
    const rimB = new DirectionalLight('#7f9cff', 1.0)
    rimB.position.set(4, 1, -3)
    this.scene.add(key, rimC, rimB, this.root)
    // câmera: enquadra FRAME unidades de altura na distância da coruja
    const dist = FRAME / 2 / Math.tan((this.cam.fov * Math.PI) / 360)
    this.cam.position.set(0, 0.92, dist)
    this.cam.lookAt(0, 0.84, 0)

    this.faceCanvas.width = 512
    this.faceCanvas.height = 256
    this.faceCtx = this.faceCanvas.getContext('2d')!
    this.faceTex = new CanvasTexture(this.faceCanvas)
    this.faceTex.colorSpace = SRGBColorSpace
  }

  async load(url: string) {
    const loader = new GLTFLoader()
    loader.setMeshoptDecoder(MeshoptDecoder)
    const gltf = await loader.loadAsync(url)
    let mesh: Mesh | undefined
    gltf.scene.traverse((o) => {
      if ((o as Mesh).isMesh) mesh = o as Mesh
    })
    if (!mesh) throw new Error('modelo sem malha')
    this.rig(mesh)
    this.halos()
  }

  /** Cria o esqueleto, os pesos e a tela do visor. */
  private rig(mesh: Mesh) {
    // o arquivo guarda os números comprimidos: converte para float e aplica a escala do modelo
    const g = mesh.geometry.clone()
    for (const name of ['position', 'normal', 'uv']) {
      const a = g.attributes[name]
      const f = new Float32Array(a.count * a.itemSize)
      for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) f[i * a.itemSize + c] = a.getComponent(i, c)
      g.setAttribute(name, new BufferAttribute(f, a.itemSize))
    }
    mesh.updateWorldMatrix(true, false)
    g.applyMatrix4(mesh.matrixWorld)
    const P = g.attributes.position
    const N = g.attributes.normal
    const U = g.attributes.uv
    const nv = P.count

    // ---- pesos suaves: perto do pescoço e dos ombros a malha dobra aos poucos ----
    const skinIndex = new Uint16Array(nv * 4)
    const skinWeight = new Float32Array(nv * 4)
    for (let i = 0; i < nv; i++) {
      const x = P.getX(i)
      const y = P.getY(i)
      const z = P.getZ(i)
      // o bico (frente, centro) vai inteiro com a cabeça
      const beak = sm(0.2, 0.3, z) * (1 - sm(0.12, 0.2, Math.abs(x))) * sm(0.72, 0.76, y)
      const hw = Math.max(sm(NECK_Y - 0.07, NECK_Y + 0.05, y), beak)
      const ww = sm(0.46, 0.62, Math.abs(x)) * sm(0.3, 0.42, y) * (1 - sm(0.84, 0.92, y)) * (1 - hw)
      skinIndex.set([0, 1, x < 0 ? 2 : 3, 0], i * 4)
      skinWeight.set([1 - hw - ww, hw, ww, 0], i * 4)
    }
    g.setAttribute('skinIndex', new BufferAttribute(skinIndex, 4))
    g.setAttribute('skinWeight', new BufferAttribute(skinWeight, 4))
    const base = new Bone()
    this.head = new Bone()
    this.wingL = new Bone()
    this.wingR = new Bone()
    this.head.position.set(0, NECK_Y, 0)
    this.wingL.position.set(-0.5, 0.64, 0)
    this.wingR.position.set(0.5, 0.64, 0)
    base.add(this.head, this.wingL, this.wingR)
    const skinned = new SkinnedMesh(g, mesh.material)
    skinned.frustumCulled = false
    skinned.add(base)
    skinned.bind(new Skeleton([base, this.head, this.wingL, this.wingR]))
    this.root.add(skinned)

    // ---- visor: triângulos escuros na frente da cabeça ----
    const img = (mesh.material as MeshStandardMaterial).map?.image as CanvasImageSource & { width: number; height: number }
    const idx = g.index
    const triCount = idx ? idx.count / 3 : nv / 3
    const vi = (t: number, j: number) => (idx ? idx.getX(t * 3 + j) : t * 3 + j)
    let visor: number[] = []
    if (img) {
      const cv = document.createElement('canvas')
      cv.width = img.width
      cv.height = img.height
      const cx = cv.getContext('2d', { willReadFrequently: true })!
      cx.drawImage(img, 0, 0)
      const tex = cx.getImageData(0, 0, cv.width, cv.height).data
      const dark = (u: number, v: number) => {
        const x = clamp(Math.floor(u * cv.width), 0, cv.width - 1)
        const y = clamp(Math.floor(v * cv.height), 0, cv.height - 1)
        const k = (y * cv.width + x) * 4
        return 0.3 * tex[k] + 0.59 * tex[k + 1] + 0.11 * tex[k + 2] < 40
      }
      // alguns navegadores entregam a textura de cabeça para baixo: testa os dois sentidos e fica com o melhor
      const up: number[] = []
      const down: number[] = []
      for (let t = 0; t < triCount; t++) {
        let cy = 0, cz = 0, nz = 0, u = 0, v = 0
        for (let j = 0; j < 3; j++) {
          const k = vi(t, j)
          cy += P.getY(k); cz += P.getZ(k); nz += N.getZ(k); u += U.getX(k); v += U.getY(k)
        }
        if (cy / 3 < NECK_Y + 0.05 || cz / 3 < 0.15 || nz / 3 < 0.2) continue
        if (dark(u / 3, v / 3)) up.push(t)
        if (dark(u / 3, 1 - v / 3)) down.push(t)
      }
      visor = up.length >= down.length ? up : down
    }
    if (visor.length < 50) return // sem visor detectado: a coruja fica sem olhos animados, mas funciona

    const vp = new Float32Array(visor.length * 9)
    visor.forEach((t, q) => {
      for (let j = 0; j < 3; j++) {
        const k = vi(t, j)
        // um pouquinho à frente da superfície, para não "brigar" com o visor
        vp[q * 9 + j * 3] = P.getX(k) + N.getX(k) * 0.004
        vp[q * 9 + j * 3 + 1] = P.getY(k) + N.getY(k) * 0.004 - NECK_Y
        vp[q * 9 + j * 3 + 2] = P.getZ(k) + N.getZ(k) * 0.004
      }
    })
    const vg = new BufferGeometry()
    vg.setAttribute('position', new BufferAttribute(vp, 3))
    vg.computeBoundingBox()
    const bb = vg.boundingBox!
    const uv = new Float32Array(visor.length * 6)
    for (let i = 0; i < visor.length * 3; i++) {
      uv[i * 2] = (vp[i * 3] - bb.min.x) / (bb.max.x - bb.min.x)
      uv[i * 2 + 1] = (vp[i * 3 + 1] - bb.min.y) / (bb.max.y - bb.min.y)
    }
    vg.setAttribute('uv', new BufferAttribute(uv, 2))
    const fm = new MeshBasicMaterial({ map: this.faceTex, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false })
    fm.color.setScalar(1.5)
    this.head.add(new Mesh(vg, fm)) // presa ao osso da cabeça: gira junto
  }

  /** Brilhos: núcleo do peito e luz embaixo (flutuando). */
  private halos() {
    const c = document.createElement('canvas')
    c.width = c.height = 128
    const g = c.getContext('2d')!
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    gr.addColorStop(0, 'rgba(80,240,255,0.9)')
    gr.addColorStop(0.35, 'rgba(40,200,255,0.3)')
    gr.addColorStop(1, 'rgba(40,200,255,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 128, 128)
    const tex = new CanvasTexture(c)
    tex.colorSpace = SRGBColorSpace
    const halo = (x: number, y: number, z: number, size: number, opacity: number) => {
      const s = new Sprite(new SpriteMaterial({ map: tex, blending: AdditiveBlending, depthWrite: false, transparent: true, opacity }))
      s.position.set(x, y, z)
      s.scale.setScalar(size)
      return s
    }
    this.coreHalo = halo(0, 0.53, 0.5, 0.55, 0.6)
    this.root.add(this.coreHalo)
    const floor = halo(0, 0, 0, 1, 0.4) // achatado, para caber inteiro no canvas (sem corte reto embaixo)
    floor.scale.set(1.3, 0.5, 1)
    this.scene.add(floor)
  }

  start() {
    window.addEventListener('pointermove', this.onMove, { passive: true })
    document.addEventListener('visibilitychange', this.onVis)
    this.canvas.style.opacity = '1'
    this.raf = requestAnimationFrame(this.frame)
  }

  /** Fica feliz por um instante (olhos sorrindo e asas batendo). */
  cheer(ms = 1300) {
    this.happyUntil = performance.now() + ms
  }

  /** Centro da coruja na tela (as partículas saem daqui e voltam para cá). */
  center() {
    return { x: this.cur.cx, y: this.cur.cy, r: this.cur.side * 0.22 }
  }

  private onMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return
    this.mouse.x = e.clientX
    this.mouse.y = e.clientY
    this.mouse.at = performance.now()
  }
  private onVis = () => {
    cancelAnimationFrame(this.raf)
    if (!document.hidden) this.raf = requestAnimationFrame(this.frame)
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame)
    const still = reduced()
    const t = now / 1000
    // suavização por tempo (igual em telas de 60 Hz, 120 Hz ou aparelhos lentos)
    const dt = Math.min(0.1, (now - (this.last || now)) / 1000)
    this.last = now
    const ease = (rate: number) => 1 - Math.exp(-dt * rate)

    // ---- posição e tamanho na tela (segue a âncora suavemente) ----
    const r = this.anchorEl?.getBoundingClientRect()
    if (r && r.height > 0) {
      const tgt = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, side: Math.min(r.height * 1.25, window.innerWidth * 1.15) }
      const first = !this.cur.side
      const e = first || still ? 1 : ease(6.5)
      const dx = (tgt.cx - this.cur.cx) * e
      const dy = (tgt.cy - this.cur.cy) * e
      this.cur.cx += dx
      this.cur.cy += dy
      this.cur.side += (tgt.side - this.cur.side) * e
      this.speed += ((first || !dt ? 0 : Math.hypot(dx, dy) / (dt * 60)) - this.speed) * ease(12)
      // resolução do desenho: cresce na hora (para não borrar) e encolhe quando ela para no canto
      const settled = Math.abs(tgt.side - this.cur.side) < 1
      if (tgt.side > this.buffer + 2 || (settled && this.buffer > tgt.side + 2)) {
        this.buffer = Math.ceil(tgt.side)
        this.renderer.setSize(this.buffer, this.buffer, true)
      }
    }
    if (!this.buffer) return
    const side = this.cur.side
    this.canvas.style.transform = `translate(${this.cur.cx - side / 2}px, ${this.cur.cy - side / 2}px) scale(${side / this.buffer})`

    // ---- olhar: segue o mouse; sem mouse, olha em volta devagar ----
    const fresh = now - this.mouse.at < 4000
    const lx = fresh ? clamp((this.mouse.x - this.cur.cx) / (window.innerWidth * 0.45)) : still ? 0 : Math.sin(t * 0.5) * 0.35
    const ly = fresh ? clamp((this.cur.cy - this.mouse.y) / (window.innerHeight * 0.45)) : still ? 0 : Math.sin(t * 0.37) * 0.15
    this.look.x += (lx - this.look.x) * ease(5)
    this.look.y += (ly - this.look.y) * ease(5)

    // ---- expressões ----
    if (!still && now > this.nextBlink) {
      this.blinkAt = now
      this.nextBlink = now + 2600 + Math.random() * 3800
    }
    const bp = (now - this.blinkAt) / 180
    const blink = bp >= 0 && bp < 1 ? Math.sin(bp * Math.PI) : 0
    const happy = now < this.happyUntil
    this.talk += ((this.talking ? 1 : 0) - this.talk) * ease(12)

    // ---- pose ----
    this.root.position.y = still ? 0 : Math.sin(t * 1.6) * 0.035
    this.root.rotation.y = this.look.x * 0.15
    this.root.rotation.z = -this.look.x * 0.04
    const nod = still ? 0 : this.talk * 0.025 * Math.sin(t * 9)
    this.head.rotation.set(-this.look.y * 0.18 + nod, this.look.x * 0.55, -this.look.x * 0.1)
    let flap = still ? 0 : Math.sin(t * 2.2) * 0.07
    if (!still) {
      if (happy) flap += 0.3 * Math.abs(Math.sin(t * 12))
      flap += Math.min(0.35, this.speed * 0.03) * Math.abs(Math.sin(t * 15)) // bate as asas ao se deslocar
    }
    this.wingL.rotation.z = -flap
    this.wingR.rotation.z = flap
    const sweep = still ? 0 : 0.08 * Math.sin(t * 2.2)
    this.wingL.rotation.y = sweep
    this.wingR.rotation.y = -sweep
    ;(this.coreHalo.material as SpriteMaterial).opacity = 0.5 + (still ? 0 : 0.2 * Math.sin(t * 3))

    this.drawFace(t, blink, happy)
    this.renderer.render(this.scene, this.cam)
  }

  /** Olhos de anel ciano no visor. Só redesenha quando algo muda. */
  private drawFace(t: number, blink: number, happy: boolean) {
    const talking = this.talk > 0.02
    const key = talking ? '' : `${happy}|${blink.toFixed(2)}|${this.look.x.toFixed(2)}|${this.look.y.toFixed(2)}`
    if (key && key === this.faceKey) return
    this.faceKey = key
    const c = this.faceCtx
    const w = 1024
    const h = 512
    c.setTransform(0.5, 0, 0, 0.5, 0, 0) // desenha em 1024×512 e reduz pela metade
    c.clearRect(0, 0, w, h)
    const cx = w / 2 + this.look.x * 70
    const cy = h * 0.52 - this.look.y * 40
    const R = 100
    c.shadowColor = '#28e1ff'
    c.shadowBlur = 45
    for (const sx of [-1, 1]) {
      c.save()
      c.translate(cx + sx * 215, cy)
      if (happy) {
        c.strokeStyle = '#8ff7ff'
        c.lineWidth = 30
        c.lineCap = 'round'
        c.beginPath()
        c.arc(0, 30, R * 0.78, Math.PI * 1.15, Math.PI * 1.85)
        c.stroke()
      } else {
        c.scale(1, Math.max(0.07, 1 - blink))
        c.strokeStyle = '#4ff0ff'
        c.lineWidth = 28
        c.beginPath()
        c.arc(0, 0, R, 0, Math.PI * 2)
        c.stroke()
        c.fillStyle = '#d5fcff'
        c.beginPath()
        c.arc(this.look.x * 18, -this.look.y * 12, R * 0.4, 0, Math.PI * 2)
        c.fill()
      }
      c.restore()
    }
    if (talking) {
      // onda de voz embaixo dos olhos
      c.shadowBlur = 25
      c.fillStyle = '#4ff0ff'
      for (let i = 0; i < 9; i++) {
        const hh = 10 + this.talk * 70 * Math.abs(Math.sin(i * 1.7 + t * 14)) * (1 - Math.abs(i - 4) / 6)
        c.fillRect(cx - 120 + i * 30 - 6, cy + 175 - hh / 2, 12, hh)
      }
    }
    this.faceTex.needsUpdate = true
  }
}
