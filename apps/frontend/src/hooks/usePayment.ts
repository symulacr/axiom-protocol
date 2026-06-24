import { useCallback, useEffect, useRef, useState } from 'react';
import type { Address } from 'viem';
import { BACKEND_URL } from '../config/env.js';

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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const run = useCallback(async <T,>(
    fn: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setError(null);
    try {
      return await fn(controller.signal);
    } catch (err) {
      const wrapped = err instanceof Error ? err : new Error(String(err));
      setError(wrapped);
      throw wrapped;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const payForAgent = useCallback(
    (tokenId: bigint, amount: string): Promise<AgentPayResult> =>
      run((signal) =>
        apiFetch<AgentPayResult>(`/v1/agents/${tokenId.toString()}/pay`, {
          method: 'POST',
          body: JSON.stringify({ amount }),
          signal,
        }),
      ),
    [run],
  );

  const payComputeProvider = useCallback(
    (provider: Address, amount: string): Promise<ComputePayResult> =>
      run((signal) =>
        apiFetch<ComputePayResult>('/v1/compute/pay', {
          method: 'POST',
          body: JSON.stringify({ provider, amount }),
          signal,
        }),
      ),
    [run],
  );

  const getEarnings = useCallback(
    (tokenId: bigint): Promise<EarningsInfo> =>
      run((signal) =>
        apiFetch<EarningsInfo>(`/v1/agents/${tokenId.toString()}/earnings`, {
          method: 'GET',
          signal,
        }),
      ),
    [run],
  );

  const setRoyalty = useCallback(
    (tokenId: bigint, bps: number): Promise<RoyaltyResult> =>
      run((signal) =>
        apiFetch<RoyaltyResult>(`/v1/agents/${tokenId.toString()}/royalty`, {
          method: 'POST',
          body: JSON.stringify({ bps }),
          signal,
        }),
      ),
    [run],
  );

  const getPaymentConfig = useCallback(
    (): Promise<PaymentConfig> =>
      run((signal) =>
        apiFetch<PaymentConfig>('/v1/payment/config', {
          method: 'GET',
          signal,
        }),
      ),
    [run],
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
