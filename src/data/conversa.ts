/**
 * O QUE A IA FALA — edite aqui os textos da conversa.
 */
export const conversa = {
  /** Primeira fala na tela inicial */
  ola: 'Olá! Eu sou a OwllSkull, a coruja deste portfólio. O que você quer conhecer?',
  /** Quando o visitante volta para a tela inicial */
  volta: 'O que mais você quer conhecer?',
  /** Botões da tela inicial */
  opcoes: [
    { id: 'projetos', label: '🧪 Projetos' },
    { id: 'sobre', label: '👤 Quem é o Felipe' },
    { id: 'contato', label: '✉ Falar com ele' },
    { id: 'tudo', label: '▶ Me mostre tudo' },
  ],
  /** Fala ao chegar em cada seção */
  secoes: {
    projetos: 'Estes são os projetos mais recentes do Felipe, direto do GitHub dele.',
    /** Completa a fala acima quando há projetos ({quando} vira "há 2 dias", "ontem"…) */
    projetosRecente: 'O último foi atualizado {quando}.',
    sobre: 'Este é o Felipe. Processos, qualidade e muita automação com inteligência artificial.',
    contato: 'Deixe uma mensagem. Eu entrego para ele.',
    /** Usada no lugar da fala acima enquanto o e-mail de profile.ts for o de exemplo */
    contatoSemEmail: 'Por enquanto, o melhor caminho para falar com ele é o GitHub.',
    tudo: 'Aqui está tudo de uma vez. Clique em mim para voltar a conversar.',
  },
  enviado: 'Mensagem pronta! Obrigado pelo contato.',
  semFiltro: 'Não encontrei projetos com esse filtro.',
}
