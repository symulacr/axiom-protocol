// Axiom Protocol — `<EventTimeline />` reusable component.
//
// Renders a vertical timeline of `AxiomEvent[]` using a CSS Grid layout
// with a left rail (timestamp + eventName) and a render-prop for body content.
// Event-shape-agnostic — callers control the body via `renderEvent`.

import type { ReactElement, ReactNode } from 'react';
import type { AxiomEvent } from '../hooks/useEventHistory.js';

/** Render-prop signature. Receives the event and a formatted
 *  timestamp string; returns the body cell's content. */
export type EventRenderer = (
  event: AxiomEvent,
  formattedTimestamp: string,
) => ReactNode;

/** Props for `<EventTimeline />`. */
export interface EventTimelineProps {
  /** Events to render, in the order they should appear. The component
   *  does NOT sort — the caller decides. */
  events: readonly AxiomEvent[];
  /** Render-prop for the body cell of each event. */
  renderEvent: EventRenderer;
  /** Optional locale for the timestamp formatter; default `'en-US'`. */
  locale?: string;
  /** Optional ISO-3166 / IANA timezone, e.g. `'UTC'`. Default: the
   *  browser's local timezone. */
  timeZone?: string;
  /** Rendered when `events` is empty AND the caller is not
   *  loading. Default: a muted "No events yet." */
  emptyState?: ReactNode;
  /** Rendered in place of every event when the caller is still
   *  loading its first batch. The render-prop is not called. */
  loadingState?: ReactNode;
  /** Loading flag. When true, `loadingState` is shown instead of
   *  `events`. Default: false. */
  isLoading?: boolean;
}

/** Cache formatters per-locale/timezone so a list of N events does
 *  not construct N DateTimeFormat instances. Source: MDN
 *  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat */
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(locale: string, timeZone: string | undefined): Intl.DateTimeFormat {
  const key = timeZone === undefined ? locale : `${locale}::${timeZone}`;
  const cached = formatterCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const fmt = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone,
  });
  formatterCache.set(key, fmt);
  return fmt;
}

/** Reused grid-line style constants. Defined at module scope so the
 *  same `style` object is shared across every cell (no per-render
 *  object allocation). */
const RAIL_WIDTH = '10rem';
const ROW_GAP = '12px';

const baseStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: `${RAIL_WIDTH} 1fr`,
  columnGap: ROW_GAP,
  rowGap: ROW_GAP,
  alignItems: 'start',
  width: '100%',
};

const railCellStyle: React.CSSProperties = {
  position: 'relative',
  paddingLeft: '12px',
  fontVariantNumeric: 'tabular-nums',
  color: '#8a8a8a',
  fontSize: '0.875rem',
  lineHeight: 1.4,
};

const railBeforeStyle: React.CSSProperties = {
  position: 'absolute',
  left: '3px',
  top: '0.5rem',
  bottom: 0,
  width: '2px',
  background: '#2a2a2a',
  content: '""',
};

const railDotStyle: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  top: '0.4rem',
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  background: '#b8976e',
};

const bodyCellStyle: React.CSSProperties = {
  paddingBottom: '8px',
  borderBottom: '1px solid #2a2a2a',
  fontSize: '0.9375rem',
  lineHeight: 1.5,
  color: '#e5e5e5',
};

const emptyStateStyle: React.CSSProperties = {
  gridColumn: '1 / -1',
  padding: '16px',
  textAlign: 'center',
  color: '#6a6a6a',
  fontStyle: 'italic',
};

/**
 * Render a list of events as a vertical timeline. See file header
 * for the layout rationale and the canonical sources.
 */
export function EventTimeline({
  events,
  renderEvent,
  locale = 'en-US',
  timeZone,
  emptyState,
  loadingState,
  isLoading = false,
}: EventTimelineProps): ReactElement {
  if (isLoading) {
    return (
      <section aria-busy="true" aria-label="Event timeline" style={baseStyle}>
        <div style={emptyStateStyle}>{loadingState ?? 'Loading events\u2026'}</div>
      </section>
    );
  }

  if (events.length === 0) {
    return (
      <section aria-label="Event timeline" style={baseStyle}>
        <div style={emptyStateStyle}>
          {emptyState ?? 'No events yet.'}
        </div>
      </section>
    );
  }

  const formatter = getFormatter(locale, timeZone);

  return (
    <section aria-label="Event timeline" style={baseStyle}>
      {events.map((event, idx) => {
        const timestamp = formatter.format(new Date(event.receivedAt));
        return (
          <EventRow
            key={eventKey(event, idx)}
            event={event}
            timestamp={timestamp}
            renderEvent={renderEvent}
          />
        );
      })}
    </section>
  );
}

interface EventRowProps {
  event: AxiomEvent;
  timestamp: string;
  renderEvent: EventRenderer;
}

function EventRow({ event, timestamp, renderEvent }: EventRowProps): ReactElement {
  return (
    <>
      <div style={railCellStyle} aria-label={`Timestamp: ${timestamp}`}>
        <span style={railBeforeStyle} aria-hidden="true" />
        <span style={railDotStyle} aria-hidden="true" />
        <div>{timestamp}</div>
        <div style={{ fontWeight: 600, color: '#e5e5e5' }}>{event.eventName}</div>
        <div style={{ fontSize: '0.75rem', color: '#6a6a6a' }}>
          block {event.blockNumber} · log {event.logIndex}
        </div>
      </div>
      <div style={bodyCellStyle}>{renderEvent(event, timestamp)}</div>
    </>
  );
}

/** Build a stable React key for an event. The (blockNumber, logIndex)
 *  pair uniquely identifies a log inside a chain; falling back to
 *  `receivedAt` for the (theoretical) case where a backend
 *  replays events without re-issuing coordinates. */
function eventKey(event: AxiomEvent, idx: number): string {
  return `${event.blockNumber}-${event.logIndex}-${event.txHash.slice(0, 10)}-${idx}`;
}
