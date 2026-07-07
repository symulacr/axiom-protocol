export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ?? "http://127.0.0.1:3000";

/** Dev-only backend API key — do not set in production builds. */
export const API_KEY = import.meta.env.VITE_API_KEY ?? "";

export const ORACLE_URL =
  import.meta.env.VITE_ORACLE_URL ?? "http://127.0.0.1:3001";

export const CHAT_MODEL =
  import.meta.env.VITE_CHAT_MODEL ?? "qwen/qwen2.5-omni-7b";
