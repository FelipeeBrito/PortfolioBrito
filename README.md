# PortfolioBrito 🤖

Portfólio em que uma **IA feita de partículas** conversa com o visitante. Ao escolher uma opção,
o robô holograma se desfaz, as partículas formam a seção escolhida e depois voltam a ser o
robô, pequeno no canto.

## Tecnologias
- [Astro](https://astro.build) + TypeScript (site estático)
- Canvas 2D para as partículas (sem bibliotecas 3D)
- Tailwind CSS

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
| Falas da IA e botões da conversa | `src/data/conversa.ts` |
| Nome, cargo, textos, e-mail, LinkedIn | `src/data/profile.ts` |
| Projetos em destaque (os repositórios do GitHub entram sozinhos) | `src/data/projects.ts` |
| Habilidades | `src/data/skills.ts` |
| Conteúdo e layout das seções | `src/pages/index.astro` |
| Navegação e transições | `src/scripts/app.ts` |
| Motor de partículas do robô | `src/scripts/holo.ts` |
| Imagem do robô (vira partículas) | `public/robot/holo.webp` |

Endereços das seções: `#projetos`, `#sobre`, `#contato`, `#tudo` (tudo sem conversa).
