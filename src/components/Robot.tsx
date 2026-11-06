import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * ROBÔ HOLOGRAMA
 *
 * As 6 imagens do robô (public/robot/*.webp) são "escaneadas" e viram nuvens de
 * partículas de luz. Ao trocar de pose, as mesmas partículas voam e se reorganizam
 * no novo desenho (morph).
 *
 * Posição: grande no topo da página (sobre o elemento #holo-anchor) e, ao rolar,
 * encolhe e vai para o canto inferior direito, acompanhando o visitante.
 *
 * Como ligar o robô a qualquer elemento da página (sem mexer neste arquivo):
 *   data-robot-hover="ideia"   data-say="Texto"  → ao passar o mouse
 *   data-robot-click="legal"   data-say="Texto"  → ao clicar
 *   data-robot-section="lendo" data-say="Texto"  → quando a seção aparece na tela
 *   window.dispatchEvent(new CustomEvent('robot', { detail: { pose, say } }))
 */

export type Pose = 'acenando' | 'lendo' | 'ideia' | 'legal' | 'rindo' | 'surpreso'
const POSES: Pose[] = ['acenando', 'lendo', 'ideia', 'legal', 'rindo', 'surpreso']

const JOKES = [
  'Por que o programador usa óculos? Porque ele não consegue C#!',
  'Existem 10 tipos de pessoas: as que entendem binário e as que não.',
  'Meu código funciona e eu não sei por quê. Não mexa!',
  'Um robô entra num bar... e pede um byte.',
  'Hehe, faz cócegas nos meus circuitos!',
  'Eu não tenho bugs, tenho funcionalidades surpresa.',
]

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

// Cores do holograma: 0 contorno (brilhante) · 1 ciano · 2 corpo (azul suave) · 3 âmbar (lâmpada/livro)
const COLORS = ['#d8f1ff', '#28e1ff', '#2f6bff', '#ffb547']
const LEVELS = 5
const GRID = 92 // resolução do "escaneamento" (colunas)

interface PoseCloud {
  x: Float32Array
  y: Float32Array
  c: Uint8Array
  n: number
}

/** Lê uma imagem e transforma em lista de pontos coloridos. */
function scan(img: HTMLImageElement): PoseCloud {
  const cv = document.createElement('canvas')
  cv.width = GRID
  cv.height = GRID
  const g = cv.getContext('2d', { willReadFrequently: true })!
  g.drawImage(img, 0, 0, GRID, GRID)
  const d = g.getImageData(0, 0, GRID, GRID).data
  const lumAt = (i: number, j: number) => {
    if (i < 0 || j < 0 || i >= GRID || j >= GRID) return 255
    const k = (j * GRID + i) * 4
    if (d[k + 3] < 120) return 255 // fora do robô conta como "claro"
    return 0.3 * d[k] + 0.59 * d[k + 1] + 0.11 * d[k + 2]
  }
  const xs: number[] = []
  const ys: number[] = []
  const cs: number[] = []
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const k = (j * GRID + i) * 4
      if (d[k + 3] < 120) continue
      const r = d[k]
      const gg = d[k + 1]
      const b = d[k + 2]
      const lum = 0.3 * r + 0.59 * gg + 0.11 * b
      let c: number
      if (r > 170 && b < gg - 35 && gg > 90) c = 3 // amarelo/laranja (lâmpada, livro)
      else if (b > 150 && gg > 140 && r < 140) c = 1 // ciano (olhos, detalhes)
      else if (lum < 110) {
        // escuro: só vira luz se for BORDA (vizinho claro). O interior do visor fica vazio,
        // assim os olhos ciano aparecem bem.
        const edge =
          lumAt(i - 1, j) > 150 || lumAt(i + 1, j) > 150 || lumAt(i, j - 1) > 150 || lumAt(i, j + 1) > 150
        if (!edge) continue
        c = 0
      } else {
        // corpo branco: preenchimento leve (1 a cada 3 pontos)
        if ((i + j * 2) % 3 !== 0) continue
        c = 2
      }
      xs.push(i / GRID - 0.5)
      ys.push(j / GRID - 0.5)
      cs.push(c)
    }
  }
  return { x: Float32Array.from(xs), y: Float32Array.from(ys), c: Uint8Array.from(cs), n: xs.length }
}

