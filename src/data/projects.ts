/**
 * Projetos em destaque. Os repositórios públicos do GitHub também são
 * carregados automaticamente na hora do build (ver src/lib/github.ts).
 * Projetos listados aqui aparecem primeiro.
 */
export interface Project {
  name: string
  description: string
  tags: string[]
  url?: string
  repo?: string
  status?: 'online' | 'em teste' | 'em construção'
}

export const featured: Project[] = [
  {
    name: 'PortfolioBrito',
    description: 'Este site: um laboratório de robótica interativo, com um assistente holográfico de partículas que reage ao visitante.',
    tags: ['Astro', 'React', 'Canvas'],
    repo: 'https://github.com/FelipeeBrito/PortfolioBrito',
    status: 'online',
  },
]
