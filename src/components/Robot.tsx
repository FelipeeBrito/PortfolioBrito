import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { assistant } from '../data/assistant'

/**
 * ROBÔ GUIA
 *
 * Poses (public/robot/*.webp): acenando · apontando · sentado · apresentando · envelope
 *
 * O que ele faz:
 * 1. Menu: clique no robô → ele aponta para um menu de navegação (Início, Sobre, Projetos...).
 * 2. Escaneamento: ao passar o mouse num projeto ([data-robot-scan]) ele vira para o card,
 *    apresenta e mostra dados reais do GitHub, com um feixe de luz até o card.
 * 3. Tour guiado pelas seções ([data-robot-action="tour"]).
 * 4. Formulário enviado → segura o envelope "Mensagem enviada!".
 *
 * Posição: grande no topo (sobre #robot-anchor) e, ao rolar, vai para o canto da tela.
 * Ao trocar de pose ele "se materializa" com um efeito de projeção.
 */

export type Pose = 'acenando' | 'apontando' | 'sentado' | 'apresentando' | 'envelope'
const POSES: Pose[] = ['acenando', 'apontando', 'sentado', 'apresentando', 'envelope']
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')
const src = (p: Pose) => `${BASE}/robot/${p}.webp`

type Chip = { label: string; icon?: string; run: () => void }

function timeAgo(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (Number.isNaN(days)) return ''
  if (days <= 0) return 'hoje'
  if (days === 1) return 'ontem'
  if (days < 30) return `há ${days} dias`
  const m = Math.floor(days / 30)
  return m === 1 ? 'há 1 mês' : `há ${m} meses`
}

const scrollToId = (id: string) =>
  id === 'topo' ? window.scrollTo({ top: 0, behavior: 'smooth' }) : document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

