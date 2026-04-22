import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:8080'

// Display version: release builds get LIBRARIUM_VERSION injected by CI (e.g. "26.4.1").
// Local/dev builds auto-compute "{YY}.{M}.DEV" from today's date so an uninjected build
// is visibly distinguishable from a release. Matches the api repo's version.go logic.
function computeVersion(): string {
  const injected = process.env.LIBRARIUM_VERSION?.trim()
  if (injected) return injected
  const now = new Date()
  const yy = now.getUTCFullYear() % 100
  const m = now.getUTCMonth() + 1
  return `${yy}.${m}.DEV`
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(computeVersion()),
  },
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
      },
      '/health': {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
