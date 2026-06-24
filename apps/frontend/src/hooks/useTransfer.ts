import { useCallback, useState } from 'react';
import { useAccount, useSignTypedData, useWriteContract } from 'wagmi';
import { type Address, type Hex } from 'viem';

import { AXIOM_AGENT_NFT_ADDRESS, AXIOM_TEE_VERIFIER_ADDRESS } from '../abi/addresses.js';
import { iTransferFromAbi } from '../abi/iTransferFrom.js';
import { BACKEND_URL } from '../config/env.js';

import { useAsyncAction } from './useAsyncAction.js';
import { EIP712_DOMAIN, ACCESS_PROOF_TYPES } from '../abi/eip712.js';

export type TransferInput = {
  tokenId: bigint;
  to: Address;
  receiverPubKey64: Hex;
  accessProofNonce: Hex;
  oldDataEncryptionKey?: string;
  oldDataUri?: Hex;
};

/** Backend response to `POST /v1/agents/:tokenId/transfer` (frontend-relevant fields). */
export type AccessProofStruct = {
  dataHash: Hex;
  targetPubkey: Hex;
  nonce: bigint;
  proof: Hex;
  validUntil: bigint;
};

export type OwnershipProofStruct = {
  oracleType: number;
  dataHash: Hex;
  sealedKey: Hex;
  targetPubkey: Hex;
  nonce: bigint;
  proof: Hex;
  validUntil: bigint;
};

/** Backend response for the two-stage transfer protocol (challenge → final). */
export type TransferResponse = {
  ok: boolean;
  stage: 'challenge' | 'final';
  tokenId: string;
  to: Address;
  dataHash?: Hex;
  oldDataHash?: Hex;
  newDataHash?: Hex;
  newDataUri?: Hex;
  targetPubkey?: Hex;
  accessProofNonce?: number;
  validUntil?: string;
  sealedKey?: Hex;
  ownershipSignature?: Hex;
  signer?: Address;
  accessSigner?: Address;
  rekeyed?: boolean;
  accessProof?: AccessProofStruct;
  ownershipProof?: OwnershipProofStruct;
};

export type UseTransferResult = {
  prepare: (input: TransferInput) => Promise<TransferResponse>;
  confirm: (input: TransferInput) => Promise<Hex>;
  transfer: (input: TransferInput) => Promise<Hex>;
  isLoading: boolean;
  error: Error | null;
  signature: TransferResponse | null;
  reset: () => void;
};

export function useTransfer(): UseTransferResult {
  const { address: from } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync, isPending: isWritePending, error: writeError, reset: resetWrite } =
    useWriteContract();

  const [signature, setSignature] = useState<TransferResponse | null>(null);
  const { execute, isLoading: actionLoading, error: actionError, reset: resetAction } =
    useAsyncAction();

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
        const url = `${BACKEND_URL}/v1/agents/${input.tokenId.toString()}/transfer`;

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
        const challengeRes = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify(challengeBody),
          signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
        });
        if (!challengeRes.ok) {
          const text = await challengeRes.text();
          throw new Error(
            `transfer challenge failed: ${challengeRes.status} ${challengeRes.statusText} ${text}`,
          );
        }
        const challenge = (await challengeRes.json()) as TransferResponse;
        if (!challenge.ok || challenge.stage !== 'challenge') {
          throw new Error('backend did not return a transfer challenge');
        }
        if (
          !challenge.dataHash ||
          !challenge.targetPubkey ||
          challenge.accessProofNonce === undefined ||
          challenge.validUntil === undefined
        ) {
          throw new Error('incomplete transfer challenge from backend');
        }

        // Step 2 — receiver signs EIP-712 AccessProof.
        const nonce = BigInt(challenge.accessProofNonce);
        const validUntil = BigInt(challenge.validUntil);
        const proofDataHash = challenge.rekeyed && challenge.newDataHash
          ? challenge.newDataHash
          : challenge.dataHash;
        const accessSignature = await signTypedDataAsync({
          domain: EIP712_DOMAIN,
          types: ACCESS_PROOF_TYPES,
          primaryType: 'AccessProof',
          message: {
            dataHash: proofDataHash,
            targetPubkey: challenge.targetPubkey,
            to: input.to,
            nft: AXIOM_AGENT_NFT_ADDRESS,
            nonce,
            validUntil,
          },
          account: from,
        });

        // Step 3 — finalize (backend builds on-chain structs from signed proof).
        const finalRes = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
          },
          signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
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
        if (!finalRes.ok) {
          const text = await finalRes.text();
          throw new Error(
            `transfer finalization failed: ${finalRes.status} ${finalRes.statusText} ${text}`,
          );
        }
        const proof = (await finalRes.json()) as TransferResponse;
        if (!proof.ok || proof.stage !== 'final') {
          throw new Error('backend did not return final proof structs');
        }
        if (!proof.accessProof || !proof.ownershipProof) {
          throw new Error('incomplete proof structs from backend');
        }
        // Carry re-key status forward for the modal.
        if (challenge.rekeyed) {
          proof.rekeyed = true;
          proof.newDataHash = challenge.newDataHash;
          proof.newDataUri = challenge.newDataUri;
        }
        setSignature(proof);
        return proof;
      });
    },
    [from, signTypedDataAsync, execute],
  );

  const confirm = useCallback(
    async (input: TransferInput): Promise<Hex> => {
      if (!from) {
        throw new Error('wallet not connected');
      }
      if (!signature?.accessProof || !signature?.ownershipProof) {
        throw new Error('no prepared proof — call prepare() first');
      }
      return writeContractAsync({
        address: AXIOM_AGENT_NFT_ADDRESS,
        abi: iTransferFromAbi,
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
  };
}
