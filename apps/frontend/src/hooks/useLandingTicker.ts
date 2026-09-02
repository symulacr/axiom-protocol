import { useMemo } from "react";
import { usePolledApi } from "./usePolledApi.js";

export interface TickerItem {
  dot: "default" | "warning";
  agent: string;
  action: string;
  ago: string;
}

/** Event shape returned by /v1/events. Mirrors the backend's
 * `AxiomEvent` envelope; we only narrow the fields we read. */
interface LandingEvent {
  eventName?: string;
  timestamp?: number;
  receivedAt?: number;
  payload?: Record<string, unknown>;
}

interface EventsResponse {
  events: LandingEvent[];
}

/** Warning-dot events: protocol pauses + signer / treasury cancellations. */
const WARNING_EVENT_NAMES = new Set<string>([
  "Paused",
  "Unpaused",
  "SignerProposalCancelled",
  "ProtocolTreasuryProposalCancelled",
]);

/** Maximum number of ticker rows we render. The hook returns at most this
 * many LIVE items; the LandingPage pads with copy placeholders to fill
 * the slot if fewer live items are available. */
export const TICKER_MAX_ITEMS = 3;

const POLL_INTERVAL_MS = 8_000;

/** Wave 5: events without a readable agent id are skipped entirely —
 *  rendering "agent #?" was placeholder junk on the flagship page
 *  (audit MASTER-SUMMARY §3.11 / 2026-09-02 re-audit). Returns null when
 *  the payload carries no tokenId. */
function readTokenId(
  payload: Record<string, unknown> | undefined,
): string | null {
  if (!payload) return null;
  const candidate = payload.tokenId ?? payload.agentTokenId ?? payload._tokenId;
  if (candidate === undefined || candidate === null) return null;
  // tokenId is typically a bigint-coerced string; trim any leading zeros
  // so "00007" becomes "7".
  const raw = String(candidate).replace(/^0+(?=\d)/, "");
  return raw === "" ? null : raw;
}

function formatAgo(deltaMs: number, locale: string): string {
  const seconds = Math.max(0, Math.floor(deltaMs / 1000));
  if (locale === "fr") {
    if (seconds < 60) return `il y a ${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `il y a ${minutes}m`;
  }
  if (locale === "de") {
    if (seconds < 60) return `vor ${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    return `vor ${minutes}m`;
  }
  // default: English
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

function eventTimestamp(ev: LandingEvent): number {
  if (typeof ev.timestamp === "number" && ev.timestamp > 0) {
    return ev.timestamp;
  }
  if (typeof ev.receivedAt === "number" && ev.receivedAt > 0) {
    return ev.receivedAt;
  }
  return 0;
}

/**
 * Polls /v1/events?limit=10 every 8s and maps the most recent events to
 * localized ticker rows. Designed for the signed-out Landing page:
 * does NOT filter by owner (the endpoint returns global events when no
 * owner query param is set). Falls back to an empty list on error or
 * while the first fetch is pending — the LandingPage pads the remaining
 * slots with copy placeholders so the rail is always populated.
 */
export function useLandingTicker(
  actionLabels: Readonly<Record<string, string>>,
  locale: string,
): TickerItem[] {
  const { data, isError } = usePolledApi<EventsResponse>(
    "/v1/events?limit=10",
    { refetchInterval: POLL_INTERVAL_MS, queryKey: ["landing-ticker"] },
  );

  return useMemo<TickerItem[]>(() => {
    if (isError || !data?.events) return [];
    const now = Date.now();
    const items: TickerItem[] = [];
    for (const ev of data.events) {
      if (items.length >= TICKER_MAX_ITEMS) break;
      const ts = eventTimestamp(ev);
      if (ts <= 0) continue;
      const tokenId = readTokenId(ev.payload);
      // No agent id → not honestly attributable → not shown (Wave 5).
      if (tokenId === null) continue;
      const eventName =
        typeof ev.eventName === "string" ? ev.eventName : "Unknown";
      const action =
        actionLabels[eventName] ?? actionLabels.Unknown ?? "tx mined";
      items.push({
        dot: WARNING_EVENT_NAMES.has(eventName) ? "warning" : "default",
        agent: `agent #${tokenId}`,
        action,
        ago: formatAgo(now - ts, locale),
      });
    }
    return items;
  }, [data, isError, actionLabels, locale]);
}
