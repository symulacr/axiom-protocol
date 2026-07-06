export interface PerformanceMetrics {
  totalTicks: number;
  buyCount: number;
  sellCount: number;
  holdCount: number;
  /** Fraction of ticks that recommended buy (not profitability). */
  buyRate: number;
  /** @deprecated Use buyRate — kept for backward compatibility. */
  winRate: number;
}

export interface TradeHistoryEntry {
  timestamp: number;
  action: string;
  amount: number | null;
  reason: string;
  durationMs: number | null;
  blockNumber: number;
  txHash: string;
}
