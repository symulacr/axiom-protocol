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

function loadThreads(): ChatThread[] {
  try {
    const raw = localStorage.getItem(CHAT_THREADS_KEY);
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
      .slice(0, MAX_THREADS);
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

let cache: ChatThread[] = loadThreads();
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function getThreads(): ChatThread[] {
  return cache;
}

export function upsertThread(thread: ChatThread): void {
  const others = cache.filter((t) => t.id !== thread.id);
  cache = [thread, ...others].slice(0, MAX_THREADS);
  saveThreads(cache);
  emit();
}

export function deleteThread(id: string): ChatThread | undefined {
  const removed = cache.find((t) => t.id === id);
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
