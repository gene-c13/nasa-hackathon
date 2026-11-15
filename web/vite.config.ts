import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { askEndpoint } from './vite-plugin-ask.ts'

export default defineConfig({
  plugins: [react(), tailwindcss(), askEndpoint()],
  resolve: {
    alias: {
      '@shared': path.resolve(import.meta.dirname, '../shared'),
      // Only api/canned.ts is imported by the browser: the pinned demo questions.
      '@api': path.resolve(import.meta.dirname, '../api'),
    },
  },
})
