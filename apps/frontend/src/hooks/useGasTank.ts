import { useCallback, useEffect, useState } from "react";
import {
  aggregateReads,
  type ReadClient,
  type AggregateResult,
} from "@axiom/config/multicall3";
import { GAS_TANK_ABI } from "@axiom/config/abis";
import { toViemAbi, getAxiomGasTankAddress } from "../abi/addresses.js";

export interface GasTankStatus {
  /** Prepaid tank balance (wei) — the withdrawable/user-visible number. */
  balance: bigint;
  /** Grants consumed so far. */
  grantsUsed: bigint;
  /** Max grants per address (admin-tunable, read live). */
  grantsCap: bigint;
  /** Grants still claimable/claimable-by-relay. */
  grantsLeft: bigint;
  /** Live per-grant size (wei) — read from the chain, never a hardcoded constant. */
  gasGrant: bigint;
  /** Approx ops remaining at gasGrant granularity (0 when tank empty). */
  opsLeft: number;
  /** True when the next op runs gas-free (balance covers an op OR a lazy grant is available). */
  sponsored: boolean;
  /** Next sequential relay nonce (lane A) — consumers pass it to the sponsor lane. */
  nextNonce?: string;
}

export interface UseGasTankResult {
  tank: GasTankStatus | null;
  error: string | null;
  loadedKey: string | null;
  refetch: () => void;
}

function toStatus(results: AggregateResult[]): GasTankStatus | null {
  const [balanceR, usedR, capR, grantR] = results;
  if (
    !balanceR?.success ||
    !usedR?.success ||
    !capR?.success ||
    !grantR?.success
  ) {
    return null;
  }
  const balance = balanceR.result as bigint;
  const grantsUsed = usedR.result as bigint;
  const grantsCap = capR.result as bigint;
  const gasGrant = grantR.result as bigint;
  const grantsLeft = grantsCap > grantsUsed ? grantsCap - grantsUsed : 0n;
  return {
    balance,
    grantsUsed,
    grantsCap,
    grantsLeft,
    gasGrant,
    opsLeft: gasGrant > 0n ? Number(balance / gasGrant) : 0,
    sponsored: balance > 0n || grantsLeft > 0n,
  };
}

/**
 * useGasTank (V3 W5-B): GasTank status for the connected wallet, env-gated —
 * an unset VITE_GAS_TANK_ADDRESS means no RPC and a null tank (wallet-less
 * first-run stays silent). One aggregateReads call per (address, chain) pair;
 * the guard test pins that shape.
 */
export function useGasTank(
  address: string | undefined,
  publicClient: ReadClient | undefined,
): UseGasTankResult {
  const gasTank = getAxiomGasTankAddress();
  const key = `${address ?? ""}:${gasTank ?? ""}`;
  const [state, setState] = useState<{
    tank: GasTankStatus | null;
    error: string | null;
    loadedKey: string | null;
  }>({ tank: null, error: null, loadedKey: null });

  const load = useCallback(() => {
    if (!gasTank || !address || !publicClient) {
      setState({ tank: null, error: null, loadedKey: key });
      return;
    }
    let cancelled = false;
    setState((prev) =>
      prev.loadedKey === key
        ? prev
        : { tank: null, error: null, loadedKey: key },
    );
    void aggregateReads(publicClient, [
      {
        address: gasTank,
        abi: toViemAbi(GAS_TANK_ABI),
        functionName: "balanceOf",
        args: [address],
      },
      {
        address: gasTank,
        abi: toViemAbi(GAS_TANK_ABI),
        functionName: "grantsUsed",
        args: [address],
      },
      {
        address: gasTank,
        abi: toViemAbi(GAS_TANK_ABI),
        functionName: "grantsCap",
      },
      {
        address: gasTank,
        abi: toViemAbi(GAS_TANK_ABI),
        functionName: "gasGrant",
      },
    ])
      .then((results: AggregateResult[]) => {
        if (cancelled) return;
        const tank = toStatus(results);
        setState({
          tank,
          error: tank ? null : "gas tank read failed",
          loadedKey: key,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          tank: null,
          error: err instanceof Error ? err.message : "gas tank read failed",
          loadedKey: key,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [address, gasTank, publicClient, key]);

  useEffect(() => {
    const cleanup = load();
    return cleanup;
  }, [load]);

  return {
    tank: state.tank,
    error: state.error,
    loadedKey: state.loadedKey,
    refetch: load,
  };
}
