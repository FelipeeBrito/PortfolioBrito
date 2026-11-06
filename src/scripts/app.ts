import { Holo, sampleShape } from './holo'

/**
 * CONTROLE DA EXPERIÊNCIA
 *
 * Telas: home (a IA conversa) · projetos · sobre · contato · tudo (todas as seções).
 * O endereço acompanha a tela (#projetos, #sobre…), então dá para compartilhar o link.
 *
 * Transição: o robô se desfaz → as partículas formam o título e os cards da tela nova →
 * o conteúdo aparece → as partículas voltam a formar o robô, pequeno no canto.
 */

type View = 'home' | 'projetos' | 'sobre' | 'contato' | 'tudo'
const VIEWS: View[] = ['home', 'projetos', 'sobre', 'contato', 'tudo']

interface Data {
  ola: string
  volta: string
  secoes: Record<Exclude<View, 'home'>, string>
  enviado: string
  semFiltro: string
  email: string
  base: string
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export async function initApp() {
  const data = JSON.parse($('conversa').textContent || '{}') as Data
  const holo = new Holo($<HTMLCanvasElement>('holo'))
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

  // ---------------------------------------------------------------- fala digitada
  async function type(el: HTMLElement, text: string, speed = 24) {
    const id = ++typingId
    holo.talking = true
    el.textContent = ''
    const caret = document.createElement('span')
    caret.className = 'caret'
    if (reduced()) {
      el.textContent = text
      el.append(caret)
      holo.talking = false
      return
    }
    for (let i = 1; i <= text.length; i++) {
      if (id !== typingId) return
      el.textContent = text.slice(0, i)
      el.append(caret)
      const ch = text[i - 1]
      await wait(ch === '.' || ch === '?' || ch === '!' ? speed * 9 : ch === ',' ? speed * 4 : speed)
    }
    if (id === typingId) holo.talking = false
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

  // ---------------------------------------------------------------- filtros de projetos
  const cards = [...document.querySelectorAll<HTMLElement>('[data-scan]')]
  function filter(tag: string) {
    let shown = 0
    for (const c of cards) {
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
    cards.forEach((c) => (c.dataset.tags ?? '').split('|').filter(Boolean).forEach((t) => count.set(t, (count.get(t) ?? 0) + 1)))
    return [...count.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([t]) => ({ label: t, run: () => filter(t) }))
  }
  document.querySelectorAll<HTMLElement>('[data-filter]').forEach((b) => b.addEventListener('click', () => filter(b.dataset.filter ?? '')))

  // ---------------------------------------------------------------- escaneamento ao passar o mouse
  function timeAgo(iso: string) {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
    if (Number.isNaN(days)) return ''
    if (days <= 0) return 'hoje'
    if (days === 1) return 'ontem'
    if (days < 30) return `há ${days} dias`
    const m = Math.floor(days / 30)
    return m === 1 ? 'há 1 mês' : `há ${m} meses`
  }
  let scanning: HTMLElement | null = null
  for (const c of cards) {
    c.addEventListener('pointerenter', (e) => {
      if ((e as PointerEvent).pointerType === 'touch' || busy) return
      scanning?.classList.remove('is-scanning')
      scanning = c
      c.classList.add('is-scanning')
      holo.pulse()
      const info = [
        c.dataset.lang && `linguagem ${c.dataset.lang}`,
        c.dataset.updated && `atualizado ${timeAgo(c.dataset.updated)}`,
        c.dataset.stars !== '' && c.dataset.stars !== undefined && `${c.dataset.stars} ★`,
      ]
        .filter(Boolean)
        .join(' · ')
      say(`Projeto ${c.dataset.num}: ${c.dataset.name}.${info ? ' ' + info[0].toUpperCase() + info.slice(1) + '.' : ''}`)
    })
    c.addEventListener('pointerleave', () => {
      c.classList.remove('is-scanning')
      if (scanning === c) scanning = null
    })
  }

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
    holo.talking = false
    bubble.hidden = true
    if (push) history.pushState(null, '', next === 'home' ? location.pathname : `#${next}`)
    const fast = reduced()
    const prev = view
    view = next

    // 1. a tela atual some
    sectionsOf(prev).forEach((el) => el.classList.remove('shown'))
    if (!fast) holo.burst(prev === 'home' ? 1 : 0.6)
    await wait(fast ? 0 : 350)
    hideAll()
    window.scrollTo(0, 0)
    chrome(next)

    if (next === 'home') {
      // 2a. as partículas voltam a formar o robô grande
      show('home', false)
      holo.formRobot(stage)
      chips.style.opacity = '0'
      requestAnimationFrame(() => home.classList.add('shown'))
      await wait(fast ? 0 : 700)
      busy = false
      await type(talk, data.volta)
      chips.style.opacity = '1'
    } else {
      // 2b. a tela nova existe (invisível) para as partículas copiarem o formato dela
      show(next, false)
      await new Promise((r) => requestAnimationFrame(r))
      holo.formShape(sampleShape($('sections')))
      await wait(fast ? 0 : 1250)
      // 3. o conteúdo aparece e as partículas voltam a ser o robozinho do canto
      sectionsOf(next).forEach((el) => el.classList.add('shown'))
      if (!fast) holo.burst(0.35)
      holo.formRobot(mini)
      await wait(fast ? 0 : 500)
      busy = false
      say(data.secoes[next], next === 'projetos' ? tagButtons() : [])
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
    holo.burst(0.8)
    holo.formShape(sampleShape($('sent-shape')))
    await wait(reduced() ? 0 : 1600)
    holo.burst(0.4)
    holo.formRobot(mini)
    say(data.enviado)
  })

  // ---------------------------------------------------------------- início
  holo.formRobot(stage)
  await holo.load(`${data.base}/robot/holo.webp`)
  holo.start()
  const first = location.hash.slice(1) as View
  if (VIEWS.includes(first) && first !== 'home') {
    await wait(reduced() ? 0 : 900)
    go(first, false)
  } else {
    await wait(reduced() ? 0 : 1100)
    await type(talk, data.ola)
    chips.style.opacity = '1'
  }
}
