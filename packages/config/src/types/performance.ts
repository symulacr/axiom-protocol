export interface PerformanceMetrics {
	totalTicks: number;
	buyCount: number;
	sellCount: number;
	holdCount: number;
	/** Fraction of ticks that were buys (buyCount / totalTicks) */
	buyRate: number;
	/**
	 * Fraction of ticks with a non-hold action (buyCount + sellCount) / totalTicks.
	 * NOT an alias for buyRate: the backend single-agent and batch endpoints
	 * both compute this formula (see apps/backend/src/routers/performance.ts).
	 * The frontend displays buyRate; winRate is the trade-action rate.
	 */
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
