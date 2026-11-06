/**
 * FALAS DO ASSISTENTE — edite aqui os textos do robô.
 */
export const assistant = {
  greeting: 'Olá! 👋 Eu sou seu guia neste portfólio. Clique em mim para navegar.',
  idle: 'Precisa de ajuda? Clique em mim! 👋',
  menuIntro: 'Para onde vamos?',
  about:
    'O Felipe trabalha com processos e qualidade e usa IA para criar soluções digitais: automações, sistemas e ferramentas. Este portfólio reúne esses projetos.',
  contact: 'Deixe sua mensagem no formulário. Eu entrego para ele! ✉️',
  projectsIntro: 'Aqui estão os projetos. Quer filtrar por tecnologia?',
  noProjects: 'Hmm, não encontrei projetos com esse filtro.',
  sent: 'Mensagem enviada! Obrigado pelo contato.',

  /** Passos do tour guiado: id da seção + o que o robô explica. */
  tour: [
    { id: 'topo', say: 'Bem-vindo! Vou te mostrar o portfólio do Felipe em poucos passos.' },
    { id: 'sobre', say: 'Aqui você conhece o Felipe e o que ele faz.' },
    { id: 'projetos', say: 'Estes são os projetos criados com IA. Passe o mouse em um e eu apresento os detalhes.' },
    { id: 'habilidades', say: 'As habilidades que fazem os projetos acontecerem.' },
    { id: 'contato', say: 'E aqui você fala com ele. Fim do tour, obrigado pela visita! 🎉' },
  ],

  jokes: [
    'Por que o programador usa óculos? Porque ele não consegue C#!',
    'Existem 10 tipos de pessoas: as que entendem binário e as que não.',
    'Meu código funciona e eu não sei por quê. Não mexa!',
    'Um robô entra num bar... e pede um byte.',
    'Eu não tenho bugs, tenho funcionalidades surpresa.',
  ],
}
