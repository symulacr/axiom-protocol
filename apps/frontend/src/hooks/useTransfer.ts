// Axiom Protocol — `useTransfer` hook.
//
// Drives the end-to-end iNFT transfer flow:
//
//   1. Challenge — POST /v1/agents/:tokenId/transfer with the receiver
//      address + receiver's 64-byte uncompressed pubkey + an accessProofNonce
//      (and, for full re-keying, the old AES data key + old 0G Storage URI).
//      The backend returns the dataHash, targetPubkey, nonce, validUntil
//      it will use for the OwnershipProof. When re-keying is requested it
//      also returns `rekeyed: true`, the fresh `sealedKey`, `newDataHash`,
//      and `newDataUri`.
//
//   2. Receiver signs the AccessProof EIP-712 typed data via the browser
//      wallet's `signTypedData_v4` (wagmi v2 `useSignTypedData`). The
//      wallet computes the EIP-712 digest internally — no EIP-191 prefix,
//      matching the on-chain `ECDSA.recover(digest, sig)` in
//      `AxiomTeeVerifier.verifyTransferValidity`.
//
//   3. Finalize — POST the signed AccessProof back to the backend. The
//      backend recovers the access signer, builds the full on-chain
//      TransferValidityProof structs, and returns them.
//
//   4. Submit the on-chain `iTransferFrom(from, to, tokenId, proofs)`
//      transaction through wagmi v2's `useWriteContract`. The contract's
//      `AxiomTeeVerifier` recovers the receiver from the AccessProof and the
//      registered TEE signer from the OwnershipProof.
//
// The EIP-7857 spec mandates the `TransferValidityProof` struct passed to
// `iTransferFrom`. See:
//
//   https://eips.ethereum.org/EIPS/eip-7857
//
// The 0G reference implementation (0gfoundation/0g-agent-nft) uses the
// ERC-721-compatible `iTransferFrom(from, to, tokenId, proofs)` signature.
//
// Canonical sources:
//   - wagmi v2 `useSignTypedData` (signTypedData_v4 / EIP-712):
//     https://wagmi.sh/react/api/hooks/useSignTypedData
//   - wagmi v2 `useWriteContract` (mutate / mutateAsync, status, data):
//     https://wagmi.sh/react/hooks/useWriteContract
//   - wagmi v2 `useAccount` (connected address used as `from`):
//     https://wagmi.sh/react/hooks/useAccount
//   - viem `Hex` / `Address` branded types:
//     https://viem.sh/docs/types/hex
//   - EIP-712 typed data spec (domain separator, struct hash):
//     https://eips.ethereum.org/EIPS/eip-712
//   - EIP-7857 iTransferFrom + TransferValidityProof struct:
//     https://eips.ethereum.org/EIPS/eip-7857
//   - MDN Fetch API (POST, JSON body, response handling):
//     https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch
//   - 0G chain ids (16602 Galileo / 16661 Aristotle) and 0G TEE verifier
//     flow:
//     https://docs.0g.ai/ai-context

import { useCallback, useState } from 'react';
import { useAccount, useSignTypedData, useWriteContract } from 'wagmi';
import { type Address, type Hex } from 'viem';

import { AXIOM_AGENT_NFT_ADDRESS, AXIOM_TEE_VERIFIER_ADDRESS } from '../abi/addresses.js';
import { iTransferFromAbi } from '../abi/iTransferFrom.js';

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ?? 'http://127.0.0.1:3000';

/** 0G Galileo testnet chain id — the chain the verifier is deployed on. */
const GALILEO_CHAIN_ID = 16602;

/**
 * EIP-712 domain for `AxiomTeeVerifier`. Binds signatures to the Galileo
 * testnet + the deployed verifier so a proof minted for one chain/contract
 * cannot be replayed on another. The on-chain `_domainSeparator()` is
 * `keccak256(abi.encode(EIP712Domain(...)))` with this exact name/version.
 */
const EIP712_DOMAIN = {
  name: 'AxiomTeeVerifier',
  version: '1',
  chainId: GALILEO_CHAIN_ID,
  verifyingContract: AXIOM_TEE_VERIFIER_ADDRESS,
} as const;

/**
 * EIP-712 type for the AccessProof struct. Mirrors the contract's
 * `ACCESS_PROOF_TYPEHASH` (`AxiomTeeVerifier.sol:74-75`). The wallet's
 * `signTypedData_v4` encodes this per the EIP-712 spec and signs the
 * resulting digest with raw ECDSA — no EIP-191 prefix.
 */
