import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.CAMWALL_API || 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  // Electron loads the build from file://, so assets must be relative.
  base: './',
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/media': { target: API, changeOrigin: true },
      '/ws': { target: API, ws: true },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
