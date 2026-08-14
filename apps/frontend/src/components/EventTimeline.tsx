import React, { useEffect, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { eventDedupeKey, type AxiomEvent } from "../hooks/useEventHistory.js";
import { useMediaQuery } from "../hooks/useMediaQuery.js";
import { COLORS, Button } from "./ui.js";

type EventRenderer = (
  event: AxiomEvent,
  formattedTimestamp: string,
) => ReactNode;

interface EventTimelineProps {
  events: readonly AxiomEvent[];
  renderEvent: EventRenderer;
}

const formatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "medium",
});

const railCellStyle: React.CSSProperties = {
  position: "relative",
  paddingLeft: "12px",
  color: COLORS.textMuted,
  fontSize: "var(--text-sm)",
  lineHeight: "var(--lh-snug)",
};

const railBeforeStyle: React.CSSProperties = {
  position: "absolute",
  left: "3px",
  top: "0.5rem",
  bottom: 0,
  width: "2px",
  background: COLORS.border,
};

const railDotStyle: React.CSSProperties = {
  position: "absolute",
  left: 0,
  top: "0.4rem",
  width: "8px",
  height: "8px",
  borderRadius: "50%",
  background: COLORS.bronze,
};

const bodyCellStyle: React.CSSProperties = {
  paddingBottom: "8px",
  borderBottom: `1px solid ${COLORS.border}`,
  fontSize: "var(--text-sm)",
  lineHeight: "var(--lh-snug)",
  color: COLORS.textPrimary,
};

export const EventTimeline = React.memo(function EventTimeline({
  events,
  renderEvent,
}: EventTimelineProps): ReactElement {
  const [expanded, setExpanded] = useState(false);
  const [seenCount, setSeenCount] = useState(events.length);
  const isNarrow = useMediaQuery("(max-width: 479px)");
  const baseStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: `${isNarrow ? "4rem" : "10rem"} 1fr`,
    gap: "12px",
    alignItems: "start",
    width: "100%",
  };
  const unseen = Math.max(0, events.length - seenCount);

  // Section became active → current feed is the seen baseline; later appends count as new.
  useEffect(() => setSeenCount(events.length), []);

  if (events.length === 0) {
    return (
      <section aria-label="Event timeline" style={baseStyle}>
        <div
          style={{
            gridColumn: "1 / -1",
            padding: "16px",
            textAlign: "center",
            color: COLORS.textDim,
            fontStyle: "italic",
          }}
        >
          No events yet.
        </div>
      </section>
    );
  }

  const EVENT_LIMIT = 50;
  const hasMore = events.length > EVENT_LIMIT;
  const displayed = expanded ? events : events.slice(0, EVENT_LIMIT);

  return (
    <section aria-label="Event timeline" style={baseStyle}>
      {unseen > 0 && (
        <Button
          variant="teal"
          onClick={() => setSeenCount(events.length)}
          style={{ gridColumn: "1 / -1", justifySelf: "center" }}
        >
          {unseen} new
        </Button>
      )}
      {displayed.map((event) => (
        <EventRow
          key={eventKey(event)}
          event={event}
          timestamp={formatter.format(new Date(event.receivedAt))}
          renderEvent={renderEvent}
        />
      ))}
      {hasMore && !expanded && (
        <div style={{ gridColumn: "1 / -1", textAlign: "center" }}>
          <Button variant="teal" onClick={() => setExpanded(true)}>
            Show all {events.length} events
          </Button>
        </div>
      )}
    </section>
  );
});

interface EventRowProps {
  event: AxiomEvent;
  timestamp: string;
  renderEvent: EventRenderer;
}

const EventRow = React.memo(function EventRow({
  event,
  timestamp,
  renderEvent,
}: EventRowProps): ReactElement {
  return (
    <>
      <div className="tabular-nums" style={railCellStyle}>
        <span style={railBeforeStyle} aria-hidden="true" />
        <span style={railDotStyle} aria-hidden="true" />
        <div>{timestamp}</div>
        <div
          style={{
            fontWeight: "var(--fw-semibold)",
            color: COLORS.textPrimary,
          }}
        >
          {event.eventName}
        </div>
        <div style={{ fontSize: "var(--text-xs)", color: COLORS.textDim }}>
          block {event.blockNumber} · log {event.logIndex}
        </div>
      </div>
      <div style={bodyCellStyle}>{renderEvent(event, timestamp)}</div>
    </>
  );
});

function eventKey(event: AxiomEvent): string {
  // Stable per event: deduped upstream by chainId:txHash:logIndex; no positional suffix or every new WS event remounts every row
  return eventDedupeKey(event);
}