const ACCESS_PROOF_TYPES = {
  AccessProof: [
    { name: 'dataHash', type: 'bytes32' },
    { name: 'targetPubkey', type: 'bytes' },
    { name: 'nonce', type: 'uint256' },
    { name: 'validUntil', type: 'uint256' },
  ],
} as const;

/**
 * Input to `useTransfer().transfer(...)`. The caller has already gathered
 * these from the user (the modal owns the form):
 *
 *   - tokenId:          the iNFT (AxiomAgentNFT) tokenId being transferred.
 *   - to:               the receiver's EVM address. The on-chain `to`.
 *   - receiverPubKey64: the receiver's 64-byte uncompressed secp256k1
 *                       public key (raw X||Y, NO leading 0x04 byte).
 *                       The TEE signer service uses this to seal the new
 *                       AES-256 data key for the receiver. Length is
 *                       enforced to 64 bytes (128 hex chars + '0x').
 *   - accessProofNonce: the receiver-supplied nonce that the access
 *                       proof signs over. Typically a fresh 32-byte
 *                       random hex per transfer; the verifier rejects
 *                       replays via `BaseVerifier.usedProofs`.
 *   - oldDataEncryptionKey: optional base64 32-byte AES key decrypting the
 *                       existing ciphertext. When supplied together with
 *                       `oldDataUri`, the backend triggers a full re-key:
 *                       it downloads + decrypts the old blob, generates a
 *                       fresh AES-256 key, re-encrypts, uploads the new
 *                       blob, and ECIES-seals the new key for the receiver.
 *   - oldDataUri:       optional 0G Storage root hash of the existing
 *                       ciphertext. Required when `oldDataEncryptionKey`
 *                       is supplied (re-key flow).
 */
export type TransferInput = {
  tokenId: bigint;
  to: Address;
  receiverPubKey64: Hex;
  accessProofNonce: Hex;
  oldDataEncryptionKey?: string;
  oldDataUri?: Hex;
};

/**
 * The backend's response to `POST /v1/agents/:tokenId/transfer`. The
 * exact JSON shape is pinned by `apps/backend/src/server.ts`
 * `POST /v1/agents/:id/transfer`. Only the fields the frontend needs to
 * build the on-chain `TransferValidityProof` and to show the user are
 * surfaced here.
 */
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

/**
 * The backend's response to `POST /v1/agents/:tokenId/transfer`.
 * The endpoint works in two stages:
 *   1. `stage: 'challenge'` — the backend returns the dataHash, targetPubkey,
 *      nonce, and validUntil it will use for the OwnershipProof. The receiver
 *      wallet signs the AccessProof EIP-712 typed data. When re-keying is
 *      requested the response also carries `rekeyed: true`, `sealedKey`,
 *      `newDataHash`, and `newDataUri`.
 *   2. `stage: 'final'` — the frontend posts the signed AccessProof back; the
 *      backend recovers the signer, builds the full on-chain structs, and
 *      returns them so the frontend can call `iTransferFrom`.
 */
export type TransferResponse = {
  ok: boolean;
  stage: 'challenge' | 'final';
  tokenId: string;
  to: Address;
  dataHash?: Hex;
  /** Original data hash (re-key flow) — same as `dataHash` for sign-only. */
  oldDataHash?: Hex;
  /** Fresh data hash after re-encryption (re-key flow only). */
  newDataHash?: Hex;
  /** 0G Storage root hash of the re-encrypted blob (re-key flow only). */
  newDataUri?: Hex;
  targetPubkey?: Hex;
  accessProofNonce?: number;
  validUntil?: string;
  /** ECIES-sealed fresh AES key for the receiver (re-key flow only). */
  sealedKey?: Hex;
  ownershipSignature?: Hex;
  signer?: Address;
  accessSigner?: Address;
  /** `true` when the backend performed a full re-key. */
  rekeyed?: boolean;
  accessProof?: AccessProofStruct;
  ownershipProof?: OwnershipProofStruct;
};

