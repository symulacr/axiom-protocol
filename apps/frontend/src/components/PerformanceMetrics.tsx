import type { ReactElement } from "react";
import type { PerformanceMetrics as Metrics } from "../hooks/usePerformance.js";
import {
  COLORS,
  Card,
  SectionTitle,
  MonoLabel,
  KeyValueGrid,
  type KeyValueGridItem,
} from "./ui.js";

interface PerformanceMetricsProps {
  metrics: Metrics;
}

/**
 * Displays key strategy performance metrics in a compact grid.
 * Uses existing Card and MonoLabel components.
 */
export function PerformanceMetrics({
  metrics,
}: PerformanceMetricsProps): ReactElement {
  const buyRate = metrics.buyRate ?? metrics.winRate;

  const items: KeyValueGridItem[] = [
    {
      label: "Total Ticks",
      value: (
        <MonoLabel
          style={{
            color: COLORS.text,
            fontSize: "var(--text-base)",
            fontWeight: "var(--fw-semibold)",
          }}
        >
          {metrics.totalTicks.toString()}
        </MonoLabel>
      ),
    },
    {
      label: "Buy / Sell / Hold",
      value: (
        <MonoLabel
          style={{
            color: COLORS.text,
            fontSize: "var(--text-base)",
            fontWeight: "var(--fw-semibold)",
          }}
        >
          {`${metrics.buyCount} / ${metrics.sellCount} / ${metrics.holdCount}`}
        </MonoLabel>
      ),
    },
    {
      label: "Buy Rate",
      value: (
        <MonoLabel
          style={{
            color:
              buyRate > 0.5
                ? COLORS.success
                : buyRate > 0
                  ? COLORS.warning
                  : COLORS.textMuted,
            fontSize: "var(--text-base)",
            fontWeight: "var(--fw-semibold)",
          }}
        >
          {`${(buyRate * 100).toFixed(1)}%`}
        </MonoLabel>
      ),
    },
    {
      label: "Actions",
      value: (
        <MonoLabel
          style={{
            color: COLORS.text,
            fontSize: "var(--text-base)",
            fontWeight: "var(--fw-semibold)",
          }}
        >
          {(metrics.buyCount + metrics.sellCount).toString()}
        </MonoLabel>
      ),
    },
  ];

  return (
    <Card style={{ marginBottom: "var(--space-xl)" }}>
      <SectionTitle>Performance Summary</SectionTitle>
      <KeyValueGrid items={items} />
    </Card>
  );
}
