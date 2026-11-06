// @ts-check
import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'

// site/base: endereço final no GitHub Pages (https://felipeebrito.github.io/PortfolioBrito)
export default defineConfig({
  site: 'https://felipeebrito.github.io',
  base: '/PortfolioBrito',
  vite: { plugins: [tailwindcss()] },
})
