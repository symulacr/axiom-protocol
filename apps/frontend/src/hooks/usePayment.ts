import { useCallback, useEffect, useState } from "react";
import { parseUnits, type Address } from "viem";
import { useAccount, useChainId, usePublicClient } from "wagmi";
import { useGenericWrite } from "./useGenericWrite.js";
import { useAsyncAction } from "./useAsyncAction.js";
import { PAYMENT_PROCESSOR_ABI, ERC20_ABI } from "@axiom/config/abis";
import {
  getAxiomPaymentProcessorAddress,
  toViemAbi,
} from "../abi/addresses.js";

const paymentProcessorAbi = toViemAbi(PAYMENT_PROCESSOR_ABI);
const erc20Abi = toViemAbi(ERC20_ABI);
import { waitForReceiptWithTimeout } from "./useReceiptReconcile.js";
import { agentEarningsPath, apiFetch } from "../utils/apiFetch.js";

export type PaymentConfig = {
  paymentToken: Address;
  /** On-chain ERC-20 symbol/decimals, read by the backend from the token
   * contract (the UI interpolates these, never hardcodes a unit). */
  paymentTokenSymbol: string;
  paymentTokenDecimals: number;
  protocolFeeBps: string;
  protocolTreasury: Address;
};

export type EarningsInfo = {
  tokenId: string;
  creator: Address;
  earnings: string;
};

type AgentPayResult = {
  ok: true;
  tokenId: string;
  amount: string;
  txHash: `0x${string}`;
  payment: unknown;
};

type UsePaymentResult = {
  payForAgent: (tokenId: bigint, amount: string) => Promise<AgentPayResult>;
  approveExactAllowance: (amount: string) => Promise<{
    approveHash: `0x${string}` | null;
  }>;

  /** Direct wallet write of withdrawAgentEarnings() — earnings accrue to
   * msg.sender on-chain, so no args and no allowance leg (pre-empts NoEarnings
   * is the caller's job via the earnings read). */
  withdrawEarnings: () => Promise<`0x${string}`>;
  getEarnings: (tokenId: bigint) => Promise<EarningsInfo>;
  getPaymentConfig: () => Promise<PaymentConfig>;
  isPayLoading: boolean;
};

