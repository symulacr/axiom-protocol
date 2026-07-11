export const DEFAULT_CHAT_MODEL = "qwen/qwen2.5-omni-7b";

export function resolveChatModel(override?: string): string {
  return override?.trim() || DEFAULT_CHAT_MODEL;
}

export const FALLBACK_CONTEXT_WINDOWS: Record<string, number> = {
  "qwen/qwen2.5-omni-7b": 32768,
};

export function resolveContextWindow(
  model: string,
  live?: Record<string, number>,
): number {
  const id = model.trim().toLowerCase();
  if (live) {
    const hit = Object.keys(live).find((k) => k.toLowerCase() === id);
    if (hit) return live[hit]!;
  }
  const fb = Object.keys(FALLBACK_CONTEXT_WINDOWS).find(
    (k) => k.toLowerCase() === id,
  );
  return fb ? FALLBACK_CONTEXT_WINDOWS[fb]! : 32768;
}
