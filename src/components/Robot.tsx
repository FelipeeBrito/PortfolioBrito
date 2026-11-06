import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { assistant } from '../data/assistant'

/**
 * ROBÔ GUIA
 *
 * Poses (public/robot/*.webp): acenando · apontando · sentado · apresentando · envelope
 *
 * - Menu: clique no robô (ou em [data-robot-action="menu"]) → ele aponta para um menu de navegação.
 * - Escaneamento: na página de projetos, ao passar o mouse num card ([data-robot-scan]) ele vira para
 *   o card, lança um feixe de luz e mostra dados do GitHub.
 * - Tour guiado: passa por todas as páginas ([data-robot-action="tour"]). Continua após trocar de página.
 * - Formulário de contato enviado → pose do envelope.
 *
 * Posicionamento do balão (responsivo):
 * - Celular/tablet estreito (< 768px): painel que sobe da parte de baixo da tela.
 * - Computador: ao lado do robô, ALÉM da ponta do dedo (nunca em cima dele). Se não couber,
 *   o robô diminui um pouco ou o painel troca de lado.
 */

export type Pose = 'acenando' | 'apontando' | 'sentado' | 'apresentando' | 'envelope'
type Page = keyof typeof assistant.pages
const POSES: Pose[] = ['acenando', 'apontando', 'sentado', 'apresentando', 'envelope']
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')
const src = (p: Pose) => `${BASE}/robot/${p}.webp`
const PAGE_URL: Record<Page, string> = {
  inicio: `${BASE}/`,
  projetos: `${BASE}/projetos/`,
  sobre: `${BASE}/sobre/`,
  contato: `${BASE}/contato/`,
}
const PAGE_POSE: Record<Page, Pose> = { inicio: 'acenando', projetos: 'apresentando', sobre: 'apontando', contato: 'envelope' }
const TOUR_KEY = 'robot-tour'
const MOBILE = 768
/** Distância do centro do robô até a ponta do dedo, em proporção do tamanho do robô. */
const REACH = 0.62
const GAP = 14

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

const storage = {
  get: () => {
    try {
      const v = sessionStorage.getItem(TOUR_KEY)
      return v === null ? -1 : Number(v)
    } catch {
      return -1
    }
  },
  set: (i: number) => {
    try {
      if (i < 0) sessionStorage.removeItem(TOUR_KEY)
      else sessionStorage.setItem(TOUR_KEY, String(i))
    } catch {
      /* navegação privada: o tour só não continua entre páginas */
    }
  },
}

