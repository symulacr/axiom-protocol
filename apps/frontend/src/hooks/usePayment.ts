import { useCallback, useState } from "react";
import type { Address } from "viem";
import { useAccount, useChainId, usePublicClient } from "wagmi";
import { useGenericWrite } from "./useGenericWrite.js";
import { useAsyncAction } from "./useAsyncAction.js";
import { PAYMENT_PROCESSOR_ABI, ERC20_ABI } from "@axiom/config/abis";

const paymentProcessorAbi = PAYMENT_PROCESSOR_ABI;
import { getAxiomPaymentProcessorAddress } from "../abi/addresses.js";
import {
  agentEarningsPath,
  agentRoyaltyPath,
  apiFetch,
} from "../utils/apiFetch.js";

export type PaymentConfig = {
  paymentToken: Address;
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
        // Exact-amount approval mirrors backend ensureAllowance — never MaxUint256; matches the contract's "approve for amount" requirement (infinity approvals only in the E2E harness)
        if (address && publicClient) {
          const config = await getPaymentConfig();
          const allowance = (await publicClient.readContract({
            address: config.paymentToken,
            abi: ERC20_ABI,
            functionName: "allowance",
            args: [address, processor],
          })) as bigint;
          if (allowance < BigInt(amount)) {
            const approveHash = await write({
              to: config.paymentToken,
              abi: ERC20_ABI,
              functionName: "approve",
              args: [processor, BigInt(amount)],
            });
            await publicClient.waitForTransactionReceipt({ hash: approveHash });
          }
        }
        const txHash = await write({
          to: processor,
          abi: paymentProcessorAbi,
          functionName: "payForAgent",
          args: [tokenId, BigInt(amount)],
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
    getEarnings,
    setRoyalty,
    getPaymentConfig,
    isPayLoading,
    isRoyaltyLoading: royaltyAction.isLoading,
    fetchError: fetchAction.error,
    earningsError: earningsAction.error,
  };
}
