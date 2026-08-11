export interface PerformanceMetrics {
  totalTicks: number;
  buyCount: number;
  sellCount: number;
  holdCount: number;
  buyRate: number;
  // (buyCount + sellCount) / totalTicks — trade-action rate, NOT an alias for buyRate;
  // backend single-agent and batch endpoints compute this identically (see routers/performance.ts).
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
