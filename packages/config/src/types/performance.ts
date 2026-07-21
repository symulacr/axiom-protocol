export interface PerformanceMetrics {
  totalTicks: number;
  buyCount: number;
  sellCount: number;
  holdCount: number;
  /** Fraction of ticks that were buys (buyCount / totalTicks) */
  buyRate: number;
  /** @deprecated Mislabeled — was an alias for buyRate. Use buyRate instead.
   *  Will be removed in a future version. */
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
