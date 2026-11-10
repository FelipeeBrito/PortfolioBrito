/**
 * PARTÍCULAS DAS TRANSIÇÕES
 *
 * Milhares de pontos de luz que saem da coruja, formam o título e o contorno dos cards
 * da seção escolhida e depois voltam para a coruja e somem.
 *
 * Modos:
 *  - gather: voam para a coruja e desaparecem (estado normal, invisível);
 *  - shape:  formam os pontos calculados a partir da página (ver sampleShape).
 */

const PALETTE = ['#1f5fff', '#2a9bff', '#28e1ff', '#a6f3ff', '#ffffff']
const TIERS = 2 // dois níveis de brilho por cor
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export class Particles {
  /** Centro e raio da coruja na tela: de onde as partículas saem e para onde voltam. */
  origin: () => { x: number; y: number; r: number } = () => ({ x: window.innerWidth / 2, y: window.innerHeight / 2, r: 100 })

  private ctx: CanvasRenderingContext2D
  private vw = 0
  private vh = 0
  private dpr = 1
  private raf = 0
  private n: number
  private px: Float32Array
  private py: Float32Array
  private vx: Float32Array
  private vy: Float32Array
  private sx: Float32Array
  private sy: Float32Array
  private k: Float32Array
  private seed: Float32Array
  private col: Uint8Array
  private buckets: Float32Array[]
  private bucketN = new Int32Array(PALETTE.length * TIERS)
  private mode: 'gather' | 'shape' = 'gather'
  private alpha = 1 // começa visível: as partículas convergem e a coruja "se materializa"
  private holdUntil = 0
  private cleared = false

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
    const small = Math.min(window.innerWidth, window.innerHeight) < 700 || (navigator.hardwareConcurrency || 4) <= 4
    const n = (this.n = small ? 2600 : 5200)
    this.px = new Float32Array(n)
    this.py = new Float32Array(n)
    this.vx = new Float32Array(n)
    this.vy = new Float32Array(n)
    this.sx = new Float32Array(n)
    this.sy = new Float32Array(n)
    this.k = new Float32Array(n)
    this.seed = new Float32Array(n)
    this.col = new Uint8Array(n)
    this.resize()
    for (let i = 0; i < n; i++) {
      this.seed[i] = Math.random()
      this.k[i] = 0.035 + Math.random() * 0.06
      const u = Math.random()
      this.col[i] = u < 0.15 ? 0 : u < 0.4 ? 1 : u < 0.75 ? 2 : u < 0.93 ? 3 : 4
      this.px[i] = Math.random() * this.vw
      this.py[i] = Math.random() * this.vh
    }
    this.buckets = Array.from({ length: PALETTE.length * TIERS }, () => new Float32Array(n * 2))
  }

  start() {
    window.addEventListener('resize', this.resize)
    document.addEventListener('visibilitychange', () => {
      cancelAnimationFrame(this.raf)
      if (!document.hidden) this.raf = requestAnimationFrame(this.frame)
    })
    if (reduced()) this.alpha = 0
    this.raf = requestAnimationFrame(this.frame)
  }

  private resize = () => {
    this.vw = window.innerWidth
    this.vh = window.innerHeight
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = Math.round(this.vw * this.dpr)
    this.canvas.height = Math.round(this.vh * this.dpr)
    this.canvas.style.width = `${this.vw}px`
    this.canvas.style.height = `${this.vh}px`
    this.cleared = false
  }

  /** As partículas aparecem e "explodem" a partir de onde estão. */
  burst(strength = 1) {
    if (reduced()) return
    this.alpha = Math.max(this.alpha, 0.95)
    this.holdUntil = performance.now() + 450
    for (let i = 0; i < this.n; i++) {
      const a = this.seed[i] * 6.283 + i
      const f = (4 + this.seed[(i * 7) % this.n] * 14) * strength
      this.vx[i] += Math.cos(a) * f
      this.vy[i] += Math.sin(a) * f
    }
  }

  /** Formam os pontos informados (coordenadas da tela). */
  formShape(points: Float32Array) {
    const m = points.length / 2
    if (!m || reduced()) return
    for (let i = 0; i < this.n; i++) {
      const j = Math.floor(this.seed[i] * m * 0.999) * 2
      this.sx[i] = points[j] + (this.seed[(i * 3) % this.n] - 0.5) * 2.5
      this.sy[i] = points[j + 1] + (this.seed[(i * 5) % this.n] - 0.5) * 2.5
    }
    this.mode = 'shape'
  }

  /** Voltam para a coruja e somem. */
  gather() {
    this.mode = 'gather'
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame)
    const ctx = this.ctx
    const shape = this.mode === 'shape'
    const want = shape || now < this.holdUntil ? 1 : 0
    this.alpha += (want - this.alpha) * (want ? 0.2 : 0.045)
    const O = this.origin()

    if (this.alpha < 0.012 && !want) {
      // invisíveis: ficam "guardadas" na coruja, prontas para a próxima transição
      if (!this.cleared) {
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
        ctx.clearRect(0, 0, this.vw, this.vh)
        this.cleared = true
      }
      for (let i = 0; i < this.n; i++) {
        const a = this.seed[i] * 6.283
        const rr = O.r * Math.sqrt(this.seed[(i * 11) % this.n])
        this.px[i] = O.x + Math.cos(a) * rr
        this.py[i] = O.y + Math.sin(a) * rr
        this.vx[i] = this.vy[i] = 0
      }
      return
    }
    this.cleared = false

    this.bucketN.fill(0)
    for (let i = 0; i < this.n; i++) {
      let tx: number
      let ty: number
      if (shape) {
        tx = this.sx[i]
        ty = this.sy[i]
      } else {
        const a = this.seed[i] * 6.283
        const rr = O.r * Math.sqrt(this.seed[(i * 11) % this.n])
        tx = O.x + Math.cos(a) * rr
        ty = O.y + Math.sin(a) * rr
      }
      const k = this.k[i] * (shape ? 1.25 : 1)
      this.vx[i] = (this.vx[i] + (tx - this.px[i]) * k) * 0.8
      this.vy[i] = (this.vy[i] + (ty - this.py[i]) * k) * 0.8
      this.px[i] += this.vx[i]
      this.py[i] += this.vy[i]
      const x = this.px[i]
      const y = this.py[i]
      if (x < -4 || y < -4 || x > this.vw + 4 || y > this.vh + 4) continue
      const b = this.col[i] * TIERS + (this.seed[i] > 0.45 ? 1 : 0)
      const arr = this.buckets[b]
      const kk = this.bucketN[b]++ * 2
      arr[kk] = x
      arr[kk + 1] = y
    }

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, this.vw, this.vh)
    ctx.globalCompositeOperation = 'lighter'
    const s = 1.7
    for (let b = 0; b < this.bucketN.length; b++) {
      const c = this.bucketN[b]
      if (!c) continue
      ctx.globalAlpha = this.alpha * (b % TIERS ? 1 : 0.55)
      ctx.fillStyle = PALETTE[(b / TIERS) | 0]
      ctx.beginPath()
      const arr = this.buckets[b]
      for (let k = 0; k < c * 2; k += 2) ctx.rect(arr[k] - s / 2, arr[k + 1] - s / 2, s, s)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  }
}

