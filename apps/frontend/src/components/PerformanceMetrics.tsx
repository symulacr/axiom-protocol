import type { ReactElement } from 'react';
import type { PerformanceMetrics as Metrics } from '../hooks/usePerformance.js';
import { COLORS, Card, SectionTitle, MonoLabel } from './ui.js';

interface PerformanceMetricsProps {
  metrics: Metrics;
}

/**
 * Displays key strategy performance metrics in a compact grid.
 * Uses existing Card and MonoLabel components.
 */
export function PerformanceMetrics({ metrics }: PerformanceMetricsProps): ReactElement {
  const items = [
    { label: 'Total Ticks', value: metrics.totalTicks.toString(), color: COLORS.text },
    { label: 'Buy / Sell / Hold', value: `${metrics.buyCount} / ${metrics.sellCount} / ${metrics.holdCount}`, color: COLORS.text },
    { label: 'Win Rate', value: `${(metrics.winRate * 100).toFixed(1)}%`, color: metrics.winRate > 0.5 ? COLORS.success : metrics.winRate > 0 ? COLORS.warning : COLORS.textMuted },
    { label: 'Actions', value: (metrics.buyCount + metrics.sellCount).toString(), color: COLORS.text },
  ];

  return (
    <Card style={{ marginBottom: 'var(--space-xl)' }}>
      <SectionTitle>Performance Summary</SectionTitle>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-lg)' }}>
        {items.map((item) => (
          <div key={item.label} style={{ minWidth: '8rem' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: COLORS.textDim, marginBottom: 'var(--space-xs)', fontWeight: 'var(--fw-medium)' }}>
              {item.label}
            </div>
            <MonoLabel style={{ color: item.color, fontSize: 'var(--text-base)', fontWeight: 'var(--fw-semibold)' }}>
              {item.value}
            </MonoLabel>
          </div>
        ))}
      </div>
    </Card>
  );
}
