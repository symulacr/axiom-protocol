// HistoryPage — connected wallet activity timeline.

import { useCallback, type ReactElement } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { useEventHistory, type AxiomEvent } from '../hooks/useEventHistory.js';
import { EventTimeline, type EventRenderer } from '../components/EventTimeline.js';
import { COLORS, Card, Alert, PageHeader, Button } from '../components/ui.js';
import { PLACEHOLDER } from '../utils/format.js';

/** Order of headline event groups. Unknown names fall through to an
 *  unordered tail. Must match the indexer's `kind` discriminator
 *  (apps/indexer/src/events.ts) exactly. */
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

/** Human-readable display label for each headline event group. */
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

/** Explorer URL for chain + tx hash. Returns `null` for unknown chains. */
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
 * Pretty-print event payload. PaymentProcessor events get a compact line;
 * everything else falls back to indented JSON.
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

/** Shorten 0x-prefixed address for inline display. */
function shortAddr(value: unknown): string {
  if (typeof value !== 'string' || value.length < 10) {
    return PLACEHOLDER;
  }
  return `${value.slice(0, 6)}\u2026${value.slice(-4)}`;
}

/**
 * Render-prop body for one event: header (chain + tx + explorer link) + payload.
 * Defined at module scope so parent re-renders don't re-allocate it.
 */
const renderEventBody: EventRenderer = (event): ReactElement => {
  const tx = event.txHash;
  const txShort =
    tx.length > 14 ? `${tx.slice(0, 10)}\u2026${tx.slice(-4)}` : tx;
  const explorer = explorerTxUrl(event.chainId, tx);
  return (
    <div>
      <div style={{ marginBottom: '6px', color: COLORS.textPrimary }}>
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
            style={{ color: COLORS.bronzeLight, textDecoration: 'none' }}
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
          background: COLORS.bg,
          border: `1px solid ${COLORS.border}`,
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
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  // Polls GET /v1/events every 15s via useEventHistory.
  const { events, byName, isLoading, error } = useEventHistory({
    owner: address,
    enabled: isConnected,
  });

  const refresh = useCallback((): void => {
    // Manual refresh — polling ticks every 15s, so this is a UX nicety.
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
      <PageHeader
        title="History"
        subtitle={`${address === undefined ? PLACEHOLDER : `${address.slice(0, 8)}\u2026${address.slice(-6)}`} on chain ${chainId}`}
        action={
          <Button variant="secondary" onClick={refresh}>
            Refresh
          </Button>
        }
      />

      {error !== null && (
        <Alert variant="error" style={{ marginBottom: 'var(--space-xl)' }}>
          Couldn't load events: {error.message}
        </Alert>
      )}

      {groupKeys.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 'var(--space-3xl) var(--space-xl)' }}>
          <p style={{ color: COLORS.textMuted, fontSize: 'var(--text-sm)', margin: 0, fontWeight: 'var(--fw-regular)', lineHeight: 'var(--lh-normal)' }}>
            {isLoading
              ? 'Loading events…'
              : 'No events recorded yet for this wallet. Activity will appear here as agents are minted, transferred, and executed.'}
          </p>
        </Card>
      ) : (
        groupKeys.map((name) => {
          const group = byName[name];
          if (group === undefined) return null;
          return (
            <section
              key={name}
              aria-label={`${name} events`}
              style={{ marginBottom: 'var(--space-2xl)' }}
            >
              <h2
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 'var(--fw-semibold)',
                  color: COLORS.textDim,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: 'var(--space-md)',
                }}
              >
                {EVENT_LABELS[name] ?? name}
                <span style={{ marginLeft: 'var(--space-sm)', color: COLORS.textDim, fontWeight: 'var(--fw-regular)' }}>
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

      <footer style={{ marginTop: 'var(--space-2xl)', color: COLORS.textDim, fontSize: 'var(--text-sm)' }}>
        {events.length} event{events.length === 1 ? '' : 's'} total
        {' · '}auto-refresh every 15s
      </footer>
    </main>
  );
}

export default HistoryPage;
