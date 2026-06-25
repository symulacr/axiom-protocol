import { useCallback, useState } from 'react';
import { useAsyncAction } from './useAsyncAction.js';
import { apiFetch, LONG_TIMEOUT } from '../utils/apiFetch.js';

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
  cancelMint: () => void;
  isLoading: boolean;
  error: Error | null;
  result: MintResult | null;
  registrationWarning: string | null;
  reset: () => void;
};

export function useMint(): UseMintResult {
  const [result, setResult] = useState<MintResult | null>(null);
  const [registrationWarning, setRegistrationWarning] = useState<string | null>(null);
  const { execute, cancel, isLoading, error, reset: resetAction } = useAsyncAction();

  const mint = useCallback(async (input: MintInput): Promise<MintResult> => {
    const data = await execute(async (signal) => {
      const warnTimer = setTimeout(() => {
        console.warn('[mint] Transaction is taking longer than expected. It may still complete on-chain.');
      }, 30000);

      try {
        const data = await apiFetch<MintResult>('/v1/agents/mint', {
          method: 'POST',
          body: JSON.stringify(input),
          signal,
          timeout: LONG_TIMEOUT,
        });
        setResult(data);
        setRegistrationWarning(
          "Mint succeeded on-chain. Transfers require oracle registration — ensure your oracle service is running and can reach this token's data hash."
        );
        return data;
      } finally {
        clearTimeout(warnTimer);
      }
    });
    return data;
  }, [execute]);

  const cancelMint = useCallback(() => {
    cancel();
  }, [cancel]);

  const reset = useCallback((): void => {
    resetAction();
    setResult(null);
    setRegistrationWarning(null);
  }, [resetAction]);

  return { mint, cancelMint, isLoading, error, result, registrationWarning, reset };
}
