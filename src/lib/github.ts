import type { Project } from '../data/projects'

/** Busca os repositórios públicos no build. Se falhar (sem internet), devolve lista vazia. */
export async function fetchRepos(user: string): Promise<Project[]> {
  try {
    const res = await fetch(`https://api.github.com/users/${user}/repos?sort=updated&per_page=30`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) return []
    const data = (await res.json()) as any[]
    return data
      .filter((r) => !r.fork && !r.archived)
      .map((r) => ({
        name: r.name,
        description: r.description || 'Projeto em desenvolvimento no laboratório.',
        tags: [r.language, ...(r.topics || [])].filter(Boolean).slice(0, 4),
        url: r.homepage || undefined,
        repo: r.html_url,
        status: 'online' as const,
      }))
  } catch {
    return []
  }
}
