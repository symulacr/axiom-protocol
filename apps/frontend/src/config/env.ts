/**
 * Typed Vite environment variable accessor.
 *
 * Vite replaces `import.meta.env.VITE_*` at build time with string literals
 * (or `undefined` when not set). This module provides a single validated
 * access point with defaults, replacing ad-hoc `??` fallback patterns across
 * the frontend.
 *
 * Source: https://vitejs.dev/guide/env-and-mode.html
 */
export function getViteEnv(): {
  VITE_BACKEND_URL: string;
  VITE_WALLETCONNECT_PROJECT_ID: string;
  VITE_OG_RPC_URL: string | undefined;
} {
  const VITE_BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:3000";
  if (typeof VITE_BACKEND_URL !== "string" || !VITE_BACKEND_URL.startsWith("http")) {
    console.warn("[env] VITE_BACKEND_URL missing or invalid, using default");
  }

  const VITE_WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "";
  if (!VITE_WALLETCONNECT_PROJECT_ID) {
    console.warn("[env] VITE_WALLETCONNECT_PROJECT_ID not set – WalletConnect may fail");
  }

  const VITE_OG_RPC_URL = import.meta.env.VITE_OG_RPC_URL || undefined;

  return { VITE_BACKEND_URL, VITE_WALLETCONNECT_PROJECT_ID, VITE_OG_RPC_URL };
}
