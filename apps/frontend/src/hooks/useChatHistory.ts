import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, LONG_TIMEOUT } from "../utils/apiFetch.js";
import type { ChatThread } from "./useThreads.js";

interface ServerTranscript {
  threadId?: string;
  wallet?: string;
  messages?: unknown[];
  msgCount?: number;
  ts?: number;
}

interface ChatHistoryResponse {
  wallet: string;
  count: number;
  transcripts: ServerTranscript[];
}

function transcriptTitle(messages: unknown[] | undefined): string {
  const first = (messages ?? []).find(
    (m) =>
      !!m &&
      typeof m === "object" &&
      (m as { role?: string }).role === "user" &&
      (m as { content?: string }).content,
  ) as { content?: string } | undefined;
  const t = (first?.content ?? "Server transcript").trim().replace(/\s+/g, " ");
  return t.length > 42 ? `${t.slice(0, 42)}…` : t || "Server transcript";
}

/** Server-persisted chat transcripts for the connected wallet
 *  (GET /v1/chat/history?wallet=, client-allowlisted). The consumer merges
 *  them with localStorage useThreads — dedupe by threadId, server wins. */
export function useChatHistory(wallet: `0x${string}` | undefined): {
  serverThreads: ChatThread[];
  isLoading: boolean;
  error: Error | null;
} {
  const walletKey = wallet?.toLowerCase();

  const query = useQuery({
    queryKey: ["chat-history", walletKey],
    queryFn: async () => {
      const res = await apiFetch<ChatHistoryResponse>(
        `/v1/chat/history?wallet=${walletKey}`,
        { timeout: LONG_TIMEOUT, retries: 0 },
      );
      return res;
    },
    enabled: !!walletKey,
    staleTime: 30_000,
    retry: 1,
  });

  const serverThreads = useMemo<ChatThread[]>(() => {
    const transcripts = query.data?.transcripts ?? [];
    return transcripts.map((t, i) => {
      const messages = Array.isArray(t.messages) ? t.messages : [];
      return {
        id: t.threadId ?? `server:${t.wallet ?? i}`,
        title: transcriptTitle(messages),
        updatedAt: t.ts ?? 0,
        messages,
      } as ChatThread;
    });
  }, [query.data]);

  return {
    serverThreads,
    isLoading: query.isFetching,
    error: query.error,
  };
}
