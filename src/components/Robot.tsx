import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { assistant } from '../data/assistant'

/**
 * ROBÔ HOLOGRAMA — GUIA DO LABORATÓRIO
 *
 * O que ele faz:
 * 1. Perguntas rápidas: clique no robô → menu com atalhos (sobre, projetos, filtros, contato, tour, piada).
 * 2. Escaneamento: ao passar o mouse num projeto ([data-robot-scan]) ele lança um feixe de luz
 *    e mostra dados reais do GitHub (linguagem, última atualização, estrelas).
 * 3. Tour guiado: percorre as seções explicando cada uma ([data-robot-action="tour"] inicia).
 *
 * Visual: as 6 imagens de public/robot são escaneadas e viram partículas; ao trocar de pose
 * as partículas se reorganizam (morph).
 *
 * Ganchos no HTML:
 *   data-robot-section="lendo" data-say="..."  → fala uma vez quando a seção aparece
 *   data-robot-action="tour" | "clear-filter"  → botões que acionam o robô
 *   window.dispatchEvent(new CustomEvent('robot', { detail: { pose, say } }))
 */

export type Pose = 'acenando' | 'lendo' | 'ideia' | 'legal' | 'rindo' | 'surpreso'
const POSES: Pose[] = ['acenando', 'lendo', 'ideia', 'legal', 'rindo', 'surpreso']

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

// Cores do holograma: 0 contorno · 1 ciano · 2 corpo · 3 âmbar
const COLORS = ['#d8f1ff', '#28e1ff', '#2f6bff', '#ffb547']
const LEVELS = 5
const GRID = 92

interface PoseCloud {
  x: Float32Array
  y: Float32Array
  c: Uint8Array
  n: number
}

