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
  /** Preenchidos automaticamente pelo GitHub (usados no escaneamento do robô) */
  language?: string
  updatedAt?: string
  stars?: number
}

export const featured: Project[] = [
  {
    name: 'PortfolioBrito',
    description: 'Este portfólio: uma IA feita de partículas que conversa com o visitante e monta cada seção.',
    tags: ['Astro', 'Canvas', 'IA'],
    repo: 'https://github.com/FelipeeBrito/PortfolioBrito',
    status: 'online',
  },
]
