import { useSyncExternalStore } from "react";

/** Chat thread persistence — single source of truth shared by the shell sidebar and ChatPage. */
const CHAT_THREADS_KEY = "axiom:chat-threads";
const MAX_THREADS = 40;

export interface ChatThread {
  id: string;
  title: string;
  messages: unknown[];
  updatedAt: number;
}

/** Parses the persisted list; `metaOnly` drops message arrays so boot
 * hydration retains ids/titles/updatedAt without transcript payloads. */
function parseThreads(raw: string | null, metaOnly: boolean): ChatThread[] {
  try {
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (t): t is ChatThread =>
          !!t &&
          typeof (t as ChatThread).id === "string" &&
          typeof (t as ChatThread).title === "string" &&
          Array.isArray((t as ChatThread).messages),
      )
      .slice(0, MAX_THREADS)
      .map((t) => (metaOnly ? { ...t, messages: [] } : t));
  } catch {
    return [];
  }
}

function saveThreads(threads: ChatThread[]): void {
  try {
    localStorage.setItem(
      CHAT_THREADS_KEY,
      JSON.stringify(threads.slice(0, MAX_THREADS)),
    );
  } catch {
    void 0;
  }
}

// Boot keeps only thread metadata (~40 ids/titles); the full message arrays
// (~2 MB) are parsed lazily on first read/mutation — all consumers mount on
// chat routes, so pages off /chat retain no transcripts.
let cache: ChatThread[] = parseThreads(
  localStorage.getItem(CHAT_THREADS_KEY),
  true,
);
let hydrated = false;

function ensureHydrated(): ChatThread[] {
  if (!hydrated) {
    hydrated = true;
    cache = parseThreads(localStorage.getItem(CHAT_THREADS_KEY), false);
  }
  return cache;
}

const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function getThreads(): ChatThread[] {
  return ensureHydrated();
}

export function upsertThread(thread: ChatThread): void {
  const others = ensureHydrated().filter((t) => t.id !== thread.id);
  cache = [thread, ...others].slice(0, MAX_THREADS);
  saveThreads(cache);
  emit();
}

export function deleteThread(id: string): ChatThread | undefined {
  const removed = ensureHydrated().find((t) => t.id === id);
  cache = cache.filter((t) => t.id !== id);
  saveThreads(cache);
  emit();
  return removed;
}

export function useThreads(): ChatThread[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getThreads,
    getThreads,
  );
}
