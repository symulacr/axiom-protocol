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