/**
 * Lê a página e gera os pontos que as partículas vão formar:
 *  - [data-p="text"] → o texto do elemento, desenhado com a mesma fonte
 *  - [data-p="box"]  → o contorno do elemento (cards, painéis)
 */
export function sampleShape(root: HTMLElement, max = 7000): Float32Array {
  const pts: number[] = []
  const vh = window.innerHeight
  root.querySelectorAll<HTMLElement>('[data-p]').forEach((el) => {
    const r = el.getBoundingClientRect()
    if (r.bottom < 0 || r.top > vh || !r.width) return
    if (el.dataset.p === 'text') {
      const cs = getComputedStyle(el)
      const c = document.createElement('canvas')
      c.width = Math.ceil(r.width)
      c.height = Math.ceil(r.height)
      const g = c.getContext('2d', { willReadFrequently: true })!
      g.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
      g.fillStyle = '#fff'
      g.textBaseline = 'middle'
      const text = el.textContent?.trim() ?? ''
      const tw = g.measureText(text).width
      const x = cs.textAlign === 'center' ? (r.width - tw) / 2 : 0
      g.fillText(text, x, r.height / 2)
      const d = g.getImageData(0, 0, c.width, c.height).data
      const step = parseFloat(cs.fontSize) > 40 ? 3 : 2
      for (let y = 0; y < c.height; y += step)
        for (let xx = 0; xx < c.width; xx += step) if (d[(y * c.width + xx) * 4 + 3] > 128) pts.push(r.left + xx, r.top + y)
    } else {
      const per = 2 * (r.width + r.height)
      const count = Math.min(900, Math.round(per / 3))
      for (let i = 0; i < count; i++) {
        const t = (i / count) * per
        if (t < r.width) pts.push(r.left + t, r.top)
        else if (t < r.width + r.height) pts.push(r.right, r.top + t - r.width)
        else if (t < 2 * r.width + r.height) pts.push(r.right - (t - r.width - r.height), r.bottom)
        else pts.push(r.left, r.bottom - (t - 2 * r.width - r.height))
      }
    }
  })
  // limita a quantidade (mantém a distribuição)
  if (pts.length / 2 > max) {
    const out = new Float32Array(max * 2)
    const stride = pts.length / 2 / max
    for (let i = 0; i < max; i++) {
      const j = Math.floor(i * stride) * 2
      out[i * 2] = pts[j]
      out[i * 2 + 1] = pts[j + 1]
    }
    return out
  }
  return Float32Array.from(pts)
}
