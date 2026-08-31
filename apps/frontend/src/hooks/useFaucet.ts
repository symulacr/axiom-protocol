import { useCallback, useEffect, useState } from "react";
import { formatUnits, type Address } from "viem";
import { usePublicClient } from "wagmi";
import { ERC20_ABI } from "@axiom/config/abis";
import { toViemAbi } from "../abi/addresses.js";
import { apiFetch } from "../utils/apiFetch.js";

const erc20Abi = toViemAbi(ERC20_ABI);

/** axmUSDC is a 6-decimal mock — the format needs the unit explicitly. */
const USDC_DECIMALS = 6;

interface FaucetStatus {
  eligible: boolean;
  amount: string;
  token: string;
}

/**
 * Testnet axmUSDC faucet (V3 W6-B): live balance + eligibility badge + the
 * claim action. Claiming POSTs /v1/relayer/faucet/:address — the relayer
 * mints directly (mint is permissionless; no user signature involved).
 */
export function useFaucet(address: Address | undefined): {
  balance: string | null;
  eligible: boolean;
  claiming: boolean;
  claim: () => Promise<boolean>;
} {
  const publicClient = usePublicClient();
  const [balance, setBalance] = useState<string | null>(null);
  const [eligible, setEligible] = useState(false);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    if (!address || !publicClient) {
      setBalance(null);
      setEligible(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [raw, status] = await Promise.all([
          publicClient.readContract({
            address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address],
          }) as Promise<bigint>,
          apiFetch<FaucetStatus>(`/v1/relayer/faucet/${address}`),
        ]);
        if (cancelled) return;
        setBalance(formatUnits(raw, USDC_DECIMALS).replace(/\.0+$/, "") || "0");
        setEligible(status?.eligible === true);
      } catch {
        // Balance stays null, eligibility degrades to the ineligible badge.
        if (!cancelled) setEligible(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, publicClient]);

  const claim = useCallback(async (): Promise<boolean> => {
    if (!address || claiming) return false;
    setClaiming(true);
    try {
      const res = await apiFetch<{ ok?: boolean; dripped?: boolean }>(
        `/v1/relayer/faucet/${address}`,
        { method: "POST" },
      );
      if (res?.dripped !== undefined) setEligible(false);
      return res?.dripped === true;
    } catch {
      return false;
    } finally {
      setClaiming(false);
    }
  }, [address, claiming]);

  return { balance, eligible, claiming, claim };
}