export default function Robot() {
  const [say, setSay] = useState('Olá! Eu sou o assistente holográfico do laboratório. Vamos explorar?')
  const [bubble, setBubble] = useState(true)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hitRef = useRef<HTMLButtonElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)

  const poseRef = useRef<Pose>('acenando')
  const setPoseRef = useRef<(p: Pose) => void>(() => {})
  const pulseRef = useRef(-1e9)
  const backTimer = useRef(0)
  const bubbleTimer = useRef(0)
  const idleTimer = useRef(0)
  const lockUntil = useRef(0)
  const jokeIdx = useRef(0)

  /** Troca a pose (e fala). Depois de alguns segundos volta à pose padrão. */
  const react = useCallback((p: Pose, text?: string, hold = 3800, priority = false) => {
    const now = Date.now()
    if (!priority && now < lockUntil.current) return
    if (priority) lockUntil.current = now + 1500
    setPoseRef.current(p)
    if (text) {
      setSay(text)
      setBubble(true)
      window.clearTimeout(bubbleTimer.current)
      bubbleTimer.current = window.setTimeout(() => setBubble(false), hold)
    }
    window.clearTimeout(backTimer.current)
    backTimer.current = window.setTimeout(() => setPoseRef.current('acenando'), hold + 300)
  }, [])

  // ------------------------------------------------------------ motor do holograma
  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let vw = 0
    let vh = 0
    let dpr = 1
    let raf = 0
    let alive = true

    const clouds = new Map<Pose, PoseCloud>()
    let N = 0
    let px = new Float32Array(0) // posição atual
    let py = new Float32Array(0)
    let tx = new Float32Array(0) // alvo
    let ty = new Float32Array(0)
    let pc = new Uint8Array(0) // cor
    let pa = new Float32Array(0) // opacidade atual
    let ta = new Float32Array(0) // opacidade alvo
    let sp = new Float32Array(0) // velocidade individual
    let rnd = new Float32Array(0)
    const buckets: Float32Array[] = []
    const bucketN = new Int32Array(COLORS.length * LEVELS)

    const mouse = { x: -9999, y: -9999, at: 0 }
    let tilt = 0

    const resize = () => {
      vw = window.innerWidth
      vh = window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(vw * dpr)
      canvas.height = Math.round(vh * dpr)
      canvas.style.width = `${vw}px`
      canvas.style.height = `${vh}px`
    }

    const applyPose = (p: Pose, burst: boolean) => {
      const cl = clouds.get(p)
      if (!cl) return
      poseRef.current = p
      for (let i = 0; i < N; i++) {
        if (i < cl.n) {
          tx[i] = cl.x[i]
          ty[i] = cl.y[i]
          pc[i] = cl.c[i]
          ta[i] = 1
        } else {
          // partículas que sobram: vão para um ponto qualquer e somem
          const k = (i * 7919) % cl.n
          tx[i] = cl.x[k]
          ty[i] = cl.y[k]
          ta[i] = 0
        }
        if (burst && !reduce) {
          // pequena "explosão" antes de se reorganizar
          px[i] += (rnd[i] - 0.5) * 0.25
          py[i] += (((i * 0.618) % 1) - 0.5) * 0.25
        }
      }
      if (reduce) {
        px.set(tx)
        py.set(ty)
        pa.set(ta)
      }
    }
    setPoseRef.current = (p: Pose) => {
      if (p !== poseRef.current) applyPose(p, true)
    }

    // carrega e escaneia as 6 poses
    Promise.all(
      POSES.map(
        (p) =>
          new Promise<void>((res) => {
            const img = new Image()
            img.onload = () => {
              clouds.set(p, scan(img))
              res()
            }
            img.onerror = () => res()
            img.src = `${BASE}/robot/${p}.webp`
          }),
      ),
    ).then(() => {
      if (!alive || !clouds.size) return
      // Ordena os pontos de cada pose do mesmo jeito (por linha) → o morph fica orgânico
      N = Math.max(...[...clouds.values()].map((c) => c.n))
      px = new Float32Array(N)
      py = new Float32Array(N)
      tx = new Float32Array(N)
      ty = new Float32Array(N)
      pc = new Uint8Array(N)
      pa = new Float32Array(N)
      ta = new Float32Array(N)
      sp = new Float32Array(N)
      rnd = new Float32Array(N)
      for (let i = 0; i < N; i++) {
        rnd[i] = Math.random()
        sp[i] = 3 + Math.random() * 5
        // começa espalhado: o robô se "materializa" ao abrir a página
        px[i] = (Math.random() - 0.5) * 2.4
        py[i] = (Math.random() - 0.5) * 2.4
      }
      for (let b = 0; b < COLORS.length * LEVELS; b++) buckets[b] = new Float32Array(N * 2)
      applyPose(poseRef.current, false)
    })

    // ---- layout: grande no topo, pequeno no canto ao rolar ----
    const layout = () => {
      const anchor = document.getElementById('holo-anchor')
      const docked = { cx: vw - (vw < 640 ? 70 : 110), cy: vh - (vw < 640 ? 80 : 115), s: vw < 640 ? 130 : 190 }
      if (!anchor) return { ...docked, t: 1 }
      const r = anchor.getBoundingClientRect()
      const hero = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, s: Math.min(r.width, r.height) }
      const t0 = Math.min(1, Math.max(0, -r.top / (r.height * 0.7)))
      const t = t0 * t0 * (3 - 2 * t0)
      const heroCy = r.top + r.height / 2 + -Math.min(0, r.top) // segue o topo enquanto some
      return {
        cx: hero.cx + (docked.cx - hero.cx) * t,
        cy: heroCy + (docked.cy - heroCy) * t,
        s: hero.s + (docked.s - hero.s) * t,
        t,
      }
    }

    let last = performance.now()
    const frame = (now: number) => {
      if (!alive) return
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const L = layout()
      const half = L.s / 2

      // botão invisível sobre o robô (clique) + posição do balão
      const hit = hitRef.current
      if (hit) {
        hit.style.transform = `translate(${L.cx - half * 0.6}px, ${L.cy - half * 0.75}px)`
        hit.style.width = `${L.s * 0.6}px`
        hit.style.height = `${L.s * 0.85}px`
      }
      const bub = bubbleRef.current
      if (bub) {
        const bw = bub.offsetWidth
        const bx = Math.max(8, Math.min(vw - bw - 8, L.cx - bw / 2))
        const by = Math.max(70, L.cy - half * 0.72 - bub.offsetHeight - 6)
        bub.style.transform = `translate(${bx}px, ${by}px)`
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, vw, vh)
      if (!N) return

      const fresh = now - mouse.at < 4000
      const tTarget = fresh ? Math.max(-1, Math.min(1, (mouse.x - L.cx) / (vw * 0.4))) : Math.sin(now * 0.0004) * 0.3
      tilt += (tTarget - tilt) * (1 - Math.exp(-dt * 3))
      const bob = reduce ? 0 : Math.sin(now * 0.0018) * L.s * 0.015
      const squash = 1 - Math.abs(tilt) * 0.12 // leve "giro" em 3D
      const scanY = ((now * 0.00035) % 1.4) - 0.7
      const glitch = !reduce && (now / 1000) % 6 < 0.08
      const glitchY = ((Math.floor(now / 6000) * 0.37) % 1) - 0.5
      const pAge = (now - pulseRef.current) / 900
      const pulsing = pAge >= 0 && pAge < 1
      const reveal2 = (L.s * 0.22) ** 2
      const size = Math.max(1.2, (L.s / GRID) * 0.55)

      bucketN.fill(0)
      for (let i = 0; i < N; i++) {
        // aproxima do alvo (cada partícula na sua velocidade)
        const k = 1 - Math.exp(-dt * sp[i])
        px[i] += (tx[i] - px[i]) * k
        py[i] += (ty[i] - py[i]) * k
        pa[i] += (ta[i] - pa[i]) * (1 - Math.exp(-dt * 4))
        if (pa[i] < 0.03) continue

        const nx = px[i]
        const ny = py[i]
        let sx = L.cx + (nx * squash + tilt * 0.05 * (ny + 0.5)) * L.s
        let sy = L.cy + ny * L.s + bob
        if (!reduce) {
          const w = Math.sin(now * 0.002 * (0.6 + rnd[i]) + rnd[i] * 50) * size * 0.35 // tremor de holograma
          sx += w
        }
        if (glitch && Math.abs(ny - glitchY) < 0.03) sx += size * 4

        let al = pa[i] * (pc[i] === 2 ? 0.32 : pc[i] === 1 ? 1 : 0.85)
        if (!reduce) al *= 0.78 + 0.22 * Math.sin(now * 0.004 * (0.5 + rnd[i]) + rnd[i] * 30)
        al += Math.exp(-((ny - scanY) ** 2) / 0.0015) * 0.45 // faixa de varredura

        // cursor perto: as partículas acendem e se afastam um pouco
        if (fresh) {
          const dx = sx - mouse.x
          const dy = sy - mouse.y
          const d2 = dx * dx + dy * dy
          if (d2 < reveal2 * 4) {
            const f = Math.exp(-d2 / reveal2)
            al += f * 0.35
            const d = Math.sqrt(d2) || 1
            sx += (dx / d) * f * size * 1.2
            sy += (dy / d) * f * size * 1.2
          }
        }
        if (pulsing) {
          const dist = Math.hypot(nx, ny) / 0.6
          al += Math.exp(-((dist - pAge) ** 2) / 0.01) * (1 - pAge) * 0.9
        }
        al = Math.min(1, al)
        if (al < 0.04) continue
        const lvl = Math.min(LEVELS - 1, Math.floor(al * LEVELS))
        const b = pc[i] * LEVELS + lvl
        const arr = buckets[b]
        const kk = bucketN[b]++ * 2
        arr[kk] = sx
        arr[kk + 1] = sy
      }

      // brilho de fundo do holograma
      ctx.globalCompositeOperation = 'lighter'
      const g = ctx.createRadialGradient(L.cx, L.cy, 0, L.cx, L.cy, L.s * 0.6)
      g.addColorStop(0, 'rgba(40,225,255,0.10)')
      g.addColorStop(1, 'rgba(40,225,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(L.cx - L.s, L.cy - L.s, L.s * 2, L.s * 2)

      // base do projetor (elipse de luz embaixo do robô)
      const baseY = L.cy + L.s * 0.5
      const bg = ctx.createRadialGradient(L.cx, baseY, 0, L.cx, baseY, L.s * 0.4)
      bg.addColorStop(0, 'rgba(40,225,255,0.35)')
      bg.addColorStop(1, 'rgba(40,225,255,0)')
      ctx.save()
      ctx.translate(L.cx, baseY)
      ctx.scale(1, 0.18)
      ctx.translate(-L.cx, -baseY)
      ctx.fillStyle = bg
      ctx.beginPath()
      ctx.arc(L.cx, baseY, L.s * 0.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()

      for (let b = 0; b < COLORS.length * LEVELS; b++) {
        const n = bucketN[b]
        if (!n) continue
        ctx.globalAlpha = ((b % LEVELS) + 1) / LEVELS
        ctx.fillStyle = COLORS[(b / LEVELS) | 0]
        ctx.beginPath()
        const arr = buckets[b]
        for (let k = 0; k < n * 2; k += 2) ctx.rect(arr[k] - size / 2, arr[k + 1] - size / 2, size, size)
        ctx.fill()
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }

    const onMove = (e: PointerEvent) => {
      mouse.x = e.clientX
      mouse.y = e.clientY
      mouse.at = performance.now()
    }
    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', onMove, { passive: true })
    raf = requestAnimationFrame(frame)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
    }
  }, [])

  // ------------------------------------------------------------ reações à página
  useEffect(() => {
    bubbleTimer.current = window.setTimeout(() => setBubble(false), 6000)

    const resetIdle = () => {
      window.clearTimeout(idleTimer.current)
      idleTimer.current = window.setTimeout(() => react('acenando', 'Ainda por aí? Clique em mim! 👋', 4000), 20000)
    }

    let lastHover: Element | null = null
    const onOver = (e: MouseEvent) => {
      const el = (e.target as Element).closest('[data-robot-hover]')
      if (!el || el === lastHover) return
      lastHover = el
      react(el.getAttribute('data-robot-hover') as Pose, el.getAttribute('data-say') || undefined)
    }
    const onOut = (e: MouseEvent) => {
      const el = (e.target as Element).closest('[data-robot-hover]')
      if (el && !el.contains(e.relatedTarget as Node)) lastHover = null
    }
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element).closest('[data-robot-click], a, button')
      if (!el || el === hitRef.current) return
      const p = (el.getAttribute('data-robot-click') as Pose) || 'legal'
      react(p, el.getAttribute('data-say') || 'Boa escolha! 👍', 2600, true)
    }

    let lx = 0
    let ly = 0
    let lt = 0
    let lastScare = 0
    const onMove = (e: MouseEvent) => {
      resetIdle()
      const now = performance.now()
      const dt = now - lt
      if (dt > 0 && dt < 60) {
        const speed = Math.hypot(e.clientX - lx, e.clientY - ly) / dt
        if (speed > 6 && now - lastScare > 6000) {
          lastScare = now
          react('surpreso', 'Uau! Que velocidade! 😮', 2200, true)
        }
      }
      lx = e.clientX
      ly = e.clientY
      lt = now
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue
          const el = en.target
          react(el.getAttribute('data-robot-section') as Pose, el.getAttribute('data-say') || undefined, 3600)
        }
      },
      { threshold: 0.35 },
    )
    document.querySelectorAll('[data-robot-section]').forEach((el) => io.observe(el))

    const onCustom = (e: Event) => {
      const d = (e as CustomEvent<{ pose: Pose; say?: string }>).detail
      react(d.pose, d.say, 4200, true)
    }

    document.addEventListener('mouseover', onOver)
    document.addEventListener('mouseout', onOut)
    document.addEventListener('click', onClick)
    window.addEventListener('mousemove', onMove, { passive: true })
    window.addEventListener('robot', onCustom)
    resetIdle()
    return () => {
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('mouseout', onOut)
      document.removeEventListener('click', onClick)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('robot', onCustom)
      io.disconnect()
      ;[backTimer, bubbleTimer, idleTimer].forEach((t) => window.clearTimeout(t.current))
    }
  }, [react])

  const onRobotClick = () => {
    pulseRef.current = performance.now()
    react('rindo', JOKES[jokeIdx.current++ % JOKES.length], 4500, true)
  }

  return (
    <>
      <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed left-0 top-0 z-30" />
      <button
        ref={hitRef}
        type="button"
        onClick={onRobotClick}
        aria-label="Robô assistente: clique para ouvir uma piada"
        className="fixed left-0 top-0 z-40 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-lab-cyan"
      />
      <div ref={bubbleRef} className="pointer-events-none fixed left-0 top-0 z-40" aria-live="polite">
        <AnimatePresence>
          {bubble && (
            <motion.div
              key={say}
              initial={{ opacity: 0, y: 8, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22 }}
              className="max-w-[260px] rounded-2xl border border-lab-cyan/40 bg-lab-panel/90 px-4 py-3 text-sm leading-snug text-lab-ink shadow-[0_0_24px_-6px_rgba(40,225,255,0.5)] backdrop-blur"
            >
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-lab-cyan">● Assistente</span>
              {say}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
