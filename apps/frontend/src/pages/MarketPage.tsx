import { resolveBlockExplorerUrl } from "@axiom/config/networks";
import type { ReactElement } from "react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount, useChainId } from "wagmi";
import { ProviderCard } from "../components/ProviderCard.js";
import { useProviders } from "../hooks/useProviders.js";
import { usePolledApi } from "../hooks/usePolledApi.js";
import {
  COLORS,
  Card,
  SectionTitle,
  ErrorAlert,
  PageHeader,
  Skeleton,
  Button,
} from "../components/ui.js";
import type { AxiomEvent } from "../hooks/useEventHistory.js";
import { useEventStream } from "../hooks/useEventStream.js";
import { eventDedupeKey } from "../hooks/useEventHistory.js";
import { humanizeError } from "../utils/format.js";

type TransferEvent = {
  source: string;
  blockNumber: number;
  txHash: string;
  eventName: string;
  payload: {
    from: `0x${string}`;
    to: `0x${string}`;
    tokenId: string;
  };
};

export function MarketPage({
  showLeaderboard = true,
}: {
  showLeaderboard?: boolean;
}): ReactElement {
  const chainId = useChainId();
  const { isConnected: walletConnected } = useAccount();
  const explorerBase = resolveBlockExplorerUrl(chainId);

  const {
    providers,
    isLoading: providersLoading,
    error: providersError,
    refetch: refetchProviders,
  } = useProviders();

  const [showAllTransfers, setShowAllTransfers] = useState(false);

  const transfersQuery = usePolledApi<{ events: TransferEvent[] }>(
    "/v1/events?eventName=Transfer",
    {
      refetchInterval: 30000,
      enabled: walletConnected,
      queryKey: ["transfers"],
    },
  );

  const rawTransfers = transfersQuery.data?.events;
  const transfers = useMemo(() => {
    if (!rawTransfers) return [];
    return rawTransfers.filter(
      (e): e is TransferEvent =>
        typeof e === "object" && e !== null && e.eventName === "Transfer",
    );
  }, [rawTransfers]);

  const transfersLoading = transfersQuery.isLoading;
  const transfersError = transfersQuery.error;
  const refetchTransfers = transfersQuery.refetch;

  const tickQuery = usePolledApi<{ events: AxiomEvent[] }>(
    "/v1/events?eventName=Tick",
    {
      refetchInterval: 30000,
      enabled: walletConnected && showLeaderboard,
      queryKey: ["leaderboard"],
    },
  );

  const { events: liveEvents, isConnected } = useEventStream({
    topics: ["transfer", "tick.*"],
    enabled: walletConnected,
  });

  const liveTransfers = useMemo<TransferEvent[]>(() => {
    return liveEvents
      .filter((ev) => ev.eventName.toLowerCase() === "transfer")
      .map((ev) => {
        const p = ev.payload as Record<string, unknown>;
        return {
          source: ev.source,
          blockNumber: ev.blockNumber,
          txHash: ev.txHash,
          eventName: "Transfer",
          payload: {
            from: String(p.from ?? "") as `0x${string}`,
            to: String(p.to ?? "") as `0x${string}`,
            tokenId: String(p.tokenId ?? ""),
          },
        } satisfies TransferEvent;
      });
  }, [liveEvents]);

  const mergedTransfers = useMemo<TransferEvent[]>(() => {
    const seen = new Set(transfers.map((t) => t.txHash));
    return [...liveTransfers.filter((t) => !seen.has(t.txHash)), ...transfers];
  }, [transfers, liveTransfers]);

  const mergedTicks = useMemo<AxiomEvent[]>(() => {
    const base = tickQuery.data?.events ?? [];
    const seen = new Set(base.map(eventDedupeKey));
    const liveTicks = liveEvents.filter((ev) =>
      ev.eventName.toLowerCase().startsWith("tick"),
    );
    return [...base, ...liveTicks.filter((ev) => !seen.has(eventDedupeKey(ev)))];
  }, [tickQuery.data, liveEvents]);

  const leaderboard = useMemo(() => {
    const raw = mergedTicks;
    if (!raw || raw.length === 0) return [];
    const byAgent = new Map<
      string,
      { buys: number; sells: number; holds: number; total: number }
    >();
    for (const ev of raw) {
      const tid = String(
        (ev.payload as Record<string, unknown>)?.tokenId ?? "",
      );
      if (!tid) continue;
      const action = String(
        (ev.payload as Record<string, unknown>)?.action ?? "",
      );
      const entry = byAgent.get(tid) ?? {
        buys: 0,
        sells: 0,
        holds: 0,
        total: 0,
      };
      if (action === "buy") entry.buys++;
      else if (action === "sell") entry.sells++;
      else entry.holds++;
      entry.total++;
      byAgent.set(tid, entry);
    }
    return [...byAgent.entries()]
      .map(([tid, s]) => ({
        tokenId: tid,
        ...s,
        score: s.buys * 2 + s.sells * 1.5 - s.holds * 0.5,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }, [mergedTicks]);

  const liveTxHashes = useMemo(
    () => new Set(liveTransfers.map((t) => t.txHash)),
    [liveTransfers],
  );
  const liveTickTokens = useMemo(
    () =>
      new Set(
        liveEvents
          .filter((ev) => ev.eventName.toLowerCase().startsWith("tick"))
          .map((ev) => String((ev.payload as Record<string, unknown>).tokenId ?? "")),
      ),
    [liveEvents],
  );

  return (
    <div>
      <PageHeader title="Market" />

      <SectionTitle>Compute Providers ({providers.length})</SectionTitle>
      {providers.length > 0 && (
        <p
          style={{
            color: COLORS.textMuted,
            fontSize: "var(--text-sm)",
            margin: "0 0 var(--space-lg)",
            lineHeight: "var(--lh-normal)",
          }}
        >
          Decentralized GPU providers for AI inference on 0G Compute
        </p>
      )}
      {providersLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Skeleton height={80} />
          <Skeleton height={80} />
        </div>
      ) : providersError !== null ? (
        <ErrorAlert
          message={`Couldn't load providers: ${humanizeError(providersError)}`}
          onRetry={refetchProviders}
        />
      ) : providers.length === 0 ? (
        <Card
          style={{
            textAlign: "center",
            padding: "var(--space-3xl) var(--space-xl)",
          }}
        >
          <p
            style={{
              color: COLORS.textMuted,
              fontSize: "var(--text-sm)",
              margin: 0,
              fontWeight: "var(--fw-regular)",
              lineHeight: "var(--lh-normal)",
            }}
          >
            No compute providers registered yet. Providers appear here when they
            register on-chain.
          </p>
        </Card>
      ) : (
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-md)" }}
        >
          {providers.map((p) => (
            <ProviderCard key={p.address} provider={p} />
          ))}
        </div>
      )}

      <SectionTitle style={{ marginTop: "var(--space-2xl)" }}>
        Recent Transfers{" "}
        <span
          className="live-pill"
          data-live={isConnected ? "true" : "false"}
          style={{ marginLeft: "var(--space-sm)" }}
        >
          {isConnected ? "LIVE" : "OFFLINE"}
        </span>
      </SectionTitle>
      {transfersLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Skeleton height={42} />
          <Skeleton height={42} />
          <Skeleton height={42} />
        </div>
      ) : transfersError !== null ? (
        <ErrorAlert
          message={`Couldn't load transfers: ${humanizeError(transfersError)}`}
          onRetry={refetchTransfers}
        />
      ) : mergedTransfers.length === 0 ? (
        <Card
          style={{
            textAlign: "center",
            padding: "var(--space-3xl) var(--space-xl)",
          }}
        >
          <p
            style={{
              color: COLORS.textMuted,
              fontSize: "var(--text-sm)",
              margin: 0,
              fontWeight: "var(--fw-regular)",
              lineHeight: "var(--lh-normal)",
            }}
          >
            No recent transfers recorded. iNFT transfers will appear here as
            they happen on-chain.
          </p>
        </Card>
      ) : (
        <>
          <ul
            aria-label="Recent iNFT transfers"
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-sm)",
            }}
          >
            {(showAllTransfers
              ? mergedTransfers
              : mergedTransfers.slice(0, 20)
            ).map((tx, i) => (
              <li
                key={`${tx.txHash}-${tx.payload.tokenId}`}
                className="fade-enter"
                style={{
                  listStyle: "none",
                  animationDelay: `${Math.min(i, 10) * 40}ms`,
                }}
              >
                  <Card
                    hover
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(min(100%, 200px), 1fr))",
                      gap: 10,
                      padding: "10px 14px",
                      fontSize: "var(--text-xs)",
                      fontFamily: "var(--font-mono)",
                      color: COLORS.textMuted,
                    }}
                  >
                    <span style={{ color: COLORS.bronzeLight }}>
                      #{tx.blockNumber}
                    </span>
                    <span>
                      {tx.payload.from.slice(0, 6)}&hellip;
                      {tx.payload.from.slice(-4)} →&nbsp;
                      {tx.payload.to.slice(0, 6)}&hellip;
                      {tx.payload.to.slice(-4)}
                    </span>
                    <span>token #{tx.payload.tokenId}</span>
                    <a
                      href={`${explorerBase}/tx/${tx.txHash}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      style={{ color: COLORS.teal }}
                    >
                      {tx.txHash.slice(0, 10)}&hellip;
                    </a>
                  </Card>
                </li>
              ),
            )}
          </ul>
          {mergedTransfers.length > 20 && !showAllTransfers && (
            <div style={{ textAlign: "center", marginTop: "var(--space-sm)" }}>
              <Button variant="teal" onClick={() => setShowAllTransfers(true)}>
                Show more ({mergedTransfers.length} total)
              </Button>
            </div>
          )}
        </>
      )}

      {showLeaderboard && (
        <>
          <SectionTitle style={{ marginTop: "var(--space-2xl)" }}>
            Leaderboard{" "}
        <span
          className="live-pill"
          data-live={isConnected ? "true" : "false"}
          style={{ marginLeft: "var(--space-sm)" }}
        >
          {isConnected ? "LIVE" : "OFFLINE"}
        </span>
      </SectionTitle>
      {tickQuery.isFetching && leaderboard.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Skeleton height={42} />
          <Skeleton height={42} />
        </div>
      ) : leaderboard.length === 0 ? (
        <Card
          style={{
            textAlign: "center",
            padding: "var(--space-3xl) var(--space-xl)",
          }}
        >
          <p
            style={{
              color: COLORS.textMuted,
              fontSize: "var(--text-sm)",
              margin: 0,
              fontWeight: "var(--fw-regular)",
              lineHeight: "var(--lh-normal)",
            }}
          >
            No strategy ticks recorded yet. Run a strategy tick to appear on the
            leaderboard.
          </p>
        </Card>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-sm)",
          }}
        >
          {leaderboard.map((entry, i) => (
            <Link
              key={entry.tokenId}
              to={`/agents/${entry.tokenId}`}
              style={{ textDecoration: "none" }}
            >
              <Card
                hover
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(min(100%, 180px), 1fr))",
                  gap: 10,
                  padding: "10px 14px",
                  fontSize: "var(--text-xs)",
                  fontFamily: "var(--font-mono)",
                  color: COLORS.textMuted,
                  animation: "axiom-fade-in 200ms var(--ease-out)",
                  animationDelay: `${Math.min(i, 10) * 40}ms`,
                }}
              >
                <span
                  style={{ color: i < 3 ? COLORS.bronzeLight : COLORS.textDim }}
                >
                  #{i + 1}
                </span>
                <span style={{ color: COLORS.text }}>
                  Agent #{entry.tokenId}
                </span>
                <span
                  style={{
                    color: entry.score > 0 ? COLORS.success : COLORS.danger,
                  }}
                >
                  {entry.score.toFixed(1)}{" "}
                  <span style={{ fontSize: "var(--text-xs)", opacity: 0.8 }}>
                    {entry.score > 5
                      ? "High"
                      : entry.score > 0
                        ? "Medium"
                        : "Low"}
                  </span>
                </span>
                <span style={{ color: COLORS.textDim }}>
                  <span style={{ color: COLORS.success }}>▲{entry.buys}</span>{" "}
                  <span style={{ color: COLORS.teal }}>▼{entry.sells}</span>{" "}
                  <span style={{ color: COLORS.textDim }}>•{entry.holds}</span>
                </span>
                <span style={{ color: COLORS.textDim }}>
                  {entry.total} ticks
                </span>
              </Card>
            </Link>
          ))}
        </div>
      )}
      </>)}
    </div>
  );
}

export default MarketPage;
