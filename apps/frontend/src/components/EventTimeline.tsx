import React from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { AxiomEvent } from '../hooks/useEventHistory.js';
import { useMediaQuery } from '../hooks/useMediaQuery.js';
import { COLORS } from './ui.js';

export type EventRenderer = (
  event: AxiomEvent,
  formattedTimestamp: string,
) => ReactNode;

export interface EventTimelineProps {
  events: readonly AxiomEvent[];
  renderEvent: EventRenderer;
  locale?: string;
  timeZone?: string;
  emptyState?: ReactNode;
  loadingState?: ReactNode;
  isLoading?: boolean;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();
const MAX_CACHE_SIZE = 20;

function getFormatter(locale: string, timeZone: string | undefined): Intl.DateTimeFormat {
  const key = timeZone === undefined ? locale : `${locale}::${timeZone}`;
  const cached = formatterCache.get(key);
  if (cached !== undefined) return cached;
  if (formatterCache.size >= MAX_CACHE_SIZE) {
    const first = formatterCache.keys().next();
    if (first.value !== undefined) formatterCache.delete(first.value);
  }
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'medium', timeZone });
  formatterCache.set(key, fmt);
  return fmt;
}

const ROW_GAP = '12px';

const railCellStyle: React.CSSProperties = {
  position: 'relative',
  paddingLeft: '12px',
  fontVariantNumeric: 'tabular-nums',
  color: COLORS.textMuted,
  fontSize: 'var(--text-sm)',
  lineHeight: 'var(--lh-snug)',
};

const railBeforeStyle: React.CSSProperties = {
  position: 'absolute',
  left: '3px',
  top: '0.5rem',
  bottom: 0,
  width: '2px',
  background: COLORS.border,
  content: '""',
};

const railDotStyle: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  top: '0.4rem',
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  background: COLORS.bronze,
};

const bodyCellStyle: React.CSSProperties = {
  paddingBottom: '8px',
  borderBottom: `1px solid ${COLORS.border}`,
  fontSize: 'var(--text-sm)',
  lineHeight: 'var(--lh-snug)',
  color: COLORS.textPrimary,
};

const emptyStateStyle: React.CSSProperties = {
  gridColumn: '1 / -1',
  padding: '16px',
  textAlign: 'center',
  color: COLORS.textDim,
  fontStyle: 'italic',
};

export const EventTimeline = React.memo(function EventTimeline({
  events,
  renderEvent,
  locale = 'en-US',
  timeZone,
  emptyState,
  loadingState,
  isLoading = false,
}: EventTimelineProps): ReactElement {
  const isNarrow = useMediaQuery('(max-width: 479px)');
  const railWidth = isNarrow ? '4rem' : '10rem';
  const baseStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `${railWidth} 1fr`,
    columnGap: ROW_GAP,
    rowGap: ROW_GAP,
    alignItems: 'start',
    width: '100%',
  };

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
});

interface EventRowProps {
  event: AxiomEvent;
  timestamp: string;
  renderEvent: EventRenderer;
}

const EventRow = React.memo(function EventRow({ event, timestamp, renderEvent }: EventRowProps): ReactElement {
  return (
    <>
      <div style={railCellStyle}>
        <span style={railBeforeStyle} aria-hidden="true" />
        <span style={railDotStyle} aria-hidden="true" />
        <div>{timestamp}</div>
        <div style={{ fontWeight: 'var(--fw-semibold)', color: COLORS.textPrimary }}>{event.eventName}</div>
        <div style={{ fontSize: 'var(--text-xs)', color: COLORS.textDim }}>
          block {event.blockNumber} · log {event.logIndex}
        </div>
      </div>
      <div style={bodyCellStyle}>{renderEvent(event, timestamp)}</div>
    </>
  );
});

function eventKey(event: AxiomEvent, idx: number): string {
  return `${event.blockNumber}-${event.logIndex}-${event.txHash.slice(0, 10)}-${idx}`;
}
