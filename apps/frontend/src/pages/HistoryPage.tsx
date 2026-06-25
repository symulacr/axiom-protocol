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
      <div className="text-primary" style={{ marginBottom: '6px' }}>
        <span className="fw-semibold">chain</span> {event.chainId}
        {' \u00b7 '}
        <span className="fw-semibold">tx</span>{' '}
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
        <span className="fw-semibold">source</span> {event.source}
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
        <span className="text-muted">{PLACEHOLDER}</span>
      ) : (
        <dl className="m-0 text-xs text-muted">
          {keys.map((key) => {
            const val = payload[key];
            return (
              <div key={key} className="flex" style={{ gap: 8, marginBottom: 2 }}>
                <dt className="fw-semibold" style={{ minWidth: 100 }}>{key}</dt>
                <dd className="m-0" style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
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
      <p className="m-0 mb-md">
        <Link to="/" className="text-dim text-sm" style={{ textDecoration: 'none' }}>
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

      <label htmlFor="event-filter" className="text-muted text-sm" style={{ marginRight: 8 }}>Event Type</label>
      <select
        id="event-filter"
        value={eventFilter}
        onChange={e => setEventFilter(e.target.value)}
        className="radius-md w-full"
        style={{ padding: '8px 12px', marginBottom: 16,
          border: `1px solid ${COLORS.border}`, background: COLORS.surface,
          color: COLORS.text, boxSizing: 'border-box' }}
      >
        <option value="">All events</option>
        {eventNames.map(name => (
          <option key={name} value={name}>{EVENT_LABELS[name] ?? name}</option>
        ))}
      </select>

      {groupKeys.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 'var(--space-3xl) var(--space-xl)' }}>
          <p className="text-muted text-sm m-0 fw-regular">
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
              className="mb-2xl"
            >
              <h2
                className="text-xs fw-semibold text-dim"
                style={{
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: 'var(--space-md)',
                }}
              >
                {EVENT_LABELS[name] ?? name}
                <span className="text-dim fw-regular" style={{ marginLeft: 'var(--space-sm)' }}>
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

      <footer className="mt-2xl text-dim text-sm">
        {allEvents.length} event{allEvents.length === 1 ? '' : 's'} total
      </footer>
      </ConnectedGuard>
    </main>
  );
}

export default HistoryPage;
