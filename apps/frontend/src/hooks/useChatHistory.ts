import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSignMessage } from "wagmi";
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

// /v1/chat/history needs EIP-191 wallet-proof headers (addr/ts/sig); server rejects >300s — re-sign at 240s.
const PROOF_TTL_MS = 240_000;
let proofCache = { address: "", ts: 0, sig: "0x" as `0x${string}` };

/** Proof headers for the connected wallet, or null when signing is
 * unavailable/rejected — callers degrade to empty history, never error. */
async function walletProofHeaders(
  address: string,
  signMessageAsync: (args: { message: string }) => Promise<`0x${string}`>,
): Promise<Record<string, string> | null> {
  try {
    const now = Date.now();
    if (
      proofCache.address !== address ||
      now - proofCache.ts * 1000 > PROOF_TTL_MS
    ) {
      const ts = Math.floor(now / 1000);
      const sig = await signMessageAsync({
        message: `axiom-chat-history-v1:${address}:${ts}`,
      });
      proofCache = { address, ts, sig };
    }
    return {
      "x-wallet-address": proofCache.address,
      "x-wallet-timestamp": String(proofCache.ts),
      "x-wallet-signature": proofCache.sig,
    };
  } catch {
    return null; // signing rejected/unavailable — quiet empty history
  }
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
 * (GET /v1/chat/history?wallet=, wallet-proof headers attached). The
 * consumer merges them with localStorage useThreads — dedupe by threadId,
 * server wins.
 *
 * SIGNATURE BOUNDARY: fetching requires an EIP-191 wallet proof, so the
 * query stays inert until `requested` is set by an explicit user gesture
 * (the thread rail's "Restore server history" row, or opening the rail on
 * mobile). /chat must never pop a signature on page load.
 *
 * No react-query `select`: the only consumer (ChatPage) feeds serverThreads
 * into the rail AND into openThread, which reads full `messages` to load a
 * server transcript — a metadata-only select would break thread opening. */
export function useChatHistory(
  wallet: `0x${string}` | undefined,
  requested: boolean,
): {
  serverThreads: ChatThread[];
  isLoading: boolean;
} {
  const walletKey = wallet?.toLowerCase();
  const { signMessageAsync } = useSignMessage();

  const query = useQuery({
    queryKey: ["chat-history", walletKey],
    queryFn: async () => {
      if (!walletKey) {
        return { wallet: "", count: 0, transcripts: [] };
      }
      // No proof (disconnected/rejected signature) → quiet empty history.
      const proof = await walletProofHeaders(walletKey, signMessageAsync);
      if (!proof) return { wallet: walletKey, count: 0, transcripts: [] };
      return apiFetch<ChatHistoryResponse>(
        `/v1/chat/history?wallet=${walletKey}`,
        { timeout: LONG_TIMEOUT, retries: 0, headers: proof },
      );
    },
    enabled: !!walletKey && requested,
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
  };
}
