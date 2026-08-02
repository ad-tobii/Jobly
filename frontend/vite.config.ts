import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // No dev proxy: the API client and the SSE hook both talk to VITE_API_URL
  // directly (see src/api/client.js). A proxy here would also shadow the
  // client-side routes — /jobs, /cvs and /applications are real app routes,
  // so proxying those prefixes made a hard refresh on them hit the backend
  // instead of loading the SPA.
})
