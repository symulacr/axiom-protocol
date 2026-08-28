/**
 * Pure predictive guard over the AxiomStrategyVault strategy tuple — mirrors
 * AxiomStrategyVault.execute's revert order (StrategyExpired before
 * DailyLimitExceeded), its UTC-day rollover spend reset (today !== resetDay),
 * and its dailyLimit=0 semantics (limit of 0 blocks every spend), so callers
 * can block operations BEFORE signing into a guaranteed revert.
 * Side-effect-free: safe to unit-test without wallet/chain env.
 * Parity with the Solidity check order is pinned by
 * strategy-guard.chain-parity.test.ts.
 */

export type StrategyLimits = {
  dailyLimitWei: bigint;
  dailySpentWei: bigint;
  /** UTC day index the spend counter is valid for; spend resets when today differs from it. */
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
  // Contract resets the spend counter before the limit check once today
  // differs from resetDay (covers both clock-behind and day-advance skew).
  const effectiveSpent =
    today !== strategy.resetDay ? 0n : strategy.dailySpentWei;
  if (effectiveSpent + valueWei > strategy.dailyLimitWei) {
    // dailyLimit=0 is NOT an unlimited sentinel on-chain: DailyLimitExceeded
    // reverts for any value>0 against a zero limit.
    const nextReset =
      (today > strategy.resetDay ? today : strategy.resetDay) + 1n;
    return `Daily limit exceeded — resets ${utcDayDateLabel(nextReset)} (UTC).`;
  }
  return null;
}
