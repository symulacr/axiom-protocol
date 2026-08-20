import { useMemo, useState, type ReactElement } from "react";
import { useThreads, type ChatThread } from "../hooks/useThreads.js";
import type { Copy } from "../lib/copy.js";

interface ChatHistorySectionProps {
  activeThreadId: string | null;
  onOpen: (t: ChatThread) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  /** Server-persisted transcripts (useChatHistory); merged with localStorage
   *  threads — dedupe by threadId, server takes precedence (newer-wins on a
   *  tie is server; local only wins when it is strictly newer, i.e. the user
   *  continued the thread after the last persist). */
  serverThreads?: ChatThread[];
  serverLoading?: boolean;
  /** When true, render the "Restore server history" row: the explicit
   *  gesture that authorizes the one wallet signature the history fetch
   *  needs. Hidden once requested (or when no wallet is connected). */
  serverRestore?: boolean;
  onRequestServerHistory?: () => void;
  /** Localized rail labels (C-11 — the rail was English-only in fr/de). */
  copy: Copy["chat"];
}

/** Thread list rendered inside the shell sidebar on chat routes (the merged,
 *  ChatGPT-style sidebar). Owns the search affordance; the active row carries
 *  aria-current so screen readers hear the selection. Delete is delegated to
 *  the page so the undo toast and active-thread switch stay in one place. */
export function ChatHistorySection({
  activeThreadId,
  onOpen,
  onNew,
  onDelete,
  serverThreads = [],
  serverLoading = false,
  serverRestore = false,
  onRequestServerHistory,
  copy,
}: ChatHistorySectionProps): ReactElement {
  const localThreads = useThreads();
  const [search, setSearch] = useState("");

  const threads = useMemo(() => {
    const seen = new Set<string>();
    const merged: ChatThread[] = [];
    // server transcripts first (they are the persisted, cross-device source)
    for (const t of serverThreads) {
      seen.add(t.id);
      merged.push(t);
    }
    for (const t of localThreads) {
      if (!seen.has(t.id)) {
        merged.push(t);
        continue;
      }
      // id collision: server wins unless the local copy is strictly newer
      const existing = merged.find((m) => m.id === t.id);
      if (existing && t.updatedAt > existing.updatedAt) {
        merged[merged.indexOf(existing)] = t;
      }
    }
    return merged;
  }, [localThreads, serverThreads]);

  const filtered = threads.filter(
    (t) => !search || t.title.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="chat-history">
      <div className="chat-history__head">
        <h2 className="chat-history__title">{copy.historyTitle}</h2>
        <button
          type="button"
          className="chat-history__new"
          onClick={onNew}
          data-axiom-btn=""
        >
          {copy.historyNew}
        </button>
      </div>
      <input
        aria-label={copy.historySearch}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={copy.historySearch}
        className="chat-history__search"
      />
      <div className="chat-history__list" aria-live="polite">
        {filtered.length === 0 ? (
          <p className="chat-history__empty">
            {search ? copy.historyNoMatch : copy.historyEmpty}
          </p>
        ) : (
          filtered.map((t) => (
            <div
              key={t.id}
              className={`chat-history__item${t.id === activeThreadId ? " is-active" : ""}`}
              style={{ display: "flex", alignItems: "center" }}
            >
              <button
                type="button"
                className="chat-history__open"
                onClick={() => onOpen(t)}
                title={t.title}
                aria-current={t.id === activeThreadId ? "true" : undefined}
              >
                {t.title}
                {/^0x[0-9a-fA-F]{40}$/.test(t.id) ? (
                  <span className="chat-history__badge">0G</span>
                ) : null}
              </button>
              <button
                type="button"
                className="chat-history__delete"
                aria-label={copy.historyDelete(t.title)}
                onClick={() => onDelete(t.id)}
              >
                ✕
              </button>
            </div>
          ))
        )}
        {serverLoading && (
          <p className="chat-history__empty">{copy.historyLoading}</p>
        )}
        {serverRestore && !serverLoading ? (
          <button
            type="button"
            className="chat-history__restore"
            onClick={onRequestServerHistory}
            title={copy.historyRestoreHint}
          >
            {copy.historyRestore}
          </button>
        ) : null}
      </div>
    </div>
  );
}
