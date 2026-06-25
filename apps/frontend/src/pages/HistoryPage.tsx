import { resolveBlockExplorerUrl } from "@axiom/config/networks";
import { useCallback, useMemo, useRef, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { useAccount, useChainId } from 'wagmi';
import { useEventHistory, type AxiomEvent } from '../hooks/useEventHistory.js';
import { useEventStream } from '../hooks/useEventStream.js';
import { EventTimeline, type EventRenderer } from '../components/EventTimeline.js';
import { COLORS, Card, Alert, ErrorAlert, PageHeader, Button, ConnectedGuard } from '../components/ui.js';
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
  const base = resolveBlockExplorerUrl(chainId);
  if (base === null) return null;
  return `${base}/tx/${txHash}`;
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
      return JSON.stringify(payload);
    }
  }
}

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

  const isSpecialEvent =
    event.eventName === 'PaymentProcessed' || event.eventName === 'EarningsWithdrawn';

  const payload = event.payload as Record<string, unknown>;
  const keys = Object.keys(payload);

  return (
    <div>
      <div style={{ marginBottom: '6px', color: COLORS.textPrimary }}>
        <span style={{ fontWeight: 'var(--fw-semibold)' }}>chain</span> {event.chainId}
        {' \u00b7 '}
        <span style={{ fontWeight: 'var(--fw-semibold)' }}>tx</span>{' '}
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
        <span style={{ fontWeight: 'var(--fw-semibold)' }}>source</span> {event.source}
      </div>
      {isSpecialEvent ? (
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
      ) : keys.length === 0 ? (
        <span style={{ color: COLORS.textMuted }}>{PLACEHOLDER}</span>
      ) : (
        <dl style={{ margin: 0, fontSize: 'var(--text-xs)', color: COLORS.textMuted }}>
          {keys.map((key) => {
            const val = payload[key];
            return (
              <div key={key} style={{ display: 'flex', gap: 8, marginBottom: 2 }}>
                <dt style={{ fontWeight: 'var(--fw-semibold)', minWidth: 100 }}>{key}</dt>
                <dd style={{ margin: 0, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
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
  const seenEventIdsRef = useRef(new Set<string>());

  // Polls GET /v1/events every 15s via useEventHistory.
  const { events, byName, isLoading, error, refetch } = useEventHistory({
    owner: address,
    enabled: isConnected,
  });

  // Real-time WebSocket stream for live updates, including WSS tick + data streams.
  const { events: wsEvents } = useEventStream({
    topics: [
      'Transfer', 'Updated', 'Authorization', 'Deposited',
      'StrategySet', 'Executed', 'PaymentProcessed', 'EarningsWithdrawn',
      'data.*',  // Future: arbitrary data updates
    ],
    enabled: isConnected,
  });

  // Single-pass merge with a persistent dedup set (avoids 4 allocations per tick).
  const allEvents = useMemo(() => {
    const existingIds = seenEventIdsRef.current;
    const merged: AxiomEvent[] = [];
    // Prepend WS events that aren't in the existing set
    for (const evt of wsEvents) {
      const key = `${evt.txHash}-${evt.logIndex}`;
      if (!existingIds.has(key)) {
        existingIds.add(key);
        merged.push(evt);
      }
    }
    // Append all polled events
    for (const evt of events) {
      const key = `${evt.txHash}-${evt.logIndex}`;
      if (!existingIds.has(key)) {
        existingIds.add(key);
        merged.push(evt);
      }
    }
    return merged;
  }, [events, wsEvents]);

  // Group all events by eventName for the timeline sections.
  const [eventFilter, setEventFilter] = useState<string>('');
  const eventNames = useMemo(
    () => [...new Set(allEvents.map(e => e.eventName))],
    [allEvents],
  );
  const filteredAllEvents = useMemo(
    () => (eventFilter ? allEvents.filter(e => e.eventName === eventFilter) : allEvents),
    [allEvents, eventFilter],
  );
  const allByName = useMemo(() => {
    const grouped: Record<string, AxiomEvent[]> = {};
    for (const ev of filteredAllEvents) {
      (grouped[ev.eventName] ??= []).push(ev);
    }
    return grouped;
  }, [filteredAllEvents]);

  const refresh = useCallback((): void => {
    refetch?.();
  }, [refetch]);

  const groupKeys = orderGroupKeys(allByName);

  return (
    <main>
      <p style={{ margin: 0, marginBottom: 'var(--space-md)' }}>
        <Link to="/" style={{ color: COLORS.textDim, textDecoration: 'none', fontSize: '0.875rem' }}>
          ← Back
        </Link>
      </p>
      <ConnectedGuard>
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
        <ErrorAlert message={`Couldn't load events: ${error.message}`} />
      )}

      <label htmlFor="event-filter" style={{ color: COLORS.textMuted, fontSize: 'var(--text-sm)', marginRight: 8 }}>Event Type</label>
      <select
        id="event-filter"
        value={eventFilter}
        onChange={e => setEventFilter(e.target.value)}
        style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', marginBottom: 16,
          border: `1px solid ${COLORS.border}`, background: COLORS.surface,
          color: COLORS.text, width: '100%', boxSizing: 'border-box' }}
      >
        <option value="">All events</option>
        {eventNames.map(name => (
          <option key={name} value={name}>{EVENT_LABELS[name] ?? name}</option>
        ))}
      </select>

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
          const group = allByName[name];
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
        {allEvents.length} event{allEvents.length === 1 ? '' : 's'} total
      </footer>
      </ConnectedGuard>
    </main>
  );
}

export default HistoryPage;
