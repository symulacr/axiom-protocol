import { useCallback, useEffect, useState } from 'react';
import { useAccount, useSignTypedData, useWriteContract } from 'wagmi';
import { type Hex } from 'viem';

import { getAxiomAgentNftAddress } from '../abi/addresses.js';
import { ITRANSFER_FROM_ABI } from '@axiom/config/abis';

import { useAsyncAction } from './useAsyncAction.js';
import { useEip712Domain, ACCESS_PROOF_TYPES } from '../abi/eip712.js';
import { agentTransferPath } from '../utils/apiPaths.js';
import { apiFetch, LONG_TIMEOUT } from '../utils/apiFetch.js';
import type {
  TransferInput,
  AccessProofStruct,
  OwnershipProofStruct,
  TransferResponse,
  TransferPhase,
} from '@axiom/config/types/transfer';
export type { TransferInput, AccessProofStruct, OwnershipProofStruct, TransferResponse, TransferPhase };
export type UseTransferResult = {
  prepare: (input: TransferInput) => Promise<TransferResponse>;
  confirm: (input: TransferInput) => Promise<Hex>;
  transfer: (input: TransferInput) => Promise<Hex>;
  isLoading: boolean;
  error: Error | null;
  signature: TransferResponse | null;
  reset: () => void;
  transferPhase: TransferPhase;
};

function useWarnTimeout(message: string, delay: number, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => console.warn(message), delay);
    return () => clearTimeout(timer);
  }, [message, delay, active]);
}

export function useTransfer(): UseTransferResult {
  const { address: from } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync, isPending: isWritePending, error: writeError, reset: resetWrite } =
    useWriteContract();
  const { domain } = useEip712Domain();

  const [signature, setSignature] = useState<TransferResponse | null>(null);
  const [transferPhase, setTransferPhase] = useState<TransferPhase>('idle');
  const { execute, isLoading: actionLoading, error: actionError, reset: resetAction } =
    useAsyncAction();
  const isLoading = actionLoading || isWritePending;
  useWarnTimeout('[transfer] Challenge phase is taking longer than expected. The oracle may be processing.', 30000, isLoading);
  useWarnTimeout('[transfer] Finalization is taking longer than expected. The transaction may still complete.', 30000, isLoading);

  const prepare = useCallback(
    async (input: TransferInput): Promise<TransferResponse> => {
      if (!from) {
        throw new Error('wallet not connected');
      }
      if (input.receiverPubKey64.length !== 130) {
        throw new Error(
          'receiverPubKey64 must be 0x-prefixed 64 raw bytes (X||Y, no 0x04 prefix)',
        );
      }

      return execute(async (signal) => {
        const path = agentTransferPath(input.tokenId);

        setTransferPhase('challenge');

        // Step 1 — challenge (backend returns proof params).
        const challengeBody: Record<string, unknown> = {
          to: input.to,
          receiverPubKey64: input.receiverPubKey64,
          accessProofNonce: BigInt(input.accessProofNonce).toString(),
        };
        if (input.oldDataEncryptionKey && input.oldDataUri) {
          challengeBody.oldDataEncryptionKey = input.oldDataEncryptionKey;
          challengeBody.oldDataUri = input.oldDataUri;
        }
        const challenge = await apiFetch<TransferResponse>(path, {
          method: 'POST',
          body: JSON.stringify(challengeBody),
          signal,
          timeout: LONG_TIMEOUT,
        });
        if (!challenge.ok || challenge.stage !== 'challenge') {
          throw new Error('backend did not return a transfer challenge. Challenge failed — generate a new nonce and try again.');
        }
        if (
          !challenge.dataHash ||
          !challenge.targetPubkey ||
          challenge.accessProofNonce === undefined ||
          challenge.validUntil === undefined
        ) {
          throw new Error('incomplete transfer challenge from backend — generate a new nonce and start over');
        }

        setTransferPhase('signing');

        // Step 2 — receiver signs EIP-712 AccessProof.
        const nonce = BigInt(challenge.accessProofNonce);
        const validUntil = BigInt(challenge.validUntil);
        const proofDataHash = challenge.rekeyed && challenge.newDataHash
          ? challenge.newDataHash
          : challenge.dataHash;
        const accessSignature = await signTypedDataAsync({
          domain,
          types: ACCESS_PROOF_TYPES,
          primaryType: 'AccessProof',
          message: {
            dataHash: proofDataHash,
            targetPubkey: challenge.targetPubkey,
            to: input.to,
            nft: getAxiomAgentNftAddress(),
            nonce,
            validUntil,
          },
          account: from,
        });

        setTransferPhase('finalizing');

        // Step 3 — finalize (backend builds on-chain structs from signed proof).
        let proof = await apiFetch<TransferResponse>(path, {
          method: 'POST',
          signal,
          timeout: LONG_TIMEOUT,
          body: JSON.stringify({
            to: input.to,
            receiverPubKey64: input.receiverPubKey64,
            dataHash: proofDataHash,
            sealedKey: challenge.sealedKey,
            accessProof: {
              dataHash: proofDataHash,
              targetPubkey: challenge.targetPubkey,
              nonce: nonce.toString(),
              proof: accessSignature,
              validUntil: validUntil.toString(),
            },
          }),
        });
        if (!proof.ok || proof.stage !== 'final') {
          throw new Error('backend did not return final proof structs. Finalization failed — transaction was NOT submitted. Click "Prepare Transfer" to restart.');
        }
        if (!proof.accessProof || !proof.ownershipProof) {
          throw new Error('incomplete proof structs from backend. Finalization failed — transaction was NOT submitted. Click "Prepare Transfer" to restart.');
        }
        // Carry re-key status forward for the modal.
        if (challenge.rekeyed) {
          proof = { ...proof, rekeyed: true, newDataHash: challenge.newDataHash, newDataUri: challenge.newDataUri };
        }
        setSignature(proof);
        setTransferPhase('idle');
        return proof;
      });
    },
    [from, domain, signTypedDataAsync, execute],
  );

  const confirm = useCallback(
    async (input: TransferInput): Promise<Hex> => {
      if (!from) {
        throw new Error('wallet not connected');
      }
      if (!signature?.accessProof || !signature?.ownershipProof) {
        throw new Error('no prepared proof — call prepare() first');
      }
      setTransferPhase('confirming');
      try {
        const txHash = await writeContractAsync({
          address: getAxiomAgentNftAddress(),
          abi: ITRANSFER_FROM_ABI,
          functionName: 'iTransferFrom',
          args: [
            from,
            input.to,
            input.tokenId,
            [
              {
                accessProof: signature.accessProof,
                ownershipProof: signature.ownershipProof,
              },
            ],
          ],
        });
        setTransferPhase('idle');
        return txHash;
      } catch (err) {
        setTransferPhase('idle');
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `On-chain transaction failed: ${msg}. Your prepared proof is still valid — click "Edit" to restart the flow with a fresh nonce.`,
        );
      }
    },
    [from, signature, writeContractAsync],
  );

  const transfer = useCallback(
    async (input: TransferInput): Promise<Hex> => {
      await prepare(input);
      return confirm(input);
    },
    [prepare, confirm],
  );

  const reset = useCallback((): void => {
    setSignature(null);
    setTransferPhase('idle');
    resetAction();
    resetWrite();
  }, [resetAction, resetWrite]);

  return {
    prepare,
    confirm,
    transfer,
    isLoading: actionLoading || isWritePending,
    error: actionError ?? (writeError as Error | null),
    signature,
    reset,
    transferPhase,
  };
}
