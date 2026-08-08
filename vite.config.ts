import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:8080'

// Display version: release builds get LIBRARIUM_VERSION injected by CI (e.g.
// "26.8.1"). Anything else is a local build and says so.
//
// The release scheme has exactly three shapes and all three describe something
// published: 26.8.1, 26.8.1-rc.1, 26.8.1-nightly.202608080642. A build from
// someone's laptop is none of them, so it claims no version rather than
// inventing a YY.M string for a release that does not exist. Mirrors
// internal/version in the Go repos.
function computeVersion(): string {
  const injected = process.env.LIBRARIUM_VERSION?.trim()
  if (injected) return injected
  return '0.0.0-dev'
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
        // AI calls (suggest-arcs / suggest-metadata / cleanup) can run 60+
        // seconds on complex prompts; the default http-proxy timeout was
        // killing those requests with 502 even though the upstream eventually
        // returned 201. Allow up to 5 minutes per request.
        timeout: 5 * 60 * 1000,
        proxyTimeout: 5 * 60 * 1000,
      },
      '/health': {
        target: apiTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