export default function Robot({ page = 'inicio' }: { page?: Page }) {
  const [pose, setPose] = useState<Pose>(PAGE_POSE[page])
  const [poseKey, setPoseKey] = useState(0)
  const [title, setTitle] = useState('')
  const [say, setSay] = useState('')
  const [bubble, setBubble] = useState(false)
  const [chips, setChips] = useState<Chip[]>([])
  const [menuStyle, setMenuStyle] = useState(false)
  const [mobile, setMobile] = useState(false)

  const bodyRef = useRef<HTMLDivElement>(null)
  const flipRef = useRef<HTMLDivElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const beamRef = useRef<HTMLCanvasElement>(null)

  const poseRef = useRef<Pose>(PAGE_POSE[page])
  const scanElRef = useRef<HTMLElement | null>(null)
  const interactive = useRef(false)
  const backTimer = useRef(0)
  const bubbleTimer = useRef(0)
  const idleTimer = useRef(0)
  const jokeIdx = useRef(0)
  const stateRef = useRef({ bubble: false, chips: 0, menu: false, mobile: false })
  stateRef.current = { bubble, chips: chips.length, menu: menuStyle, mobile }

  const changePose = useCallback((p: Pose) => {
    if (p === poseRef.current) return
    poseRef.current = p
    setPose(p)
    setPoseKey((k) => k + 1)
  }, [])

  const speak = useCallback(
    (p: Pose, text: string, opts: { title?: string; chips?: Chip[]; menu?: boolean; hold?: number } = {}) => {
      const { chips: buttons = [], hold = 5000 } = opts
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
        backTimer.current = window.setTimeout(() => changePose(PAGE_POSE[page]), hold + 300)
      }
    },
    [changePose, page],
  )

  const close = useCallback(() => {
    interactive.current = false
    storage.set(-1)
    setChips([])
    setBubble(false)
    changePose(PAGE_POSE[page])
  }, [changePose, page])

  const go = useCallback(
    (target: Page, hash = '') => {
      if (target === page) {
        if (hash) document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth' })
        else window.scrollTo({ top: 0, behavior: 'smooth' })
        close()
        return
      }
      window.location.href = PAGE_URL[target] + hash
    },
    [page, close],
  )

  // ---------------------------------------------------------------- filtros (página de projetos)
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
        .slice(0, 6)
        .map(([t, n]) => ({ label: `${t} (${n})`, run: () => applyFilter(t) })),
      { label: 'Ver todos', run: () => (applyFilter(null), close()) },
    ]
  }, [applyFilter, close])

  // ---------------------------------------------------------------- tour (entre páginas)
  const tourStep = useCallback(
    (i: number) => {
      const steps = assistant.tour
      if (i >= steps.length) {
        storage.set(-1)
        interactive.current = false
        speak('acenando', 'Tour concluído! Clique em mim quando precisar.', { title: 'Até logo! 👋' })
        return
      }
      storage.set(i)
      const step = steps[i]
      if (step.page !== page) {
        window.location.href = PAGE_URL[step.page as Page]
        return
      }
      window.scrollTo({ top: 0, behavior: 'smooth' })
      speak(PAGE_POSE[page], step.say, {
        title: `Tour · ${i + 1}/${steps.length}`,
        chips: [
          { label: i === steps.length - 1 ? 'Concluir ✓' : 'Próximo →', run: () => tourStep(i + 1) },
          { label: 'Sair', run: close },
        ],
      })
    },
    [page, close, speak],
  )

  // ---------------------------------------------------------------- menu
  const openMenuRef = useRef<() => void>(() => {})
  const openMenu = useCallback(() => {
    storage.set(-1)
    const back = { label: '← Voltar', run: () => openMenuRef.current() }
    const items: Chip[] = [
      { icon: '⌂', label: 'Início', run: () => go('inicio') },
      { icon: '🧪', label: 'Projetos', run: () => (page === 'projetos' ? speak('apresentando', 'Quer filtrar por tecnologia?', { title: '🚀 Filtros', chips: [...tagChips(), back] }) : go('projetos')) },
      { icon: '👤', label: 'Sobre mim', run: () => go('sobre') },
      { icon: '⚙', label: 'Skills', run: () => go('sobre', '#habilidades') },
      { icon: '✉', label: 'Contato', run: () => go('contato') },
      { icon: '▶', label: 'Fazer o tour', run: () => tourStep(0) },
      { icon: '😄', label: 'Conte uma piada', run: () => speak('acenando', assistant.jokes[jokeIdx.current++ % assistant.jokes.length], { title: 'Hehe', chips: [back] }) },
    ]
    speak('apontando', '', { title: assistant.menuIntro, menu: true, chips: items })
  }, [go, page, speak, tagChips, tourStep])
  openMenuRef.current = openMenu

  // ---------------------------------------------------------------- posição, balão e feixe (a cada quadro)
  useEffect(() => {
    let raf = 0
    let vw = window.innerWidth
    let vh = window.innerHeight
    const cur = { cx: 0, cy: 0, s: 0, init: false }
    const mouse = { x: 0, y: 0, at: 0 }
    let tilt = 0
    let face = 1
    let docked = true
    const beam = beamRef.current!
    const bctx = beam.getContext('2d')!
    let dpr = 1

    const resize = () => {
      vw = window.innerWidth
      vh = window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      beam.width = Math.round(vw * dpr)
      beam.height = Math.round(vh * dpr)
      setMobile(vw < MOBILE)
    }
    const onMove = (e: PointerEvent) => {
      mouse.x = e.clientX
      mouse.y = e.clientY
      mouse.at = performance.now()
    }
    const setFace = (f: number) => {
      if (f === face) return
      face = f
      if (flipRef.current) flipRef.current.style.transform = `scaleX(${f})`
    }

    const target = () => {
      const small = vw < MOBILE
      const dock = { cx: vw - (small ? 54 : 100), cy: vh - (small ? 60 : 108), s: small ? 100 : 180 }
      const a = document.getElementById('robot-anchor')
      if (!a) {
        docked = true
        return dock
      }
      const r = a.getBoundingClientRect()
      const t0 = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height * 0.8)))
      const t = t0 * t0 * (3 - 2 * t0)
      docked = t > 0.5
      const hs = Math.min(r.width, r.height)
      const hcx = r.left + r.width / 2
      const hcy = r.top + r.height / 2 - Math.min(0, r.top)
      return { cx: hcx + (dock.cx - hcx) * t, cy: hcy + (dock.cy - hcy) * t, s: hs + (dock.s - hs) * t }
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const T = target()
      const st = stateRef.current
      const scanEl = scanElRef.current
      const sr = scanEl?.isConnected ? scanEl.getBoundingClientRect() : null
      const bub = bubbleRef.current
      const bw = bub?.offsetWidth ?? 0
      const bh = bub?.offsetHeight ?? 0

      // modo do balão: 'sheet' (celular), 'side' (ao lado, além do dedo) ou 'above' (acima da cabeça)
      const mode = !st.bubble ? 'none' : st.mobile ? 'sheet' : !sr && (st.chips > 0 || !docked) ? 'side' : 'above'

      // lado do painel e tamanho máximo do robô para ele caber (calculado com o tamanho "ideal",
      // não com o atual, para não ficar oscilando)
      let side = docked ? -1 : 1
      let cap = Infinity
      if (mode === 'side') {
        const room = (sd: number) => (sd > 0 ? vw - 16 - (T.cx + GAP) - bw : T.cx - GAP - 16 - bw) // espaço para o "alcance" do dedo
        if (room(side) < REACH * T.s) {
          if (!docked) cap = Math.max(120, room(side) / REACH) // no topo: nunca vai para cima do texto, só diminui
          else if (room(side) / REACH >= 150) cap = room(side) / REACH
          else if (room(-side) >= REACH * T.s) side = -side
          else {
            side = room(-side) > room(side) ? -side : side
            cap = Math.max(110, room(side) / REACH)
          }
        }
        setFace(side)
      }
      T.s = Math.min(T.s, cap)
      if (mode === 'sheet' && !docked) {
        // celular, robô no topo: ele "desce" para o canto, logo acima do painel, para não ficar coberto
        T.cx = vw - 54
        T.s = 100
        T.cy = vh - 12 - bh - T.s * 0.42
      }

      if (!cur.init) Object.assign(cur, T, { init: true })
      cur.cx += (T.cx - cur.cx) * 0.14
      cur.cy += (T.cy - cur.cy) * 0.14
      cur.s += (T.s - cur.s) * 0.14

      // ---- balão ----
      if (bub && mode !== 'none') {
        let bx = 8
        let by = 0
        if (mode === 'sheet') {
          // painel embaixo; se o robô estiver no canto, fica logo acima dele
          const bottom = docked ? Math.max(12, vh - (cur.cy - cur.s * 0.5) + 6) : 12 // no topo o robô sobe acima do painel
          by = vh - bottom - bh
        } else if (mode === 'side') {
          bx = side > 0 ? cur.cx + REACH * cur.s + GAP : cur.cx - REACH * cur.s - GAP - bw
          by = Math.max(76, Math.min(vh - bh - 12, cur.cy - cur.s * 0.22 - bh * 0.3))
          bx = Math.max(8, Math.min(vw - bw - 8, bx))
        } else {
          bx = Math.max(8, Math.min(vw - bw - 8, cur.cx - bw + cur.s * 0.35))
          by = Math.max(76, cur.cy - cur.s * 0.62 - bh)
        }
        bub.style.transform = `translate(${Math.round(bx)}px, ${Math.round(by)}px)`
      }

      // ---- para onde olhar ----
      if (sr) setFace(sr.left + sr.width / 2 < cur.cx ? -1 : 1)
      else if (!st.bubble || st.mobile || (docked && st.chips === 0)) {
        const lookX = now - mouse.at < 4000 ? mouse.x : docked ? 0 : vw
        setFace(lookX < cur.cx - 30 ? -1 : 1)
      }
      const lookX = sr ? sr.left + sr.width / 2 : now - mouse.at < 4000 ? mouse.x : cur.cx
      tilt += (Math.max(-1, Math.min(1, (lookX - cur.cx) / (vw * 0.5))) - tilt) * 0.06

      const body = bodyRef.current
      if (body) {
        body.style.width = `${cur.s}px`
        body.style.height = `${cur.s}px`
        body.style.transform = `translate(${cur.cx - cur.s / 2}px, ${cur.cy - cur.s / 2}px) rotate(${tilt * 5}deg)`
      }

      // ---- feixe até o projeto escaneado ----
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      bctx.clearRect(0, 0, vw, vh)
      if (sr && sr.bottom > 0 && sr.top < vh) {
        const hx = cur.cx + face * cur.s * REACH * 0.9
        const hy = cur.cy - cur.s * 0.15
        const nearX = face < 0 ? sr.right : sr.left
        const g = bctx.createLinearGradient(hx, hy, nearX, sr.top + sr.height / 2)
        g.addColorStop(0, 'rgba(40,225,255,0.5)')
        g.addColorStop(1, 'rgba(40,225,255,0.03)')
        bctx.fillStyle = g
        bctx.globalAlpha = 0.3 + 0.08 * Math.sin(now * 0.02)
        bctx.beginPath()
        bctx.moveTo(hx, hy)
        bctx.lineTo(nearX, Math.max(0, sr.top))
        bctx.lineTo(nearX, Math.min(vh, sr.bottom))
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

    // tour em andamento (veio de outra página) ou saudação da página
    const t = storage.get()
    const greet = window.setTimeout(() => {
      if (t >= 0 && assistant.tour[t]?.page === page) tourStep(t)
      else {
        storage.set(-1)
        const g = assistant.pages[page]
        speak(PAGE_POSE[page], g.say, { title: g.title, hold: 6500 })
      }
    }, 500)

    const resetIdle = () => {
      window.clearTimeout(idleTimer.current)
      idleTimer.current = window.setTimeout(() => !interactive.current && speak('acenando', assistant.idle, { hold: 4000 }), 30000)
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
      setTitle(`🚀 ${card.dataset.exp ?? 'Projeto'}`)
      setSay('Escaneando…')
      setChips([])
      setMenuStyle(false)
      setBubble(true)
      window.clearTimeout(bubbleTimer.current)
      window.clearTimeout(scanTimer)
      scanTimer = window.setTimeout(() => {
        const info = [
          card.dataset.lang && `Linguagem: ${card.dataset.lang}`,
          card.dataset.updated && `Atualizado ${timeAgo(card.dataset.updated)}`,
          card.dataset.stars !== undefined && card.dataset.stars !== '' && `★ ${card.dataset.stars}`,
        ]
          .filter(Boolean)
          .join(' · ')
        speak('apresentando', `${card.dataset.name}\n${info || 'Dados do GitHub indisponíveis no momento.'}`, { title: `🚀 ${card.dataset.exp}`, hold: 5000 })
      }, 550)
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
      const a = el.dataset.robotAction
      if (a === 'tour') tourStep(0)
      if (a === 'menu') openMenu()
      if (a === 'clear-filter') (applyFilter(null), close())
    }
    const onCustom = (e: Event) => {
      const d = (e as CustomEvent<{ pose: Pose; say?: string; title?: string }>).detail
      speak(d.pose, d.say ?? '', { title: d.title, hold: 5500 })
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && interactive.current && close()

    document.addEventListener('mouseover', onOver)
    document.addEventListener('mouseout', onOut)
    document.addEventListener('click', onClick)
    window.addEventListener('pointermove', resetIdle, { passive: true })
    window.addEventListener('robot', onCustom)
    window.addEventListener('keydown', onKey)
    resetIdle()
    return () => {
      window.clearTimeout(greet)
      document.removeEventListener('mouseover', onOver)
      document.removeEventListener('mouseout', onOut)
      document.removeEventListener('click', onClick)
      window.removeEventListener('pointermove', resetIdle)
      window.removeEventListener('robot', onCustom)
      window.removeEventListener('keydown', onKey)
      window.clearTimeout(scanTimer)
      ;[backTimer, bubbleTimer, idleTimer].forEach((t) => window.clearTimeout(t.current))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const panelWidth = mobile ? 'w-[calc(100vw-16px)]' : menuStyle ? 'w-[230px]' : 'w-[300px]'

  return (
    <>
      <canvas ref={beamRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-30 h-full w-full" />

      {/* fundo escurecido quando o menu está aberto no celular (toque fora fecha) */}
      <AnimatePresence>
        {mobile && bubble && chips.length > 0 && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 z-[35] bg-[#02040b]/70 backdrop-blur-[2px]"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* corpo do robô */}
      <div ref={bodyRef} className="pointer-events-none fixed left-0 top-0 z-40">
        <button
          type="button"
          onClick={() => (interactive.current && storage.get() < 0 ? close() : openMenu())}
          aria-label="Assistente do portfólio: abrir menu"
          title="Abrir o menu do assistente"
          className="robot-float pointer-events-auto absolute inset-[10%] cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-lab-cyan"
        >
          <span className="robot-jet" aria-hidden="true" />
          <div ref={flipRef} className="absolute inset-[-16%] transition-transform duration-300">
            {POSES.map((p) => (
              <img
                key={p === pose ? `${p}-${poseKey}` : p}
                src={src(p)}
                alt=""
                draggable={false}
                className={`absolute inset-0 h-full w-full select-none object-contain drop-shadow-[0_10px_30px_rgba(40,225,255,0.25)] ${p === pose ? 'robot-materialize opacity-100' : 'opacity-0'}`}
              />
            ))}
          </div>
        </button>
      </div>

      {/* balão / painel */}
      <div ref={bubbleRef} className="fixed left-0 top-0 z-50" style={{ transform: 'translate(-9999px, 0)' }} aria-live="polite">
        <AnimatePresence>
          {bubble && (
            <motion.div
              key={title + say + chips.length}
              role={chips.length ? 'dialog' : undefined}
              aria-label={chips.length ? title : undefined}
              initial={{ opacity: 0, y: 10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 340, damping: 28 }}
              className={`panel glow rounded-2xl px-4 py-3 text-sm leading-snug text-lab-ink ${panelWidth}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-white">{title}</span>
                {chips.length > 0 && (
                  <button type="button" onClick={close} className="-mr-1 grid h-7 w-7 place-items-center rounded-full text-lab-muted hover:bg-white/5 hover:text-white" aria-label="Fechar">
                    ✕
                  </button>
                )}
              </div>
              {say && <p className="mt-1 whitespace-pre-line text-lab-muted">{say}</p>}
              {chips.length > 0 && (
                <div className={menuStyle ? `mt-2 grid gap-1 ${mobile ? 'grid-cols-2' : 'grid-cols-1'}` : 'mt-3 flex flex-wrap gap-1.5'}>
                  {chips.map((c) =>
                    menuStyle ? (
                      <button
                        key={c.label}
                        type="button"
                        onClick={c.run}
                        className="flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-left text-[13px] text-lab-ink transition hover:bg-lab-cyan/10 hover:text-white hover:shadow-[inset_0_0_0_1px_rgba(40,225,255,0.5)]"
                      >
                        <span className="w-5 shrink-0 text-center text-lab-cyan">{c.icon}</span>
                        {c.label}
                      </button>
                    ) : (
                      <button
                        key={c.label}
                        type="button"
                        onClick={c.run}
                        className="min-h-9 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-lab-ink transition hover:border-lab-cyan hover:text-lab-cyan"
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
