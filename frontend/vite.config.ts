import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4401,
    proxy: {
      '/api': {
        target: 'http://localhost:4400',
        changeOrigin: true,
      },
      '/assets': {
        target: 'http://localhost:4400',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../src/public/app',
    emptyOutDir: true,
    copyPublicDir: true,
  },
});
