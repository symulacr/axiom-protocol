import { useCallback } from 'react';
import type { Address } from 'viem';
import { BACKEND_URL } from '../config/env.js';
import { useAsyncAction } from './useAsyncAction.js';

/** Response body of `GET /v1/payment/config`. */
export type PaymentConfig = {
  paymentToken: Address;
  protocolFeeBps: number;
  protocolTreasury: Address;
};

/** Response body of `GET /v1/agents/:id/earnings`. */
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

export type ComputePayResult = {
  ok: true;
  provider: Address;
  amount: string;
  txHash: `0x${string}`;
};

export type RoyaltyResult = {
  ok: true;
  tokenId: string;
  bps: number;
  to: `0x${string}`;
  data: `0x${string}`;
  value: string;
};

async function apiFetch<T>(
  path: string,
  init: RequestInit,
): Promise<T> {
  const signal = init.signal ?? AbortSignal.timeout(10000);
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    signal,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    // Backend returns JSON `{ error: string }`; surface the body so the
    // UI can show a meaningful message instead of just a status code.
    const text = await res.text();
    throw new Error(`${path} failed: ${res.status} ${res.statusText} ${text}`);
  }
  return (await res.json()) as T;
}

export type UsePaymentResult = {
  payForAgent: (tokenId: bigint, amount: string) => Promise<AgentPayResult>;
  payComputeProvider: (provider: Address, amount: string) => Promise<ComputePayResult>;
  getEarnings: (tokenId: bigint) => Promise<EarningsInfo>;
  setRoyalty: (tokenId: bigint, bps: number) => Promise<RoyaltyResult>;
  getPaymentConfig: () => Promise<PaymentConfig>;
  isLoading: boolean;
  error: Error | null;
};

export function usePayment(): UsePaymentResult {
  const { execute, isLoading, error } = useAsyncAction();

  const payForAgent = useCallback(
    (tokenId: bigint, amount: string): Promise<AgentPayResult> =>
      execute((signal) =>
        apiFetch<AgentPayResult>(`/v1/agents/${tokenId.toString()}/pay`, {
          method: 'POST',
          body: JSON.stringify({ amount }),
          signal,
        }),
      ),
    [execute],
  );

  const payComputeProvider = useCallback(
    (provider: Address, amount: string): Promise<ComputePayResult> =>
      execute((signal) =>
        apiFetch<ComputePayResult>('/v1/compute/pay', {
          method: 'POST',
          body: JSON.stringify({ provider, amount }),
          signal,
        }),
      ),
    [execute],
  );

  const getEarnings = useCallback(
    (tokenId: bigint): Promise<EarningsInfo> =>
      execute((signal) =>
        apiFetch<EarningsInfo>(`/v1/agents/${tokenId.toString()}/earnings`, {
          method: 'GET',
          signal,
        }),
      ),
    [execute],
  );

  const setRoyalty = useCallback(
    (tokenId: bigint, bps: number): Promise<RoyaltyResult> =>
      execute((signal) =>
        apiFetch<RoyaltyResult>(`/v1/agents/${tokenId.toString()}/royalty`, {
          method: 'POST',
          body: JSON.stringify({ bps }),
          signal,
        }),
      ),
    [execute],
  );

  const getPaymentConfig = useCallback(
    (): Promise<PaymentConfig> =>
      execute((signal) =>
        apiFetch<PaymentConfig>('/v1/payment/config', {
          method: 'GET',
          signal,
        }),
      ),
    [execute],
  );

  return {
    payForAgent,
    payComputeProvider,
    getEarnings,
    setRoyalty,
    getPaymentConfig,
    isLoading,
    error,
  };
}