export function usePayment(): UsePaymentResult {
  const chainId = useChainId();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const fetchAction = useAsyncAction();
  const earningsAction = useAsyncAction();

  const { write } = useGenericWrite();
  const [isPayLoading, setPayLoading] = useState(false);

  /**
   * Payment boundary 1: exact-amount approval mirrors backend ensureAllowance —
   * never MaxUint256; matches the contract's "approve for amount" requirement
   * (infinity approvals only in the E2E harness). Returns the approve hash, or
   * null when live allowance already covers amount. Caller guarantees
   * address+publicClient exist.
   */
  const ensureAllowance = useCallback(
    async (
      config: PaymentConfig,
      amountWei: bigint,
    ): Promise<`0x${string}` | null> => {
      const processor = getAxiomPaymentProcessorAddress(chainId);
      const allowance = (await publicClient!.readContract({
        address: config.paymentToken,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address!, processor],
      })) as bigint;
      if (allowance >= amountWei) return null;
      const approveHash = await write({
        to: config.paymentToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [processor, amountWei],
      });
      await waitForReceiptWithTimeout(publicClient!, approveHash);
      return approveHash;
    },
    [chainId, write, address, publicClient],
  );

  const getPaymentConfig = useCallback(
    (): Promise<PaymentConfig> =>
      fetchAction.execute((signal) =>
        apiFetch<PaymentConfig>("/v1/payment/config", {
          method: "GET",
          signal,
        }),
      ),
    [fetchAction.execute],
  );

  const payForAgent = useCallback(
    async (tokenId: bigint, amount: string): Promise<AgentPayResult> => {
      setPayLoading(true);
      try {
        const processor = getAxiomPaymentProcessorAddress(chainId);
        // Human units ("1.5") → on-chain base units via payment config; never BigInt(amount) — it throws.
        const config = await getPaymentConfig();
        const amountWei = parseUnits(
          amount.trim(),
          config.paymentTokenDecimals ?? 6,
        );
        if (address && publicClient) await ensureAllowance(config, amountWei);
        const txHash = await write({
          to: processor,
          abi: paymentProcessorAbi,
          functionName: "payForAgent",
          args: [tokenId, amountWei],
        });
        return {
          ok: true,
          tokenId: tokenId.toString(),
          amount,
          txHash,
          payment: { txHash },
        };
      } finally {
        setPayLoading(false);
      }
    },
    [chainId, write, address, publicClient, getPaymentConfig, ensureAllowance],
  );

  /**
   * Payment boundary 1: the REAL approve leg split out of payForAgent so the "Approve exact
   * allowance" CTA actually prompts; no-op (approveHash: null) when live allowance covers amount.
   */
  const approveExactAllowance = useCallback(
    async (amount: string): Promise<{ approveHash: `0x${string}` | null }> => {
      setPayLoading(true);
      try {
        if (!address || !publicClient) throw new Error("wallet not connected");
        const config = await getPaymentConfig();
        // On-chain token decimals from the config — never a constant.
        const amountWei = parseUnits(
          amount.trim(),
          config.paymentTokenDecimals ?? 6,
        );
        return { approveHash: await ensureAllowance(config, amountWei) };
      } finally {
        setPayLoading(false);
      }
    },
    [address, publicClient, getPaymentConfig, ensureAllowance],
  );

  const getEarnings = useCallback(
    (tokenId: bigint): Promise<EarningsInfo> =>
      earningsAction.execute((signal) =>
        apiFetch<EarningsInfo>(agentEarningsPath(tokenId), {
          method: "GET",
          signal,
        }),
      ),
    [earningsAction.execute],
  );

  // Mirrors the sibling paymentProcessor writes (payForAgent/approveExactAllowance):
  // calldata encoded locally from the shared ABI, sent through useGenericWrite —
  // the POST /v1/payment/withdraw-earnings relay stays a chat-runtime surface.
  const withdrawEarnings = useCallback(async (): Promise<`0x${string}`> => {
    if (!address || !publicClient) throw new Error("wallet not connected");
    return write({
      to: getAxiomPaymentProcessorAddress(chainId),
      abi: paymentProcessorAbi,
      functionName: "withdrawAgentEarnings",
      args: [],
    });
  }, [chainId, write, address, publicClient]);

  return {
    payForAgent,
    approveExactAllowance,
    withdrawEarnings,
    getEarnings,
    getPaymentConfig,
    isPayLoading,
  };
}

/*
  Payment-token symbol/decimals resolved once from the backend config and memoized at module scope —
  one unit source so form suffix, confirm CTA and fact rows can never diverge or hardcode a token.
*/

export type PaymentTokenMeta = { symbol: string; decimals: number };

/** Neutral unit placeholder while the config fetch is in flight (or when the
 * backend is unreachable — the flow's allowance/execute path needs the same
 * endpoint, so a down backend blocks execution anyway). Every consumer uses
 * this SAME fallback, so the form and the confirm CTA never diverge. */
export const PAYMENT_SYMBOL_PENDING = "…";

type PaymentConfigResponse = {
  paymentToken: string;
  paymentTokenSymbol?: string;
  paymentTokenDecimals?: number;
};

let cached: PaymentTokenMeta | null = null;
let inflight: Promise<PaymentTokenMeta | null> | null = null;

function fetchMeta(): Promise<PaymentTokenMeta | null> {
  inflight ??= apiFetch<PaymentConfigResponse>("/v1/payment/config", {
    method: "GET",
  })
    .then((config) => {
      cached = config.paymentTokenSymbol
        ? {
            symbol: config.paymentTokenSymbol,
            decimals: config.paymentTokenDecimals ?? 6,
          }
        : null;
      return cached;
    })
    .catch(() => {
      inflight = null; // allow a retry on the next mount
      return null;
    });
  return inflight;
}

/** Payment-token metadata; null until the first successful read resolves. */
export function usePaymentToken(): PaymentTokenMeta | null {
  const [meta, setMeta] = useState<PaymentTokenMeta | null>(cached);
  useEffect(() => {
    if (cached) {
      setMeta(cached);
      return;
    }
    let alive = true;
    void fetchMeta().then((resolved) => {
      if (alive) setMeta(resolved);
    });
    return () => {
      alive = false;
    };
  }, []);
  return meta;
}

/** Display symbol with the shared pending fallback. */
export function paymentSymbolOf(meta: PaymentTokenMeta | null): string {
  return meta?.symbol ?? PAYMENT_SYMBOL_PENDING;
}
