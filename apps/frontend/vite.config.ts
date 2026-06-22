// Axiom Protocol — Vite configuration.
//
// Source: Vite official docs (https://vitejs.dev/config/).
// React plugin: @vitejs/plugin-react (https://github.com/vitejs/vite-plugin-react).
//
// Default dev port is 5173 per Vite convention. strictPort is left false so
// that if 5173 is busy Vite picks the next free port; this matches the Vite
// docs guidance for local dev. CORS is enabled so the dApp can be loaded in
// embedded preview surfaces (WalletConnect wallet browser, Vercel preview
// iframes, etc.) without being blocked by the dev server.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    cors: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'walletconnect': ['wagmi', 'viem'],
          'rainbowkit': ['@rainbow-me/rainbowkit'],
          'vendor': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});
