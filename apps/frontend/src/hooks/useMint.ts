// Axiom Protocol — `useMint` hook.
//
// POSTs to `POST /v1/agents/mint`. The backend wallet signs the on-chain
// `mint()` call. Uses native fetch with AbortController for cancelation,
// mirroring the discipline in `useOrchestratorTick` and `useTransfer`.

import { useCallback, useEffect, useRef, useState } from 'react';

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ?? 'http://127.0.0.1:3000';

/**
 * Input to `useMint().mint(...)`. The caller supplies the encrypted
 * strategy pointer + sealed key (produced off-chain by the TEE oracle's
 * upload step) and the owner address (usually the connected wallet).
 */
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

/**
 * The backend's response to `POST /v1/agents/mint`. `tokenId` is a decimal
 * string (ERC-721 tokenIds are uint256; JSON has no bigint natively).
 */
export type MintResult = {
  ok: boolean;
  agentNft: `0x${string}`;
  owner: `0x${string}`;
  tokenId: string;
  dataHash: `0x${string}`;
  txHash: `0x${string}`;
};

/**
 * Hook surface. `mint` kicks off the backend mint round-trip; `result`
 * holds the last successful response so the UI can render the success
 * state (tokenId + tx hash + link to `/agents/:tokenId`).
 */
export type UseMintResult = {
  mint: (input: MintInput) => Promise<MintResult>;
  isLoading: boolean;
  error: Error | null;
  result: MintResult | null;
  /** Clear the success / error state so the form can be reused. */
  reset: () => void;
};

/**
 * Drive the backend mint round-trip. The hook owns a single in-flight
 * `AbortController`: each new `mint()` call aborts the previous one, and
 * unmounting the calling component aborts whatever is in flight (via the
 * cleanup effect). This keeps stale responses from overwriting fresh UI
 * state when the user double-submits or navigates away mid-request.
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
