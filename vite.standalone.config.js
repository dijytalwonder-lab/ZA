import { defineConfig } from 'vite';

// Standalone build: everything (fonts included) is inlined so the game can be opened
// straight from disk (file://) - no web server and no open port needed.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist-web',
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 8000,
    cssCodeSplit: false,
    target: 'es2019'
  }
});