type Chip = { label: string; run: () => void }

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
    if (d[k + 3] < 120) return 255
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
      if (r > 170 && b < gg - 35 && gg > 90) c = 3
      else if (b > 150 && gg > 140 && r < 140) c = 1
      else if (lum < 110) {
        const edge = lumAt(i - 1, j) > 150 || lumAt(i + 1, j) > 150 || lumAt(i, j - 1) > 150 || lumAt(i, j + 1) > 150
        if (!edge) continue
        c = 0
      } else {
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

/** "há 3 dias", "hoje"... */
function timeAgo(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (Number.isNaN(days)) return ''
  if (days <= 0) return 'hoje'
  if (days === 1) return 'ontem'
  if (days < 30) return `há ${days} dias`
  const m = Math.floor(days / 30)
  return m === 1 ? 'há 1 mês' : `há ${m} meses`
}

const scrollToId = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

export default function Robot() {
  const [say, setSay] = useState(assistant.greeting)
  const [bubble, setBubble] = useState(true)
  const [chips, setChips] = useState<Chip[]>([])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hitRef = useRef<HTMLButtonElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)

  const poseRef = useRef<Pose>('acenando')
  const setPoseRef = useRef<(p: Pose) => void>(() => {})
  const pulseRef = useRef(-1e9)
  const scanElRef = useRef<HTMLElement | null>(null) // projeto sendo escaneado (feixe)
  const tourRef = useRef(-1) // passo do tour (-1 = sem tour)
  const interactive = useRef(false) // menu/tour aberto: não esconder o balão sozinho
  const backTimer = useRef(0)
  const bubbleTimer = useRef(0)
  const idleTimer = useRef(0)
  const jokeIdx = useRef(0)

  /** Fala algo, com pose e (opcional) botões. Sem botões, o balão some sozinho. */
  const speak = useCallback((p: Pose, text: string, buttons: Chip[] = [], hold = 4500) => {
    setPoseRef.current(p)
    setSay(text)
    setChips(buttons)
    setBubble(true)
    interactive.current = buttons.length > 0
    window.clearTimeout(bubbleTimer.current)
    window.clearTimeout(backTimer.current)
    if (!buttons.length) {
      bubbleTimer.current = window.setTimeout(() => setBubble(false), hold)
      backTimer.current = window.setTimeout(() => setPoseRef.current('acenando'), hold + 300)
    }
  }, [])

  const close = useCallback(() => {
    interactive.current = false
    tourRef.current = -1
    document.querySelectorAll('.tour-focus').forEach((el) => el.classList.remove('tour-focus'))
    setChips([])
    setBubble(false)
    setPoseRef.current('acenando')
  }, [])

  // ---------------------------------------------------------------- filtros de projetos
  const applyFilter = useCallback(
    (tag: string | null) => {
      const cards = [...document.querySelectorAll<HTMLElement>('[data-robot-scan]')]
      let shown = 0
      for (const c of cards) {
        const ok = !tag || (c.dataset.tags ?? '').split('|').includes(tag)
        c.style.display = ok ? '' : 'none'
        if (ok) shown++
      }
      const bar = document.getElementById('filtro')
      const name = document.getElementById('filtro-nome')
      if (bar && name) {
        bar.style.display = tag ? 'flex' : 'none'
        name.textContent = tag ?? ''
      }
      scrollToId('projetos')
      if (!tag) return
      if (shown) speak('legal', `Encontrei ${shown} projeto${shown > 1 ? 's' : ''} com "${tag}". 👍`)
      else speak('surpreso', assistant.noProjects)
    },
    [speak],
  )

  const tagChips = useCallback((): Chip[] => {
    const count = new Map<string, number>()
    document.querySelectorAll<HTMLElement>('[data-robot-scan]').forEach((c) =>
      (c.dataset.tags ?? '').split('|').filter(Boolean).forEach((t) => count.set(t, (count.get(t) ?? 0) + 1)),
    )
    const top = [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    return [
      ...top.map(([t, n]) => ({ label: `${t} (${n})`, run: () => applyFilter(t) })),
      { label: 'Ver todos', run: () => (applyFilter(null), close()) },
    ]
  }, [applyFilter, close])

  // ---------------------------------------------------------------- tour guiado
  const tourStep = useCallback(
    (i: number) => {
      const steps = assistant.tour
      document.querySelectorAll('.tour-focus').forEach((el) => el.classList.remove('tour-focus'))
      if (i >= steps.length) {
        close()
        speak('legal', 'Tour concluído! Clique em mim quando precisar. 🤖')
        return
      }
      tourRef.current = i
      const step = steps[i]
      const el = document.getElementById(step.id)
      if (step.id !== 'topo') el?.classList.add('tour-focus')
      if (step.id === 'topo') window.scrollTo({ top: 0, behavior: 'smooth' })
      else scrollToId(step.id)
      const pose: Pose = i === 0 ? 'acenando' : i === steps.length - 1 ? 'legal' : 'lendo'
      speak(pose, `(${i + 1}/${steps.length}) ${step.say}`, [
        { label: i === steps.length - 1 ? 'Concluir ✓' : 'Próximo →', run: () => tourStep(i + 1) },
        { label: 'Sair do tour', run: close },
      ])
    },
    [close, speak],
  )

  // ---------------------------------------------------------------- menu principal
  const openMenu = useCallback(() => {
    pulseRef.current = performance.now()
    tourRef.current = -1
    speak('ideia', assistant.menuIntro, [
      { label: '👤 O que o Felipe faz?', run: () => (scrollToId('sobre'), speak('lendo', assistant.about, [{ label: '← Voltar', run: openMenuRef.current }])) },
      { label: '🔬 Mostrar projetos', run: () => (scrollToId('projetos'), speak('lendo', assistant.projectsIntro, tagChips())) },
      { label: '▶ Fazer o tour', run: () => tourStep(0) },
      { label: '✉️ Falar com ele', run: () => (scrollToId('contato'), speak('legal', assistant.contact)) },
      {
        label: '😄 Conte uma piada',
        run: () => speak('rindo', assistant.jokes[jokeIdx.current++ % assistant.jokes.length], [{ label: '← Voltar', run: openMenuRef.current }]),
      },
      { label: 'Fechar', run: close },
    ])
  }, [close, speak, tagChips, tourStep])
  const openMenuRef = useRef(openMenu)
  openMenuRef.current = openMenu

  // ---------------------------------------------------------------- motor do holograma
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
    let px = new Float32Array(0)
    let py = new Float32Array(0)
    let tx = new Float32Array(0)
    let ty = new Float32Array(0)
    let pc = new Uint8Array(0)
    let pa = new Float32Array(0)
    let ta = new Float32Array(0)
    let sp = new Float32Array(0)
    let rnd = new Float32Array(0)
    const buckets: Float32Array[] = []
    const bucketN = new Int32Array(COLORS.length * LEVELS)

    const mouse = { x: -9999, y: -9999, at: 0 }
    let tilt = 0
    const cur = { cx: 0, cy: 0, s: 0, init: false } // posição suavizada

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
      poseRef.current = p
      if (!cl) return
      for (let i = 0; i < N; i++) {
        if (i < cl.n) {
          tx[i] = cl.x[i]
          ty[i] = cl.y[i]
          pc[i] = cl.c[i]
          ta[i] = 1
        } else {
          const k = (i * 7919) % cl.n
          tx[i] = cl.x[k]
          ty[i] = cl.y[k]
          ta[i] = 0
        }
        if (burst && !reduce) {
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
      if (p !== poseRef.current || !N) applyPose(p, !!N)
    }

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
        px[i] = (Math.random() - 0.5) * 2.4
        py[i] = (Math.random() - 0.5) * 2.4
      }
      for (let b = 0; b < COLORS.length * LEVELS; b++) buckets[b] = new Float32Array(N * 2)
      applyPose(poseRef.current, false)
    })

    /** Onde o robô deve estar: no topo (sobre #holo-anchor), no canto, ou em destaque durante o tour. */
    const target = () => {
      const small = vw < 640
      const docked = { cx: vw - (small ? 70 : 110), cy: vh - (small ? 80 : 115), s: small ? 130 : 190 }
      if (tourRef.current > 0) {
        // durante o tour ele "se aproxima": maior, na lateral direita
        return small ? { cx: vw - 80, cy: vh - 95, s: 160 } : { cx: vw - 170, cy: vh * 0.62, s: 300 }
      }
      const anchor = document.getElementById('holo-anchor')
      if (!anchor) return docked
      const r = anchor.getBoundingClientRect()
      const t0 = Math.min(1, Math.max(0, -r.top / (r.height * 0.7)))
      const t = t0 * t0 * (3 - 2 * t0)
      const heroCy = r.top + r.height / 2 - Math.min(0, r.top)
      const hs = Math.min(r.width, r.height)
      return {
        cx: r.left + r.width / 2 + (docked.cx - (r.left + r.width / 2)) * t,
        cy: heroCy + (docked.cy - heroCy) * t,
        s: hs + (docked.s - hs) * t,
      }
    }

    let last = performance.now()
    const frame = (now: number) => {
      if (!alive) return
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const T = target()
      if (!cur.init) Object.assign(cur, T, { init: true })
      const kk = 1 - Math.exp(-dt * 7)
      cur.cx += (T.cx - cur.cx) * kk
      cur.cy += (T.cy - cur.cy) * kk
      cur.s += (T.s - cur.s) * kk
      const L = cur
      const half = L.s / 2

      const hit = hitRef.current
      if (hit) {
        hit.style.transform = `translate(${L.cx - half * 0.6}px, ${L.cy - half * 0.75}px)`
        hit.style.width = `${L.s * 0.6}px`
        hit.style.height = `${L.s * 0.85}px`
      }
      const bub = bubbleRef.current
      if (bub) {
        const bw = bub.offsetWidth
        const bh = bub.offsetHeight
        let bx = L.cx - bw / 2
        let by = L.cy - half * 0.72 - bh - 6
        if (by < 70) {
          // sem espaço em cima (robô grande no topo): balão ao lado da cabeça
          bx = L.cx - half * 0.62 - bw
          by = Math.max(70, L.cy - half * 0.62)
        }
        bub.style.transform = `translate(${Math.max(8, Math.min(vw - bw - 8, bx))}px, ${by}px)`
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, vw, vh)
      if (!N) return

      // olhar: para o projeto escaneado, senão para o mouse
      const scanEl = scanElRef.current
      const sr = scanEl?.isConnected ? scanEl.getBoundingClientRect() : null
      const fresh = now - mouse.at < 4000
      const lookX = sr ? sr.left + sr.width / 2 : fresh ? mouse.x : L.cx + Math.sin(now * 0.0004) * vw * 0.12
      const tTarget = Math.max(-1, Math.min(1, (lookX - L.cx) / (vw * 0.4)))
      tilt += (tTarget - tilt) * (1 - Math.exp(-dt * 3))

      const bob = reduce ? 0 : Math.sin(now * 0.0018) * L.s * 0.015
      const squash = 1 - Math.abs(tilt) * 0.12
      const scanY = ((now * 0.00035) % 1.4) - 0.7
      const glitch = !reduce && (now / 1000) % 6 < 0.08
      const glitchY = ((Math.floor(now / 6000) * 0.37) % 1) - 0.5
      const pAge = (now - pulseRef.current) / 900
      const pulsing = pAge >= 0 && pAge < 1
      const reveal2 = (L.s * 0.22) ** 2
      const size = Math.max(1.2, (L.s / GRID) * 0.55)

      ctx.globalCompositeOperation = 'lighter'

      // ---- feixe de escaneamento: dos olhos até o projeto ----
      if (sr && sr.bottom > 0 && sr.top < vh) {
        const ex = L.cx + tilt * L.s * 0.05
        const ey = L.cy - L.s * 0.22 + bob
        const flick = reduce ? 1 : 0.8 + 0.2 * Math.sin(now * 0.02)
        const grad = ctx.createLinearGradient(ex, ey, sr.left + sr.width / 2, sr.top + sr.height / 2)
        grad.addColorStop(0, `rgba(40,225,255,${0.4 * flick})`)
        grad.addColorStop(1, 'rgba(40,225,255,0.03)')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.moveTo(ex, ey)
        ctx.lineTo(sr.left, sr.top)
        ctx.lineTo(sr.right, sr.top)
        ctx.lineTo(sr.right, sr.bottom)
        ctx.lineTo(sr.left, sr.bottom)
        ctx.closePath()
        ctx.globalAlpha = 0.35
        ctx.fill()
        ctx.globalAlpha = 1
      }

      // brilho de fundo + base do projetor
      const g = ctx.createRadialGradient(L.cx, L.cy, 0, L.cx, L.cy, L.s * 0.6)
      g.addColorStop(0, 'rgba(40,225,255,0.10)')
      g.addColorStop(1, 'rgba(40,225,255,0)')
      ctx.fillStyle = g
      ctx.fillRect(L.cx - L.s, L.cy - L.s, L.s * 2, L.s * 2)
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

      // ---- partículas ----
      bucketN.fill(0)
      for (let i = 0; i < N; i++) {
        const k = 1 - Math.exp(-dt * sp[i])
        px[i] += (tx[i] - px[i]) * k
        py[i] += (ty[i] - py[i]) * k
        pa[i] += (ta[i] - pa[i]) * (1 - Math.exp(-dt * 4))
        if (pa[i] < 0.03) continue

        const nx = px[i]
        const ny = py[i]
        let sx = L.cx + (nx * squash + tilt * 0.05 * (ny + 0.5)) * L.s
        let sy = L.cy + ny * L.s + bob
        if (!reduce) sx += Math.sin(now * 0.002 * (0.6 + rnd[i]) + rnd[i] * 50) * size * 0.35
        if (glitch && Math.abs(ny - glitchY) < 0.03) sx += size * 4

        let al = pa[i] * (pc[i] === 2 ? 0.32 : pc[i] === 1 ? 1 : 0.85)
        if (!reduce) al *= 0.78 + 0.22 * Math.sin(now * 0.004 * (0.5 + rnd[i]) + rnd[i] * 30)
        al += Math.exp(-((ny - scanY) ** 2) / 0.0015) * 0.45
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
        const kk2 = bucketN[b]++ * 2
        arr[kk2] = sx
        arr[kk2 + 1] = sy
      }
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

  // ---------------------------------------------------------------- ligações com a página
  useEffect(() => {
    bubbleTimer.current = window.setTimeout(() => !interactive.current && setBubble(false), 7000)

    const resetIdle = () => {
      window.clearTimeout(idleTimer.current)
      idleTimer.current = window.setTimeout(() => {
        if (!interactive.current) speak('acenando', assistant.idle, [], 4000)
      }, 25000)
    }

    // escaneamento de projetos
    let scanTimer = 0
    const onOver = (e: MouseEvent) => {
      const card = (e.target as Element).closest<HTMLElement>('[data-robot-scan]')
      if (!card || card === scanElRef.current) return
      scanElRef.current?.classList.remove('is-scanning')
      scanElRef.current = card
      card.classList.add('is-scanning')
      if (interactive.current) return // menu/tour aberto: só o feixe, sem trocar a fala
      setPoseRef.current('lendo')
      setSay(`Escaneando ${card.dataset.exp}…`)
      setChips([])
      setBubble(true)
      window.clearTimeout(scanTimer)
      scanTimer = window.setTimeout(() => {
        const info = [
          card.dataset.lang && `Linguagem: ${card.dataset.lang}`,
          card.dataset.updated && `Atualizado ${timeAgo(card.dataset.updated)}`,
          card.dataset.stars !== undefined && card.dataset.stars !== '' && `★ ${card.dataset.stars}`,
        ]
          .filter(Boolean)
          .join(' · ')
        speak('ideia', `${card.dataset.exp} · ${card.dataset.name}\n${info || 'Dados do GitHub indisponíveis no momento.'}`, [], 5000)
      }, 650)
    }
    const onOut = (e: MouseEvent) => {
      const card = (e.target as Element).closest<HTMLElement>('[data-robot-scan]')
      if (!card || card.contains(e.relatedTarget as Node)) return
      card.classList.remove('is-scanning')
      if (scanElRef.current === card) scanElRef.current = null
    }

    // botões da página que acionam o robô
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element).closest<HTMLElement>('[data-robot-action]')
      if (!el) return
      const a = el.dataset.robotAction
      if (a === 'tour') tourStep(0)
      if (a === 'clear-filter') (applyFilter(null), close())
    }

    // seções: fala UMA vez quando aparecem (só as que têm data-say)
    const seen = new Set<Element>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (!en.isIntersecting || seen.has(en.target) || interactive.current) continue
          seen.add(en.target)
          const el = en.target
          const text = el.getAttribute('data-say')
          if (text) speak(el.getAttribute('data-robot-section') as Pose, text)
        }
      },
      { threshold: 0.35 },
    )
    document.querySelectorAll('[data-robot-section]').forEach((el) => io.observe(el))

    const onCustom = (e: Event) => {
      const d = (e as CustomEvent<{ pose: Pose; say?: string }>).detail
      speak(d.pose, d.say ?? '')
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && interactive.current && close()

    document.addEventListener('mouseover', onOver)
    document.addEventListener('mouseout', onOut)
    document.addEventListener('click', onClick)
    window.addEventListener('mousemove', resetIdle, { passive: true })
    window.addEventListener('robot', onCustom)
    window.addEventListener('keydown', onKey)
    resetIdle()
    return () => {
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('mouseout', onOut)
      document.removeEventListener('click', onClick)
      window.removeEventListener('mousemove', resetIdle)
      window.removeEventListener('robot', onCustom)
      window.removeEventListener('keydown', onKey)
      io.disconnect()
      window.clearTimeout(scanTimer)
      ;[backTimer, bubbleTimer, idleTimer].forEach((t) => window.clearTimeout(t.current))
    }
  }, [speak, tourStep, applyFilter, close])

  return (
    <>
      <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed left-0 top-0 z-30" />
      <button
        ref={hitRef}
        type="button"
        onClick={() => (interactive.current && tourRef.current < 0 ? close() : openMenu())}
        aria-label="Assistente do laboratório: abrir menu de ajuda"
        title="Clique para abrir o menu do assistente"
        className="fixed left-0 top-0 z-40 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-lab-cyan"
      />
      <div ref={bubbleRef} className="fixed left-0 top-0 z-40" aria-live="polite">
        <AnimatePresence>
          {bubble && (
            <motion.div
              key={say}
              initial={{ opacity: 0, y: 8, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 320, damping: 24 }}
              className="w-[min(300px,calc(100vw-16px))] rounded-2xl border border-lab-cyan/40 bg-lab-panel/95 px-4 py-3 text-sm leading-snug text-lab-ink shadow-[0_0_24px_-6px_rgba(40,225,255,0.5)] backdrop-blur"
            >
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-lab-cyan">● Assistente</span>
              <p className="whitespace-pre-line">{say}</p>
              {chips.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {chips.map((c) => (
                    <button
                      key={c.label}
                      type="button"
                      onClick={c.run}
                      className="rounded-full border border-lab-line bg-lab-bg px-3 py-1.5 text-xs text-lab-ink transition hover:border-lab-cyan hover:text-lab-cyan"
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
