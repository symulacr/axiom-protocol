import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    cors: true,
    // Mirror apps/frontend/server.mjs: route same-origin /api and /oracle
    // to the local backend (=:3000) and oracle (=:8787) so `vite dev`
    // works with the relative BACKEND_URL="/api" / ORACLE_URL="/oracle"
    // defaults and never needs hardcoded localhost URLs.
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
        ws: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
      "/oracle": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
        ws: true,
        rewrite: (p) => p.replace(/^\/oracle/, ""),
      },
    },
  },
  build: {
    rollupOptions: {
      external: ["node:crypto", "node:fs", "node:path"],
      output: {
        manualChunks: {
          wagmi: ["wagmi", "viem"],
          rainbowkit: ["@rainbow-me/rainbowkit"],
          vendor: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
});
