import { useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { aggregateReads, type AggregateResult } from "@axiom/config/multicall3";
import { STATE_VIEW_ABI } from "@axiom/config/abis";
import type { Address } from "viem";
import { getAxiomStateViewAddress, toViemAbi } from "../abi/addresses.js";

const stateViewAbi = toViemAbi(STATE_VIEW_ABI);

/** W2-C paymentSnapshot shape (AxiomStateView.sol): every fact payForAgent
 * checks, in ONE facade call — itself batched into ONE Multicall3 round-trip. */
export interface PaymentSnapshot {
  /** MAX_PAY_CAP; 0 = unlimited (the Processor's sentinel). */
  maxPayCap: bigint;
  /** computeRatioMax; 0 = unlimited. */
  computeRatioMax: bigint;
  /** Payer's live token balance. */
  agentBalance: bigint;
  /** Payer's live allowance to the PaymentProcessor. */
  payerAllowance: bigint;
  /** Live settlement token the Processor will pull. */
  paymentToken: Address | null;
}

export interface PaymentSnapshotResult {
  snapshot: PaymentSnapshot | null;
  isLoading: boolean;
  error: Error | null;
}

const EMPTY: PaymentSnapshot = {
  maxPayCap: 0n,
  computeRatioMax: 0n,
  agentBalance: 0n,
  payerAllowance: 0n,
  paymentToken: null,
};

/**
 * W3-C: pay-panel pre-flight via StateView.paymentSnapshot. One Multicall3
 * aggregate3 round-trip replaces the sequential decimals/allowance reads the
 * pay flow used to need; the facade is env-gated (undefined until the deploy
 * lane sets VITE_STATE_VIEW_ADDRESS) so callers keep their W2 fallbacks.
 */
export function usePaymentSnapshot(): PaymentSnapshotResult {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const stateView = getAxiomStateViewAddress();
  const [state, setState] = useState<{
    snapshot: PaymentSnapshot | null;
    error: Error | null;
    loadedKey: string;
  }>({ snapshot: null, error: null, loadedKey: "" });

  const key = `${stateView ?? ""}:${address ?? ""}`;

  useEffect(() => {
    if (!stateView || !address || !publicClient) {
      setState({ snapshot: null, error: null, loadedKey: key });
      return;
    }
    let cancelled = false;
    setState((prev) =>
      prev.loadedKey === key
        ? prev
        : { snapshot: null, error: null, loadedKey: key },
    );
    void aggregateReads(publicClient, [
      {
        address: stateView,
        abi: stateViewAbi,
        functionName: "paymentSnapshot",
        args: [address, 0n],
      },
    ])
      .then((results: AggregateResult[]) => {
        if (cancelled) return;
        const snap = results[0];
        if (snap?.success && Array.isArray(snap.result)) {
          const [
            maxPayCap,
            computeRatioMax,
            agentBalance,
            payerAllowance,
            paymentToken,
          ] = snap.result as [bigint, bigint, bigint, bigint, Address];
          setState({
            snapshot: {
              maxPayCap,
              computeRatioMax,
              agentBalance,
              payerAllowance,
              paymentToken,
            },
            error: null,
            loadedKey: key,
          });
        } else {
          setState({
            snapshot: null,
            error: snap?.error ?? new Error("paymentSnapshot unavailable"),
            loadedKey: key,
          });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          snapshot: null,
          error: err instanceof Error ? err : new Error("multicall failed"),
          loadedKey: key,
        });
      });
    return () => {
      cancelled = true;
    };
    // hooks: one aggregated read per (facade, wallet) pair
  }, [key, publicClient]);

  const isLoading =
    Boolean(stateView && address) &&
    state.snapshot === null &&
    state.error === null;

  return {
    snapshot: state.snapshot ?? null,
    isLoading,
    error: state.error,
  };
}

export type { PaymentSnapshot as PaymentSnapshotShape };
export { EMPTY as EMPTY_PAYMENT_SNAPSHOT };
