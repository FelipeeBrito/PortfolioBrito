/**
 * FALAS DO ASSISTENTE — edite aqui os textos do robô.
 */
export const assistant = {
  greeting: 'Olá! Sou o assistente do laboratório. Clique em mim se quiser ajuda para explorar. 🤖',
  idle: 'Precisa de ajuda? Clique em mim! 👋',
  menuIntro: 'Como posso ajudar?',
  about:
    'O Felipe trabalha com processos e qualidade e usa IA para criar soluções digitais: automações, sistemas e ferramentas. Este laboratório reúne esses experimentos.',
  contact: 'Ótimo! Deixe sua mensagem no formulário ou use um dos canais diretos. 📡',
  projectsIntro: 'Aqui estão os experimentos. Quer filtrar por tecnologia?',
  noProjects: 'Hmm, não encontrei projetos com esse filtro.',
  scanHint: 'Passe o mouse sobre um projeto e eu escaneio para você.',

  /** Passos do tour guiado: id da seção + o que o robô explica. */
  tour: [
    { id: 'topo', say: 'Bem-vindo ao laboratório do Felipe! Vou te mostrar tudo em poucos passos.' },
    { id: 'sobre', say: 'Aqui fica a ficha técnica: quem é o Felipe e o que ele faz.' },
    { id: 'projetos', say: 'Estes são os experimentos, projetos criados com IA. Passe o mouse em um e eu escaneio os detalhes.' },
    { id: 'habilidades', say: 'Os componentes instalados: as habilidades que fazem os projetos acontecerem.' },
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
