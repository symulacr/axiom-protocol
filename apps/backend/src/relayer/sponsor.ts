import { getRelayerConfig } from "@axiom/config";

/** Token-bucket entry per user (rate §1: SPONSOR_RATE_PER_MIN refill). */
interface Bucket {
  tokens: number;
  updatedAt: number;
}

/**
 * Sponsored-op admission control keyed on the RECOVERED EIP-712 signer:
 *  - token bucket: AXIOM_RELAYER_SPONSOR_RATE_PER_MIN ops/min per user;
 *  - maxGasCost ceiling: AXIOM_RELAYER_SPONSOR_MAX_GAS_COST_WEI (user-signed
 *    commitment must fit under the operator cap);
 *  - inflight cap: AXIOM_RELAYER_SPONSOR_MAX_INFLIGHT_PER_USER, enforced in
 *    the queue; the gate exposes the check for pre-flight 402/429 shaping.
 */
export class SponsorGate {
  private buckets = new Map<string, Bucket>();
  private cfg = getRelayerConfig();

  /** Rate-limiter verdict for a user. */
  takeToken(user: string): boolean {
    const key = user.toLowerCase();
    const now = Date.now();
    const rate = this.cfg.sponsorRatePerMin;
    const refillMs = 60_000 / rate;
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: rate - 1, updatedAt: now };
      this.buckets.set(key, b);
      return true;
    }
    const elapsed = now - b.updatedAt;
    if (elapsed > 0) {
      b.tokens = Math.min(rate, b.tokens + elapsed / refillMs);
      b.updatedAt = now;
    }
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  /** maxGasCost ceiling check. */
  allowsMaxGasCost(maxGasCost: bigint): boolean {
    return maxGasCost <= this.cfg.sponsorMaxGasCostWei;
  }

  /** Inflight cap check (reservation-aware). */
  allowsInflight(reservedCount: number): boolean {
    return reservedCount < this.cfg.sponsorMaxInflightPerUser;
  }
}
