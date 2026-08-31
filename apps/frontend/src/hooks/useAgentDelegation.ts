import { useCallback, useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { aggregateReads, type AggregateResult } from "@axiom/config/multicall3";
import { DELEGATION_REGISTRY_ABI } from "@axiom/config/abis";
import type { Address } from "viem";
import {
  getAxiomDelegationRegistryAddress,
  toViemAbi,
} from "../abi/addresses.js";

const delegationRegistryAbi = toViemAbi(DELEGATION_REGISTRY_ABI);

/** getDelegation tuple — field order matches AxiomDelegationRegistry.AgentDelegation. */
export interface ActiveDelegation {
  agentTokenId: bigint;
  delegate: Address;
  perTxCap: bigint;
  windowCap: bigint;
  windowSeconds: bigint;
  expiresAt: bigint;
  allowedSelectorsRoot: `0x${string}`;
  nonce: bigint;
  isDelegationActive: boolean;
}

export interface AgentDelegationResult {
  delegation: ActiveDelegation | null;
  /** undefined while unconfigured/loading; definitive false once resolved. */
  isConfigured: boolean;
  isLoading: boolean;
  error: Error | null;
  /** Re-runs the aggregated read (post install/revoke). */
  refresh: () => void;
}

/**
 * W3-C: active-delegation read for the agent detail page. One Multicall3
 * round-trip carries getDelegation + isDelegationActive; the registry address
 * is env-gated (undefined until the deploy lane sets
 * VITE_DELEGATION_REGISTRY_ADDRESS) so the card can render a disabled state.
 */
export function useAgentDelegation(tokenId: bigint): AgentDelegationResult {
  const publicClient = usePublicClient();
  const registry = getAxiomDelegationRegistryAddress();
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<{
    delegation: ActiveDelegation | null;
    error: Error | null;
    loadedKey: string;
  }>({ delegation: null, error: null, loadedKey: "" });

  const key = `${registry ?? ""}:${tokenId.toString()}:${reload}`;

  useEffect(() => {
    if (!registry || !publicClient || tokenId <= 0n) {
      setState({ delegation: null, error: null, loadedKey: key });
      return;
    }
    let cancelled = false;
    setState((prev) =>
      prev.loadedKey === key
        ? prev
        : { delegation: null, error: null, loadedKey: key },
    );
    void aggregateReads(publicClient, [
      {
        address: registry,
        abi: delegationRegistryAbi,
        functionName: "getDelegation",
        args: [tokenId],
      },
      {
        address: registry,
        abi: delegationRegistryAbi,
        functionName: "isDelegationActive",
        args: [tokenId],
      },
    ])
      .then((results: AggregateResult[]) => {
        if (cancelled) return;
        const [del, active] = results;
        if (del?.success && Array.isArray(del.result)) {
          const [
            agentTokenId,
            delegate,
            perTxCap,
            windowCap,
            windowSeconds,
            expiresAt,
            allowedSelectorsRoot,
            nonce,
          ] = del.result as [
            bigint,
            Address,
            bigint,
            bigint,
            bigint,
            bigint,
            `0x${string}`,
            bigint,
          ];
          setState({
            delegation: {
              agentTokenId,
              delegate,
              perTxCap,
              windowCap,
              windowSeconds,
              expiresAt,
              allowedSelectorsRoot,
              nonce,
              isDelegationActive:
                active?.success === true && active.result === true,
            },
            error: null,
            loadedKey: key,
          });
        } else {
          setState({
            delegation: null,
            error: del?.error ?? new Error("getDelegation unavailable"),
            loadedKey: key,
          });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          delegation: null,
          error: err instanceof Error ? err : new Error("multicall failed"),
          loadedKey: key,
        });
      });
    return () => {
      cancelled = true;
    };
    // hooks: one aggregated read per (registry, token) pair
  }, [key, publicClient]);

  const isLoading =
    Boolean(registry && publicClient) &&
    tokenId > 0n &&
    state.delegation === null &&
    state.error === null;

  return {
    delegation: state.delegation,
    isConfigured: registry !== undefined,
    isLoading,
    error: state.error,
    refresh: useCallback(() => setReload((n) => n + 1), []),
  };
}
