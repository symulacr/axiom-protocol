import { useCallback, useState } from "react";
import {
  useAccount,
  useChainId,
  useSignTypedData,
  useWriteContract,
} from "wagmi";
import { type Hex, toHex } from "viem";

import { getAxiomAgentNftAddress } from "../abi/addresses.js";
import { ITRANSFER_FROM_ABI } from "@axiom/config/abis";
import { sealKeyForReceiver } from "@axiom/config/crypto/keys";

import { useAsyncAction } from "./useAsyncAction.js";
import { useEip712Domain, ACCESS_PROOF_TYPES } from "../abi/eip712.js";
import { agentTransferPath, apiFetch, LONG_TIMEOUT } from "../utils/apiFetch.js";
import { ORACLE_URL, API_KEY } from "../config/env.js";
import type {
  TransferInput,
  AccessProofStruct,
  OwnershipProofStruct,
  TransferResponse,
  TransferPhase,
} from "@axiom/config/types/transfer";
export type {
  TransferInput,
  AccessProofStruct,
  OwnershipProofStruct,
  TransferResponse,
  TransferPhase,
};
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

function hexToBytes(hex: string): Uint8Array {
  const h = hex.replace(/^0x/, "");
  if (h.length % 2 !== 0) throw new Error("invalid hex");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Fetch oracle uncompressed pubkey and ECIES-seal a base64 32-byte DEK. */
async function sealDekForOracle(
  oldDataEncryptionKeyB64: string,
  signal?: AbortSignal,
): Promise<string> {
  const healthUrl = `${ORACLE_URL.replace(/\/$/, "")}/health`;
  const headers: Record<string, string> = {};
  if (API_KEY) headers["x-api-key"] = API_KEY;
  const res = await fetch(healthUrl, { signal, headers });
  if (!res.ok) {
    throw new Error(`oracle health failed (${res.status}) — cannot seal DEK`);
  }
  const body = (await res.json()) as {
    uncompressedPubkey?: string | number[];
  };
  let pubBytes: Uint8Array;
  if (typeof body.uncompressedPubkey === "string") {
    pubBytes = hexToBytes(body.uncompressedPubkey);
  } else if (Array.isArray(body.uncompressedPubkey)) {
    pubBytes = Uint8Array.from(body.uncompressedPubkey);
  } else {
    throw new Error("oracle health missing uncompressedPubkey");
  }
  // sealKeyForReceiver expects 64-byte X||Y (no 0x04) or compressed.
  if (pubBytes.length === 65 && pubBytes[0] === 0x04) {
    pubBytes = pubBytes.subarray(1);
  }
  const dek = base64ToBytes(oldDataEncryptionKeyB64);
  if (dek.length !== 32) {
    throw new Error("oldDataEncryptionKey must be 32 bytes base64");
  }
  const sealed = sealKeyForReceiver(pubBytes, dek);
  return toHex(sealed instanceof Uint8Array ? sealed : new Uint8Array(sealed));
}

export function useTransfer(): UseTransferResult {
  const chainId = useChainId();
  const { address: from } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const {
    writeContractAsync,
    isPending: isWritePending,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();
  const { domain } = useEip712Domain();

  const [signature, setSignature] = useState<TransferResponse | null>(null);
  const [transferPhase, setTransferPhase] = useState<TransferPhase>("idle");
  const {
    execute,
    isLoading: actionLoading,
    error: actionError,
    reset: resetAction,
  } = useAsyncAction();
  const prepare = useCallback(
    async (input: TransferInput): Promise<TransferResponse> => {
      if (!from) {
        throw new Error("wallet not connected");
      }
      if (input.receiverPubKey64.length !== 130) {
        throw new Error(
          "receiverPubKey64 must be 0x-prefixed 64 raw bytes (X||Y, no 0x04 prefix)",
        );
      }

      return execute(async (signal) => {
        try {
          const path = agentTransferPath(input.tokenId);

          setTransferPhase("challenge");

          let nonceBig: bigint;
          try {
            nonceBig = BigInt(input.accessProofNonce);
          } catch {
            throw new Error("Invalid access proof nonce");
          }
          const challengeBody: Record<string, unknown> = {
            to: input.to,
            receiverPubKey64: input.receiverPubKey64,
            accessProofNonce: nonceBig.toString(),
          };
          if (input.oldDataUri && (input.sealedDataEncryptionKey || input.oldDataEncryptionKey)) {
            challengeBody.oldDataUri = input.oldDataUri;
            // Prefer pre-sealed; otherwise ECIES-seal DEK to oracle TEE pubkey (no cleartext on wire).
            if (input.sealedDataEncryptionKey) {
              challengeBody.sealedDataEncryptionKey = input.sealedDataEncryptionKey;
            } else if (input.oldDataEncryptionKey) {
              challengeBody.sealedDataEncryptionKey = await sealDekForOracle(
                input.oldDataEncryptionKey,
                signal,
              );
            }
          }
          const challenge = await apiFetch<TransferResponse>(path, {
            method: "POST",
            body: JSON.stringify(challengeBody),
            signal,
            timeout: LONG_TIMEOUT,
          });
          if (!challenge.ok || challenge.stage !== "challenge") {
            throw new Error(
              "backend did not return a transfer challenge. Challenge failed — generate a new nonce and try again.",
            );
          }
          if (
            !challenge.dataHash ||
            !challenge.targetPubkey ||
            challenge.accessProofNonce === undefined ||
            challenge.validUntil === undefined
          ) {
            throw new Error(
              "incomplete transfer challenge from backend — generate a new nonce and start over",
            );
          }

          setTransferPhase("signing");

          const nonce = BigInt(challenge.accessProofNonce);
          const validUntil = BigInt(challenge.validUntil);
          // On-chain intelligentDatas must match the proof dataHash at iTransfer
          // time (old hash). Re-key uploads a new blob; sealedKey delivers the
          // new AES key — do NOT put newDataHash into AccessProof / OwnershipProof.
          const proofDataHash = challenge.dataHash;
          const accessSignature = await signTypedDataAsync({
            domain,
            types: ACCESS_PROOF_TYPES,
            primaryType: "AccessProof",
            message: {
              dataHash: proofDataHash,
              targetPubkey: challenge.targetPubkey,
              to: input.to,
              nft: getAxiomAgentNftAddress(chainId),
              nonce: (challenge.accessProofNonce ?? `0x${nonce.toString(16)}`) as `0x${string}`,
              validUntil,
            },
            account: from,
          });

          setTransferPhase("finalizing");

          let proof = await apiFetch<TransferResponse>(path, {
            method: "POST",
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
          if (!proof.ok || proof.stage !== "final") {
            throw new Error(
              'backend did not return final proof structs. Finalization failed — transaction was NOT submitted. Click "Prepare Transfer" to restart.',
            );
          }
          if (!proof.accessProof || !proof.ownershipProof) {
            throw new Error(
              'incomplete proof structs from backend. Finalization failed — transaction was NOT submitted. Click "Prepare Transfer" to restart.',
            );
          }
          if (challenge.rekeyed) {
            proof = {
              ...proof,
              rekeyed: true,
              newDataHash: challenge.newDataHash,
              newDataUri: challenge.newDataUri,
            };
          }
          setSignature(proof);
          setTransferPhase("idle");
          return proof;
        } catch (err) {
          setTransferPhase("idle");
          throw err;
        }
      });
    },
    [chainId, from, domain, signTypedDataAsync, execute],
  );

  const confirm = useCallback(
    async (input: TransferInput): Promise<Hex> => {
      if (!from) {
        throw new Error("wallet not connected");
      }
      if (!signature?.accessProof || !signature?.ownershipProof) {
        throw new Error("no prepared proof — call prepare() first");
      }
      setTransferPhase("confirming");
      try {
        const txHash = await writeContractAsync({
          address: getAxiomAgentNftAddress(chainId),
          abi: ITRANSFER_FROM_ABI,
          functionName: "iTransferFrom",
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
        setTransferPhase("idle");
        return txHash;
      } catch (err) {
        setTransferPhase("idle");
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `On-chain transaction failed: ${msg}. Your prepared proof is still valid — click "Edit" to restart the flow with a fresh nonce.`,
          { cause: err },
        );
      }
    },
    [chainId, from, signature, writeContractAsync],
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
    setTransferPhase("idle");
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
