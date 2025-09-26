import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite config for GitHub Pages deployment under /powerbi-quiz-app/
export default defineConfig({
  plugins: [react()],
  base: '/powerbi-quiz-app/',
})
