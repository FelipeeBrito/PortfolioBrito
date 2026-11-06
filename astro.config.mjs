// @ts-check
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import tailwindcss from '@tailwindcss/vite'

// site/base: endereço final no GitHub Pages (https://felipeebrito.github.io/PortfolioBrito)
export default defineConfig({
  site: 'https://felipeebrito.github.io',
  base: '/PortfolioBrito',
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
})
