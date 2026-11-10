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
Abra http://localhost:4321/

> No Windows/PowerShell, se aparecer erro de "execução de scripts", use `npm.cmd install` e `npm.cmd run dev`.

## Onde editar
| O quê | Arquivo |
|---|---|
| Falas da IA e botões da conversa | `src/data/conversa.ts` |
| Nome, cargo, textos, e-mail, LinkedIn | `src/data/profile.ts` |
| Quantos projetos aparecem, topics e ajustes de descrição | `src/data/projects.ts` |
| Busca no GitHub e HTML do cartão de perfil e dos cards | `src/lib/github.ts` |
| Habilidades | `src/data/skills.ts` |
| Conteúdo e layout das seções | `src/pages/index.astro` |
| Navegação e transições | `src/scripts/app.ts` |
| Motor de partículas do robô | `src/scripts/holo.ts` |
| Imagem do robô (vira partículas) | `public/robot/holo.webp` |

Endereços das seções: `#projetos`, `#sobre`, `#contato`, `#tudo` (tudo sem conversa).

## Publicar
- **Netlify:** conecte o repositório; o arquivo `netlify.toml` já configura tudo (build `npm run build`, pasta `dist`).
- **GitHub Pages** (em `/PortfolioBrito`): faça o build com a variável `BASE_PATH=/PortfolioBrito`.

## Projetos e perfil (direto do GitHub)
A seção Projetos mostra a foto, o nome e a bio do perfil do GitHub e os **6 repositórios públicos
atualizados mais recentemente**. Os dados são buscados quando a página abre, então um projeto novo
aparece sem publicar o site de novo.

Controle pelas *topics* do repositório (About → engrenagem → Topics):
- `portfolio`: aparece sempre, mesmo sendo antigo (ganha o selo "Destaque");
- `ocultar`: nunca aparece.

Forks, repositórios arquivados e o repositório do perfil ficam de fora automaticamente.
