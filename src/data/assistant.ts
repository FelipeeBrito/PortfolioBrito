/**
 * FALAS DO ASSISTENTE — edite aqui os textos do robô.
 */
export const assistant = {
  /** O que o robô diz ao abrir cada página. */
  pages: {
    inicio: { title: 'Olá! 👋', say: 'Eu sou seu guia neste portfólio. Clique em mim ou em "Vamos lá?" para navegar.' },
    projetos: { title: '🚀 Meus projetos', say: 'Passe o mouse sobre um projeto e eu apresento os detalhes. Quer filtrar por tecnologia?' },
    sobre: { title: 'Sobre o Felipe', say: 'Aqui você conhece o Felipe e as habilidades dele.' },
    contato: { title: 'Contato', say: 'Deixe sua mensagem no formulário. Eu entrego para ele! ✉️' },
  },
  idle: 'Precisa de ajuda? Clique em mim! 👋',
  menuIntro: 'Para onde vamos?',
  noProjects: 'Hmm, não encontrei projetos com esse filtro.',

  /** Passos do tour guiado (passa por todas as páginas). */
  tour: [
    { page: 'inicio', say: 'Bem-vindo! Vou te mostrar o portfólio do Felipe em poucos passos.' },
    { page: 'sobre', say: 'Aqui você conhece o Felipe e as habilidades que fazem os projetos acontecerem.' },
    { page: 'projetos', say: 'Estes são os projetos criados com IA. Passe o mouse em um e eu apresento os detalhes.' },
    { page: 'contato', say: 'E aqui você fala com ele. Fim do tour, obrigado pela visita! 🎉' },
  ],

  jokes: [
    'Por que o programador usa óculos? Porque ele não consegue C#!',
    'Existem 10 tipos de pessoas: as que entendem binário e as que não.',
    'Meu código funciona e eu não sei por quê. Não mexa!',
    'Um robô entra num bar... e pede um byte.',
    'Eu não tenho bugs, tenho funcionalidades surpresa.',
  ],
} as const
