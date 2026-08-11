import type { ReactElement } from "react";
import type { TradeHistoryEntry } from "../hooks/usePerformance.js";
import {
  Card,
  SectionTitle,
  CopyButton,
  mutedTextSm,
} from "./ui.js";
import { EmptyState } from "./EmptyState.js";
import { resolveBlockExplorerUrl } from "@axiom/config/networks";

interface TradeHistoryProps {
  history: TradeHistoryEntry[];
}

export function TradeHistory({ history }: TradeHistoryProps): ReactElement {
  const explorerBase = resolveBlockExplorerUrl();

  if (history.length === 0) {
    return (
      <EmptyState>
        <p style={mutedTextSm}>
          No strategy executions yet. Execute a strategy to see trade history
          here.
        </p>
      </EmptyState>
    );
  }

  return (
    <Card>
      <SectionTitle>Trade History</SectionTitle>
      <div className="trade-list">
        {history.map((entry, i) => {
          const date = new Date(entry.timestamp);
          const timeStr = date.toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });

          return (
            <div
              key={`${entry.txHash}-${i}`}
              className="trade-row"
            >
              <span
                className="trade-time tabular-nums"
              >
                {timeStr}
              </span>
              <strong
                className={`trade-action trade-action--${entry.action}`}
              >
                {entry.action}
              </strong>
              {entry.amount !== null && (
                <span
                  className="trade-amount tabular-nums"
                >
                  amt: {entry.amount}
                </span>
              )}
              <span
                className="trade-reason"
              >
                {entry.reason}
              </span>
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
      </div>
    </Card>
  );
}