/**
 * Hook surface.
 *
 * The flow is split into two phases so the modal can show proof details
 * and require an explicit confirmation before the on-chain write:
 *
 *   - `prepare(input)` — challenge + receiver EIP-712 signature + finalize.
 *     Produces the full `TransferValidityProof` structs (stored in
 *     `signature`) but does NOT touch the chain. The modal renders the
 *     re-key status, OwnershipProof signer, and recovered AccessProof
 *     signer from this response.
 *   - `confirm(input)` — submits the on-chain `iTransferFrom` call using
 *     the prepared `signature`. Requires `prepare` to have succeeded.
 *
 * `transfer(input)` is a convenience that chains `prepare` → `confirm`
 * for callers that do not want the intermediate confirmation step.
 *
 * `signature` is the final backend response (full proof structs), kept
 * around so the modal can render the proof details before the user
 * confirms the on-chain write.
 */
export type UseTransferResult = {
  /** Challenge + sign + finalize. Sets `signature`; does not write on-chain. */
  prepare: (input: TransferInput) => Promise<TransferResponse>;
  /** Submit the on-chain `iTransferFrom` using the prepared `signature`. */
  confirm: (input: TransferInput) => Promise<Hex>;
  /** Convenience: `prepare` then `confirm` in one call. */
  transfer: (input: TransferInput) => Promise<Hex>;
  isLoading: boolean;
  error: Error | null;
  signature: TransferResponse | null;
  reset: () => void;
};

/**
 * Drive the end-to-end iNFT transfer flow:
 *   1. Challenge — ask the backend for the dataHash/targetPubkey/validUntil
 *      it will use for the OwnershipProof (and, when `oldDataEncryptionKey`
 *      + `oldDataUri` are supplied, trigger a full re-key).
 *   2. Receiver `signTypedData_v4` — the connected wallet signs the
 *      AccessProof EIP-712 typed data. The wallet computes the EIP-712
 *      digest internally (no EIP-191 prefix), matching the on-chain
 *      `ECDSA.recover(digest, sig)`.
 *   3. Finalize — post the signed AccessProof to the backend; it recovers
 *      the access signer, builds the full on-chain structs, and returns them.
 *   4. On-chain `iTransferFrom` through wagmi v2's `useWriteContract`.
 */
export function useTransfer(): UseTransferResult {
  const { address: from } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync, isPending: isWritePending, error: writeError, reset: resetWrite } =
    useWriteContract();

  const [signature, setSignature] = useState<TransferResponse | null>(null);
  const [signingError, setSigningError] = useState<Error | null>(null);
  const [isSigning, setIsSigning] = useState(false);

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

      setIsSigning(true);
      setSigningError(null);
      try {
        const url = `${BACKEND_URL}/v1/agents/${input.tokenId.toString()}/transfer`;

        // Step 1 — challenge: backend picks dataHash, targetPubkey, nonce,
        // and validUntil for the OwnershipProof it will sign. When re-key
        // inputs are supplied, the backend performs a full re-key and also
        // returns the fresh sealedKey + newDataHash + newDataUri.
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

        // Step 2 — receiver signs the AccessProof EIP-712 typed data.
        // When the backend re-keyed, the proof must bind to the FRESH
        // data hash (the on-chain token will reference the new blob), so
        // we sign over `newDataHash` instead of the original `dataHash`.
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
            nonce,
            validUntil,
          },
          account: from,
        });

        // Step 3 — finalize: post the signed AccessProof; the backend
        // builds the full on-chain TransferValidityProof structs. Echo
        // the rekeyed sealedKey back so the OwnershipProof binds to the
        // fresh sealed key (backend server.ts:358-368 reads `sealedKey`
        // from the request body).
        const finalRes = await fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
          },
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
        // Carry re-key status forward so the modal can render it.
        if (challenge.rekeyed) {
          proof.rekeyed = true;
          proof.newDataHash = challenge.newDataHash;
          proof.newDataUri = challenge.newDataUri;
        }
        setSignature(proof);
        return proof;
      } catch (err) {
        const wrapped = err instanceof Error ? err : new Error(String(err));
        setSigningError(wrapped);
        throw wrapped;
      } finally {
        setIsSigning(false);
      }
    },
    [from, signTypedDataAsync],
  );

  const confirm = useCallback(
    async (input: TransferInput): Promise<Hex> => {
      if (!from) {
        throw new Error('wallet not connected');
      }
      if (!signature?.accessProof || !signature?.ownershipProof) {
        throw new Error('no prepared proof — call prepare() first');
      }
      // Step 4 — submit the on-chain `iTransferFrom` call with full structs.
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
    setSigningError(null);
    resetWrite();
  }, [resetWrite]);

  return {
    prepare,
    confirm,
    transfer,
    isLoading: isSigning || isWritePending,
    error: signingError ?? (writeError as Error | null),
    signature,
    reset,
  };
}
