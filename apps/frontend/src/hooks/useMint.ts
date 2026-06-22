// Axiom Protocol — `useMint` hook.
//
// POSTs to the backend `POST /v1/agents/mint` endpoint, which uploads the
// encrypted strategy bundle to the TEE oracle, calls
// `AxiomAgentNFT.mint(iDatas, owner)` with the on-chain mint fee, and
// returns the freshly-minted tokenId + transaction hash. The backend wallet
// signs the on-chain `mint()` call (the frontend is a thin client — no
// wagmi `useWriteContract` is needed for mint, unlike the transfer flow).
//
// The backend route (apps/backend/src/server.ts) expects the request body:
//
//   {
//     agentNft:            `0x${string}`  // AxiomAgentNFT proxy address
//     encryptedStrategyUri: `0x${string}` // 0G Storage root hash / dataHash
//     sealedKey:           `0x${string}`  // TEE-sealed encryption key
//     owner:               `0x${string}`  // receiver of the minted tokenId
//   }
//
// and responds with:
//
//   { ok: true, agentNft, owner, tokenId, dataHash, txHash }
//
// The hook uses the native Fetch API with an `AbortController` so an
// unmounting caller cancels the in-flight request (the previous fetch is
// aborted before a new one starts). This mirrors the fetch discipline used
// by `useOrchestratorTick` and `useTransfer`.
//
// Backend base URL is read from Vite's `VITE_BACKEND_URL` env var (the
// `VITE_` prefix keeps the value out of the server bundle and exposes it to
// the browser, per the Vite convention). Falls back to the local dev
// loopback port used by `apps/backend` (`pnpm dev` → :3000).
//
// Canonical references:
//  - MDN Fetch API: Request/Response, JSON body, error handling:
//    https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch
//  - MDN AbortController (cancelable fetch on unmount):
//    https://developer.mozilla.org/en-US/docs/Web/API/AbortController
//  - Vite environment variables (VITE_ prefix):
//    https://vitejs.dev/guide/env-and-mode
//  - EIP-721 mint + EIP-7857 iNFT dataHash / sealedKey:
//    https://eips.ethereum.org/EIPS/eip-721
//    https://eips.ethereum.org/EIPS/eip-7857

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
        signal: controller.signal,
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
