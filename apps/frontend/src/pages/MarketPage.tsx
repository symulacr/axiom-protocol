// Axiom Protocol — `/market` page.
//
// Real-time market dashboard with two sections:
//
//   1. "Available Compute Providers" — fetched from
//      `GET /v1/compute/providers` on mount and then polled every 30 s.
//      Rendered as a list of `ProviderCard` components (one per provider).
//   2. "Recent Transfers" — fetched from
//      `GET /v1/events?eventName=Transfer` on mount (no polling — the
//      chain event log is append-only and re-fetching the latest 25 is
//      a cheap way to surface new activity without a WebSocket).
//
// The page is intentionally read-only — it does not write to the chain
// or to the backend. State is local to the component; the polling effect
// owns its own `setInterval` and cleans it up on unmount.
//
// The provider section delegates the polling to `useProviders`; the
// transfer section uses a small in-place `useEffect` because we only
// fetch once (the assignment does not require transfer polling).
//
// Canonical references:
//  - MDN — Fetch API (Request, Response, JSON body, error handling):
//    https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch
//  - React — useEffect (run after commit, cleanup runs before next effect
//    and on unmount):
//    https://react.dev/reference/react/useEffect
//  - React — useState (typed state for the transfer log + UI flags):
//    https://react.dev/reference/react/useState
//  - React Router v6+ — nested route mount + `useNavigate` import path:
//    https://reactrouter.com/en/main/routers/create-browser-router

import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';

import { ProviderCard } from '../components/ProviderCard';
import { useProviders } from '../hooks/useProviders';

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

const sectionHeaderStyle: React.CSSProperties = {
  marginTop: 24,
  marginBottom: 8,
  fontSize: 18,
  fontWeight: 600,
};

const gridStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
};

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const transferRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '90px 1fr 1fr 1fr',
  gap: 8,
  padding: '6px 8px',
  border: '1px solid #e5e7eb',
  borderRadius: 4,
  fontSize: 12,
  fontFamily: 'monospace',
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
        const data = (await res.json()) as TransferEvent[];
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
      <h1>Market</h1>
      <p style={{ color: '#4b5563' }}>
        Real-time view of the Axiom compute marketplace and recent
        iNFT transfer activity. Provider data refreshes every 30&nbsp;seconds.
      </p>

      <h2 style={sectionHeaderStyle}>Available Compute Providers</h2>
      {providersLoading ? (
        <p>Loading providers&hellip;</p>
      ) : providersError !== null ? (
        <p style={{ color: '#b91c1c' }}>
          Failed to load providers: {providersError.message}
        </p>
      ) : providers.length === 0 ? (
        <p>No providers registered yet.</p>
      ) : (
        <div style={gridStyle}>
          {providers.map((p) => (
            <ProviderCard key={p.address} provider={p} />
          ))}
        </div>
      )}

      <h2 style={sectionHeaderStyle}>Recent Transfers</h2>
      {transfersLoading ? (
        <p>Loading transfers&hellip;</p>
      ) : transfersError !== null ? (
        <p style={{ color: '#b91c1c' }}>
          Failed to load transfers: {transfersError.message}
        </p>
      ) : transfers.length === 0 ? (
        <p>No recent transfers.</p>
      ) : (
        <ul style={listStyle}>
          {transfers.map((tx) => (
            <li
              key={`${tx.transactionHash}-${tx.tokenId}`}
              style={transferRowStyle}
            >
              <span>#{tx.blockNumber}</span>
              <span>
                {tx.from.slice(0, 6)}&hellip;{tx.from.slice(-4)} →&nbsp;
                {tx.to.slice(0, 6)}&hellip;{tx.to.slice(-4)}
              </span>
              <span>token #{tx.tokenId}</span>
              <a
                href={`https://chainscan-galileo.0g.ai/tx/${tx.transactionHash}`}
                target="_blank"
                rel="noreferrer noopener"
                style={{ color: '#1d4ed8' }}
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
