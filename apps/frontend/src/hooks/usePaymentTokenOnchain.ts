import { useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { aggregateReads, type AggregateResult } from "@axiom/config/multicall3";
import type { Address } from "viem";
import { PAYMENT_TOKEN_ABI } from "@axiom/config/abis";
import {
  getAxiomPaymentProcessorAddress,
  toViemAbi,
} from "../abi/addresses.js";

const paymentTokenAbi = toViemAbi(PAYMENT_TOKEN_ABI);

export interface PaymentTokenOnchain {
  /** ERC-20 decimals of the live settlement token; undefined until the read resolves. */
  decimals?: number;
  /** Caller's live allowance to the PaymentProcessor; undefined until resolved. */
  allowanceWei?: bigint;
  isLoading: boolean;
  error: Error | null;
}

/**
 * W2-C: live payment-token facts for the pay flow, fetched through the canonical
 * Multicall3 `aggregate3` (packages/config/multicall3) — decimals + allowance
 * collapse from 2 sequential readContract round-trips into ONE RPC call.
 *
 * Replaces the per-review-open allowance-only poll in FlowPage for surfaces that
 * need both facts up-front (e.g. the dashboard "needs allowance" prompt).
 * Unresolved facts stay undefined so callers keep their existing defaults.
 */
export function usePaymentTokenOnchain(
  paymentToken: Address | null | undefined,
): PaymentTokenOnchain {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [state, setState] = useState<{
    decimals?: number;
    allowanceWei?: bigint;
    error: Error | null;
    loadedKey: string;
  }>({ error: null, loadedKey: "" });

  const key = `${paymentToken ?? ""}:${address ?? ""}`;

  useEffect(() => {
    if (!paymentToken || !address || !publicClient) {
      setState({ error: null, loadedKey: key });
      return;
    }
    let cancelled = false;
    setState((prev) =>
      prev.loadedKey === key ? prev : { error: null, loadedKey: key },
    );
    void aggregateReads(publicClient, [
      {
        address: paymentToken,
        abi: paymentTokenAbi,
        functionName: "decimals",
        args: [],
      },
      {
        address: paymentToken,
        abi: paymentTokenAbi,
        functionName: "allowance",
        args: [address, getAxiomPaymentProcessorAddress()],
      },
    ])
      .then((results: AggregateResult[]) => {
        if (cancelled) return;
        const [decimals, allowance] = results;
        setState({
          decimals:
            decimals?.success && typeof decimals.result === "number"
              ? decimals.result
              : undefined,
          allowanceWei:
            allowance?.success && typeof allowance.result === "bigint"
              ? allowance.result
              : undefined,
          error: decimals?.error ?? allowance?.error ?? null,
          loadedKey: key,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          error: err instanceof Error ? err : new Error("multicall failed"),
          loadedKey: key,
        });
      });
    return () => {
      cancelled = true;
    };
    // hooks: one aggregated read per (token, wallet) pair
  }, [key, publicClient]);

  const isLoading =
    Boolean(paymentToken && address) &&
    !state.allowanceWei &&
    state.decimals === undefined;

  return {
    decimals: state.decimals,
    allowanceWei: state.allowanceWei,
    isLoading,
    error: state.error,
  };
}
