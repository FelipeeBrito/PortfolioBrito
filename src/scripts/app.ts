import { Particles, sampleShape } from './particles'
import type { Owl } from './owl'
import { liveGithub, renderCards, renderProfile, timeAgo, type GhData } from '../lib/github'

/**
 * CONTROLE DA EXPERIÊNCIA
 *
 * Telas: home (a IA conversa) · projetos · sobre · contato · tudo (todas as seções).
 * O endereço acompanha a tela (#projetos, #sobre…), então dá para compartilhar o link.
 *
 * Personagem: a coruja 3D (owl.ts). Ela fica grande no início e voa para o canto nas seções.
 * Transição: partículas saem da coruja → formam o título e os cards da tela nova →
 * o conteúdo aparece → as partículas voltam para a coruja e somem.
 */

type View = 'home' | 'projetos' | 'sobre' | 'contato' | 'tudo'
const VIEWS: View[] = ['home', 'projetos', 'sobre', 'contato', 'tudo']

interface Data {
  ola: string
  volta: string
  secoes: Record<Exclude<View, 'home'>, string> & { projetosRecente: string }
  enviado: string
  semFiltro: string
  email: string
  base: string
  site: { name: string; role: string; github: string }
  /** dados do GitHub de quando o site foi gerado (pode ser null) */
  gh: GhData | null
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export async function initApp() {
  const data = JSON.parse($('conversa').textContent || '{}') as Data
  const fx = new Particles($<HTMLCanvasElement>('fx'))
  let owl: Owl | null = null
  const talking = (v: boolean) => owl && (owl.talking = v)
  const stage = $('robot-stage')
  const mini = $('robot-mini')
  const home = $('home')
  const talk = $('talk')
  const chips = $('chips')
  const bubble = $('bubble')
  const bubbleText = $('bubble-text')
  const bubbleChips = $('bubble-chips')
  const nav = $('nav')
  const skip = $('skip')
  const footer = document.querySelector<HTMLElement>('[data-footer]')!

  let view: View = 'home'
  let busy = false
  let typingId = 0
  let pending: View | null = null
  let anchor: HTMLElement = stage
  /** Define onde a coruja fica (grande no início, pequena no canto). */
  function perch(el: HTMLElement) {
    anchor = el
    if (owl) owl.anchorEl = el
  }

  // ---------------------------------------------------------------- fala digitada
  async function type(el: HTMLElement, text: string, speed = 24) {
    const id = ++typingId
    talking(true)
    el.textContent = ''
    const caret = document.createElement('span')
    caret.className = 'caret'
    if (reduced()) {
      el.textContent = text
      el.append(caret)
      talking(false)
      return
    }
    for (let i = 1; i <= text.length; i++) {
      if (id !== typingId) return
      el.textContent = text.slice(0, i)
      el.append(caret)
      const ch = text[i - 1]
      await wait(ch === '.' || ch === '?' || ch === '!' ? speed * 9 : ch === ',' ? speed * 4 : speed)
    }
    if (id === typingId) talking(false)
  }

  function say(text: string, buttons: { label: string; run: () => void }[] = []) {
    bubble.hidden = false
    bubbleChips.replaceChildren(
      ...buttons.map((b) => {
        const el = document.createElement('button')
        el.type = 'button'
        el.className = 'chip chip-sm'
        el.textContent = b.label
        el.addEventListener('click', b.run)
        return el
      }),
    )
    return type(bubbleText, text, 18)
  }

  // no celular o balão cobre o conteúdo: some quando a pessoa rola a página
  let shownAtY = 0
  new MutationObserver(() => (shownAtY = window.scrollY)).observe(bubble, { attributes: true, attributeFilter: ['hidden'] })
  window.addEventListener(
    'scroll',
    () => {
      if (!bubble.hidden && window.innerWidth < 1024 && Math.abs(window.scrollY - shownAtY) > 60) bubble.hidden = true
    },
    { passive: true },
  )

  // ---------------------------------------------------------------- projetos do GitHub (ao vivo)
  const grid = $('gh-grid')
  const cards = () => [...grid.querySelectorAll<HTMLElement>('[data-scan]')]
  let latest = '' // data do projeto mais recente (para a fala da coruja)

  function renderGithub(d: GhData | null, failed = false) {
    const projects = d?.projects ?? []
    latest = projects[0]?.updatedAt ?? ''
    $('gh-profile').innerHTML = renderProfile(d?.profile ?? null, data.site, latest || undefined)
    grid.innerHTML = renderCards(projects, failed ? 'erro' : 'carregando', data.site.github)
    $('filtro').style.display = 'none'
    scanning = null
  }
  /** Troca o conteúdo só quando não há transição em andamento (para não bagunçar as partículas). */
  const whenIdle = (fn: () => void) => (busy ? void setTimeout(() => whenIdle(fn), 250) : fn())

  // ---------------------------------------------------------------- filtros de projetos
  function filter(tag: string) {
    let shown = 0
    for (const c of cards()) {
      const ok = !tag || (c.dataset.tags ?? '').split('|').includes(tag)
      c.style.display = ok ? '' : 'none'
      if (ok) shown++
    }
    $('filtro').style.display = tag ? 'flex' : 'none'
    $('filtro-nome').textContent = tag
    if (tag) say(shown ? `Encontrei ${shown} projeto${shown > 1 ? 's' : ''} com "${tag}".` : data.semFiltro, tagButtons())
  }
  function tagButtons() {
    const count = new Map<string, number>()
    cards().forEach((c) => (c.dataset.tags ?? '').split('|').filter(Boolean).forEach((t) => count.set(t, (count.get(t) ?? 0) + 1)))
    return [...count.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([t]) => ({ label: t, run: () => filter(t) }))
  }
  document.querySelectorAll<HTMLElement>('[data-filter]').forEach((b) => b.addEventListener('click', () => filter(b.dataset.filter ?? '')))

  // ---------------------------------------------------------------- escaneamento ao passar o mouse
  // (ouvimos a grade inteira, porque os cards são trocados quando chegam os dados do GitHub)
  let scanning: HTMLElement | null = null
  grid.addEventListener('pointerover', (e) => {
    const c = (e.target as Element).closest<HTMLElement>('[data-scan]')
    if (!c || c === scanning || e.pointerType === 'touch' || busy) return
    scanning?.classList.remove('is-scanning')
    scanning = c
    c.classList.add('is-scanning')
    owl?.cheer(900)
    const info = [
      c.dataset.lang && `linguagem ${c.dataset.lang}`,
      c.dataset.updated && `atualizado ${timeAgo(c.dataset.updated)}`,
      c.dataset.stars && `${c.dataset.stars} ★`,
    ]
      .filter(Boolean)
      .join(' · ')
    say(`Projeto ${c.dataset.num}: ${c.dataset.name}.${info ? ' ' + info[0].toUpperCase() + info.slice(1) + '.' : ''}`)
  })
  grid.addEventListener('pointerout', (e) => {
    const c = (e.target as Element).closest<HTMLElement>('[data-scan]')
    if (!c || c.contains(e.relatedTarget as Node)) return
    c.classList.remove('is-scanning')
    if (scanning === c) scanning = null
  })

  // ---------------------------------------------------------------- navegação entre telas
  const sectionsOf = (v: View): HTMLElement[] =>
    v === 'home' ? [home] : v === 'tudo' ? [$('projetos'), $('sobre'), $('contato'), footer] : [$(v), footer]

  function show(v: View, visible: boolean) {
    for (const el of sectionsOf(v)) {
      el.classList.add('on')
      el.classList.toggle('shown', visible)
    }
  }
  function hideAll() {
    VIEWS.forEach((v) => sectionsOf(v).forEach((el) => el.classList.remove('on', 'shown')))
  }

  function chrome(v: View) {
    const inHome = v === 'home'
    nav.hidden = inHome
    skip.hidden = !inHome
    mini.hidden = inHome
    nav.querySelectorAll<HTMLElement>('[data-go]').forEach((a) => {
      const on = a.dataset.go === v
      a.classList.toggle('border-cyan/70', on)
      a.classList.toggle('text-white', on)
      if (on) a.setAttribute('aria-current', 'page')
      else a.removeAttribute('aria-current')
    })
  }

  async function go(next: View, push = true) {
    if (busy) {
      pending = next
      return
    }
    if (next === view) return
    busy = true
    typingId++
    talking(false)
    bubble.hidden = true
    if (push) history.pushState(null, '', next === 'home' ? location.pathname : `#${next}`)
    const fast = reduced()
    const prev = view
    view = next

    // 1. a tela atual some
    sectionsOf(prev).forEach((el) => el.classList.remove('shown'))
    fx.burst(prev === 'home' ? 1 : 0.6)
    await wait(fast ? 0 : 350)
    hideAll()
    window.scrollTo(0, 0)
    chrome(next)

    if (next === 'home') {
      // 2a. a coruja voa de volta para o centro
      show('home', false)
      perch(stage)
      fx.gather()
      chips.style.opacity = '0'
      requestAnimationFrame(() => home.classList.add('shown'))
      await wait(fast ? 0 : 700)
      busy = false
      await type(talk, data.volta)
      chips.style.opacity = '1'
    } else {
      // 2b. a tela nova existe (invisível) para as partículas copiarem o formato dela
      show(next, false)
      perch(mini) // a coruja já vai voando para o canto
      await new Promise((r) => requestAnimationFrame(r))
      fx.formShape(sampleShape($('sections')))
      await wait(fast ? 0 : 1250)
      // 3. o conteúdo aparece e as partículas voltam para a coruja, já no canto
      sectionsOf(next).forEach((el) => el.classList.add('shown'))
      fx.gather()
      await wait(fast ? 0 : 500)
      busy = false
      if (next === 'projetos') {
        const recente = latest ? ' ' + data.secoes.projetosRecente.replace('{quando}', timeAgo(latest)) : ''
        say(data.secoes.projetos + recente, tagButtons())
      } else say(data.secoes[next])
    }
    if (pending) {
      const p = pending
      pending = null
      go(p)
    }
  }

  // links e botões com data-go
  document.addEventListener('click', (e) => {
    const a = (e.target as Element).closest<HTMLElement>('[data-go]')
    if (!a) return
    e.preventDefault()
    go(a.dataset.go as View)
  })
  mini.addEventListener('click', () => go('home'))
  window.addEventListener('popstate', () => {
    const h = location.hash.slice(1) as View
    go(VIEWS.includes(h) ? h : 'home', false)
  })

  // formulário de contato: abre o e-mail já preenchido + animação "Enviado ✓"
  $('contact').addEventListener('submit', async (e) => {
    e.preventDefault()
    const form = e.target as HTMLFormElement
    const f = new FormData(form)
    const body = `${f.get('mensagem')}\n\n— ${f.get('nome')} (${f.get('email')})`
    window.location.href = `mailto:${data.email}?subject=${encodeURIComponent('Contato pelo portfólio')}&body=${encodeURIComponent(body)}`
    form.reset()
    bubble.hidden = true
    owl?.cheer(2600)
    fx.burst(0.8)
    fx.formShape(sampleShape($('sent-shape')))
    await wait(reduced() ? 0 : 1600)
    fx.gather()
    say(data.enviado)
  })

  // ---------------------------------------------------------------- início
  // GitHub: mostra já a versão de quando o site foi gerado e busca a atual em seguida
  if (data.gh) renderGithub(data.gh)
  liveGithub(data.site.github).then((d) => whenIdle(() => (d ? renderGithub(d) : data.gh || renderGithub(null, true))))

  fx.start()
  perch(stage)
  stage.addEventListener('click', () => owl?.cheer())
  // a coruja 3D carrega à parte, para o resto da página não esperar por ela
  const owlReady = import('./owl')
    .then(async ({ Owl }) => {
      const o = new Owl($<HTMLCanvasElement>('owl'))
      await o.load(`${data.base}/owl/owl.glb`)
      owl = o
      perch(anchor)
      fx.origin = () => o.center()
      o.start()
    })
    .catch(() => {
      // sem 3D (navegador antigo ou falha ao carregar): mostra a coruja como imagem
      for (const el of [stage, mini]) el.style.background = `url(${data.base}/owl/owl.png) center / contain no-repeat`
    })
  await Promise.race([owlReady, wait(3500)])
  const first = location.hash.slice(1) as View
  if (VIEWS.includes(first) && first !== 'home') {
    go(first, false)
  } else {
    await wait(reduced() ? 0 : 500)
    await type(talk, data.ola)
    chips.style.opacity = '1'
  }
}
