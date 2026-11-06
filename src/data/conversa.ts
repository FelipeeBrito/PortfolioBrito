/**
 * O QUE A IA FALA — edite aqui os textos da conversa.
 */
export const conversa = {
  /** Primeira fala na tela inicial */
  ola: 'Olá. Eu sou a IA deste portfólio. O que você quer conhecer?',
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
    projetos: 'Estes são os projetos que o Felipe criou com IA. Passe o mouse num deles que eu te conto os detalhes.',
    sobre: 'Este é o Felipe. Processos, qualidade e muita automação com inteligência artificial.',
    contato: 'Deixe uma mensagem. Eu entrego para ele.',
    tudo: 'Aqui está tudo de uma vez. Clique em mim para voltar a conversar.',
  },
  enviado: 'Mensagem pronta! Obrigado pelo contato.',
  semFiltro: 'Não encontrei projetos com esse filtro.',
}
