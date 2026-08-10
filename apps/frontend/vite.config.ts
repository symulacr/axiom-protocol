import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  // Single source of truth: the root /home/eya/og/.env holds every VITE_*
  // var (deployed addresses, API key, URLs). Read it from there instead of
  // the stale apps/frontend/.env (which had pre-July-22 testnet addresses).
  envDir: resolve(import.meta.dirname, "../.."),
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
      output: {
        // Function form so subpath modules are pinned by path, not just
        // package entry points. The eager entry imports @axiom/config (zod
        // schemas) and config/wagmi.ts (viem chains); if those modules ride
        // the rainbowkit chunk, Rollup marks the whole large rainbowkit chunk
        // as a static import of the entry and it lands in the initial
        // critical path instead of loading lazily with the wallet
        // provider/ConnectButton.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@rainbow-me/rainbowkit") && id.includes(".css")) {
            // main.tsx imports the stylesheet statically; keep it out of the
            // rainbowkit JS chunk or that chunk becomes eager.
            return "rainbowkit-css";
          }
          if (id.includes("@rainbow-me/rainbowkit")) return "rainbowkit";
          if (id.includes("/zod/")) return "zod";
          if (
            id.includes("/react-router") ||
            id.includes("/react-dom/") ||
            id.includes("/react/")
          ) {
            return "vendor";
          }
          // wagmi core + the viem/ox modules the eager wagmi config pulls in
          // (createConfig/http/zeroGMainnet). Only the entry + chains are
          // pinned; the rest of viem is left to Rollup's default algorithm so
          // the wallet-connectivity libs keep their own shared chunks instead
          // of merging into rainbowkit.
          if (
            id.includes("/wagmi/dist/") ||
            id.includes("/viem/_esm/chains") ||
            id.includes("/viem/_esm/index.js") ||
            id.includes("/ox/_esm/")
          ) {
            return "wagmi";
          }
          return undefined;
        },
      },
    },
  },
});
