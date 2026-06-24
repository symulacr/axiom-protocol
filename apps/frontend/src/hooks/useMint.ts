import { useCallback, useState } from 'react';
import { BACKEND_URL } from '../config/env.js';
import { useAsyncAction } from './useAsyncAction.js';

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
  const [result, setResult] = useState<MintResult | null>(null);
  const { execute, isLoading, error, reset: resetAction } = useAsyncAction();

  const mint = useCallback(async (input: MintInput): Promise<MintResult> => {
    const data = await execute(async (signal) => {
      const res = await fetch(`${BACKEND_URL}/v1/agents/mint`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(input),
        signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
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
    });
    return data;
  }, [execute]);

  const reset = useCallback((): void => {
    resetAction();
    setResult(null);
  }, [resetAction]);

  return { mint, isLoading, error, result, reset };
}
