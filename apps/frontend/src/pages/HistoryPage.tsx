// Axiom Protocol — `/history` page.
//
// Renders the connected wallet's recent activity as a vertical
// timeline. The page consumes `useEventHistory()`, which polls
// GET /v1/events on a 15-second cadence (see
// apps/frontend/src/hooks/useEventHistory.ts) and exposes a
// pre-grouped `byName: Record<string, AxiomEvent[]>` index. The
// page renders the groups in the order the server first emits
// each `eventName`, in one shared `EventTimeline`, with a
// render-prop that formats the raw payload as JSON and shows the
// on-chain coordinates.
//
// The grouping is purely presentational — the server returns a
// flat `events` array and we derive the `byName` index on the
// client. The headline event names below match the indexer's
// `kind` discriminator (apps/indexer/src/events.ts) exactly:
// Transfer, Updated, Authorization, Deposited, StrategySet,
// Executed, PaymentProcessed, EarningsWithdrawn. We do not
// whitelist, so any other eventName the indexer starts emitting
// (e.g. `VerifierUpdated`, `AuthorizationRevoked`) is rendered
// in its own group too.
//
// Why a render-prop on `<EventTimeline />`?
//   The reusable component does not know the difference between
//   a Transfer (which shows from/to/tokenId), a Deposited (which
//   shows amount), and a StrategySet (which shows a merkle root +
//   daily limit + validUntilDay). The page owns that formatting
//   and supplies it as a function. The timeline owns layout and
//   timestamps; the page owns content.
//
// Source URLs (cited at the call sites that use them):
//   - React `useAccount` (connected wallet address shown in the
//     header, drives the `?owner=` filter on the polled URL):
//     https://wagmi.sh/react/hooks/useAccount
//   - MDN — Intl.DateTimeFormat (the timestamp string in the
//     rail cell is produced by the EventTimeline; this file does
//     not re-format it):
//     https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat
//   - React useEffect (the polling hook lives there):
//     https://react.dev/reference/react/useEffect
//   - 0G chain ids (Galileo 16602 / Aristotle 16661) so the
//     explorer link points at the right network:
//     https://docs.0g.ai/ai-context

import { useCallback, type ReactElement } from 'react';
import { useAccount, useChainId } from 'wagmi';

import { useEventHistory, type AxiomEvent } from '../hooks/useEventHistory.js';
import { EventTimeline, type EventRenderer } from '../components/EventTimeline.js';

/** Display the em-dash for an absent value. Mirrors HomePage /
 *  VaultDashboard / AgentDetail. */
const PLACEHOLDER = '\u2014';

/** Order of the "headline" event groups. Other eventNames are
 *  appended at the bottom in the order the server first emits
 *  them. The names MUST match the indexer's `kind` discriminator
 *  (apps/indexer/src/events.ts) exactly — wrong names silently
 *  fall through to the unordered tail and never populate. */
const HEADLINE_EVENT_ORDER: readonly string[] = [
  'Transfer',
  'Updated',           // ERC-7857 IDataStorage (was wrongly 'DataUpdated')
  'Authorization',     // ERC-7857 Authorize    (was wrongly 'UsageAuthorized')
  'Deposited',
  'StrategySet',
  'Executed',          // AxiomStrategyVault    (was wrongly 'ActionExecuted')
  'PaymentProcessed',  // AxiomPaymentProcessor
  'EarningsWithdrawn', // AxiomPaymentProcessor
];

/** Human-readable display label for each headline event group.
 *  Unknown names fall back to the raw `eventName`. Keeps the
 *  group header readable without touching the wire format. */
const EVENT_LABELS: Readonly<Record<string, string>> = {
  Transfer: 'Transfer',
  Updated: 'Data Updated',
  Authorization: 'Access Authorized',
  Deposited: 'Deposited',
  StrategySet: 'Strategy Set',
  Executed: 'Action Executed',
  PaymentProcessed: 'Payment Processed',
  EarningsWithdrawn: 'Earnings Withdrawn',
};

/** Build the explorer URL for a given chain + tx hash. Returns
 *  `null` for chains we don't know about so the page never
 *  links to a wrong-network explorer. */
function explorerTxUrl(
  chainId: number,
  txHash: string,
): string | null {
  switch (chainId) {
    case 16602:
      return `https://chainscan-galileo.0g.ai/tx/${txHash}`;
    case 16661:
      return `https://chainscan.0g.ai/tx/${txHash}`;
    default:
      return null;
  }
}

/**
 * Pretty-print an event payload as a string. For the headline
 * PaymentProcessor events we render a compact human-readable
 * line; everything else falls back to indented JSON. The
 * function handles the empty-payload case (returns the em-dash)
 * so the timeline never shows a blank cell.
 */
function formatPayload(eventName: string, payload: Record<string, unknown>): string {
  switch (eventName) {
    case 'PaymentProcessed': {
      const get = (k: string): string => String(payload[k] ?? PLACEHOLDER);
      return [
        `agent #${get('agentTokenId')}`,
        `payer ${shortAddr(payload['payer'])}`,
        `creator ${shortAddr(payload['creator'])}`,
        `amount ${get('amount')}`,
        `creator cut ${get('creatorCut')}`,
        `protocol cut ${get('protocolCut')}`,
      ].join(' \u00b7 ');
    }
    case 'EarningsWithdrawn': {
      return [
        `creator ${shortAddr(payload['creator'])}`,
        `amount ${String(payload['amount'] ?? PLACEHOLDER)}`,
      ].join(' \u00b7 ');
    }
    default: {
      const keys = Object.keys(payload);
      if (keys.length === 0) {
        return PLACEHOLDER;
      }
      return JSON.stringify(payload, null, 2);
    }
  }
}