export default function Robot() {
  const [pose, setPose] = useState<Pose>('acenando')
  const [poseKey, setPoseKey] = useState(0) // reinicia a animação de "materializar"
  const [title, setTitle] = useState<string>('Assistente')
  const [say, setSay] = useState(assistant.greeting)
  const [bubble, setBubble] = useState(true)
  const [chips, setChips] = useState<Chip[]>([])
  const [menuStyle, setMenuStyle] = useState(false) // menu vertical (estilo navegação)

  const bodyRef = useRef<HTMLDivElement>(null)
  const flipRef = useRef<HTMLDivElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const beamRef = useRef<HTMLCanvasElement>(null)

  const poseRef = useRef<Pose>('acenando')
  const scanElRef = useRef<HTMLElement | null>(null)
  const tourRef = useRef(-1)
  const interactive = useRef(false)
  const backTimer = useRef(0)
  const bubbleTimer = useRef(0)
  const idleTimer = useRef(0)
  const jokeIdx = useRef(0)
  const layoutRef = useRef({ menu: false, chips: 0 })

  const changePose = useCallback((p: Pose) => {
    if (p === poseRef.current) return
    poseRef.current = p
    setPose(p)
    setPoseKey((k) => k + 1)
  }, [])

  const speak = useCallback(
    (p: Pose, text: string, opts: { title?: string; chips?: Chip[]; menu?: boolean; hold?: number } = {}) => {
      const { chips: buttons = [], hold = 4800 } = opts
      changePose(p)
      setTitle(opts.title ?? 'Assistente')
      setSay(text)
      setChips(buttons)
      setMenuStyle(!!opts.menu)
      setBubble(true)
      interactive.current = buttons.length > 0
      window.clearTimeout(bubbleTimer.current)
      window.clearTimeout(backTimer.current)
      if (!buttons.length) {
        bubbleTimer.current = window.setTimeout(() => setBubble(false), hold)
        backTimer.current = window.setTimeout(() => changePose('acenando'), hold + 300)
      }
    },
    [changePose],
  )

  const close = useCallback(() => {
    interactive.current = false
    tourRef.current = -1
    document.querySelectorAll('.tour-focus').forEach((el) => el.classList.remove('tour-focus'))
    setChips([])
    setBubble(false)
    changePose('acenando')
  }, [changePose])

  // ---------------------------------------------------------------- filtros
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
      if (shown) speak('apresentando', `Encontrei ${shown} projeto${shown > 1 ? 's' : ''} com "${tag}".`, { title: 'Filtro aplicado' })
      else speak('sentado', assistant.noProjects, { title: 'Filtro' })
    },
    [speak],
  )

  const tagChips = useCallback((): Chip[] => {
    const count = new Map<string, number>()
    document.querySelectorAll<HTMLElement>('[data-robot-scan]').forEach((c) =>
      (c.dataset.tags ?? '').split('|').filter(Boolean).forEach((t) => count.set(t, (count.get(t) ?? 0) + 1)),
    )
    return [
      ...[...count.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([t, n]) => ({ label: `${t} (${n})`, run: () => applyFilter(t) })),
      { label: 'Ver todos', run: () => (applyFilter(null), close()) },
    ]
  }, [applyFilter, close])

  // ---------------------------------------------------------------- tour
  const tourStep = useCallback(
    (i: number) => {
      const steps = assistant.tour
      document.querySelectorAll('.tour-focus').forEach((el) => el.classList.remove('tour-focus'))
      if (i >= steps.length) {
        close()
        speak('acenando', 'Tour concluído! Clique em mim quando precisar.', { title: 'Até logo!' })
        return
      }
      tourRef.current = i
      const step = steps[i]
      if (step.id !== 'topo') document.getElementById(step.id)?.classList.add('tour-focus')
      scrollToId(step.id)
      const p: Pose = step.id === 'projetos' ? 'apresentando' : step.id === 'contato' ? 'envelope' : i === 0 ? 'acenando' : 'apontando'
      speak(p, step.say, {
        title: `Tour · ${i + 1}/${steps.length}`,
        chips: [
          { label: i === steps.length - 1 ? 'Concluir ✓' : 'Próximo →', run: () => tourStep(i + 1) },
          { label: 'Sair', run: close },
        ],
      })
    },
    [close, speak],
  )

  // ---------------------------------------------------------------- menu
  const openMenuRef = useRef<() => void>(() => {})
  const openMenu = useCallback(() => {
    tourRef.current = -1
    const back = { label: '← Voltar ao menu', run: () => openMenuRef.current() }
    speak('apontando', assistant.menuIntro, {
      title: 'Para onde vamos?',
      menu: true,
      chips: [
        { icon: '⌂', label: 'Início', run: () => (scrollToId('topo'), close()) },
        { icon: '👤', label: 'Sobre mim', run: () => (scrollToId('sobre'), speak('apontando', assistant.about, { title: 'Sobre o Felipe', chips: [back] })) },
        { icon: '🧪', label: 'Projetos', run: () => (scrollToId('projetos'), speak('apresentando', assistant.projectsIntro, { title: 'Meus projetos', chips: [...tagChips(), back] })) },
        { icon: '⚙', label: 'Skills', run: () => (scrollToId('habilidades'), close()) },
        { icon: '✉', label: 'Contato', run: () => (scrollToId('contato'), speak('envelope', assistant.contact, { title: 'Contato' })) },
        { icon: '▶', label: 'Fazer o tour', run: () => tourStep(0) },
        { icon: '😄', label: 'Conte uma piada', run: () => speak('acenando', assistant.jokes[jokeIdx.current++ % assistant.jokes.length], { title: 'Hehe', chips: [back] }) },
      ],
    })
  }, [close, speak, tagChips, tourStep])
  openMenuRef.current = openMenu

  layoutRef.current = { menu: menuStyle, chips: chips.length }

  // ---------------------------------------------------------------- posição, inclinação e feixe
  useEffect(() => {
    let raf = 0
    let vw = window.innerWidth
    let vh = window.innerHeight
    const cur = { cx: 0, cy: 0, s: 0, init: false }
    const mouse = { x: vw / 2, y: vh / 2, at: 0 }
    let tilt = 0
    let face = 1 // 1 = olhando para a direita · -1 = espelhado
    const beam = beamRef.current!
    const bctx = beam.getContext('2d')!
    let dpr = 1
    const resize = () => {
      vw = window.innerWidth
      vh = window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      beam.width = vw * dpr
      beam.height = vh * dpr
    }
    const onMove = (e: PointerEvent) => {
      mouse.x = e.clientX
      mouse.y = e.clientY
      mouse.at = performance.now()
    }

    const target = () => {
      const small = vw < 640
      const docked = { cx: vw - (small ? 62 : 105), cy: vh - (small ? 78 : 120), s: small ? 120 : 200 }
      if (tourRef.current > 0) return small ? { cx: vw - 70, cy: vh - 90, s: 140 } : { cx: vw - 165, cy: vh * 0.6, s: 300 }
      const a = document.getElementById('robot-anchor')
      if (!a) return docked
      const r = a.getBoundingClientRect()
      const t0 = Math.min(1, Math.max(0, -r.top / (r.height * 0.8)))
      const t = t0 * t0 * (3 - 2 * t0)
      const hs = Math.min(r.width, r.height)
      const hcx = r.left + r.width / 2
      const hcy = r.top + r.height / 2 - Math.min(0, r.top)
      return { cx: hcx + (docked.cx - hcx) * t, cy: hcy + (docked.cy - hcy) * t, s: hs + (docked.s - hs) * t }
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const T = target()
      if (!cur.init) Object.assign(cur, T, { init: true })
      cur.cx += (T.cx - cur.cx) * 0.12
      cur.cy += (T.cy - cur.cy) * 0.12
      cur.s += (T.s - cur.s) * 0.12

      // para onde olhar: projeto escaneado, menu (balão) ou mouse
      const scanEl = scanElRef.current
      const sr = scanEl?.isConnected ? scanEl.getBoundingClientRect() : null
      const bub = bubbleRef.current
      const lookX = sr ? sr.left + sr.width / 2 : now - mouse.at < 4000 ? mouse.x : cur.cx + 100
      const wantFace = lookX < cur.cx - 20 ? -1 : 1
      if (wantFace !== face) {
        face = wantFace
        if (flipRef.current) flipRef.current.style.transform = `scaleX(${face})`
      }
      const tt = Math.max(-1, Math.min(1, (lookX - cur.cx) / (vw * 0.5)))
      tilt += (tt - tilt) * 0.06

      const body = bodyRef.current
      if (body) {
        body.style.width = `${cur.s}px`
        body.style.height = `${cur.s}px`
        body.style.transform = `translate(${cur.cx - cur.s / 2}px, ${cur.cy - cur.s / 2}px) rotate(${tilt * 6}deg)`
      }

      // balão: ao lado do robô, do lado para onde ele está virado (ou acima, se couber)
      if (bub) {
        const bw = bub.offsetWidth
        const bh = bub.offsetHeight
        const half = cur.s / 2
        let bx: number
        let by: number
        const side = cur.cx - half * 0.55 - bw - 12 > 8 ? -1 : 1
        if (layoutRef.current.menu || layoutRef.current.chips || cur.s > 320) {
          bx = side < 0 ? cur.cx - half * 0.5 - bw - 12 : cur.cx + half * 0.5 + 12
          by = cur.cy - bh / 2 - half * 0.1
          // aponta para o balão
          if (!sr && flipRef.current && (side < 0 ? -1 : 1) !== face) {
            face = side < 0 ? -1 : 1
            flipRef.current.style.transform = `scaleX(${face})`
          }
        } else {
          bx = cur.cx - bw / 2
          by = cur.cy - half * 0.88 - bh
        }
        bub.style.transform = `translate(${Math.max(8, Math.min(vw - bw - 8, bx))}px, ${Math.max(72, Math.min(vh - bh - 8, by))}px)`
      }

      // feixe até o projeto escaneado
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      bctx.clearRect(0, 0, vw, vh)
      if (sr && sr.bottom > 0 && sr.top < vh) {
        const hx = cur.cx + face * cur.s * 0.18
        const hy = cur.cy - cur.s * 0.05
        const g = bctx.createLinearGradient(hx, hy, sr.left + sr.width / 2, sr.top + sr.height / 2)
        g.addColorStop(0, 'rgba(40,225,255,0.45)')
        g.addColorStop(1, 'rgba(40,225,255,0.02)')
        bctx.fillStyle = g
        bctx.globalAlpha = 0.35 + 0.1 * Math.sin(now * 0.02)
        bctx.beginPath()
        bctx.moveTo(hx, hy)
        const nearX = face < 0 ? sr.right : sr.left
        bctx.lineTo(nearX, sr.top)
        bctx.lineTo(nearX, sr.bottom)
        bctx.closePath()
        bctx.fill()
        bctx.globalAlpha = 1
      }
    }
    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', onMove, { passive: true })
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
    }
  }, [])

  // ---------------------------------------------------------------- ligações com a página
  useEffect(() => {
    POSES.forEach((p) => {
      const i = new Image()
      i.src = src(p)
    })
    bubbleTimer.current = window.setTimeout(() => !interactive.current && setBubble(false), 7000)

    const resetIdle = () => {
      window.clearTimeout(idleTimer.current)
      idleTimer.current = window.setTimeout(() => !interactive.current && speak('acenando', assistant.idle, { hold: 4000 }), 25000)
    }

    let scanTimer = 0
    const onOver = (e: MouseEvent) => {
      const card = (e.target as Element).closest<HTMLElement>('[data-robot-scan]')
      if (!card || card === scanElRef.current) return
      scanElRef.current?.classList.remove('is-scanning')
      scanElRef.current = card
      card.classList.add('is-scanning')
      if (interactive.current) return
      changePose('apresentando')
      setTitle(card.dataset.exp ?? 'Projeto')
      setSay('Escaneando…')
      setChips([])
      setMenuStyle(false)
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
        speak('apresentando', `${card.dataset.name}\n${info || 'Dados do GitHub indisponíveis no momento.'}`, {
          title: `🚀 ${card.dataset.exp}`,
          hold: 5000,
        })
      }, 600)
    }
    const onOut = (e: MouseEvent) => {
      const card = (e.target as Element).closest<HTMLElement>('[data-robot-scan]')
      if (!card || card.contains(e.relatedTarget as Node)) return
      card.classList.remove('is-scanning')
      if (scanElRef.current === card) scanElRef.current = null
    }
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element).closest<HTMLElement>('[data-robot-action]')
      if (!el) return
      if (el.dataset.robotAction === 'tour') tourStep(0)
      if (el.dataset.robotAction === 'menu') openMenu()
      if (el.dataset.robotAction === 'clear-filter') (applyFilter(null), close())
    }
    const seen = new Set<Element>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (!en.isIntersecting || seen.has(en.target) || interactive.current) continue
          seen.add(en.target)
          const text = en.target.getAttribute('data-say')
          if (text) speak(en.target.getAttribute('data-robot-section') as Pose, text, { title: en.target.getAttribute('data-title') ?? 'Assistente' })
        }
      },
      { threshold: 0.35 },
    )
    document.querySelectorAll('[data-robot-section]').forEach((el) => io.observe(el))
    const onCustom = (e: Event) => {
      const d = (e as CustomEvent<{ pose: Pose; say?: string; title?: string }>).detail
      speak(d.pose, d.say ?? '', { title: d.title, hold: 5000 })
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
  }, [speak, tourStep, applyFilter, close, openMenu, changePose])

  return (
    <>
      <canvas ref={beamRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-30 h-full w-full" />

      {/* corpo do robô */}
      <div ref={bodyRef} className="pointer-events-none fixed left-0 top-0 z-40">
        <button
          type="button"
          onClick={() => (interactive.current && tourRef.current < 0 ? close() : openMenu())}
          aria-label="Assistente do portfólio: abrir menu"
          title="Clique para abrir o menu do assistente"
          className="robot-float pointer-events-auto absolute inset-[12%] cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-lab-cyan"
        >
          <span className="robot-jet" aria-hidden="true" />
          <div ref={flipRef} className="absolute inset-[-14%] transition-transform duration-300">
            {POSES.map((p) => (
              <img
                key={p === pose ? `${p}-${poseKey}` : p}
                src={src(p)}
                alt=""
                draggable={false}
                className={`absolute inset-0 h-full w-full select-none object-contain drop-shadow-[0_10px_30px_rgba(40,225,255,0.25)] ${
                  p === pose ? 'robot-materialize opacity-100' : 'opacity-0'
                }`}
              />
            ))}
          </div>
        </button>
      </div>

      {/* balão / painel */}
      <div ref={bubbleRef} className="fixed left-0 top-0 z-50" aria-live="polite">
        <AnimatePresence>
          {bubble && (
            <motion.div
              key={title + say}
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              className={`glass glow rounded-2xl px-4 py-3 text-sm leading-snug text-lab-ink ${menuStyle ? 'w-[230px]' : 'w-[min(290px,calc(100vw-16px))]'}`}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-semibold text-white">{title}</span>
                {chips.length > 0 && (
                  <button type="button" onClick={close} className="text-lab-muted hover:text-white" aria-label="Fechar">
                    ✕
                  </button>
                )}
              </div>
              {!menuStyle && <p className="whitespace-pre-line text-lab-muted">{say}</p>}
              {chips.length > 0 && (
                <div className={menuStyle ? 'mt-2 flex flex-col gap-1' : 'mt-3 flex flex-wrap gap-1.5'}>
                  {chips.map((c) =>
                    menuStyle ? (
                      <button
                        key={c.label}
                        type="button"
                        onClick={c.run}
                        className="flex items-center gap-3 rounded-xl px-3 py-2 text-left text-[13px] text-lab-ink transition hover:bg-lab-cyan/10 hover:text-white hover:shadow-[inset_0_0_0_1px_rgba(40,225,255,0.5)]"
                      >
                        <span className="w-5 text-center text-lab-cyan">{c.icon}</span>
                        {c.label}
                      </button>
                    ) : (
                      <button
                        key={c.label}
                        type="button"
                        onClick={c.run}
                        className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-lab-ink transition hover:border-lab-cyan hover:text-lab-cyan"
                      >
                        {c.label}
                      </button>
                    ),
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
