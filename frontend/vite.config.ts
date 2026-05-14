import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/auth': 'http://localhost:3000',
      '/cv': 'http://localhost:3000',
      '/jobs': 'http://localhost:3000',
      '/applications': 'http://localhost:3000',
      '/documents': 'http://localhost:3000'
    }
  }
})
