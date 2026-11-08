# Protótipo da coruja 3D (em andamento)

- `owl.glb`: modelo gerado no Hunyuan3D a partir de `referencia-coruja.png`, otimizado (37 MB → 0,8 MB, 80 mil triângulos).
- `owl2.js`: carrega o modelo, cria um esqueleto com pesos suaves (cabeça e asas, sem rasgos)
  e desenha os olhos digitais no visor (olhar, piscar, feliz, falar).
- `owl2.html`: página de teste (precisa do bundle: `npx esbuild owl2.js --bundle --format=esm --outfile=owl2b.js`).

Próximo passo: integrar a coruja no portfólio no lugar do robô de partículas
(seguir o mouse, conversar, versão pequena no canto).
