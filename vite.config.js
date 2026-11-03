import { defineConfig } from 'vite';

// Vite root is ./client. The production build goes to ./dist and is served by server/index.js.
// In `npm run dev` the Node server (port 3000) handles /ws and /healthz, Vite (5173) serves the client with HMR.
export default defineConfig({
  root: 'client',
  publicDir: 'public',
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 1500, target: 'es2020' },
  server: {
    port: 5173,
    host: true,
    fs: { allow: ['..'] }, // allow importing ../shared
    proxy: {
      '/ws': { target: 'ws://localhost:3000', ws: true },
      '/healthz': 'http://localhost:3000',
    },
  },
});
