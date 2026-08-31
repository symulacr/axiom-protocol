import { useCallback, useEffect, useState } from "react";
import { parseUnits, type Address } from "viem";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useSignTypedData,
} from "wagmi";
import { useGenericWrite } from "./useGenericWrite.js";
import { useAsyncAction } from "./useAsyncAction.js";
import { PAYMENT_PROCESSOR_ABI, ERC20_ABI } from "@axiom/config/abis";
import {
  buildPermit2WitnessTypedData,
  type PermitTransferFrom,
} from "../lib/permit2.js";
import {
  getAxiomPaymentProcessorAddress,
  toViemAbi,
} from "../abi/addresses.js";

const paymentProcessorAbi = toViemAbi(PAYMENT_PROCESSOR_ABI);
const erc20Abi = toViemAbi(ERC20_ABI);
import { waitForReceiptWithTimeout } from "./useReceiptReconcile.js";
import { agentEarningsPath, apiFetch } from "../utils/apiFetch.js";

type PaymentConfig = {
  paymentToken: Address;
  /** On-chain ERC-20 symbol/decimals, read by the backend from the token
   * contract (the UI interpolates these, never hardcodes a unit). Decimals
   * may be absent on the wire; all parseUnits sites fall back to 18. */
  paymentTokenSymbol: string;
  paymentTokenDecimals: number;
  protocolFeeBps: string;
};

