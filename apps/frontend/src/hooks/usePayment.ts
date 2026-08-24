import { useCallback, useState } from "react";
import { parseUnits, type Address } from "viem";
import { useAccount, useChainId, usePublicClient } from "wagmi";
import { useGenericWrite } from "./useGenericWrite.js";
import { useAsyncAction } from "./useAsyncAction.js";
import { PAYMENT_PROCESSOR_ABI, ERC20_ABI } from "@axiom/config/abis";
import { toViemAbi } from "../lib/abi.js";

const paymentProcessorAbi = toViemAbi(PAYMENT_PROCESSOR_ABI);
const erc20Abi = toViemAbi(ERC20_ABI);
import { getAxiomPaymentProcessorAddress } from "../abi/addresses.js";
import { waitForReceiptWithTimeout } from "./useReceiptReconcile.js";
import {
  agentEarningsPath,
  agentRoyaltyPath,
  apiFetch,
} from "../utils/apiFetch.js";

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

type RoyaltyResult = {
  ok: true;
  tokenId: string;
  bps: number;
  to: `0x${string}`;
  data: `0x${string}`;
  value: string;
};

type UsePaymentResult = {
  payForAgent: (tokenId: bigint, amount: string) => Promise<AgentPayResult>;
  approveExactAllowance: (amount: string) => Promise<{
    approveHash: `0x${string}` | null;
  }>;

  getEarnings: (tokenId: bigint) => Promise<EarningsInfo>;
  setRoyalty: (tokenId: bigint, bps: number) => Promise<RoyaltyResult>;
  getPaymentConfig: () => Promise<PaymentConfig>;
  isPayLoading: boolean;
  isRoyaltyLoading: boolean;
  fetchError: Error | null;
  earningsError: Error | null;
};

export function usePayment(): UsePaymentResult {
  const chainId = useChainId();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const fetchAction = useAsyncAction();
  const earningsAction = useAsyncAction();
  const royaltyAction = useAsyncAction();

  const { write } = useGenericWrite();
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
        // Exact-amount approval mirrors backend ensureAllowance — never MaxUint256; matches the contract's "approve for amount" requirement (infinity approvals only in the E2E harness)
        if (address && publicClient) {
          const allowance = (await publicClient.readContract({
            address: config.paymentToken,
            abi: erc20Abi,
            functionName: "allowance",
            args: [address, processor],
          })) as bigint;
          if (allowance < amountWei) {
            const approveHash = await write({
              to: config.paymentToken,
              abi: erc20Abi,
              functionName: "approve",
              args: [processor, amountWei],
            });
            await waitForReceiptWithTimeout(publicClient, approveHash);
          }
        }
        const txHash = await write({
          to: processor,
          abi: paymentProcessorAbi,
          functionName: "payForAgent",
          args: [tokenId, amountWei],
        });
        setPayLoading(false);
        return {
          ok: true,
          tokenId: tokenId.toString(),
          amount,
          txHash,
          payment: { txHash },
        };
      } catch (err) {
        setPayLoading(false);
        throw err;
      }
    },
    [chainId, write, address, publicClient, getPaymentConfig],
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
        const processor = getAxiomPaymentProcessorAddress(chainId);
        const config = await getPaymentConfig();
        // On-chain token decimals from the config — never a constant.
        const amountWei = parseUnits(
          amount.trim(),
          config.paymentTokenDecimals ?? 6,
        );
        const allowance = (await publicClient.readContract({
          address: config.paymentToken,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, processor],
        })) as bigint;
        if (allowance >= amountWei) return { approveHash: null };
        const approveHash = await write({
          to: config.paymentToken,
          abi: erc20Abi,
          functionName: "approve",
          args: [processor, amountWei],
        });
        await waitForReceiptWithTimeout(publicClient, approveHash);
        return { approveHash };
      } finally {
        setPayLoading(false);
      }
    },
    [chainId, write, address, publicClient, getPaymentConfig],
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

  const setRoyalty = useCallback(
    (tokenId: bigint, bps: number): Promise<RoyaltyResult> =>
      royaltyAction.execute((signal) =>
        apiFetch<RoyaltyResult>(agentRoyaltyPath(tokenId), {
          method: "POST",
          body: JSON.stringify({ bps }),
          signal,
        }),
      ),
    [royaltyAction.execute],
  );

  return {
    payForAgent,
    approveExactAllowance,
    getEarnings,
    setRoyalty,
    getPaymentConfig,
    isPayLoading,
    isRoyaltyLoading: royaltyAction.isLoading,
    fetchError: fetchAction.error,
    earningsError: earningsAction.error,
  };
}
