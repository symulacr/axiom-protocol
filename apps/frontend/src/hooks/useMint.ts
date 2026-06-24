import { useCallback, useEffect, useRef, useState } from 'react';
import { BACKEND_URL } from '../config/env.js';

export type MintInput = {
  agentNft?: `0x${string}`;
  encryptedStrategyUri: `0x${string}`;
  sealedKey: `0x${string}`;
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

export type UseMintResult = {
  mint: (input: MintInput) => Promise<MintResult>;
  isLoading: boolean;
  error: Error | null;
  result: MintResult | null;
  reset: () => void;
};

export function useMint(): UseMintResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<MintResult | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const mint = useCallback(async (input: MintInput): Promise<MintResult> => {
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
        const text = await res.text();
        throw new Error(
          `mint failed: ${res.status} ${res.statusText} ${text}`,
        );
      }
      const data = (await res.json()) as MintResult;
      setResult(data);
      return data;
    } catch (err) {
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
