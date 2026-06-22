// Vite environment variable type declarations.
// Source: https://vitejs.dev/guide/env-and-mode.html#intellisense-for-typescript

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
  readonly VITE_BACKEND_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
