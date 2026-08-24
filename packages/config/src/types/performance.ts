export interface PerformanceMetrics {
  totalTicks: number;
  buyCount: number;
  sellCount: number;
  holdCount: number;
  buyRate: number;
  // (buyCount + sellCount)/totalTicks — trade-action rate, NOT buyRate; mirrors routers/performance.ts.
  winRate: number;
}
