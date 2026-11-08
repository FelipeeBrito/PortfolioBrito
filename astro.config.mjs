// @ts-check
import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'

// Por padrão o site fica na raiz do domínio (Netlify, Vercel...).
// Para publicar no GitHub Pages em /PortfolioBrito, rode o build com BASE_PATH=/PortfolioBrito
export default defineConfig({
  site: process.env.SITE_URL || undefined,
  base: process.env.BASE_PATH || '/',
  vite: { plugins: [tailwindcss()] },
})
