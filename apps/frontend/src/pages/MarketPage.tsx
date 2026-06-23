// Axiom Protocol — `/market` page.
//
// Real-time market dashboard: compute providers (polled every 30 s via
// `useProviders`) and recent transfers (one-shot fetch on mount).

import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { ProviderCard } from '../components/ProviderCard';
import { useProviders } from '../hooks/useProviders';
import { COLORS, Card, SectionTitle, Alert, PageHeader, Skeleton } from '../components/ui.js';

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ?? 'http://127.0.0.1:3000';

/**
 * One row returned by `GET /v1/events?eventName=Transfer`. The backend
 * (see `apps/backend/src/server.ts`) normalizes ERC-721 Transfer events
 * into this flat shape; the exact field names match the chain event ABI
 * (lowercased keys, hex addresses, bigint-serialised block numbers).
 */
type TransferEvent = {
  blockNumber: string;
  transactionHash: `0x${string}`;
  from: `0x${string}`;
  to: `0x${string}`;
  tokenId: string;
};

const transferRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '80px 1fr 1fr 1fr',
  gap: 10,
  padding: '10px 14px',
  border: `1px solid ${COLORS.border}`,
  borderRadius: 8,
  fontSize: 12,
  fontFamily: "'SF Mono', 'Fira Code', monospace",
  background: COLORS.surface,
  color: COLORS.textMuted,
  transition: 'all 0.18s ease',
};

export function MarketPage(): ReactElement {
  const {
    providers,
    isLoading: providersLoading,
    error: providersError,
  } = useProviders();

  const [transfers, setTransfers] = useState<TransferEvent[]>([]);
  const [transfersLoading, setTransfersLoading] = useState<boolean>(true);
  const [transfersError, setTransfersError] = useState<Error | null>(null);

  // Recent transfers — one-shot fetch on mount; cleanup just flips a
  // `cancelled` flag so we don't `setState` after unmount.
  // Source: https://react.dev/reference/react/useEffect#cleanup
  useEffect(() => {
    let cancelled = false;

    const load = async (): Promise<void> => {
      try {
        const res = await fetch(
          `${BACKEND_URL}/v1/events?eventName=Transfer`,
          {
            method: 'GET',
            headers: { accept: 'application/json' },
          },
        );
        if (!res.ok) {
          const text = await res.text();
          throw new Error(
            `transfers fetch failed: ${res.status} ${res.statusText} ${text}`,
          );
        }
        const body = (await res.json()) as { events: unknown[] };
        const allEvents = Array.isArray(body.events) ? body.events : [];
        const data = allEvents.filter(
          (e): e is TransferEvent =>
            typeof e === 'object' &&
            e !== null &&
            (e as { eventName?: unknown }).eventName === 'Transfer',
        );
        if (cancelled) return;
        setTransfers(data);
        setTransfersError(null);
      } catch (err) {
        if (cancelled) return;
        setTransfersError(
          err instanceof Error ? err : new Error(String(err)),
        );
      } finally {
        if (!cancelled) {
          setTransfersLoading(false);
        }
      }
    };

    void load();

    return (): void => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <PageHeader
        title="Market"
        subtitle="Compute providers and recent iNFT transfers — refreshes every 30 seconds"
      />

      <SectionTitle>Compute Providers</SectionTitle>
      {providersLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Skeleton height={80} />
          <Skeleton height={80} />
        </div>
      ) : providersError !== null ? (
        <Alert variant="error">
          Couldn't load providers: {providersError.message}
        </Alert>
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
        <Alert variant="error">
          Couldn't load transfers: {transfersError.message}
        </Alert>
      ) : transfers.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 'var(--space-3xl) var(--space-xl)' }}>
          <p style={{ color: COLORS.textMuted, fontSize: 'var(--text-sm)', margin: 0, fontWeight: 'var(--fw-regular)', lineHeight: 'var(--lh-normal)' }}>
            No recent transfers recorded. iNFT transfers will appear here as they happen on-chain.
          </p>
        </Card>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          {transfers.map((tx) => (
            <li
              key={`${tx.transactionHash}-${tx.tokenId}`}
              style={transferRowStyle}
            >
              <span style={{ color: COLORS.bronzeLight }}>#{tx.blockNumber}</span>
              <span>
                {tx.from.slice(0, 6)}&hellip;{tx.from.slice(-4)} →&nbsp;
                {tx.to.slice(0, 6)}&hellip;{tx.to.slice(-4)}
              </span>
              <span>token #{tx.tokenId}</span>
              <a
                href={`https://chainscan-galileo.0g.ai/tx/${tx.transactionHash}`}
                target="_blank"
                rel="noreferrer noopener"
                style={{ color: COLORS.bronzeLight }}
              >
                {tx.transactionHash.slice(0, 10)}&hellip;
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export default MarketPage;
