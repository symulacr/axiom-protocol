// Axiom Protocol — `useMint` hook.

import { useCallback, useEffect, useRef, useState } from 'react';
import { BACKEND_URL } from '../config/env.js';

export type MintInput = {
  /** AxiomAgentNFT proxy address. Defaults to the deployed Galileo proxy. */
  agentNft?: `0x${string}`;
  /** Encrypted strategy URI / 0G Storage root hash (the iNFT `dataHash`). */
  encryptedStrategyUri: `0x${string}`;
  /** TEE-sealed encryption key (the iNFT `sealedKey`). */
  sealedKey: `0x${string}`;
  /** Receiver of the minted tokenId (the connected wallet). */
  owner: `0x${string}`;
};

export type MintResult = {
  ok: boolean;
  agentNft: `0x${string}`;
  owner: `0x${string}`;
  tokenId: string;
  dataHash: `0x${string}`;
  txHash: `0x${string}`;
};

/** Hook surface for the backend mint round-trip. */
export type UseMintResult = {
  mint: (input: MintInput) => Promise<MintResult>;
  isLoading: boolean;
  error: Error | null;
  result: MintResult | null;
  /** Clear the success / error state so the form can be reused. */
  reset: () => void;
};

/**
 * Drive the backend mint round-trip.
 * Each call aborts the previous in-flight request via AbortController.
 */
export function useMint(): UseMintResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<MintResult | null>(null);

  // Ref to the active AbortController so a new call (or unmount) can
  // cancel the previous fetch. `useRef` + `useEffect` cleanup is the
  // React-idiomatic cancelable-fetch pattern.
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const mint = useCallback(async (input: MintInput): Promise<MintResult> => {
    // Cancel any in-flight request before starting a new one.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/v1/agents/mint`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(input),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      });
      if (!res.ok) {
        // The backend returns `{ error: string }` on failure.
        const text = await res.text();
        throw new Error(
          `mint failed: ${res.status} ${res.statusText} ${text}`,
        );
      }
      const data = (await res.json()) as MintResult;
      setResult(data);
      return data;
    } catch (err) {
      // AbortError happens on intentional cancel (unmount / new call) —
      // don't surface it as a user-visible error.
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      const wrapped = err instanceof Error ? err : new Error(String(err));
      setError(wrapped);
      throw wrapped;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const reset = useCallback((): void => {
    setError(null);
    setResult(null);
  }, []);

  return { mint, isLoading, error, result, reset };
}
