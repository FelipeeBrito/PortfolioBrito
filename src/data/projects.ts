/**
 * PROJETOS — vêm direto do seu GitHub, sem precisar publicar o site de novo.
 *
 * O que aparece: os repositórios públicos atualizados mais recentemente
 * (quantidade em `recentes`) + os que tiverem a topic de destaque.
 * Nunca aparecem: forks, arquivados, o repositório do perfil e os que tiverem a topic de ocultar.
 *
 * Para controlar pelo GitHub: abra o repositório → "About" (engrenagem) → "Topics".
 */
export const githubConfig = {
  /** Quantos projetos recentes mostrar */
  recentes: 6,
  /** Topic que faz um repositório aparecer sempre, mesmo sendo antigo */
  topicDestaque: 'portfolio',
  /** Topic que esconde um repositório do site */
  topicOcultar: 'ocultar',
  /** Até quantos dias depois da última atualização o projeto ganha o selo "Novo" */
  diasNovo: 7,
}

export interface Project {
  name: string
  description: string
  tags: string[]
  /** Site do projeto (campo "Website" do repositório) */
  url?: string
  repo: string
  language?: string
  updatedAt: string
  stars: number
  /** Tem a topic de destaque */
  destaque: boolean
}

/**
 * Ajustes opcionais por repositório (use o nome exato do repositório).
 * Serve para trocar a descrição, as tags ou o link sem mexer no GitHub.
 */
export const ajustes: Record<string, Partial<Pick<Project, 'description' | 'tags' | 'url'>>> = {
  PortfolioBrito: {
    description: 'Este portfólio: uma coruja-robô 3D que conversa com o visitante e monta cada seção com partículas.',
    tags: ['Astro', 'Three.js', 'IA'],
  },
}
