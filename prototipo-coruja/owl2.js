import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/**
 * CORUJA 3D
 * O modelo (uma peça só) é separado automaticamente em corpo, cabeça e duas asas,
 * pela posição de cada triângulo. Sobre o visor (triângulos escuros da frente da cabeça)
 * é criada uma "tela" onde os olhos são desenhados ao vivo.
 */
const NECK_Y = 0.85
const W = innerWidth, H = innerHeight
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false })
renderer.setSize(W, H); renderer.setPixelRatio(1)
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0
document.body.appendChild(renderer.domElement)
const scene = new THREE.Scene(); scene.background = new THREE.Color('#03050c')
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.55
scene.add(new THREE.HemisphereLight('#cfe0ff', '#0a1020', 0.45))
const key = new THREE.DirectionalLight('#ffffff', 1.3); key.position.set(3, 5, 6); scene.add(key)
const rimC = new THREE.DirectionalLight('#28e1ff', 1.6); rimC.position.set(-4, 2, -3); scene.add(rimC)
const rimB = new THREE.DirectionalLight('#7f9cff', 1.0); rimB.position.set(4, 1, -3); scene.add(rimB)
const cam = new THREE.PerspectiveCamera(30, W / H, 0.01, 50)
cam.position.set(0, 0.95, 4.6); cam.lookAt(0, 0.82, 0)

const owl = new THREE.Group(); scene.add(owl)
const parts = {}

// tela dos olhos
const fc = document.createElement('canvas'); fc.width = 1024; fc.height = 512
const fx = fc.getContext('2d')
const faceTex = new THREE.CanvasTexture(fc); faceTex.colorSpace = THREE.SRGBColorSpace

function split(mesh) {
  // o arquivo otimizado guarda os números comprimidos: converte tudo para float e aplica a escala do modelo
  let g = mesh.geometry.clone()
  for (const name of ['position', 'normal', 'uv']) {
    const a = g.attributes[name], f = new Float32Array(a.count * a.itemSize)
    for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) f[i * a.itemSize + c] = a.getComponent(i, c)
    g.setAttribute(name, new THREE.BufferAttribute(f, a.itemSize))
  }
  mesh.updateWorldMatrix(true, false)
  g.applyMatrix4(mesh.matrixWorld)
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv
  // lê a textura de cor para achar o visor (pixels bem escuros)
  const img = mesh.material.map.image
  const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height
  const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0)
  const tex = cx.getImageData(0, 0, img.width, img.height).data
  const dark = (u, v) => {
    const x = Math.min(img.width - 1, Math.max(0, Math.floor(u * img.width)))
    const y = Math.min(img.height - 1, Math.max(0, Math.floor(v * img.height)))
    const k = (y * img.width + x) * 4
    return 0.3 * tex[k] + 0.59 * tex[k + 1] + 0.11 * tex[k + 2] < 40
  }
  // ---- esqueleto com pesos suaves: o modelo continua inteiro, sem cortes ----
  const sm = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k) }
  const P = g.attributes.position, nv = P.count
  const skinIndex = new Uint16Array(nv * 4), skinWeight = new Float32Array(nv * 4)
  for (let i = 0; i < nv; i++) {
    const x = P.getX(i), y = P.getY(i)
    const z = P.getZ(i)
    // cabeça: passa de 0 a 1 suavemente no pescoço; o bico (frente, centro) vai inteiro com a cabeça
    const beak = sm(0.2, 0.3, z) * (1 - sm(0.12, 0.2, Math.abs(x))) * sm(0.72, 0.76, y)
    const hw = Math.max(sm(NECK_Y - 0.07, NECK_Y + 0.05, y), beak)
    const ww = sm(0.46, 0.62, Math.abs(x)) * sm(0.3, 0.42, y) * (1 - sm(0.84, 0.92, y)) * (1 - hw) // asas: suave no ombro
    skinIndex.set([0, 1, x < 0 ? 2 : 3, 0], i * 4)
    skinWeight.set([1 - hw - ww, hw, ww, 0], i * 4)
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4))
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4))
  const root = new THREE.Bone(), headB = new THREE.Bone(), wl = new THREE.Bone(), wr = new THREE.Bone()
  headB.position.set(0, NECK_Y, 0); wl.position.set(-0.5, 0.64, 0); wr.position.set(0.5, 0.64, 0)
  root.add(headB, wl, wr)
  const skinned = new THREE.SkinnedMesh(g, mesh.material)
  skinned.add(root); skinned.bind(new THREE.Skeleton([root, headB, wl, wr]))
  owl.add(skinned)
  parts.head = headB; parts.wingL = wl; parts.wingR = wr

  // triângulos do visor (escuros, na frente da cabeça) para a tela dos olhos
  const visorTris = []
  const U = g.attributes.uv, N = g.attributes.normal, idx = g.index
  const triCount = idx ? idx.count / 3 : nv / 3
  const vi = (t, j) => (idx ? idx.getX(t * 3 + j) : t * 3 + j)
  for (let t = 0; t < triCount; t++) {
    let cy = 0, cz = 0, nz = 0, u = 0, v = 0
    for (let j = 0; j < 3; j++) { const k = vi(t, j); cy += P.getY(k); cz += P.getZ(k); nz += N.getZ(k); u += U.getX(k); v += U.getY(k) }
    if (cy / 3 > NECK_Y + 0.05 && cz / 3 > 0.15 && nz / 3 > 0.2 && dark(u / 3, v / 3)) visorTris.push(t)
  }
  const vp = new Float32Array(visorTris.length * 9), vn = new Float32Array(visorTris.length * 9)
  visorTris.forEach((t, q) => { for (let j = 0; j < 3; j++) { const k = vi(t, j); for (let c = 0; c < 3; c++) { vp[q * 9 + j * 3 + c] = P.getComponent(k, c); vn[q * 9 + j * 3 + c] = N.getComponent(k, c) } } })
  const vg = new THREE.BufferGeometry()
  vg.setAttribute('position', new THREE.BufferAttribute(vp, 3)); vg.setAttribute('normal', new THREE.BufferAttribute(vn, 3))
  // tela do visor: mesmos triângulos, um pouquinho à frente, com UV projetado de frente
  vg.computeBoundingBox(); const bb = vg.boundingBox
  const p = vg.attributes.position, n = vg.attributes.normal, uvs = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) + n.getX(i) * 0.004, p.getY(i) + n.getY(i) * 0.004, p.getZ(i) + n.getZ(i) * 0.004)
    uvs[i * 2] = (p.getX(i) - bb.min.x) / (bb.max.x - bb.min.x)
    uvs[i * 2 + 1] = (p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y)
  }
  vg.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  vg.translate(0, -NECK_Y, 0)
  const fm = new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
  fm.color.setScalar(1.5)
  parts.head.add(new THREE.Mesh(vg, fm))
  window.visorBox = [bb.min.x, bb.max.x, bb.min.y, bb.max.y]
}