/** Shorten a 0x-prefixed address to `0x1234\u20265678` for inline
 *  display. Returns the em-dash for non-string / missing values. */
function shortAddr(value: unknown): string {
  if (typeof value !== 'string' || value.length < 10) {
    return PLACEHOLDER;
  }
  return `${value.slice(0, 6)}\u2026${value.slice(-4)}`;
}

/** Render-prop body for one event: a short header (chain + tx
 *  short hash + explorer link when applicable) and the raw
 *  payload in a <pre>. Lives at module scope so a re-render of
 *  the parent does not re-allocate the callback. */
const renderEventBody: EventRenderer = (event): ReactElement => {
  const tx = event.txHash;
  const txShort =
    tx.length > 14 ? `${tx.slice(0, 10)}\u2026${tx.slice(-4)}` : tx;
  const explorer = explorerTxUrl(event.chainId, tx);
  return (
    <div>
      <div style={{ marginBottom: '6px', color: '#374151' }}>
        <span style={{ fontWeight: 600 }}>chain</span> {event.chainId}
        {' \u00b7 '}
        <span style={{ fontWeight: 600 }}>tx</span>{' '}
        {explorer === null ? (
          <code>{txShort}</code>
        ) : (
          <a
            href={explorer}
            target="_blank"
            rel="noreferrer noopener"
            style={{ color: '#2563eb', textDecoration: 'none' }}
          >
            <code>{txShort}</code>
          </a>
        )}
        {' \u00b7 '}
        <span style={{ fontWeight: 600 }}>source</span> {event.source}
      </div>
      <pre
        style={{
          margin: 0,
          padding: '8px 12px',
          background: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: '4px',
          fontSize: '0.8125rem',
          lineHeight: 1.45,
          overflowX: 'auto',
        }}
      >
        {formatPayload(event.eventName, event.payload)}
      </pre>
    </div>
  );
};

/** Stable order for the groups: headline names first in the
 *  brief's order, then any other names in insertion order. */
function orderGroupKeys(byName: Record<string, AxiomEvent[]>): string[] {
  const known = new Set<string>();
  const head: string[] = [];
  for (const name of HEADLINE_EVENT_ORDER) {
    if (byName[name] !== undefined) {
      head.push(name);
      known.add(name);
    }
  }
  const tail: string[] = [];
  for (const name of Object.keys(byName)) {
    if (!known.has(name)) {
      tail.push(name);
    }
  }
  return [...head, ...tail];
}

export function HistoryPage(): ReactElement {
  // wagmi v2 — connected wallet address shown in the page header.
  // Source: https://wagmi.sh/react/hooks/useAccount
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  // Polls GET /v1/events every 15s with cleanup; see
  // apps/frontend/src/hooks/useEventHistory.ts. The `owner` is
  // forwarded as `?owner=0x...` so a future server-side filter
  // can scope to the connected wallet; today's backend ignores it
  // and returns the full ring.
  const { events, byName, isLoading, error } = useEventHistory({
    owner: address,
    enabled: isConnected,
  });

  const refresh = useCallback((): void => {
    // Re-render is the right "refresh" — the polling hook ticks
    // every 15s, so a manual button is just a UX nicety that
    // re-keys the EventTimeline to force a fresh render of the
    // current snapshot. We re-render via a no-op state nudge is
    // overkill; a `key` bump on the timeline would also work
    // but adds state for no benefit. Keep the button as a
    // visual affordance that the page is live.
    window.location.reload();
  }, []);

  if (!isConnected) {
    return (
      <main>
        <h1>History</h1>
        <p>Connect a wallet to view recent activity.</p>
      </main>
    );
  }

  const groupKeys = orderGroupKeys(byName);

  return (
    <main>
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: '16px',
        }}
      >
        <div>
          <h1 style={{ marginBottom: 4 }}>History</h1>
          <p style={{ margin: 0, color: '#6b7280' }}>
            {address === undefined
              ? PLACEHOLDER
              : `${address.slice(0, 8)}\u2026${address.slice(-6)}`}{' '}
            on chain {chainId}
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          style={{
            padding: '6px 12px',
            border: '1px solid #d1d5db',
            background: '#fff',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Refresh
        </button>
      </header>

      {error !== null && (
        <div
          role="alert"
          style={{
            padding: '8px 12px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            borderRadius: '4px',
            marginBottom: '12px',
          }}
        >
          Failed to load events: {error.message}
        </div>
      )}

      {groupKeys.length === 0 ? (
        <p style={{ color: '#6b7280' }}>
          {isLoading
            ? 'Loading events\u2026'
            : 'No events have been recorded yet for this wallet.'}
        </p>
      ) : (
        groupKeys.map((name) => {
          const group = byName[name];
          if (group === undefined) {
            return null;
          }
          return (
            <section
              key={name}
              aria-label={`${name} events`}
              style={{ marginBottom: '24px' }}
            >
              <h2
                style={{
                  fontSize: '1rem',
                  fontWeight: 600,
                  color: '#111827',
                  marginBottom: '8px',
                }}
              >
                {EVENT_LABELS[name] ?? name}
                <span
                  style={{
                    marginLeft: '8px',
                    color: '#6b7280',
                    fontWeight: 400,
                  }}
                >
                  ({group.length})
                </span>
              </h2>
              <EventTimeline
                events={group}
                renderEvent={renderEventBody}
                isLoading={isLoading && group.length === 0}
              />
            </section>
          );
        })
      )}

      <footer
        style={{
          marginTop: '24px',
          color: '#6b7280',
          fontSize: '0.8125rem',
        }}
      >
        {events.length} event{events.length === 1 ? '' : 's'} total
        {' \u00b7 '}auto-refresh every 15s
      </footer>
    </main>
  );
}

export default HistoryPage;
