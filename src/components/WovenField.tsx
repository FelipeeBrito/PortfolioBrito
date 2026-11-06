import { useEffect, useRef } from 'react'

/**
 * TECIDO DE LUZ (fundo do topo)
 *
 * Um nó 3D (torus knot) "tecido" com milhares de partículas de luz. Gira devagar,
 * inclina na direção do mouse e as partículas se afastam do cursor.
 * Feito em Canvas 2D (sem bibliotecas 3D) para ficar leve.
 */

const COLORS = ['#28e1ff', '#2f6bff', '#9b7bff', '#e6f4ff']

export default function WovenField() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    // o Astro envolve o componente num elemento sem tamanho: mede a <section> do topo
    const host = (canvas.closest('section') ?? canvas.parentElement)!
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const small = window.innerWidth < 700 || (navigator.hardwareConcurrency || 4) <= 4
    const N = small ? 2600 : 5200

    // pontos sobre a superfície de um tubo que segue um torus knot (p=2, q=3)
    const bx = new Float32Array(N)
    const by = new Float32Array(N)
    const bz = new Float32Array(N)
    const col = new Uint8Array(N)
    const tw = new Float32Array(N)
    const curve = (t: number) => {
      const r = 0.55 + 0.25 * Math.cos(3 * t)
      return [r * Math.cos(2 * t), r * Math.sin(2 * t), 0.25 * Math.sin(3 * t)]
    }
    for (let i = 0; i < N; i++) {
      const t = (i / N) * Math.PI * 2
      const a = Math.random() * Math.PI * 2
      const p = curve(t)
      const q = curve(t + 0.001)
      // vetor tangente e um vetor perpendicular aproximado → anel do tubo
      const tx = q[0] - p[0]
      const ty = q[1] - p[1]
      const tz = q[2] - p[2]
      const tl = Math.hypot(tx, ty, tz) || 1
      let nx = -ty / tl
      let ny = tx / tl
      const nz = 0
      const nl = Math.hypot(nx, ny) || 1
      nx /= nl
      ny /= nl
      const b1 = (ty / tl) * nz - (tz / tl) * ny
      const b2 = (tz / tl) * nx - (tx / tl) * nz
      const b3 = (tx / tl) * ny - (ty / tl) * nx
      const rr = 0.09 * (0.85 + Math.random() * 0.3)
      bx[i] = p[0] + rr * (Math.cos(a) * nx + Math.sin(a) * b1)
      by[i] = p[1] + rr * (Math.cos(a) * ny + Math.sin(a) * b2)
      bz[i] = p[2] + rr * (Math.cos(a) * nz + Math.sin(a) * b3)
      const u = Math.random()
      col[i] = u < 0.42 ? 0 : u < 0.72 ? 1 : u < 0.9 ? 2 : 3
      tw[i] = Math.random() * 6.28
    }

    let w = 0
    let h = 0
    let dpr = 1
    const resize = () => {
      const r = host.getBoundingClientRect()
      w = r.width
      h = r.height
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
    }

    const mouse = { x: -1e4, y: -1e4, at: 0 }
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      mouse.x = e.clientX - r.left
      mouse.y = e.clientY - r.top
      mouse.at = performance.now()
    }

    let visible = true
    const io = new IntersectionObserver(([en]) => (visible = en.isIntersecting))
    io.observe(host)

    let rx = 0
    let ry = 0
    let raf = 0
    const sx = new Float32Array(N)
    const sy = new Float32Array(N)
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (!visible) return
      const fresh = now - mouse.at < 3000
      const trx = fresh ? (mouse.y / h - 0.5) * 0.8 : 0
      const try_ = fresh ? (mouse.x / w - 0.5) * 0.8 : 0
      rx += (trx - rx) * 0.04
      ry += (try_ - ry) * 0.04
      const spin = reduce ? 0.6 : now * 0.00012
      const cA = Math.cos(spin + ry)
      const sA = Math.sin(spin + ry)
      const cB = Math.cos(0.9 + rx)
      const sB = Math.sin(0.9 + rx)

      // o objeto fica à direita no computador e centralizado no celular
      const cx = w > 900 ? w * 0.68 : w * 0.5
      const cy = w > 900 ? h * 0.52 : h * 0.74
      const R = Math.min(w > 900 ? w * 0.46 : w * 0.95, h * 0.95) * 0.82

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'lighter'
      const rad2 = (R * 0.35) ** 2

      for (let c = 0; c < COLORS.length; c++) {
        ctx.fillStyle = COLORS[c]
        for (let pass = 0; pass < 2; pass++) {
          // duas passadas: pontos de trás (fracos) e da frente (fortes)
          ctx.globalAlpha = pass === 0 ? 0.4 : 1
          ctx.beginPath()
          for (let i = 0; i < N; i++) {
            if (col[i] !== c) continue
            const x1 = bx[i] * cA - bz[i] * sA
            const z1 = bx[i] * sA + bz[i] * cA
            const y2 = by[i] * cB - z1 * sB
            const z2 = by[i] * sB + z1 * cB
            if ((z2 > 0) !== (pass === 1)) continue
            const persp = 2.4 / (2.4 - z2)
            let px = cx + x1 * R * persp
            let py = cy + y2 * R * persp
            if (fresh) {
              const dx = px - mouse.x
              const dy = py - mouse.y
              const d2 = dx * dx + dy * dy
              if (d2 < rad2) {
                const f = 1 - d2 / rad2
                const d = Math.sqrt(d2) || 1
                px += (dx / d) * f * 26
                py += (dy / d) * f * 26
              }
            }
            sx[i] = px
            sy[i] = py
            const s = (pass === 0 ? 1.3 : 2.1) * persp * (reduce ? 1 : 0.8 + 0.35 * Math.sin(now * 0.003 + tw[i]))
            ctx.rect(px - s / 2, py - s / 2, s, s)
          }
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }

    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('pointermove', onMove, { passive: true })
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
    }
  }, [])

  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />
}
