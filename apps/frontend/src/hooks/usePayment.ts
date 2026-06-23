// Axiom Protocol — `usePayment` hook.
//
// Typed HTTP wrapper for the backend's five payment routes:
// POST /v1/agents/:id/pay, POST /v1/compute/pay, GET /v1/agents/:id/earnings,
// POST /v1/agents/:id/royalty, GET /v1/payment/config.

import { useCallback, useState } from 'react';
import type { Address } from 'viem';

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ?? 'http://127.0.0.1:3000';

/** Response body of `GET /v1/payment/config`. */
export type PaymentConfig = {
  /** ERC-20 payment token (USDC.e / USDG) contract address. */
  paymentToken: Address;
  /** Protocol fee in basis points (0–10000). */
  protocolFeeBps: number;
  /** Treasury address that receives the protocol cut. */
  protocolTreasury: Address;
};

/** Response body of `GET /v1/agents/:id/earnings`. */
export type EarningsInfo = {
  /** Token id queried. */
  tokenId: string;
  /** Creator address whose balance was read. */
  creator: Address;
  /** Withdrawable creator earnings, smallest token unit (string). */
  earnings: string;
};

/** Response body of `POST /v1/agents/:id/pay`. */
export type AgentPayResult = {
  ok: true;
  tokenId: string;
  amount: string;
  txHash: `0x${string}`;
  payment: unknown;
};

/** Response body of `POST /v1/compute/pay`. */
export type ComputePayResult = {
  ok: true;
  provider: Address;
  amount: string;
  txHash: `0x${string}`;
};

/** Response body of `POST /v1/agents/:id/royalty`. */
export type RoyaltyResult = {
  ok: true;
  tokenId: string;
  bps: number;
  txHash: `0x${string}`;
};

/**
 * Shared fetch helper. Throws an `Error` on non-2xx so the hook's
 * `try / catch` can wrap it into state. Mirrors the pattern in
 * `useOrchestratorTick.ts` so the whole codebase surfaces backend
 * failures the same way.
 */
async function apiFetch<T>(
  path: string,
  init: RequestInit,
): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    signal: AbortSignal.timeout(10000),
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

/** Hook surface returned by `usePayment()`. */
export type UsePaymentResult = {
  payForAgent: (tokenId: bigint, amount: string) => Promise<AgentPayResult>;
  payComputeProvider: (
    provider: Address,
    amount: string,
  ) => Promise<ComputePayResult>;
  getEarnings: (tokenId: bigint) => Promise<EarningsInfo>;
  setRoyalty: (tokenId: bigint, bps: number) => Promise<RoyaltyResult>;
  getPaymentConfig: () => Promise<PaymentConfig>;
  /** True while any action is in flight. */
  isLoading: boolean;
  /** Last error from any action; cleared on the next successful call. */
  error: Error | null;
};

/**
 * HTTP client for the backend's payment routes. Each action is a thin
 * `fetch` wrapper that sets `isLoading` for the duration and stores
 * any thrown error in `error`. Actions re-throw so the caller can
 * also react in-line (e.g. show a toast) — matching
 * `useOrchestratorTick`'s contract.
 */
export function usePayment(): UsePaymentResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const run = useCallback(async <T,>(
    fn: () => Promise<T>,
  ): Promise<T> => {
    setIsLoading(true);
    setError(null);
    try {
      return await fn();
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
      run(() =>
        apiFetch<AgentPayResult>(`/v1/agents/${tokenId.toString()}/pay`, {
          method: 'POST',
          body: JSON.stringify({ amount }),
        }),
      ),
    [run],
  );

  const payComputeProvider = useCallback(
    (provider: Address, amount: string): Promise<ComputePayResult> =>
      run(() =>
        apiFetch<ComputePayResult>('/v1/compute/pay', {
          method: 'POST',
          body: JSON.stringify({ provider, amount }),
        }),
      ),
    [run],
  );

  const getEarnings = useCallback(
    (tokenId: bigint): Promise<EarningsInfo> =>
      run(() =>
        apiFetch<EarningsInfo>(`/v1/agents/${tokenId.toString()}/earnings`, {
          method: 'GET',
        }),
      ),
    [run],
  );

  const setRoyalty = useCallback(
    (tokenId: bigint, bps: number): Promise<RoyaltyResult> =>
      run(() =>
        apiFetch<RoyaltyResult>(`/v1/agents/${tokenId.toString()}/royalty`, {
          method: 'POST',
          body: JSON.stringify({ bps }),
        }),
      ),
    [run],
  );

  const getPaymentConfig = useCallback(
    (): Promise<PaymentConfig> =>
      run(() =>
        apiFetch<PaymentConfig>('/v1/payment/config', {
          method: 'GET',
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
