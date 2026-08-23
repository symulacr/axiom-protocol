import { useMemo } from "react";
import { useEventStream } from "./useEventStream.js";
import { eventTokenId } from "./useEventHistory.js";

/** On-chain events the chat surface surfaces as "⛓ tx mined" confirmations.
 * Mirrors the indexer's watched topics (apps/backend/src/indexer/events.ts)
 * minus pure-admin/governance noise the chat user did not trigger. */
const CHAT_TX_EVENT_NAMES: Record<string, true> = {
  Transfer: true, // mint + iTransferFrom
  Authorization: true,
  AuthorizationRevoked: true,
  DelegateAccess: true,
  Cloned: true,
  Deposited: true,
  Withdrawn: true,
  StrategySet: true,
  Executed: true,
  PaymentProcessed: true,
  ComputeProviderPaid: true,
  EarningsWithdrawn: true,
  RoyaltySet: true,
};

export interface ChatTxRow {
  id: string;
  eventName: string;
  txHash?: string;
  blockNumber?: number;
  tokenId?: string;
}

const MAX_ROWS = 40;

/** Live WS subscription (reuses the /v1/stream client-key auth + useEventStream
 * reconnect/backoff) filtered to on-chain confirmations, deduped by txHash. */
export function useChatTxStream(enabled = true): {
  rows: ChatTxRow[];
  isConnected: boolean;
} {
  const { events, isConnected } = useEventStream({
    topics: ["*"],
    enabled,
  });

  const rows = useMemo(() => {
    const seen = new Set<string>();
    const out: ChatTxRow[] = [];
    for (const ev of events) {
      if (CHAT_TX_EVENT_NAMES[ev.eventName] !== true) continue;
      const txHash = ev.txHash || ev.transactionHash || ev.payload?.txHash;
      if (!txHash) continue;
      if (seen.has(txHash)) continue;
      seen.add(txHash);
      out.push({
        id: `${txHash}:${ev.logIndex ?? 0}`,
        eventName: ev.eventName,
        txHash: String(txHash),
        blockNumber: ev.blockNumber,
        tokenId: eventTokenId(ev) ?? undefined,
      });
    }
    return out.slice(0, MAX_ROWS);
  }, [events]);

  return { rows, isConnected };
}
