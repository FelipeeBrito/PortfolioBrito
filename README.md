# PortfolioBrito 🤖

Portfólio em formato de **laboratório de robótica**, com um assistente robô que reage ao visitante.
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

> No Windows/PowerShell, se aparecer erro de "execução de scripts", use `npm.cmd install` e `npm.cmd run dev`.

## Onde editar
| O quê | Arquivo |
|---|---|
| Nome, cargo, textos, e-mail, LinkedIn | `src/data/profile.ts` |
| Projetos em destaque | `src/data/projects.ts` (os repositórios públicos do GitHub entram sozinhos) |
| Habilidades | `src/data/skills.ts` |
| Comportamento e falas do robô | `src/components/Robot.tsx` |
| Imagens do robô | `public/robot/*.webp` |

## Como o robô reage
| Ação do visitante | Pose |
|---|---|
| Chega no site / fica parado | acenando |
| Rola até Sobre ou Projetos | lendo |
| Passa o mouse num projeto ou habilidade | ideia |
| Clica em botão ou link | legal |
| Clica no robô | rindo (conta uma piada) |
| Mexe o mouse muito rápido | surpreso |

Para ligar o robô a qualquer elemento, use atributos no HTML:
`data-robot-hover="ideia"`, `data-robot-click="legal"`, `data-robot-section="lendo"` e `data-say="texto da fala"`.
