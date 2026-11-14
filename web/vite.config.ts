import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // /shared holds the frozen types and the pipeline's data.json
    alias: { '@shared': fileURLToPath(new URL('../shared', import.meta.url)) },
  },
})
