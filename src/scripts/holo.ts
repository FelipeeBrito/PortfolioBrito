/**
 * MOTOR DO ROBÔ HOLOGRAMA
 *
 * A imagem public/robot/holo.webp é "escaneada": as linhas brilhantes viram milhares de
 * partículas com a cor do desenho. Cada partícula tem uma posição de origem no robô e
 * pode voar para qualquer outro alvo (texto, contorno de cards...) e voltar.
 *
 * Modos:
 *  - robot: as partículas formam o robô sobre um elemento âncora (grande no início, pequeno no canto).
 *  - shape: as partículas formam pontos calculados a partir da página (títulos, contornos).
 *
 * Animações do robô: flutuar, inclinar com o mouse, piscar, boca mexendo ao falar,
 * núcleo do peito pulsando e efeitos de holograma (cintilar, faixa de varredura, falha).
 */

// Paleta (as cores da imagem são aproximadas para estas, para desenhar em lotes)
const PALETTE = ['#0b3aa8', '#1f5fff', '#2a9bff', '#28e1ff', '#a6f3ff', '#ffffff']
const ALPHAS = 4

// Regiões do desenho (em pixels da imagem 620×655) para animar olhos, boca e peito
const IMG_H = 655
const REG = {
  eyeL: { x0: 205, x1: 300, y0: 245, y1: 305, cy: 278 },
  eyeR: { x0: 365, x1: 455, y0: 245, y1: 305, cy: 278 },
  mouth: { x0: 285, x1: 375, y0: 305, y1: 350, cy: 322 },
  core: { x0: 268, x1: 352, y0: 462, y1: 540 },
}

export interface Anchor {
  cx: number
  cy: number
  /** altura do robô na tela (px) */
  h: number
}

