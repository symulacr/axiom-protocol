import { resolveChatModel } from "@axiom/config/models";

export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ?? "http://127.0.0.1:3000";

export const API_KEY = import.meta.env.VITE_API_KEY ?? "";

export const ORACLE_URL =
  import.meta.env.VITE_ORACLE_URL ?? "http://127.0.0.1:3001";

export const CHAT_MODEL = resolveChatModel(import.meta.env.VITE_CHAT_MODEL);
