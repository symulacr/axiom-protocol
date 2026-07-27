import type { ReactElement } from "react";
import type { TradeHistoryEntry } from "../hooks/usePerformance.js";
import {
  COLORS,
  Card,
  SectionTitle,
  getActionColor,
  CopyButton,
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
        <p
          style={{
            color: COLORS.textMuted,
            fontSize: "var(--text-sm)",
            margin: 0,
          }}
        >
          No strategy executions yet. Execute a strategy to see trade history
          here.
        </p>
      </EmptyState>
    );
  }

  return (
    <Card>
      <SectionTitle>Trade History</SectionTitle>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {history.map((entry, i) => {
          const actionColor = getActionColor(entry.action);
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
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-md)",
                padding: "var(--space-sm) 0",
                borderBottom:
                  i < history.length - 1
                    ? `1px solid ${COLORS.border}`
                    : "none",
                fontSize: "var(--text-sm)",
              }}
            >
              <span
                className="tabular-nums"
                style={{
                  color: COLORS.textDim,
                  fontSize: "var(--text-xs)",
                  minWidth: "5.5rem",
                  whiteSpace: "nowrap",
                }}
              >
                {timeStr}
              </span>
              <strong
                style={{
                  color: actionColor,
                  textTransform: "uppercase",
                  minWidth: "2.5rem",
                  fontSize: "var(--text-xs)",
                }}
              >
                {entry.action}
              </strong>
              {entry.amount !== null && (
                <span
                  className="tabular-nums"
                  style={{
                    color: COLORS.textMuted,
                    fontSize: "var(--text-xs)",
                  }}
                >
                  amt: {entry.amount}
                </span>
              )}
              <span
                style={{
                  color: COLORS.textDim,
                  fontSize: "var(--text-xs)",
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {entry.reason}
              </span>
              <a
                href={`${explorerBase}/tx/${entry.txHash}`}
                target="_blank"
                rel="noreferrer noopener"
                style={{
                  color: COLORS.teal,
                  fontSize: "var(--text-xs)",
                  textDecoration: "none",
                  flexShrink: 0,
                  fontFamily: "var(--font-mono)",
                }}
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
