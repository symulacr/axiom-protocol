import { isFaucetEnabled, getRelayerConfig } from "@axiom/config";
import type { RelayerQueue, SponsorRecord } from "./queue.js";
import { createLogger } from "../utils/logger.js";
import { formatEther } from "ethers";

const log = createLogger("relayer.faucet");

/** GasTank lazy-grant read-model for the faucet status report; omitted when the tank read fails. */
export interface RelayGrantsView {
  grantBalance: string;
  grantsUsed: string;
  grantsCap: string;
  gasGrant: string;
}

/** One-time W0G wrap-drip: relayer wraps native → transfers W0G; no user signature. */
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
 * the live W0G balance when available, and enqueues a distinct faucet-mint op
 * through the same queue machinery. The in-memory `fauceted` set is not
 * durable — the on-chain balance gate is the backstop, so a restarted relayer
 * re-faucets only addresses still holding < the gate (0.01 W0G).
 */
export class Faucet {
  private fauceted = new Set<string>();
  private cfg = getRelayerConfig();
  private enabled: boolean;

  constructor(
    private queue: RelayerQueue,
    private mint: FaucetMinter,
    private balanceOf: UsdcBalanceOf | null,
    private tokenSymbol: (() => Promise<string>) | null = null,
    private relayGrantsOf:
      ((user: string) => Promise<RelayGrantsView | null>) | null = null,
    env: Record<string, string | undefined> = globalThis.process !== undefined
      ? (process.env as Record<string, string | undefined>)
      : {},
    private token?: string,
  ) {
    this.enabled = isFaucetEnabled(env);
    // Best-effort boot visibility (ops): which token serves the drip, which chain.
    if (this.token) {
      log.info(
        `faucet token: ${this.token} chain ${env["AXIOM_CHAIN_ID"] ?? "unknown"}`,
      );
    }
  }

  /** Read-model for GET /v1/relayer/faucet/:address. */
  async statusOf(address: string): Promise<{
    eligible: boolean;
    alreadyGranted: boolean;
    grantedBalance: string;
    dripAmount: string;
    token: string;
    tokenSymbol?: string;
    relayGrants?: RelayGrantsView;
  }> {
    const user = address.toLowerCase();
    let balance: bigint | null = null;
    if (this.balanceOf) {
      try {
        balance = await this.balanceOf(user);
      } catch (err) {
        log.warn(
          `faucet balance read failed for ${user}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    // Non-exclusive report leg: an address already holding ≥ the gate has been
    // granted elsewhere (or before a restart) — never mutates the fauceted set.
    const gate = this.cfg.faucetBalanceGateWei;
    const alreadyGranted = balance !== null && balance >= gate;
    const out: Awaited<ReturnType<Faucet["statusOf"]>> = {
      eligible: this.enabled && (await this.isEligible(user)),
      alreadyGranted,
      grantedBalance: balance === null ? "0.0" : formatEther(balance),
      dripAmount: formatEther(this.cfg.faucetAmountWei),
      token: this.token ?? "",
    };
    if (this.tokenSymbol) {
      try {
        out.tokenSymbol = await this.tokenSymbol();
      } catch {
        // Symbol read is cosmetic; omit rather than fail the status route.
      }
    }
    if (this.relayGrantsOf) {
      try {
        const grants = await this.relayGrantsOf(user);
        if (grants) out.relayGrants = grants;
      } catch {
        // Tank read failure must never fail the status route.
      }
    }
    return out;
  }

  private async isEligible(user: string): Promise<boolean> {
    if (this.fauceted.has(user)) return false;
    if (this.balanceOf) {
      try {
        if ((await this.balanceOf(user)) >= this.cfg.faucetBalanceGateWei) {
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
    const amount = this.cfg.faucetAmountWei;
    const record = this.queue.enqueue(buildFaucetRecord(user));
    if (!record) {
      // Inflight cap rejected: roll back so a later relay can still drip.
      this.fauceted.delete(user);
      return false;
    }
    markFaucet(record, amount);
    log.info(`faucet drip queued for ${user} (${formatEther(amount)} W0G)`);
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
