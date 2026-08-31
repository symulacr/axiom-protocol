import type { GasTankStatus } from "./useGasTank.js";

/** Pure shape derivation shared by the hook and the card tests — mirrors the
 *  relay-side tank view (V3 W5-B): opsLeft at gasGrant granularity, sponsored
 *  when balance covers an op OR a lazy grant is still available. */
export function tankResponseShape(v: {
  balance: bigint;
  grantsUsed: bigint;
  grantsCap: bigint;
  gasGrant: bigint;
}): Pick<GasTankStatus, "opsLeft" | "sponsored" | "grantsLeft"> {
  const grantsLeft =
    v.grantsCap > v.grantsUsed ? v.grantsCap - v.grantsUsed : 0n;
  return {
    grantsLeft,
    opsLeft: v.gasGrant > 0n ? Number(v.balance / v.gasGrant) : 0,
    sponsored: v.balance > 0n || grantsLeft > 0n,
  };
}
