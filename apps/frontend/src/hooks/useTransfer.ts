import { useCallback, useRef, useState } from "react";
import { useAccount, useChainId, useSignTypedData } from "wagmi";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Hex, toHex } from "viem";

import { getAxiomAgentNftAddress } from "../abi/addresses.js";
import { ITRANSFER_FROM_ABI } from "@axiom/config/abis";
import { sealKeyForReceiver } from "@axiom/config/crypto/keys";

import { useEip712Domain, ACCESS_PROOF_TYPES } from "../abi/eip712.js";
import {
  agentTransferPath,
  apiFetch,
  oracleFetch,
  LONG_TIMEOUT,
} from "../utils/apiFetch.js";
import { useGenericWrite } from "./useGenericWrite.js";
import type {
  TransferInput,
  TransferResponse,
  TransferPhase,
} from "@axiom/config/types/transfer";
export type { TransferInput, TransferResponse, TransferPhase };
type UseTransferResult = {
  prepare: (input: TransferInput) => Promise<TransferResponse>;
  confirm: (input: TransferInput) => Promise<Hex>;
  isLoading: boolean;
  error: Error | null;
  signature: TransferResponse | null;
  reset: () => void;
  transferPhase: TransferPhase;
};

type TransferChallenge = TransferResponse & {
  dataHash: `0x${string}`;
  targetPubkey: `0x${string}`;
  accessProofNonce: number | string;
  validUntil: string;
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

async function sealDekForOracle(
  oldDataEncryptionKeyB64: string,
  signal?: AbortSignal,
): Promise<string> {
  const body = await oracleFetch<{ uncompressedPubkey?: string | number[] }>(
    "/health",
    { signal },
  );
  let pubBytes: Uint8Array;
  if (typeof body.uncompressedPubkey === "string") {
    pubBytes = hexToBytes(body.uncompressedPubkey);
  } else if (Array.isArray(body.uncompressedPubkey)) {
    pubBytes = Uint8Array.from(body.uncompressedPubkey);
  } else {
    throw new Error("oracle health missing uncompressedPubkey");
  }
  // sealKeyForReceiver expects 64-byte X||Y (no 0x04 prefix) or compressed pubkey format
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
  const { write } = useGenericWrite();
  const [isWritePending, setWritePending] = useState(false);
  const [writeError, setWriteError] = useState<Error | null>(null);
  const { domain } = useEip712Domain();
  const queryClient = useQueryClient();

  const [signature, setSignature] = useState<TransferResponse | null>(null);
  const [transferPhase, setTransferPhase] = useState<TransferPhase>("idle");
  const [isPreparing, setIsPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState<Error | null>(null);
  // intent-start marker; each prepare() bumps attempt so a fresh challenge is always fetched (nonces are single-use)
  const [intent, setIntent] = useState<{
    input: TransferInput;
    attempt: number;
  } | null>(null);
  const intentRef = useRef(intent);
  intentRef.current = intent;
  const attemptRef = useRef(0);

  const runChallenge = useCallback(
    async ({
      input,
      signal,
    }: {
      input: TransferInput;
      signal?: AbortSignal;
    }): Promise<TransferChallenge> => {
      const path = agentTransferPath(input.tokenId);

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
      if (
        input.oldDataUri &&
        (input.sealedDataEncryptionKey || input.oldDataEncryptionKey)
      ) {
        challengeBody.oldDataUri = input.oldDataUri;
        if (input.sealedDataEncryptionKey) {
          // prefer pre-sealed; else ECIES-seal DEK to oracle TEE pubkey (no cleartext on wire)
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
      return challenge as TransferChallenge;
    },
    [],
  );

  // Challenge fetch fires on transfer intent; prepare() awaits the same fetchQuery cache entry so signing/finalizing stay sequential
  const challengeQuery = useQuery<TransferChallenge, Error>({
    queryKey: ["transfer-challenge", intent?.attempt ?? -1],
    enabled: intent !== null,
    staleTime: Infinity,
    retry: false,
    queryFn: ({ signal }) => {
      const current = intentRef.current;
      if (!current) throw new Error("no transfer intent");
      return runChallenge({ input: current.input, signal });
    },
  });

  const finalizeMutation = useMutation<
    TransferResponse,
    Error,
    {
      input: TransferInput;
      challenge: TransferChallenge;
      accessSignature: `0x${string}`;
    }
  >({
    retry: false,
    mutationFn: async ({ input, challenge, accessSignature }) => {
      const path = agentTransferPath(input.tokenId);
      const nonce = BigInt(challenge.accessProofNonce);
      const validUntil = BigInt(challenge.validUntil);
      // iTransfer validates proof dataHash against the OLD on-chain hash; re-key uploads a new blob, sealedKey delivers the new AES key — never put newDataHash into the proofs
      const proofDataHash = challenge.dataHash;
      let proof = await apiFetch<TransferResponse>(path, {
        method: "POST",
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
      return proof;
    },
  });

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

      setPrepareError(null);
      setIsPreparing(true);
      const attempt = attemptRef.current + 1;
      attemptRef.current = attempt;
      setIntent({ input, attempt });
      setTransferPhase("challenge");
      try {
        const challenge = await queryClient.fetchQuery({
          queryKey: ["transfer-challenge", attempt],
          queryFn: ({ signal }) => runChallenge({ input, signal }),
          staleTime: Infinity,
          retry: false,
        });

        setTransferPhase("signing");

        const nonce = BigInt(challenge.accessProofNonce);
        const validUntil = BigInt(challenge.validUntil);
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
            nonce: (challenge.accessProofNonce ??
              `0x${nonce.toString(16)}`) as `0x${string}`,
            validUntil,
          },
          account: from,
        });

        setTransferPhase("finalizing");

        const proof = await finalizeMutation.mutateAsync({
          input,
          challenge,
          accessSignature,
        });

        setSignature(proof);
        setTransferPhase("idle");
        return proof;
      } catch (err) {
        setTransferPhase("idle");
        const wrapped = err instanceof Error ? err : new Error(String(err));
        setPrepareError(wrapped);
        throw wrapped;
      } finally {
        setIsPreparing(false);
      }
    },
    [
      chainId,
      from,
      domain,
      signTypedDataAsync,
      queryClient,
      runChallenge,
      finalizeMutation,
    ],
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
      setWritePending(true);
      setWriteError(null);
      try {
        const txHash = await write({
          to: getAxiomAgentNftAddress(chainId),
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
        setWritePending(false);
        setTransferPhase("idle");
        return txHash;
      } catch (err) {
        setWritePending(false);
        setTransferPhase("idle");
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `On-chain transaction failed: ${msg}. Your prepared proof is still valid — click "Edit" to restart the flow with a fresh nonce.`,
          { cause: err },
        );
      }
    },
    [chainId, from, signature, write],
  );

  const reset = useCallback((): void => {
    setSignature(null);
    setTransferPhase("idle");
    setIntent(null);
    setPrepareError(null);
    setIsPreparing(false);
    setWritePending(false);
    setWriteError(null);
    queryClient.removeQueries({ queryKey: ["transfer-challenge"] });
  }, [queryClient]);

  return {
    prepare,
    confirm,
    isLoading: isPreparing || challengeQuery.isFetching || isWritePending,
    error: prepareError ?? challengeQuery.error ?? (writeError as Error | null),
    signature,
    reset,
    transferPhase,
  };
}
