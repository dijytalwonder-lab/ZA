import { defineConfig } from 'vite';

// Relative base so the bundle also works from the Android WebView (Capacitor).
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 4000,
    target: 'es2019'
  }
});
