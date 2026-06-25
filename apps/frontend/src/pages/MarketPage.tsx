import { resolveBlockExplorerUrl } from "@axiom/config/networks";
import type { ReactElement } from 'react';
import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useChainId } from 'wagmi';
import { ProviderCard } from '../components/ProviderCard.js';
import { useProviders } from '../hooks/useProviders.js';
import { usePoll } from '../hooks/usePoll.js';
import { usePolledApi } from '../hooks/usePolledApi.js';
import { COLORS, Card, SectionTitle, ErrorAlert, PageHeader, Skeleton } from '../components/ui.js';
import { apiFetch } from '../utils/apiFetch.js';
import type { AxiomEvent } from '../hooks/useEventHistory.js';

/**
 * One row returned by `GET /v1/events?eventName=Transfer`. The backend
 * returns `StoredEvent`-shaped objects where transfer-specific fields are
 * nested inside a `payload` object.
 */
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

const transferRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '80px 1fr 1fr 1fr',
  gap: 10,
  padding: '10px 14px',
  border: `1px solid ${COLORS.border}`,
  borderRadius: 'var(--radius-lg)',
  fontSize: 'var(--text-xs)',
  fontFamily: "'SF Mono', 'Fira Code', monospace",
  background: COLORS.surface,
  color: COLORS.textMuted,
  transition: 'all 0.18s ease',
};

export function MarketPage(): ReactElement {
  const chainId = useChainId();
  const explorerBase = resolveBlockExplorerUrl(chainId);

  const {
    providers,
    isLoading: providersLoading,
    error: providersError,
    refetch: refetchProviders,
  } = useProviders();

  const [transfers, setTransfers] = useState<TransferEvent[]>([]);
  const [transfersError, setTransfersError] = useState<Error | null>(null);

  const fetcher = useCallback(async (signal: AbortSignal): Promise<TransferEvent[]> => {
    const body = await apiFetch<{ events: unknown[] }>(
      '/v1/events?eventName=Transfer',
      { method: 'GET', signal, timeout: 10000 },
    );
    const allEvents = Array.isArray(body.events) ? body.events : [];
    return allEvents.filter(
      (e): e is TransferEvent =>
        typeof e === 'object' &&
        e !== null &&
        (e as { eventName?: unknown }).eventName === 'Transfer',
    );
  }, []);

  const { isLoading: transfersLoading, refetch: refetchTransfers } = usePoll(
    fetcher,
    setTransfers,
    setTransfersError,
    { intervalMs: 30000 },
  );

  const tickQuery = usePolledApi<{ events: AxiomEvent[] }>("/v1/events?eventName=Tick", {
    refetchInterval: 30000,
    enabled: true,
    queryKey: ["leaderboard"],
  });

  const leaderboard = useMemo(() => {
    const raw = tickQuery.data?.events;
    if (!raw || raw.length === 0) return [];
    const byAgent = new Map<string, { buys: number; sells: number; holds: number; total: number }>();
    for (const ev of raw) {
      const tid = String((ev.payload as Record<string, unknown>)?.tokenId ?? "");
      if (!tid) continue;
      const action = String((ev.payload as Record<string, unknown>)?.action ?? "");
      const entry = byAgent.get(tid) ?? { buys: 0, sells: 0, holds: 0, total: 0 };
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
  }, [tickQuery.data]);

  return (
    <main>
      <PageHeader
        title="Market"
      />

      <SectionTitle>Compute Providers</SectionTitle>
      {providersLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Skeleton height={80} />
          <Skeleton height={80} />
        </div>
      ) : providersError !== null ? (
        <ErrorAlert message={`Couldn't load providers: ${providersError.message}`} onRetry={refetchProviders} />
      ) : providers.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 'var(--space-3xl) var(--space-xl)' }}>
          <p style={{ color: COLORS.textMuted, fontSize: 'var(--text-sm)', margin: 0, fontWeight: 'var(--fw-regular)', lineHeight: 'var(--lh-normal)' }}>
            No compute providers registered yet. Providers appear here when they register on-chain.
          </p>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
          {providers.map((p) => (
            <ProviderCard key={p.address} provider={p} />
          ))}
        </div>
      )}

      <SectionTitle style={{ marginTop: 'var(--space-2xl)' }}>Recent Transfers</SectionTitle>
      {transfersLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton height={42} />
          <Skeleton height={42} />
          <Skeleton height={42} />
        </div>
      ) : transfersError !== null ? (
        <ErrorAlert message={`Couldn't load transfers: ${transfersError.message}`} onRetry={refetchTransfers} />
      ) : transfers.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 'var(--space-3xl) var(--space-xl)' }}>
          <p style={{ color: COLORS.textMuted, fontSize: 'var(--text-sm)', margin: 0, fontWeight: 'var(--fw-regular)', lineHeight: 'var(--lh-normal)' }}>
            No recent transfers recorded. iNFT transfers will appear here as they happen on-chain.
          </p>
        </Card>
      ) : (
        <ul aria-label="Recent iNFT transfers" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          {transfers.map((tx) => (
            <li
              key={`${tx.txHash}-${tx.payload.tokenId}`}
              style={transferRowStyle}
            >
              <span style={{ color: COLORS.bronzeLight }}>#{tx.blockNumber}</span>
              <span>
                {tx.payload.from.slice(0, 6)}&hellip;{tx.payload.from.slice(-4)} →&nbsp;
                {tx.payload.to.slice(0, 6)}&hellip;{tx.payload.to.slice(-4)}
              </span>
              <span>token #{tx.payload.tokenId}</span>
              <a
                href={`${explorerBase}/tx/${tx.txHash}`}
                target="_blank"
                rel="noreferrer noopener"
                style={{ color: COLORS.bronzeLight }}
              >
                {tx.txHash.slice(0, 10)}&hellip;
              </a>
            </li>
          ))}
        </ul>
      )}

      <SectionTitle style={{ marginTop: 'var(--space-2xl)' }}>Leaderboard</SectionTitle>
      {tickQuery.isFetching && leaderboard.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton height={42} />
          <Skeleton height={42} />
        </div>
      ) : leaderboard.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 'var(--space-3xl) var(--space-xl)' }}>
          <p style={{ color: COLORS.textMuted, fontSize: 'var(--text-sm)', margin: 0, fontWeight: 'var(--fw-regular)', lineHeight: 'var(--lh-normal)' }}>
            No strategy ticks recorded yet. Run a strategy tick to appear on the leaderboard.
          </p>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          {leaderboard.map((entry, i) => (
            <Link
              key={entry.tokenId}
              to={`/agents/${entry.tokenId}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '32px 1fr 80px 80px',
                gap: 10,
                padding: '10px 14px',
                border: `1px solid ${COLORS.border}`,
                borderRadius: 'var(--radius-lg)',
                fontSize: 'var(--text-xs)',
                fontFamily: "'SF Mono', 'Fira Code', monospace",
                background: COLORS.surface,
                color: COLORS.textMuted,
                textDecoration: 'none',
                transition: 'all 0.18s ease',
              }}
            >
              <span style={{ color: i < 3 ? COLORS.bronzeLight : COLORS.textDim }}>#{i + 1}</span>
              <span style={{ color: COLORS.text }}>Agent #{entry.tokenId}</span>
              <span style={{ color: entry.score > 0 ? '#6b9e6b' : '#c85a5a' }}>{entry.score.toFixed(1)}</span>
              <span style={{ color: COLORS.textDim }}>{entry.total} ticks</span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

export default MarketPage;
