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

/**
 * Writes the built version where a running tab can read it.
 *
 * An open tab has no way to tell that the files behind it were replaced, and
 * index.html is the wrong thing to ask: it is the file browsers cache hardest.
 * One tiny JSON, fetched with no-store, is what src/lib/appVersion.ts compares
 * against. Emitted rather than kept in public/, because the version only exists
 * at build time.
 */
function versionFile(version: string) {
  return {
    name: 'librarium-version-file',
    generateBundle(this: { emitFile: (f: { type: 'asset'; fileName: string; source: string }) => void }) {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version }) + '\n' })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), versionFile(computeVersion())],
  define: {
    __APP_VERSION__: JSON.stringify(computeVersion()),
  },
  // The camera scanner imports zxing lazily, so vite only discovers it when
  // someone opens the scanner. A dependency found that late gets re-bundled
  // mid-session, and until the page reloads its import fails with a 504 and
  // the camera won't start. Bundle it up front instead.
  optimizeDeps: {
    include: ['zxing-wasm/reader'],
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
