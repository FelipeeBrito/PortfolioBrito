import { ajustes, githubConfig, type Project } from '../data/projects'

/**
 * GITHUB — busca o perfil e os repositórios e monta o HTML do cartão de perfil e dos cards.
 *
 * Este arquivo roda em dois lugares:
 *  - na hora de gerar o site (deixa uma "foto" dos dados já pronta na página);
 *  - no navegador de quem visita (busca os dados atuais e atualiza a página).
 */

export interface GhProfile {
  login: string
  name: string
  bio: string
  location: string
  avatar: string
  url: string
  repos: number
  followers: number
}

export interface GhData {
  profile: GhProfile | null
  projects: Project[]
  fetchedAt: number
}

const API = 'https://api.github.com'
const DAY = 86400000

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const safeUrl = (u?: string | null) => (u && /^https?:\/\//i.test(u) ? u : undefined)

/** "hoje", "ontem", "há 3 dias", "há 2 meses"… */
export function timeAgo(iso: string, now = Date.now()) {
  const days = Math.floor((now - new Date(iso).getTime()) / DAY)
  if (Number.isNaN(days)) return ''
  if (days <= 0) return 'hoje'
  if (days === 1) return 'ontem'
  if (days < 30) return `há ${days} dias`
  const m = Math.floor(days / 30)
  if (m < 12) return m === 1 ? 'há 1 mês' : `há ${m} meses`
  const y = Math.floor(days / 365)
  return y <= 1 ? 'há 1 ano' : `há ${y} anos`
}

/** Escolhe o que aparece: os mais recentes + os marcados com a topic de destaque. */
export function pickProjects(raw: any[], user: string): Project[] {
  const { recentes, topicDestaque, topicOcultar } = githubConfig
  const fix = new Map(Object.entries(ajustes).map(([k, v]) => [k.toLowerCase(), v]))
  return raw
    .filter(
      (r) =>
        !r.fork &&
        !r.archived &&
        !r.private &&
        r.name !== '.github' &&
        r.name.toLowerCase() !== user.toLowerCase() && // repositório especial do perfil
        !(r.topics ?? []).includes(topicOcultar),
    )
    .sort((a, b) => Date.parse(b.pushed_at ?? b.updated_at) - Date.parse(a.pushed_at ?? a.updated_at))
    .filter((r, i) => i < recentes || (r.topics ?? []).includes(topicDestaque))
    .map((r) => {
      const a = fix.get(r.name.toLowerCase()) ?? {}
      const topics: string[] = (r.topics ?? []).filter((t: string) => t !== topicDestaque && t !== topicOcultar)
      return {
        name: r.name,
        description: a.description ?? r.description ?? 'Projeto em desenvolvimento.',
        tags: a.tags ?? [r.language, ...topics].filter(Boolean).slice(0, 4),
        url: safeUrl(a.url ?? r.homepage),
        repo: r.html_url,
        language: r.language ?? undefined,
        updatedAt: r.pushed_at ?? r.updated_at,
        stars: r.stargazers_count ?? 0,
        destaque: (r.topics ?? []).includes(topicDestaque),
      }
    })
}

/** Busca perfil + repositórios. Devolve null se o GitHub não responder. */
export async function fetchGithub(user: string): Promise<GhData | null> {
  try {
    const opt = { headers: { Accept: 'application/vnd.github+json' } }
    const [u, r] = await Promise.all([
      fetch(`${API}/users/${user}`, opt),
      fetch(`${API}/users/${user}/repos?sort=pushed&per_page=100`, opt),
    ])
    if (!r.ok) return null
    const repos = await r.json()
    if (!Array.isArray(repos)) return null
    const p = u.ok ? await u.json() : null
    return {
      profile: p?.login
        ? {
            login: p.login,
            name: p.name ?? '',
            bio: p.bio ?? '',
            location: p.location ?? '',
            avatar: p.avatar_url ?? '',
            url: p.html_url ?? `https://github.com/${user}`,
            repos: p.public_repos ?? 0,
            followers: p.followers ?? 0,
          }
        : null,
      projects: pickProjects(repos, user),
      fetchedAt: Date.now(),
    }
  } catch {
    return null
  }
}

/**
 * Versão para o navegador: guarda o resultado por 10 minutos (para não repetir a busca a cada
 * clique) e, se o GitHub estiver fora do ar, devolve a última versão guardada.
 */
export async function liveGithub(user: string): Promise<GhData | null> {
  const key = `gh2:${user}`
  let cached: GhData | null = null
  try {
    cached = JSON.parse(localStorage.getItem(key) || 'null')
  } catch {
    /* sem armazenamento: busca sempre */
  }
  if (cached && Date.now() - cached.fetchedAt < 10 * 60 * 1000) return cached
  const fresh = await fetchGithub(user)
  if (!fresh) return cached
  try {
    localStorage.setItem(key, JSON.stringify(fresh))
  } catch {
    /* ignora */
  }
  return fresh
}

// ------------------------------------------------------------------ HTML

/** Cartão de perfil. Sem dados do GitHub, usa o nome/cargo do site e a foto pública. */
export function renderProfile(p: GhProfile | null, site: { name: string; role: string; github: string }, latest?: string) {
  const url = p?.url ?? `https://github.com/${site.github}`
  const avatar = p?.avatar ? `${p.avatar}${p.avatar.includes('?') ? '&' : '?'}s=240` : `https://github.com/${site.github}.png?size=240`
  const name = p?.name || site.name
  const stats: [string, string][] = []
  if (p?.repos) stats.push([String(p.repos), 'repositórios públicos'])
  if (p && p.followers >= 5) stats.push([String(p.followers), 'seguidores'])
  if (latest) stats.push([timeAgo(latest), 'última atualização'])
  return `<div data-p="box" class="card flex flex-col gap-5 p-5 sm:p-7 lg:flex-row lg:items-center lg:gap-8">
  <div class="flex min-w-0 flex-1 items-center gap-4 sm:gap-5">
    <a href="${esc(url)}" target="_blank" rel="noopener" class="avatar-ring shrink-0" aria-label="Abrir o GitHub de ${esc(name)}">
      <img src="${esc(avatar)}" alt="Foto de ${esc(name)} no GitHub" width="96" height="96" class="h-[72px] w-[72px] rounded-full bg-navy object-cover sm:h-24 sm:w-24" onerror="this.style.visibility='hidden'" />
    </a>
    <div class="min-w-0">
      <p class="text-lg font-semibold leading-tight text-white sm:text-xl">${esc(name)}</p>
      <p class="mt-0.5 font-mono text-xs text-cyan">@${esc(p?.login ?? site.github)}</p>
      <p class="mt-2 text-sm leading-relaxed text-muted">${esc(p?.bio || site.role)}</p>
      ${p?.location ? `<p class="mt-1 text-xs text-muted">📍 ${esc(p.location)}</p>` : ''}
    </div>
  </div>
  <div class="flex flex-wrap items-center gap-x-8 gap-y-4">
    ${stats.map(([v, l]) => `<p><span class="block text-xl font-semibold leading-tight text-white sm:text-2xl">${esc(v)}</span><span class="text-xs text-muted">${esc(l)}</span></p>`).join('')}
    <a href="${esc(url)}" target="_blank" rel="noopener" class="chip chip-sm whitespace-nowrap">Ver meu GitHub ↗</a>
  </div>
</div>`
}

/** Cards dos projetos. `state` define a mensagem quando a lista está vazia. */
export function renderCards(projects: Project[], state: 'carregando' | 'erro' = 'carregando', github = '') {
  if (!projects.length) {
    return state === 'carregando'
      ? `<p class="col-span-full py-10 text-center font-mono text-sm text-muted">Carregando projetos do GitHub…</p>`
      : `<p class="col-span-full py-10 text-center text-sm text-muted">Não consegui carregar os projetos agora. <a class="text-cyan underline" href="https://github.com/${esc(github)}?tab=repositories" target="_blank" rel="noopener">Veja direto no GitHub ↗</a></p>`
  }
  const now = Date.now()
  return projects
    .map((p, i) => {
      const novo = now - Date.parse(p.updatedAt) < githubConfig.diasNovo * DAY
      const thumb = p.repo.includes('github.com/') ? `https://opengraph.githubassets.com/1/${p.repo.split('github.com/')[1]}` : ''
      return `<article data-p="box" data-scan class="card flex flex-col" data-name="${esc(p.name)}" data-num="${String(i + 1).padStart(2, '0')}" data-tags="${esc(p.tags.join('|').toLowerCase())}" data-lang="${esc(p.language ?? p.tags[0] ?? '')}" data-updated="${esc(p.updatedAt)}" data-stars="${p.stars || ''}">
  <div class="relative aspect-[16/9] border-b border-white/5 bg-gradient-to-br from-navy via-[#1b1f5c] to-[#3a1d6e]">
    ${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy" class="h-full w-full object-cover opacity-85" onerror="this.remove()" />` : ''}
    <div class="absolute left-3 top-3 flex gap-1.5">
      ${novo ? `<span class="rounded-full bg-cyan px-2.5 py-0.5 text-[11px] font-semibold text-bg shadow-[0_0_14px_-2px_rgba(40,225,255,0.9)]">Novo</span>` : ''}
      ${p.destaque ? `<span class="rounded-full border border-white/25 bg-black/60 px-2.5 py-0.5 text-[11px] text-white backdrop-blur">★ Destaque</span>` : ''}
    </div>
  </div>
  <div class="flex flex-1 flex-col p-5 sm:p-6">
    <h3 class="break-words text-lg font-semibold text-white">${esc(p.name)}</h3>
    <p class="mt-1 font-mono text-[11px] text-muted">atualizado ${esc(timeAgo(p.updatedAt, now))}</p>
    <p class="mt-3 flex-1 text-sm leading-relaxed text-muted">${esc(p.description)}</p>
    <div class="mt-4 flex flex-wrap gap-1.5">
      ${p.tags.map((t) => `<span class="rounded-full border border-cyan/30 px-2.5 py-0.5 text-[11px] text-cyan">${esc(t)}</span>`).join('')}
    </div>
    <div class="mt-5 flex flex-wrap gap-2">
      ${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener" class="chip chip-sm">Ver projeto ↗</a>` : ''}
      <a href="${esc(p.repo)}" target="_blank" rel="noopener" class="chip chip-sm">Código</a>
    </div>
  </div>
</article>`
    })
    .join('')
}
