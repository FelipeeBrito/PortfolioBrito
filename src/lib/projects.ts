import { featured, type Project } from '../data/projects'
import { profile } from '../data/profile'
import { fetchRepos } from './github'

/** Projetos: destaques manuais + repositórios públicos do GitHub (sem repetir). */
export async function loadProjects(): Promise<Project[]> {
  const repos = await fetchRepos(profile.github)
  const seen = new Set(featured.map((p) => p.name.toLowerCase()))
  const byName = new Map(repos.map((r) => [r.name.toLowerCase(), r]))
  return [
    ...featured.map((p) => {
      const r = byName.get(p.name.toLowerCase())
      return r ? { ...p, language: r.language, updatedAt: r.updatedAt, stars: r.stars } : p
    }),
    ...repos.filter((r) => !seen.has(r.name.toLowerCase())),
  ]
}

/** Miniatura automática do GitHub (imagem de prévia do repositório). */
export const thumb = (p: Project) =>
  p.repo?.includes('github.com/') ? `https://opengraph.githubassets.com/1/${p.repo.split('github.com/')[1]}` : null
