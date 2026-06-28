import type { ReactElement } from 'react';
import type { TradeHistoryEntry } from '../hooks/usePerformance.js';
import { COLORS, Card, SectionTitle } from './ui.js';
import { EmptyState } from './EmptyState.js';

interface TradeHistoryProps {
  history: TradeHistoryEntry[];
}
import { EXPLORER_BASE } from '../utils/constants.js';

/**
 * Displays trade history as a compact list. Reuses Card and MonoLabel.
 * Each entry shows timestamp, action (color-coded), amount, and reason.
 */
export function TradeHistory({ history }: TradeHistoryProps): ReactElement {
  if (history.length === 0) {
    return (
      <EmptyState>
        <p style={{ color: COLORS.textMuted, fontSize: 'var(--text-sm)', margin: 0 }}>
          No strategy executions yet. Execute a strategy to see trade history here.
        </p>
      </EmptyState>
    );
  }

  return (
    <Card>
      <SectionTitle>Trade History</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {history.map((entry, i) => {
          const actionColor = entry.action === 'buy' ? COLORS.success : entry.action === 'sell' ? COLORS.danger : COLORS.textMuted;
          const date = new Date(entry.timestamp);
          const timeStr = date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

          return (
            <div
              key={`${entry.txHash}-${i}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-md)',
                padding: 'var(--space-sm) 0',
                borderBottom: i < history.length - 1 ? `1px solid ${COLORS.border}` : 'none',
                fontSize: 'var(--text-sm)',
              }}
            >
              <span style={{ color: COLORS.textDim, fontSize: 'var(--text-xs)', minWidth: '5.5rem', whiteSpace: 'nowrap' }}>
                {timeStr}
              </span>
              <strong style={{ color: actionColor, textTransform: 'uppercase', minWidth: '2.5rem', fontSize: 'var(--text-xs)' }}>
                {entry.action}
              </strong>
              {entry.amount !== null && (
                <span style={{ color: COLORS.textMuted, fontSize: 'var(--text-xs)' }}>
                  amt: {entry.amount}
                </span>
              )}
              <span style={{ color: COLORS.textDim, fontSize: 'var(--text-xs)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.reason}
              </span>
              <a
                href={`${EXPLORER_BASE}/tx/${entry.txHash}`}
                target="_blank"
                rel="noreferrer noopener"
                style={{ color: COLORS.teal, fontSize: 'var(--text-xs)', textDecoration: 'none', flexShrink: 0 }}
              >
                {entry.txHash.slice(0, 10)}…
              </a>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
