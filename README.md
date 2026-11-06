# PortfolioBrito 🤖

Portfólio em formato de **laboratório de robótica**, com um **robô guia** que apresenta o portfólio (menu, tour, escaneamento dos projetos) e um fundo de "tecido de luz" feito de partículas.
Aqui ficam publicados os projetos criados com IA (Claude).

## Tecnologias
- [Astro](https://astro.build) + TypeScript — site estático e rápido
- React + [Motion](https://motion.dev) — o robô interativo
- Tailwind CSS — visual

## Rodar no computador
```bash
npm install
npm run dev
```
Abra http://localhost:4321/PortfolioBrito/

## Páginas
| Página | Arquivo |
|---|---|
| Início (apresentação + robô) | `src/pages/index.astro` |
| Projetos | `src/pages/projetos/index.astro` |
| Sobre + Skills | `src/pages/sobre/index.astro` |
| Contato | `src/pages/contato/index.astro` |
| Menu, rodapé e robô (todas as páginas) | `src/layouts/Base.astro` |

> No Windows/PowerShell, se aparecer erro de "execução de scripts", use `npm.cmd install` e `npm.cmd run dev`.

## Onde editar
| O quê | Arquivo |
|---|---|
| Nome, cargo, textos, e-mail, LinkedIn | `src/data/profile.ts` |
| Projetos em destaque | `src/data/projects.ts` (os repositórios públicos do GitHub entram sozinhos) |
| Habilidades | `src/data/skills.ts` |
| Falas do robô (menu, tour, piadas) | `src/data/assistant.ts` |
| Comportamento do robô | `src/components/Robot.tsx` |
| Fundo de partículas do topo | `src/components/WovenField.tsx` |
| Imagens do robô | `public/robot/*.webp` |

## Como o robô reage
| Ação do visitante | Pose |
|---|---|
| Chega no site / fica parado | acenando |
| Clica no robô ou em "Vamos lá?" | apontando (abre o menu) |
| Passa o mouse num projeto | apresentando (escaneia e mostra dados do GitHub) |
| Filtro sem resultados | sentado |
| Envia o formulário de contato | envelope |

Para ligar o robô a qualquer elemento, use atributos no HTML:
`data-robot-hover="ideia"`, `data-robot-click="legal"`, `data-robot-section="lendo"` e `data-say="texto da fala"`.
