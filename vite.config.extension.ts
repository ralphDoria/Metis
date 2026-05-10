import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import manifest from './extension/manifest.json' with { type: 'json' }

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: path.join(root, 'extension'),
  plugins: [react(), crx({ manifest })],
  build: {
    outDir: path.join(root, 'dist-ext'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: path.join(root, 'extension/src/popup/index.html'),
        offscreen: path.join(root, 'extension/src/offscreen/offscreen.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@metis-core': path.join(root, 'src/components/metis-core'),
      '@metis-lib': path.join(root, 'src/lib'),
    },
  },
  server: {
    port: 5174,
  },
})
