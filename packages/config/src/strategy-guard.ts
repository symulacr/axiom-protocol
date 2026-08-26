/**
 * Pure predictive guard over the AxiomStrategyVault strategy tuple — mirrors
 * AxiomStrategyVault.execute's revert order (StrategyExpired before
 * DailyLimitExceeded) and its UTC-day rollover spend reset, so callers can
 * block operations BEFORE signing into a guaranteed revert. Side-effect-free:
 * safe to unit-test without wallet/chain env.
 */

export type StrategyLimits = {
  dailyLimitWei: bigint;
  dailySpentWei: bigint;
  /** UTC day index the spend counter is valid for; spend resets when today passes it. */
  resetDay: bigint;
  /** UTC day index after which execute() reverts StrategyExpired; 0n = no expiry. */
  validUntilDay: bigint;
};

/** Contract day index: block.timestamp / 1 days (UTC), matching AxiomStrategyVault's rollover math. */
export function currentUtcDay(nowMs: number = Date.now()): bigint {
  return BigInt(Math.floor(nowMs / 86_400_000));
}

/** UTC calendar date (YYYY-MM-DD) a strategy day index rolls over at midnight. */
export function utcDayDateLabel(day: bigint): string {
  return new Date(Number(day) * 86_400_000).toISOString().slice(0, 10);
}

/** Humanized blocker when `valueWei` cannot settle through the strategy today,
 * or null when the operation can proceed. */
export function strategyGuardError(
  strategy: StrategyLimits,
  valueWei: bigint,
  today: bigint = currentUtcDay(),
): string | null {
  if (strategy.validUntilDay !== 0n && today > strategy.validUntilDay) {
    return "Strategy expired — set a new spending strategy to continue.";
  }
  // Contract resets the spend counter before the limit check once today passes resetDay.
  const effectiveSpent = today > strategy.resetDay ? 0n : strategy.dailySpentWei;
  if (
    strategy.dailyLimitWei > 0n &&
    effectiveSpent + valueWei > strategy.dailyLimitWei
  ) {
    const nextReset = (today > strategy.resetDay ? today : strategy.resetDay) + 1n;
    return `Daily limit exceeded — resets ${utcDayDateLabel(nextReset)} (UTC).`;
  }
  return null;
}
