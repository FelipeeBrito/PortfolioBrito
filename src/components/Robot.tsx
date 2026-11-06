import { AnimatePresence, motion, useMotionValue, useSpring, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * ROBÔ ASSISTENTE
 *
 * Fica fixo no canto da tela e reage ao visitante trocando de pose:
 *   acenando · lendo · ideia · legal · rindo · surpreso
 *
 * Como ligar o robô a qualquer elemento da página (sem mexer neste arquivo):
 *   data-robot-hover="ideia"  data-say="Texto"   → ao passar o mouse
 *   data-robot-click="legal"  data-say="Texto"   → ao clicar
 *   data-robot-section="lendo" data-say="Texto"  → quando a seção aparece na tela
 *   window.dispatchEvent(new CustomEvent('robot', { detail: { pose, say } }))  → via código
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
const src = (p: Pose) => `${BASE}/robot/${p}.webp`

export default function Robot() {
  const reduce = useReducedMotion()
  const [pose, setPose] = useState<Pose>('acenando')
  const [say, setSay] = useState('Oi! Eu sou o assistente do laboratório. Vamos explorar?')
  const [bubble, setBubble] = useState(true)
  const [minimized, setMinimized] = useState(false)

  const backTimer = useRef<number>(0)
  const bubbleTimer = useRef<number>(0)
  const idleTimer = useRef<number>(0)
  const lockUntil = useRef(0) // evita que reações menores atropelem uma fala
  const jokeIdx = useRef(0)

  // inclinação seguindo o mouse
  const tilt = useMotionValue(0)
  const tiltSpring = useSpring(tilt, { stiffness: 120, damping: 14 })
  const rootRef = useRef<HTMLDivElement>(null)

  /** Troca a pose (e opcionalmente fala). Depois de alguns segundos volta ao normal. */
  const react = useCallback((p: Pose, text?: string, hold = 3800, priority = false) => {
    const now = Date.now()
    if (!priority && now < lockUntil.current) return
    if (priority) lockUntil.current = now + 1500
    setPose(p)
    if (text) {
      setSay(text)
      setBubble(true)
      window.clearTimeout(bubbleTimer.current)
      bubbleTimer.current = window.setTimeout(() => setBubble(false), hold)
    }
    window.clearTimeout(backTimer.current)
    backTimer.current = window.setTimeout(() => setPose('acenando'), hold + 300)
  }, [])

  useEffect(() => {
    // pré-carrega as imagens para a troca ser instantânea
    POSES.forEach((p) => {
      const img = new Image()
      img.src = src(p)
    })
    bubbleTimer.current = window.setTimeout(() => setBubble(false), 5500)

    const resetIdle = () => {
      window.clearTimeout(idleTimer.current)
      idleTimer.current = window.setTimeout(() => react('acenando', 'Ainda por aí? Clique em mim! 👋', 4000), 20000)
    }

    // ---- passar o mouse ----
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

    // ---- clique ----
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element).closest('[data-robot-click], a, button')
      if (!el || rootRef.current?.contains(el)) return
      const p = (el.getAttribute('data-robot-click') as Pose) || 'legal'
      react(p, el.getAttribute('data-say') || 'Boa escolha! 👍', 2600, true)
    }

    // ---- movimento do mouse: inclinação + "susto" com movimento brusco ----
    let lx = 0
    let ly = 0
    let lt = 0
    let lastScare = 0
    const onMove = (e: MouseEvent) => {
      resetIdle()
      const r = rootRef.current?.getBoundingClientRect()
      if (r) {
        const dx = e.clientX - (r.left + r.width / 2)
        tilt.set(Math.max(-12, Math.min(12, dx / 40)))
      }
      const now = performance.now()
      const dt = now - lt
      if (dt > 0 && dt < 60) {
        const speed = Math.hypot(e.clientX - lx, e.clientY - ly) / dt // px por ms
        if (speed > 6 && now - lastScare > 6000) {
          lastScare = now
          react('surpreso', 'Uau! Que velocidade! 😮', 2200, true)
        }
      }
      lx = e.clientX
      ly = e.clientY
      lt = now
    }

    // ---- seções aparecendo na tela ----
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

    // ---- eventos vindos do código (ex.: formulário enviado) ----
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
  }, [react, tilt])

  const onRobotClick = () => {
    if (minimized) {
      setMinimized(false)
      react('acenando', 'Voltei! 🤖', 2500, true)
      return
    }
    const joke = JOKES[jokeIdx.current++ % JOKES.length]
    react('rindo', joke, 4500, true)
  }

  return (
    <div
      ref={rootRef}
      className="pointer-events-none fixed bottom-3 right-3 z-50 flex flex-col items-end sm:bottom-6 sm:right-6"
      aria-live="polite"
    >
      {/* balão de fala */}
      <AnimatePresence>
        {bubble && !minimized && (
          <motion.div
            key={say}
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 22 }}
            className="pointer-events-auto relative mb-2 max-w-[240px] rounded-2xl border border-lab-line bg-white px-4 py-3 text-sm leading-snug text-lab-ink shadow-lg sm:max-w-[280px]"
          >
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-lab-cyan-dark">
              ● Assistente
            </span>
            {say}
            <span className="absolute -bottom-2 right-12 h-4 w-4 rotate-45 border-b border-r border-lab-line bg-white" />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="pointer-events-auto relative">
        {/* botão minimizar */}
        {!minimized && (
          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="absolute -left-1 top-2 z-10 grid h-6 w-6 place-items-center rounded-full border border-lab-line bg-white text-xs text-lab-muted shadow hover:text-lab-ink"
            aria-label="Minimizar o robô"
            title="Minimizar"
          >
            –
          </button>
        )}

        <motion.button
          type="button"
          onClick={onRobotClick}
          aria-label={minimized ? 'Mostrar o robô assistente' : 'Robô assistente: clique para ouvir uma piada'}
          className="block cursor-pointer select-none outline-none"
          style={{ rotate: reduce ? 0 : tiltSpring }}
          animate={reduce ? undefined : { y: [0, -8, 0] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.img
              key={pose}
              src={src(pose)}
              alt=""
              draggable={false}
              initial={reduce ? false : { scale: 0.85, y: 8, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 20 }}
              className={`drop-shadow-xl transition-[width] duration-300 ${minimized ? 'w-14' : 'w-28 sm:w-40'}`}
            />
          </AnimatePresence>
        </motion.button>
      </div>
    </div>
  )
}
