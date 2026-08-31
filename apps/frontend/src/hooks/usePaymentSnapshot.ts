import { useEffect, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { aggregateReads, type AggregateResult } from "@axiom/config/multicall3";
import { PAYMENT_PROCESSOR_ABI } from "@axiom/config/abis";
import type { Address } from "viem";
import {
  getAxiomPaymentProcessorAddress,
  toViemAbi,
} from "../abi/addresses.js";

const processorAbi = toViemAbi(PAYMENT_PROCESSOR_ABI);

/** W4 statefold paymentSnapshot shape (Processor view, ex-AxiomStateView): every fact
 * payForAgent checks, in ONE call — itself batched into ONE Multicall3 round-trip. */
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
 * W4 statefold: pay-panel pre-flight via Processor.paymentSnapshot (the
 * retired AxiomStateView facade was folded into the upgraded Processor). One
 * Multicall3 aggregate3 round-trip replaces the sequential decimals/allowance
 * reads the pay flow used to need; the Processor address is env-sourced.
 */
export function usePaymentSnapshot(): PaymentSnapshotResult {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const processor = getAxiomPaymentProcessorAddress();
  const [state, setState] = useState<{
    snapshot: PaymentSnapshot | null;
    error: Error | null;
    loadedKey: string;
  }>({ snapshot: null, error: null, loadedKey: "" });

  const key = `${processor ?? ""}:${address ?? ""}`;

  useEffect(() => {
    if (!processor || !address || !publicClient) {
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
        address: processor,
        abi: processorAbi,
        functionName: "paymentSnapshot",
        args: [address, 0n],
      },
    ])
      .then((results: AggregateResult[]) => {
        if (cancelled) return;
        const snap = results[0];
        if (snap?.success && Array.isArray(snap.result)) {
          // guard test pins this order: cap, ratio, balance, allowance, token
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
    // hooks: one aggregated read per (processor, wallet) pair
  }, [key, publicClient]);

  const isLoading =
    Boolean(processor && address) &&
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
