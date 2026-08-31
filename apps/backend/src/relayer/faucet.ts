import { isFaucetEnabled, getRelayerConfig } from "@axiom/config";
import type { RelayerQueue, SponsorRecord } from "./queue.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("relayer.faucet");

/** One-time axmUSDC drip: relayer-initiated mint op, no user signature. */
export type FaucetMinter = (
  user: string,
  amount: bigint,
) => Promise<`0x${string}`>;

/** Balance gate leg (best-effort on-chain check); mocked in tests. */
export type UsdcBalanceOf = (user: string) => Promise<bigint>;

/** Queue entry carrying a relayer-initiated mint (no userSig). */
export function buildFaucetRecord(
  user: string,
): Omit<SponsorRecord, "id" | "status" | "enqueuedAt" | "attempts"> {
  // The queue measures maxGasCost only for admission accounting; a faucet op
  // carries 0 so it never competes with user ops for the sponsor ceiling.
  return {
    request: {
      user: user.toLowerCase() as `0x${string}`,
      target: "0x0000000000000000000000000000000000000000",
      data: "0x",
      maxGasCost: 0n,
      nonce: 0n,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
    },
    userSig: "0x" as `0x${string}`,
    user: user.toLowerCase(),
  };
}

/** True when a queued record is a faucet-mint op (as built by enqueueDrip). */
export function isFaucetRecord(r: SponsorRecord): boolean {
  return (r as SponsorRecord & { op?: string }).op === "faucet-mint";
}

/** The drip size attached to a faucet-mint record (undefined for user ops). */
export function faucetAmountOf(r: SponsorRecord): bigint | undefined {
  return (r as SponsorRecord & { amount?: bigint }).amount;
}

/** Attaches the faucet marker + drip size to a queued record (in place). */
function markFaucet(record: SponsorRecord, amount: bigint): void {
  (record as SponsorRecord & { op?: string }).op = "faucet-mint";
  (record as SponsorRecord & { amount?: bigint }).amount = amount;
}

/**
 * First-relay faucet (V3 W6-B): tracks who already received the drip, gates on
 * the live axmUSDC balance when available, and enqueues a distinct faucet-mint
 * op through the same queue machinery. The in-memory `fauceted` set is not
 * durable — the on-chain balance gate is the backstop, so a restarted relayer
 * re-faucets only addresses still holding < 1 axmUSDC.
 */
export class Faucet {
  private fauceted = new Set<string>();
  private cfg = getRelayerConfig();
  private enabled: boolean;

  constructor(
    private queue: RelayerQueue,
    private mint: FaucetMinter,
    private balanceOf: UsdcBalanceOf | null,
    env: Record<string, string | undefined> = globalThis.process !== undefined
      ? (process.env as Record<string, string | undefined>)
      : {},
  ) {
    this.enabled = isFaucetEnabled(env);
  }

  /** Read-model for GET /v1/relayer/faucet/:address. */
  async statusOf(
    address: string,
  ): Promise<{ eligible: boolean; amount: string; token: string }> {
    const user = address.toLowerCase();
    return {
      eligible: this.enabled && (await this.isEligible(user)),
      amount: this.cfg.faucetAmountUsdc.toString(),
      token: "axmUSDC",
    };
  }

  private async isEligible(user: string): Promise<boolean> {
    if (this.fauceted.has(user)) return false;
    if (this.balanceOf) {
      try {
        if ((await this.balanceOf(user)) >= this.cfg.faucetBalanceGate) {
          // Remember on a live read too: this address does not need the drip.
          this.fauceted.add(user);
          return false;
        }
      } catch (err) {
        log.warn(
          `faucet balance gate failed for ${user}: ${err instanceof Error ? err.message : String(err)}`,
        );
        // Gate leg down: treat as eligible. The mint is permissionless and
        // bounded by one drip per address per process lifetime.
      }
    }
    return true;
  }

  /** Enqueue the drip; called from the sponsor route on a user's first relay. */
  async dripOnFirstRelay(address: string): Promise<boolean> {
    if (!this.enabled) return false;
    const user = address.toLowerCase();
    if (!(await this.isEligible(user))) return false;
    this.fauceted.add(user);
    const amount = this.cfg.faucetAmountUsdc;
    const record = this.queue.enqueue(buildFaucetRecord(user));
    if (!record) {
      // Inflight cap rejected: roll back so a later relay can still drip.
      this.fauceted.delete(user);
      return false;
    }
    markFaucet(record, amount);
    log.info(
      `faucet drip queued for ${user} (${amount.toString()} base units)`,
    );
    void this.execute(record);
    return true;
  }

  /** Broadcast leg for faucet ops — direct mint(), never gasTank.relay(). */
  async execute(record: SponsorRecord): Promise<void> {
    const amount = faucetAmountOf(record);
    if (amount === undefined) return;
    try {
      await this.mint(record.user, amount);
      this.queue.markConfirmed(record.id);
    } catch (err) {
      this.queue.markFailed(
        record.id,
        err instanceof Error ? err.message : String(err),
      );
      // Nothing minted: let a later relay retry the drip.
      this.fauceted.delete(record.user);
    }
  }
}