const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export class Holo {
  private ctx: CanvasRenderingContext2D
  private vw = 0
  private vh = 0
  private dpr = 1
  private raf = 0

  private n = 0
  private bx = new Float32Array(0) // origem no robô (normalizada pela altura; centro = 0,0)
  private by = new Float32Array(0)
  private col = new Uint8Array(0)
  private lum = new Float32Array(0)
  private reg = new Uint8Array(0) // 0 nada · 1 olho esq · 2 olho dir · 3 boca · 4 núcleo
  private px = new Float32Array(0)
  private py = new Float32Array(0)
  private vx = new Float32Array(0)
  private vy = new Float32Array(0)
  private k = new Float32Array(0)
  private seed = new Float32Array(0)
  private sx = new Float32Array(0) // alvo de "shape"
  private sy = new Float32Array(0)
  private buckets: Float32Array[] = []
  private bucketN = new Int32Array(PALETTE.length * ALPHAS)

  private eyeY = 0
  private mouthY = 0

  mode: 'robot' | 'shape' = 'robot'
  /** de onde ler a posição do robô */
  anchorEl: HTMLElement | null = null
  /** 0…1: quanto a boca está "falando" */
  talking = false
  private mouthOpen = 0
  private blinkAt = 0
  private nextBlink = 2500
  private pulseAt = -1e9
  private tilt = 0
  private mouse = { x: 0, y: 0, at: -1e9 }
  private born = 0
  private visible = 1 // opacidade geral
  private cur: Anchor = { cx: 0, cy: 0, h: 0 }

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
  }

  /** Carrega a imagem e cria as partículas. Celular usa menos partículas. */
  async load(url: string) {
    const img = new Image()
    img.src = url
    await img.decode()
    const W = img.naturalWidth
    const H = img.naturalHeight
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const g = c.getContext('2d', { willReadFrequently: true })!
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, W, H).data

    const small = Math.min(window.innerWidth, window.innerHeight) < 700 || (navigator.hardwareConcurrency || 4) <= 4
    const step = small ? 3 : 2
    const xs: number[] = []
    const ys: number[] = []
    const cs: number[] = []
    const ls: number[] = []
    const rs: number[] = []
    let s = 12345
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    const inReg = (x: number, y: number, r: { x0: number; x1: number; y0: number; y1: number }) =>
      x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1
    for (let y = 0; y < H; y += step) {
      for (let x = 0; x < W; x += step) {
        const k = (y * W + x) * 4
        if (d[k + 3] < 100) continue
        const r = d[k]
        const gg = d[k + 1]
        const b = d[k + 2]
        const l = (0.3 * r + 0.59 * gg + 0.11 * b) / 255
        if (rnd() > Math.min(1, l ** 1.6 * (small ? 2.2 : 1.5))) continue // linhas brilhantes = mais partículas
        xs.push(x / IMG_H - (W / IMG_H) * 0.5)
        ys.push(y / IMG_H - (H / IMG_H) * 0.5)
        ls.push(l)
        // cor mais próxima da paleta (por brilho e quanto "ciano" tem)
        const cyan = gg / 255
        cs.push(l > 0.86 ? 5 : l > 0.7 ? 4 : cyan > 0.75 ? 3 : cyan > 0.5 ? 2 : l > 0.22 ? 1 : 0)
        const yy = (y * IMG_H) / H
        const xx = (x * IMG_H) / H
        rs.push(inReg(xx, yy, REG.eyeL) ? 1 : inReg(xx, yy, REG.eyeR) ? 2 : inReg(xx, yy, REG.mouth) ? 3 : inReg(xx, yy, REG.core) ? 4 : 0)
      }
    }
    this.eyeY = REG.eyeL.cy / IMG_H - (H / IMG_H) * 0.5
    this.mouthY = REG.mouth.cy / IMG_H - (H / IMG_H) * 0.5

    const n = (this.n = xs.length)
    this.bx = Float32Array.from(xs)
    this.by = Float32Array.from(ys)
    this.col = Uint8Array.from(cs)
    this.lum = Float32Array.from(ls)
    this.reg = Uint8Array.from(rs)
    this.px = new Float32Array(n)
    this.py = new Float32Array(n)
    this.vx = new Float32Array(n)
    this.vy = new Float32Array(n)
    this.k = new Float32Array(n)
    this.seed = new Float32Array(n)
    this.sx = new Float32Array(n)
    this.sy = new Float32Array(n)
    this.resize()
    for (let i = 0; i < n; i++) {
      this.seed[i] = rnd()
      this.k[i] = 0.035 + rnd() * 0.06
      // começam espalhadas pela tela: o robô "se materializa"
      this.px[i] = rnd() * this.vw
      this.py[i] = rnd() * this.vh
    }
    this.buckets = Array.from({ length: PALETTE.length * ALPHAS }, () => new Float32Array(n * 2))
    this.born = performance.now()
    return n
  }

  start() {
    window.addEventListener('resize', this.resize)
    window.addEventListener('pointermove', this.onMove, { passive: true })
    document.addEventListener('visibilitychange', this.onVis)
    this.raf = requestAnimationFrame(this.frame)
  }

  private onVis = () => {
    cancelAnimationFrame(this.raf)
    if (!document.hidden) this.raf = requestAnimationFrame(this.frame)
  }

  private onMove = (e: PointerEvent) => {
    this.mouse.x = e.clientX
    this.mouse.y = e.clientY
    this.mouse.at = performance.now()
  }

  private resize = () => {
    this.vw = window.innerWidth
    this.vh = window.innerHeight
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.canvas.width = Math.round(this.vw * this.dpr)
    this.canvas.height = Math.round(this.vh * this.dpr)
    this.canvas.style.width = `${this.vw}px`
    this.canvas.style.height = `${this.vh}px`
  }

  /** "Explode" as partículas (impulso aleatório). */
  burst(strength = 1) {
    for (let i = 0; i < this.n; i++) {
      const a = this.seed[i] * 6.283 + i
      const f = (4 + this.seed[(i * 7) % this.n] * 14) * strength
      this.vx[i] += Math.cos(a) * f
      this.vy[i] += Math.sin(a) * f
    }
  }

  /** Faz as partículas formarem os pontos informados (coordenadas da tela). */
  formShape(points: Float32Array) {
    const m = points.length / 2
    if (!m) return
    for (let i = 0; i < this.n; i++) {
      const j = Math.floor(this.seed[i] * m * 0.999) * 2
      this.sx[i] = points[j] + (this.seed[(i * 3) % this.n] - 0.5) * 2.5
      this.sy[i] = points[j + 1] + (this.seed[(i * 5) % this.n] - 0.5) * 2.5
    }
    this.mode = 'shape'
    if (reduce()) {
      this.px.set(this.sx)
      this.py.set(this.sy)
    }
  }

  /** Volta a formar o robô sobre a âncora. */
  formRobot(anchorEl: HTMLElement) {
    this.anchorEl = anchorEl
    this.mode = 'robot'
  }

  pulse() {
    this.pulseAt = performance.now()
  }

  setVisible(v: number) {
    this.visible = v
  }

  private anchor(): Anchor {
    const el = this.anchorEl
    if (!el) return { cx: this.vw / 2, cy: this.vh / 2, h: Math.min(this.vh * 0.6, 520) }
    const r = el.getBoundingClientRect()
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, h: r.height }
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame)
    const n = this.n
    if (!n) return
    const ctx = this.ctx
    const still = reduce()
    const A = this.anchor()
    // posição do robô suavizada (desliza entre o centro e o canto)
    if (!this.cur.h) this.cur = { ...A }
    const ease = still ? 1 : 0.12
    this.cur.cx += (A.cx - this.cur.cx) * ease
    this.cur.cy += (A.cy - this.cur.cy) * ease
    this.cur.h += (A.h - this.cur.h) * ease
    const L = this.cur
    const robot = this.mode === 'robot'

    // ---- expressões ----
    if (!still && now > this.nextBlink) {
      this.blinkAt = now
      this.nextBlink = now + 2600 + Math.random() * 3800
    }
    const bp = (now - this.blinkAt) / 180
    const blink = bp >= 0 && bp < 1 ? Math.sin(bp * Math.PI) : 0
    const target = this.talking && !still ? 0.5 + 0.5 * Math.abs(Math.sin(now * 0.018)) * (0.6 + 0.4 * Math.sin(now * 0.007)) : 0
    this.mouthOpen += (target - this.mouthOpen) * 0.35
    const fresh = now - this.mouse.at < 4000
    const tt = fresh ? Math.max(-1, Math.min(1, (this.mouse.x - L.cx) / (this.vw * 0.5))) : Math.sin(now * 0.0005) * 0.3
    this.tilt += (tt - this.tilt) * 0.05
    const bob = still ? 0 : Math.sin(now * 0.0016) * L.h * 0.015
    const pAge = (now - this.pulseAt) / 900
    const pulse = pAge >= 0 && pAge < 1 ? 1 - pAge : 0
    const core = 0.75 + 0.25 * Math.sin(now * 0.004)
    const scanY = (((now * 0.00028) % 1.3) - 0.65) // faixa de varredura (em unidades do robô)
    const glitch = !still && (now / 1000) % 7 < 0.07
    const glitchY = ((Math.floor(now / 7000) * 0.37) % 1) - 0.5
    const born = Math.min(1, (now - this.born) / 1600)

    // ---- física: cada partícula persegue seu alvo como uma mola ----
    const size = robot ? Math.max(1.05, (L.h / 655) * 2.1) : 1.7
    this.bucketN.fill(0)
    for (let i = 0; i < n; i++) {
      let tx: number
      let ty: number
      const sd = this.seed[i]
      if (robot) {
        let x = this.bx[i]
        let y = this.by[i]
        const r = this.reg[i]
        if (r === 1 || r === 2) y = this.eyeY + (y - this.eyeY) * (1 - blink * 0.85)
        else if (r === 3) y = this.mouthY + (y - this.mouthY) * (1 + this.mouthOpen * 1.6)
        // inclinação leve (parece girar) + flutuar
        x = x * (1 - Math.abs(this.tilt) * 0.06) + this.tilt * 0.04 * (y + 0.5)
        tx = L.cx + x * L.h
        ty = L.cy + y * L.h + bob
        if (glitch && Math.abs(y - glitchY) < 0.025) tx += L.h * 0.02
        if (!still) tx += Math.sin(now * 0.0021 * (0.6 + sd) + sd * 60) * size * 0.4
      } else {
        tx = this.sx[i]
        ty = this.sy[i]
      }
      if (still) {
        this.px[i] = tx
        this.py[i] = ty
      } else {
        const k = this.k[i] * (robot ? 1 : 1.25)
        this.vx[i] = (this.vx[i] + (tx - this.px[i]) * k) * 0.8
        this.vy[i] = (this.vy[i] + (ty - this.py[i]) * k) * 0.8
        this.px[i] += this.vx[i]
        this.py[i] += this.vy[i]
      }
      const x = this.px[i]
      const y = this.py[i]
      if (x < -4 || y < -4 || x > this.vw + 4 || y > this.vh + 4) continue

      // brilho
      let a: number
      if (robot) {
        a = 0.3 + this.lum[i] * 0.85
        if (this.reg[i] === 4) a *= core + pulse * 0.6
        const yy = this.by[i]
        a += Math.exp(-((yy - scanY) ** 2) / 0.0012) * 0.35
        if (!still) a *= 0.82 + 0.18 * Math.sin(now * 0.005 * (0.4 + sd) + sd * 40)
        a += pulse * 0.4 * Math.exp(-((Math.hypot(this.bx[i], this.by[i]) - (1 - pulse) * 0.7) ** 2) / 0.004)
      } else {
        a = 0.55 + this.lum[i] * 0.45
      }
      a *= this.visible * born
      if (a < 0.05) continue
      const lv = Math.min(ALPHAS - 1, Math.floor(a * ALPHAS))
      const b = this.col[i] * ALPHAS + lv
      const arr = this.buckets[b]
      const kk = this.bucketN[b]++ * 2
      arr[kk] = x
      arr[kk + 1] = y
    }

    // ---- desenho ----
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, this.vw, this.vh)
    ctx.globalCompositeOperation = 'lighter'
    if (robot) {
      const g = ctx.createRadialGradient(L.cx, L.cy, 0, L.cx, L.cy, L.h * 0.75)
      g.addColorStop(0, `rgba(40,140,255,${0.14 * this.visible * born})`)
      g.addColorStop(1, 'rgba(40,140,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(L.cx - L.h, L.cy - L.h, L.h * 2, L.h * 2)
    }
    for (let b = 0; b < this.bucketN.length; b++) {
      const c = this.bucketN[b]
      if (!c) continue
      ctx.globalAlpha = ((b % ALPHAS) + 1) / ALPHAS
      ctx.fillStyle = PALETTE[(b / ALPHAS) | 0]
      const s = size * (0.75 + ((b / ALPHAS) | 0) * 0.07)
      const h = s / 2
      ctx.beginPath()
      const arr = this.buckets[b]
      for (let k = 0; k < c * 2; k += 2) ctx.rect(arr[k] - h, arr[k + 1] - h, s, s)
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
      const align = cs.textAlign
      const text = el.textContent?.trim() ?? ''
      const tw = g.measureText(text).width
      const x = align === 'center' ? (r.width - tw) / 2 : 0
      g.fillText(text, x, r.height / 2)
      const d = g.getImageData(0, 0, c.width, c.height).data
      const step = parseFloat(cs.fontSize) > 40 ? 3 : 2
      for (let y = 0; y < c.height; y += step)
        for (let xx = 0; xx < c.width; xx += step) if (d[(y * c.width + xx) * 4 + 3] > 128) pts.push(r.left + xx, r.top + y)
    } else {
      const per = 2 * (r.width + r.height)
      const count = Math.min(900, Math.round(per / 3))
      const rad = 20
      for (let i = 0; i < count; i++) {
        const t = (i / count) * per
        let x: number
        let y: number
        if (t < r.width) (x = r.left + t), (y = r.top)
        else if (t < r.width + r.height) (x = r.right), (y = r.top + t - r.width)
        else if (t < 2 * r.width + r.height) (x = r.right - (t - r.width - r.height)), (y = r.bottom)
        else (x = r.left), (y = r.bottom - (t - 2 * r.width - r.height))
        // cantos arredondados
        x = Math.min(Math.max(x, r.left + (y < r.top + rad || y > r.bottom - rad ? rad * 0.3 : 0)), r.right - (y < r.top + rad || y > r.bottom - rad ? rad * 0.3 : 0))
        pts.push(x, y)
      }
    }
  })
  // limita a quantidade (mantém a distribuição)
  if (pts.length / 2 > max) {
    const out: number[] = []
    const stride = pts.length / 2 / max
    for (let i = 0; i < max; i++) {
      const j = Math.floor(i * stride) * 2
      out.push(pts[j], pts[j + 1])
    }
    return Float32Array.from(out)
  }
  return Float32Array.from(pts)
}
