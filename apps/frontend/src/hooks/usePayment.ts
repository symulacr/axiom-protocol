import { useCallback } from 'react';
import type { Address } from 'viem';
import { useWriteContract } from 'wagmi';
import { useAsyncAction } from './useAsyncAction.js';
import { PAYMENT_PROCESSOR_ABI } from '@axiom/config/abis';
import { getAxiomPaymentProcessorAddress } from '../abi/addresses.js';
import { agentEarningsPath, agentRoyaltyPath } from '../utils/apiPaths.js';
import { apiFetch } from '../utils/apiFetch.js';

export type PaymentConfig = {
  paymentToken: Address;
  protocolFeeBps: number;
  protocolTreasury: Address;
};

export type EarningsInfo = {
  tokenId: string;
  creator: Address;
  earnings: string;
};

export type AgentPayResult = {
  ok: true;
  tokenId: string;
  amount: string;
  txHash: `0x${string}`;
  payment: unknown;
};



export type RoyaltyResult = {
  ok: true;
  tokenId: string;
  bps: number;
  to: `0x${string}`;
  data: `0x${string}`;
  value: string;
};

export type UsePaymentResult = {
  payForAgent: (tokenId: bigint, amount: string) => Promise<AgentPayResult>;

  getEarnings: (tokenId: bigint) => Promise<EarningsInfo>;
  setRoyalty: (tokenId: bigint, bps: number) => Promise<RoyaltyResult>;
  getPaymentConfig: () => Promise<PaymentConfig>;
  isPayLoading: boolean;
  payError: Error | null;
  isRoyaltyLoading: boolean;
  royaltyError: Error | null;
  isFetching: boolean;
  fetchError: Error | null;
  isEarningsLoading: boolean;
  earningsError: Error | null;
  resetPay: () => void;
  resetRoyalty: () => void;
  resetFetch: () => void;
  resetEarnings: () => void;
};

export function usePayment(): UsePaymentResult {
  const fetchAction = useAsyncAction();
  const earningsAction = useAsyncAction();
  const royaltyAction = useAsyncAction();

  const { writeContractAsync, isPending: isPayLoading, error: payError } = useWriteContract();

  const payForAgent = useCallback(
    async (tokenId: bigint, amount: string): Promise<AgentPayResult> => {
      const txHash = await writeContractAsync({
        address: getAxiomPaymentProcessorAddress(),
        abi: PAYMENT_PROCESSOR_ABI,
        functionName: 'payForAgent',
        args: [tokenId, BigInt(amount)],
      });
      return { ok: true, tokenId: tokenId.toString(), amount, txHash, payment: null };
    },
    [writeContractAsync],
  );

  const getEarnings = useCallback(
    (tokenId: bigint): Promise<EarningsInfo> =>
      earningsAction.execute((signal) =>
        apiFetch<EarningsInfo>(agentEarningsPath(tokenId), {
          method: 'GET',
          signal,
        }),
      ),
    [earningsAction.execute],
  );

  const setRoyalty = useCallback(
    (tokenId: bigint, bps: number): Promise<RoyaltyResult> =>
      royaltyAction.execute((signal) =>
        apiFetch<RoyaltyResult>(agentRoyaltyPath(tokenId), {
          method: 'POST',
          body: JSON.stringify({ bps }),
          signal,
        }),
      ),
    [royaltyAction.execute],
  );

  const getPaymentConfig = useCallback(
    (): Promise<PaymentConfig> =>
      fetchAction.execute((signal) =>
        apiFetch<PaymentConfig>('/v1/payment/config', {
          method: 'GET',
          signal,
        }),
      ),
    [fetchAction.execute],
  );

  return {
    payForAgent,
    getEarnings,
    setRoyalty,
    getPaymentConfig,
    isPayLoading,
    payError,
    isRoyaltyLoading: royaltyAction.isLoading,
    royaltyError: royaltyAction.error,
    isFetching: fetchAction.isLoading,
    fetchError: fetchAction.error,
    isEarningsLoading: earningsAction.isLoading,
    earningsError: earningsAction.error,
    resetPay: () => {},
    resetRoyalty: royaltyAction.reset,
    resetFetch: fetchAction.reset,
    resetEarnings: earningsAction.reset,
  };
}