type EarningsInfo = {
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

/** Which settle lane executed: "permit2" = witness-permit signature + one write,
 * "approval" = the pre-existing approve + payForAgent path. */
export type PaymentLane = "permit2" | "approval";

export type Permit2PayResult = AgentPayResult & { lane: PaymentLane };

type UsePaymentResult = {
  payForAgent: (tokenId: bigint, amount: string) => Promise<AgentPayResult>;
  /** W3-C: Permit2 witness lane. Falls back to the approve+pay path when the
   * wallet's live allowance already covers the amount (no re-signing for
   * nothing; one migration-safe code path either way). */
  payForAgentWithPermit2: (
    tokenId: bigint,
    amount: string,
  ) => Promise<Permit2PayResult>;
  /** Live processor allowance vs amount — the lane-selection gate. */
  hasSufficientAllowance: (amount: string) => Promise<boolean>;
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
  const { signTypedDataAsync } = useSignTypedData();
  const [isPayLoading, setPayLoading] = useState(false);

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

  /**
   * Payment boundary 1: shared approval leg — config fetch + human→base-unit
   * conversion via the LIVE token decimals (never BigInt(amount), it throws;
   * fallback 18 when absent on the wire), then an exact-amount approve
   * mirroring backend ensureAllowance — never MaxUint256. The allowance
   * read/approve needs the wallet, so it is skipped when disconnected (null
   * hash) — callers either fail their own write or have pre-guarded.
   */
  const priceAndApprove = useCallback(
    async (
      amount: string,
    ): Promise<{ amountWei: bigint; approveHash: `0x${string}` | null }> => {
      const config = await getPaymentConfig();
      const amountWei = parseUnits(
        amount.trim(),
        config.paymentTokenDecimals ?? 18,
      );
      if (!address || !publicClient) return { amountWei, approveHash: null };
      const processor = getAxiomPaymentProcessorAddress(chainId);
      const allowance = (await publicClient.readContract({
        address: config.paymentToken,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, processor],
      })) as bigint;
      if (allowance >= amountWei) return { amountWei, approveHash: null };
      const approveHash = await write({
        to: config.paymentToken,
        abi: erc20Abi,
        functionName: "approve",
        args: [processor, amountWei],
      });
      await waitForReceiptWithTimeout(publicClient, approveHash);
      return { amountWei, approveHash };
    },
    [chainId, write, address, publicClient, getPaymentConfig],
  );

  const payForAgent = useCallback(
    async (tokenId: bigint, amount: string): Promise<AgentPayResult> => {
      setPayLoading(true);
      try {
        const processor = getAxiomPaymentProcessorAddress(chainId);
        const { amountWei } = await priceAndApprove(amount);
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
    [chainId, write, address, publicClient, priceAndApprove],
  );

  /** Live processor allowance vs amount — the Permit2-vs-approval lane gate. */
  const hasSufficientAllowance = useCallback(
    async (amount: string): Promise<boolean> => {
      if (!address || !publicClient) return false;
      const config = await getPaymentConfig();
      const amountWei = parseUnits(
        amount.trim(),
        config.paymentTokenDecimals ?? 18,
      );
      const processor = getAxiomPaymentProcessorAddress(chainId);
      const allowance = (await publicClient.readContract({
        address: config.paymentToken,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, processor],
      })) as bigint;
      return allowance >= amountWei;
    },
    [chainId, address, publicClient, getPaymentConfig],
  );

  /**
   * Payment boundary 3 (W3-C): Permit2 witness settlement. Sequence:
   *   1. lane gate — allowance already covers amount → existing approve+pay path
   *      (lane: "approval"), skipping a needless wallet signature;
   *   2. build Permit2 typed data (domain name "Permit2"/chainId/PERMIT2, types =
   *      PermitWitnessTransferFrom + TokenPermissions + AgentPayment — byte-matching
   *      the Processor's witness variant) and ask the wallet to sign;
   *   3. one write: payForAgentWithPermit2(agentTokenId, amount, owner, permit, sig).
   * No approve tx ever happens on this lane — the signature IS the authorization.
   */
  const payForAgentWithPermit2 = useCallback(
    async (tokenId: bigint, amount: string): Promise<Permit2PayResult> => {
      setPayLoading(true);
      try {
        if (!address || !publicClient) throw new Error("wallet not connected");
        // Lane gate: a sufficient standing allowance uses the migration-proven path.
        if (await hasSufficientAllowance(amount)) {
          const result = await payForAgent(tokenId, amount);
          return { ...result, lane: "approval" };
        }
        const config = await getPaymentConfig();
        const amountWei = parseUnits(
          amount.trim(),
          config.paymentTokenDecimals ?? 18,
        );
        const processor = getAxiomPaymentProcessorAddress(chainId);
        // Sign BEFORE any state change: the permit is single-use (unordered nonce)
        // and expires; a failed write burns nothing but the user's signature.
        const { domain, types, primaryType, message, permit } =
          buildPermit2WitnessTypedData({
            chainId,
            paymentToken: config.paymentToken,
            permittedAmount: amountWei,
            payAmount: amountWei,
            spender: processor,
            agentTokenId: tokenId,
            // 30 minutes — generous for wallet prompts, tight against phishing reuse.
            deadline: BigInt(Math.floor(Date.now() / 1000) + 30 * 60),
          });
        const signature = await signTypedDataAsync({
          domain,
          types,
          primaryType,
          message,
        });
        const txHash = await write({
          to: processor,
          abi: paymentProcessorAbi,
          functionName: "payForAgentWithPermit2",
          args: [
            tokenId,
            amountWei,
            address,
            permit as PermitTransferFrom,
            signature,
          ],
        });
        return {
          ok: true,
          tokenId: tokenId.toString(),
          amount,
          txHash,
          payment: { txHash },
          lane: "permit2",
        };
      } finally {
        setPayLoading(false);
      }
    },
    [
      chainId,
      write,
      address,
      publicClient,
      signTypedDataAsync,
      hasSufficientAllowance,
      payForAgent,
      getPaymentConfig,
    ],
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
        return { approveHash: (await priceAndApprove(amount)).approveHash };
      } finally {
        setPayLoading(false);
      }
    },
    [address, publicClient, priceAndApprove],
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
    payForAgentWithPermit2,
    hasSufficientAllowance,
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

type PaymentTokenMeta = {
  paymentToken?: string;
  symbol: string;
  decimals: number;
};

/** Neutral unit placeholder while the config fetch is in flight (or when the
 * backend is unreachable — the flow's allowance/execute path needs the same
 * endpoint, so a down backend blocks execution anyway). Every consumer uses
 * this SAME fallback, so the form and the confirm CTA never diverge. */
const PAYMENT_SYMBOL_PENDING = "…";

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
            paymentToken: config.paymentToken,
            symbol: config.paymentTokenSymbol,
            decimals: config.paymentTokenDecimals ?? 18,
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
