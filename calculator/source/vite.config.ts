import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5183 },
  build: {
    // Сборка рассчитана на открытие двойным кликом (file://):
    // относительные пути и классический скрипт вместо ES-модуля, потому что
    // модули браузер по file:// не грузит из-за CORS.
    assetsDir: 'assets',
    target: 'es2019',
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
  base: './',
});