// rosto: olhos de anel ciano (estilo coruja)
function drawFace(s) {
  const c = fx, w = 1024, h = 512
  c.clearRect(0, 0, w, h)
  const cx = w / 2 + s.look[0] * 70, cy = h * 0.52 - s.look[1] * 40
  const dx = 215, R = s.mood === 'surprise' ? 118 : 100
  c.shadowColor = '#28e1ff'; c.shadowBlur = 45
  for (const sx of [-1, 1]) {
    c.save(); c.translate(cx + sx * dx, cy)
    if (s.mood === 'happy') {
      c.strokeStyle = '#8ff7ff'; c.lineWidth = 30; c.lineCap = 'round'
      c.beginPath(); c.arc(0, 30, R * 0.78, Math.PI * 1.15, Math.PI * 1.85); c.stroke()
    } else {
      c.scale(1, Math.max(0.07, 1 - s.blink))
      c.strokeStyle = '#4ff0ff'; c.lineWidth = 28
      c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.stroke()
      c.fillStyle = '#d5fcff'
      c.beginPath(); c.arc(s.look[0] * 18, -s.look[1] * 12, R * 0.4, 0, Math.PI * 2); c.fill()
    }
    c.restore()
  }
  if (s.talk > 0.01) {
    c.shadowBlur = 25; c.fillStyle = '#4ff0ff'
    for (let i = 0; i < 9; i++) {
      const hh = 10 + s.talk * 70 * Math.abs(Math.sin(i * 1.7 + s.t * 14)) * (1 - Math.abs(i - 4) / 6)
      c.fillRect(cx - 120 + i * 30 - 6, cy + 175 - hh / 2, 12, hh)
    }
  }
  faceTex.needsUpdate = true
}

// halo de luz embaixo (flutuando) e no núcleo
const haloTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128
  const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  gr.addColorStop(0, 'rgba(80,240,255,0.9)'); gr.addColorStop(0.35, 'rgba(40,200,255,0.3)'); gr.addColorStop(1, 'rgba(40,200,255,0)')
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t
})()
const halo = (pos, size, op) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: op })); m.position.copy(pos); m.scale.setScalar(size); return m }
const coreHalo = halo(new THREE.Vector3(0, 0.53, 0.5), 0.55, 0.6)
const floor = halo(new THREE.Vector3(0, -0.15, 0), 1.4, 0.35)

window.renderAt = (t, st) => {
  const s = Object.assign({ yaw: 0, pitch: 0, look: [0, 0], blink: 0, mood: 'normal', talk: 0, flap: 0, lean: 0, owlYaw: 0 }, st)
  owl.position.y = Math.sin(t * 1.6) * 0.035
  owl.rotation.y = s.owlYaw; owl.rotation.z = s.lean
  parts.head.rotation.set(s.pitch, s.yaw, -s.yaw * 0.12)
  const f = Math.sin(t * 2.2) * 0.07 + s.flap
  parts.wingL.rotation.z = -f; parts.wingR.rotation.z = f
  parts.wingL.rotation.y = 0.08 * Math.sin(t * 2.2); parts.wingR.rotation.y = -0.08 * Math.sin(t * 2.2)
  coreHalo.material.opacity = 0.5 + 0.2 * Math.sin(t * 3)
  drawFace({ ...s, t })
  renderer.render(scene, cam)
}
window.demoAt = (t) => {
  const ease = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k) }
  const lx = Math.sin(t * 1.1) * 0.9 * (1 - ease(4.3, 5, t)), ly = Math.cos(t * 0.8) * 0.35 * (1 - ease(4.3, 5, t))
  const blink = [1.2, 3.6].map((b) => Math.max(0, 1 - Math.abs(t - b) / 0.09)).reduce((a, b) => Math.max(a, b), 0)
  const happy = t > 4.6
  renderAt(t, { yaw: lx * 0.55, pitch: -ly * 0.15, look: [lx, ly], blink, mood: happy ? 'happy' : 'normal', talk: t > 2 && t < 3.4 ? 1 : 0,
    flap: happy ? 0.35 * Math.abs(Math.sin((t - 4.6) * 6)) : 0, lean: -lx * 0.05, owlYaw: lx * 0.15 })
}

const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder)
loader.load('owl.glb', (g) => {
  let mesh; g.scene.traverse((o) => { if (o.isMesh) mesh = o })
  split(mesh)
  owl.add(coreHalo); scene.add(floor)
  window.__ready = true
})
