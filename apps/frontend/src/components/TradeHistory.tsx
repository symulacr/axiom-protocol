import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import type { TradeHistoryEntry } from "../hooks/usePerformance.js";
import { Button, Card, SectionTitle, CopyButton, mutedTextSm } from "./ui.js";
import { EmptyState } from "./EmptyState.js";
import { resolveBlockExplorerUrl } from "@axiom/config/networks";

interface TradeHistoryProps {
  history: TradeHistoryEntry[];
}

export function TradeHistory({ history }: TradeHistoryProps): ReactElement {
  const explorerBase = resolveBlockExplorerUrl();
  const [expanded, setExpanded] = useState(false);
  const seenTxs = useRef<Set<string>>(new Set());
  useEffect(() => {
    history.forEach((e) => seenTxs.current.add(e.txHash));
  }, [history]);
  if (history.length === 0) {
    return (
      <EmptyState>
        <p style={mutedTextSm}>No executions yet.</p>
      </EmptyState>
    );
  }

  const hasMore = history.length > 30;
  const displayed = expanded ? history : history.slice(0, 30);

  return (
    <Card>
      <SectionTitle>Trade History</SectionTitle>
      <div className="trade-list">
        {displayed.map((entry, i) => {
          const timeStr = new Date(entry.timestamp).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
          const isNew = !seenTxs.current.has(entry.txHash);
          return (
            <div
              key={`${entry.txHash}-${i}`}
              className={`trade-row${isNew ? " flash-up" : ""}`}
            >
              <span className="trade-time tabular-nums">{timeStr}</span>
              <strong className={`trade-action trade-action--${entry.action}`}>
                {entry.action}
              </strong>
              {entry.amount !== null && (
                <span className="trade-amount tabular-nums">
                  amt: {entry.amount}
                </span>
              )}
              <span className="trade-reason">{entry.reason}</span>
              <a
                href={`${explorerBase}/tx/${entry.txHash}`}
                target="_blank"
                rel="noreferrer noopener"
                className="trade-link"
              >
                {entry.txHash.slice(0, 10)}…
              </a>
              <CopyButton text={entry.txHash} />
            </div>
          );
        })}
        {hasMore && !expanded && (
          <div style={{ textAlign: "center" }}>
            <Button variant="teal" onClick={() => setExpanded(true)}>
              Show all {history.length} trades
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
