# PortfolioBrito 🤖

Portfólio apresentado pela **Owll**, uma coruja-robô 3D que conversa com o visitante: segue o mouse,
pisca, fala e voa para o canto quando uma seção abre. Nas transições, partículas saem dela, formam o
título e os cards da seção e voltam.

## Tecnologias
- [Astro](https://astro.build) + TypeScript (site estático)
- Three.js para a coruja 3D e Canvas 2D para as partículas
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
| Coruja 3D (esqueleto, olhos, movimentos) | `src/scripts/owl.ts` |
| Partículas das transições | `src/scripts/particles.ts` |
| Modelo 3D da coruja (e imagem reserva) | `public/owl/owl.glb`, `public/owl/owl.png` |

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
