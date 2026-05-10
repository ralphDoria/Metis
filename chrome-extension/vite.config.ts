import { defineConfig } from 'vite'
import { crx } from '@crxjs/vite-plugin'
import { resolve } from 'node:path'
import manifest from './manifest.json' with { type: 'json' }

// Bundles the extension into ./dist using @crxjs/vite-plugin.
// Manifest is the source of truth for entry points; crxjs walks it
// and emits each script with the right format for MV3.
//
// Offscreen documents are loaded at runtime via chrome.offscreen.createDocument,
// so crxjs can't discover them through the manifest. Register the HTML as a
// rollup input below so its <script> is bundled too.
export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        offscreen: resolve(__dirname, 'src/offscreen.html'),
      },
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    hmr: { port: 5174 },
  },
})
