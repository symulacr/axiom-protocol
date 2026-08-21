import { useCallback, useRef, useState } from "react";
import { useAccount, useChainId, useSignTypedData } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type Hex, recoverTypedDataAddress, toHex } from "viem";
import type { Connector } from "wagmi";

import { getAxiomAgentNftAddress } from "../abi/addresses.js";
import { ITRANSFER_FROM_ABI } from "@axiom/config/abis";
import { sealKeyForReceiver } from "@axiom/config/crypto/keys";
import { toViemAbi } from "../lib/abi.js";

import { useEip712Domain, ACCESS_PROOF_TYPES } from "../abi/eip712.js";
import {
  agentTransferPath,
  apiFetch,
  oracleFetch,
  LONG_TIMEOUT,
} from "../utils/apiFetch.js";
import { useGenericWrite } from "./useGenericWrite.js";
import {
  ACCEPTANCE_CODE_SHAPE,
  encodeHandoffPayload,
  handoffUrl,
  type AccessProofMessage,
} from "../lib/transferHandoff.js";
import type {
  TransferInput,
  TransferResponse,
  TransferPhase,
} from "@axiom/config/types/transfer";
export type { TransferInput, TransferResponse, TransferPhase };

/** F-01: prepare() outcome — self-transfers finish in one step ("ready");
 *  cross-party transfers pause after the oracle challenge until the RECEIVER
 *  co-signs the AccessProof (protocol requires recovered signer == recipient). */
export type PrepareResult =
  | { status: "ready"; proof: TransferResponse }
  | { status: "co-sign-required"; receiver: `0x${string}` };

/** Thrown when the connected wallet cannot expose the receiver account, so the
 *  co-sign can never succeed from this session — the GUI renders an honest
 *  blocker (change recipient / let the receiver sign from their own session),
 *  never a futile retry. */
export class ReceiverAccountUnavailableError extends Error {
  readonly receiver: `0x${string}`;
  constructor(receiver: `0x${string}`) {
    super(
      `The receiving account ${receiver} is not available in the connected wallet.`,
    );
    this.name = "ReceiverAccountUnavailableError";
    this.receiver = receiver;
  }
}

export function isReceiverAccountUnavailable(
  err: unknown,
): err is ReceiverAccountUnavailableError {
  return (
    err instanceof ReceiverAccountUnavailableError ||
    (err instanceof Error && err.name === "ReceiverAccountUnavailableError")
  );
}

/** P4 handoff: an acceptance code that is not a signature at all, or one that
 *  recovers to a different address than the receiver. Both mean "ask the
 *  receiver to sign the link again" — never submit a mismatched proof. */
export class HandoffSignatureInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HandoffSignatureInvalidError";
  }
}

export function isHandoffSignatureInvalid(
  err: unknown,
): err is HandoffSignatureInvalidError {
  return (
    err instanceof HandoffSignatureInvalidError ||
    (err instanceof Error && err.name === "HandoffSignatureInvalidError")
  );
}

type Eip1193Provider = {
  request: (args: {
    method: string;
    params?: unknown[] | Record<string, unknown>;
  }) => Promise<unknown>;
};

/** wagmi/viem wrap connector errors — walk the cause chain for the
 *  ConnectorAccountNotFound signal (receiver not exposed by the wallet). */
function isAccountNotFound(err: unknown): boolean {
  let cur: unknown = err;
  for (let depth = 0; depth < 5 && cur; depth++) {
    if (cur instanceof Error) {
      if (cur.name === "ConnectorAccountNotFoundError") return true;
      if (/account.*not found|not found.*account/i.test(cur.message)) {
        return true;
      }
      cur = (cur as { cause?: unknown }).cause;
    } else {
      return false;
    }
  }
  return false;
}

type UseTransferResult = {
  prepare: (input: TransferInput) => Promise<PrepareResult>;
  coSign: () => Promise<TransferResponse>;
  confirm: (input: TransferInput) => Promise<Hex>;
  isLoading: boolean;
  error: Error | null;
  signature: TransferResponse | null;
  /** Set when prepare() paused for a cross-party transfer: the receiver
   *  address that must co-sign before confirm() can run. */
  coSignReceiver: `0x${string}` | null;
  /** Canonical-hex nonce of the paused challenge — lets callers match
   *  receiver-produced results (localStorage cross-tab) to THIS challenge
   *  before applying (P4 handoff). */
  coSignNonce: `0x${string}` | null;
  /** URL the receiver opens on their own device to sign the acceptance. */
  coSignHandoffUrl: () => string | null;
  /** Verify + apply a receiver-produced acceptance signature (P4 handoff). */
  applyHandoffSignature: (
    signature: `0x${string}`,
  ) => Promise<TransferResponse>;
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
  const { address: from, connector } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { write } = useGenericWrite();
  const [isWritePending, setWritePending] = useState(false);
  const [writeError, setWriteError] = useState<Error | null>(null);
  const { domain } = useEip712Domain();
  const queryClient = useQueryClient();

  const [signature, setSignature] = useState<TransferResponse | null>(null);
  // Ref mirror of `signature`: prepare/coSign → confirm chains run inside one
  // stale render closure (FlowPage execute), so confirm() must not trust the
  // state captured by its own useCallback (C-stale closure; the modal's
  // click-separated path never hit this, the flow page's chained one does).
  const signatureRef = useRef<TransferResponse | null>(null);
  const [transferPhase, setTransferPhase] = useState<TransferPhase>("idle");
  const [isPreparing, setIsPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState<Error | null>(null);
  // F-01: paused cross-party transfer — challenge is fetched, receiver co-sign outstanding
  const [pendingCoSign, setPendingCoSign] = useState<{
    input: TransferInput;
    challenge: TransferChallenge;
  } | null>(null);
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

  // Finalize logic lives in finalizePrepared below (shared by the sign path
  // and the P4 handoff-apply path — both exchange a receiver signature for
  // the final proof structs; only the signature's origin differs).

  /** Canonical AccessProof message for a paused/active challenge — the one
   *  structure the wallet signs, the sender validates handoff codes against
   *  and the backend verifier hashes (P4: shared by sign + handoff paths). */
  const buildAccessProofMessage = useCallback(
    (
      input: TransferInput,
      challenge: TransferChallenge,
    ): AccessProofMessage => {
      const nonce = BigInt(challenge.accessProofNonce);
      const validUntil = BigInt(challenge.validUntil);
      return {
        dataHash: challenge.dataHash,
        targetPubkey: challenge.targetPubkey,
        to: input.to,
        nft: getAxiomAgentNftAddress(chainId),
        // Canonical 32-byte hex — the challenge echoes the nonce as a DECIMAL
        // string, but the backend/contract hash ethers.toBeHex(nonce); the
        // minimal form can drop to an ODD number of hex chars (top nibble 0,
        // ~1/16 of random nonces) which wallets reject as an invalid `bytes`
        // value. Padding to 32 bytes keeps wallet, backend and contract
        // hashing the identical bytes (F-01 encoding half + P4 live find).
        nonce: toHex(nonce, { size: 32 }),
        validUntil,
      };
    },
    [chainId],
  );

  /** Exchanges a receiver signature for the final proof structs (no wallet
   *  action) — shared by the in-wallet co-sign and the P4 handoff apply. */
  const finalizePrepared = useCallback(
    async ({
      input,
      challenge,
      accessSignature,
    }: {
      input: TransferInput;
      challenge: TransferChallenge;
      accessSignature: `0x${string}`;
    }): Promise<TransferResponse> => {
      setTransferPhase("finalizing");
      const nonce = BigInt(challenge.accessProofNonce);
      const validUntil = BigInt(challenge.validUntil);
      // iTransfer validates proof dataHash against the OLD on-chain hash; re-key uploads a new blob, sealedKey delivers the new AES key — never put newDataHash into the proofs
      const proofDataHash = challenge.dataHash;
      let proof = await apiFetch<TransferResponse>(
        agentTransferPath(input.tokenId),
        {
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
        },
      );
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
      signatureRef.current = proof;
      setSignature(proof);
      setTransferPhase("idle");
      return proof;
    },
    [],
  );

  /** Signs the receiver-bound AccessProof with `signerAccount`, then exchanges
   *  it for the final proof structs. Shared by the self-transfer one-step path
   *  (signer == connected owner) and the cross-party co-sign step (signer ==
   *  recipient, F-01). */
  const signAndFinalize = useCallback(
    async ({
      input,
      challenge,
      signerAccount,
      signerConnector,
    }: {
      input: TransferInput;
      challenge: TransferChallenge;
      signerAccount: `0x${string}`;
      signerConnector?: Connector;
    }): Promise<TransferResponse> => {
      setTransferPhase("signing");
      const message = buildAccessProofMessage(input, challenge);
      const accessSignature = await signTypedDataAsync({
        domain,
        types: ACCESS_PROOF_TYPES,
        primaryType: "AccessProof",
        message,
        account: signerAccount,
        // Passing the connector forces a fresh getAccounts() probe (the cached
        // connection can lag a wallet-side account switch), so a just-exposed
        // receiver account is accepted immediately.
        ...(signerConnector ? { connector: signerConnector } : {}),
      });
      return finalizePrepared({ input, challenge, accessSignature });
    },
    [domain, signTypedDataAsync, buildAccessProofMessage, finalizePrepared],
  );

  /** Asks the wallet to expose/switch to the receiver account (MetaMask:
   *  wallet_requestPermissions account picker; fallback eth_requestAccounts),
   *  then re-probes the connector account list. */
  const requestReceiverExposure = useCallback(
    async (receiver: `0x${string}`): Promise<boolean> => {
      if (!connector) return false;
      try {
        const provider = (await connector.getProvider()) as Eip1193Provider;
        try {
          await provider.request({
            method: "wallet_requestPermissions",
            params: [{ eth_accounts: {} }],
          });
        } catch {
          // wallet has no permission flow (or denied) — a plain account
          // request is the only other switch lever injected wallets expose
          await provider
            .request({ method: "eth_requestAccounts" })
            .catch(() => undefined);
        }
      } catch {
        return false;
      }
      const accounts = await connector.getAccounts().catch(() => [] as const);
      return accounts.some((a) => a.toLowerCase() === receiver.toLowerCase());
    },
    [connector],
  );

  const prepare = useCallback(
    async (input: TransferInput): Promise<PrepareResult> => {
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
      setPendingCoSign(null);
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

        // F-01: the AccessProof must recover to the RECIPIENT. Self-transfers
        // keep the one-step path; cross-party transfers pause here and let the
        // GUI drive the explicit receiver co-sign step (coSign()).
        if (input.to.toLowerCase() !== from.toLowerCase()) {
          setPendingCoSign({ input, challenge });
          setTransferPhase("idle");
          return { status: "co-sign-required", receiver: input.to };
        }

        const proof = await signAndFinalize({
          input,
          challenge,
          signerAccount: from,
        });
        return { status: "ready", proof };
      } catch (err) {
        setTransferPhase("idle");
        const wrapped = err instanceof Error ? err : new Error(String(err));
        setPrepareError(wrapped);
        throw wrapped;
      } finally {
        setIsPreparing(false);
      }
    },
    [from, queryClient, runChallenge, signAndFinalize],
  );

  /** F-01 receiver co-sign: signs the paused challenge's AccessProof AS the
   *  recipient. If the wallet does not expose the receiver account, asks it to
   *  switch/add the account once; when that is impossible the caller gets a
   *  ReceiverAccountUnavailableError (honest blocker, not a retry loop). The
   *  connected sender session is never replaced — after this resolves, the
   *  sender's own confirm() submits the transfer. */
  const coSign = useCallback(async (): Promise<TransferResponse> => {
    const pending = pendingCoSign;
    if (!pending) {
      throw new Error("no transfer is waiting for a receiver co-sign");
    }
    const receiver = pending.input.to;
    setPrepareError(null);
    setIsPreparing(true);
    try {
      const exposed = (await connector?.getAccounts().catch(() => [])) ?? [];
      const canSignDirectly = exposed.some(
        (a) => a.toLowerCase() === receiver.toLowerCase(),
      );
      if (!canSignDirectly) {
        const switched = await requestReceiverExposure(receiver);
        if (!switched) throw new ReceiverAccountUnavailableError(receiver);
      }
      const proof = await signAndFinalize({
        input: pending.input,
        challenge: pending.challenge,
        signerAccount: receiver,
        signerConnector: connector,
      });
      setPendingCoSign(null);
      return proof;
    } catch (err) {
      setTransferPhase("idle");
      if (isReceiverAccountUnavailable(err)) {
        setPrepareError(err);
        throw err;
      }
      if (isAccountNotFound(err)) {
        // The wallet lost the account between probe and prompt — same honest blocker.
        const blocked = new ReceiverAccountUnavailableError(receiver);
        setPrepareError(blocked);
        throw blocked;
      }
      const wrapped = err instanceof Error ? err : new Error(String(err));
      setPrepareError(wrapped);
      throw wrapped;
    } finally {
      setIsPreparing(false);
    }
  }, [pendingCoSign, connector, requestReceiverExposure, signAndFinalize]);

  /** P4 cross-wallet handoff: URL the receiver opens on their own device —
   *  the paused challenge's typed data, base64url-encoded on the canonical
   *  /transfer/co-sign receive path. Null unless a co-sign is pending. */
  const coSignHandoffUrl = useCallback((): string | null => {
    const pending = pendingCoSign;
    if (!pending) return null;
    const message = buildAccessProofMessage(pending.input, pending.challenge);
    return handoffUrl(
      encodeHandoffPayload({
        v: 1,
        typedData: {
          domain,
          primaryType: "AccessProof",
          message,
        },
        meta: {
          tokenId: pending.input.tokenId.toString(),
          sender: from ?? ("" as `0x${string}`),
          receiver: pending.input.to,
          validUntil: pending.challenge.validUntil,
        },
      }),
    );
  }, [pendingCoSign, buildAccessProofMessage, domain, from]);

  /** P4 handoff apply: accept a signature the receiver's wallet produced on
   *  another device/browser. The signature is verified LOCALLY against the
   *  paused challenge (recover → must equal the receiver address) before the
   *  finalize call — a mismatched or damaged code never reaches the backend.
   *  The sender still calls confirm() for the on-chain submission. */
  const applyHandoffSignature = useCallback(
    async (signature: `0x${string}`): Promise<TransferResponse> => {
      const pending = pendingCoSign;
      if (!pending) {
        throw new Error("no transfer is waiting for a receiver co-sign");
      }
      if (!ACCEPTANCE_CODE_SHAPE.test(signature)) {
        throw new HandoffSignatureInvalidError(
          "This acceptance code is not a wallet signature.",
        );
      }
      setPrepareError(null);
      setIsPreparing(true);
      try {
        const message = buildAccessProofMessage(
          pending.input,
          pending.challenge,
        );
        const recovered = await recoverTypedDataAddress({
          domain,
          types: ACCESS_PROOF_TYPES,
          primaryType: "AccessProof",
          message,
          signature,
        });
        if (recovered.toLowerCase() !== pending.input.to.toLowerCase()) {
          throw new HandoffSignatureInvalidError(
            `This acceptance signature does not recover to the receiver address (recovered ${recovered}).`,
          );
        }
        const proof = await finalizePrepared({
          input: pending.input,
          challenge: pending.challenge,
          accessSignature: signature,
        });
        setPendingCoSign(null);
        return proof;
      } catch (err) {
        setTransferPhase("idle");
        if (isHandoffSignatureInvalid(err)) {
          setPrepareError(err);
          throw err;
        }
        const wrapped = err instanceof Error ? err : new Error(String(err));
        setPrepareError(wrapped);
        throw wrapped;
      } finally {
        setIsPreparing(false);
      }
    },
    [pendingCoSign, buildAccessProofMessage, domain, finalizePrepared],
  );

  const confirm = useCallback(
    async (input: TransferInput): Promise<Hex> => {
      if (!from) {
        throw new Error("wallet not connected");
      }
      const prepared = signature ?? signatureRef.current;
      if (!prepared?.accessProof || !prepared?.ownershipProof) {
        throw new Error("no prepared proof — call prepare() first");
      }
      setTransferPhase("confirming");
      setWritePending(true);
      setWriteError(null);
      try {
        const txHash = await write({
          to: getAxiomAgentNftAddress(chainId),
          abi: toViemAbi(ITRANSFER_FROM_ABI),
          functionName: "iTransferFrom",
          args: [
            from,
            input.to,
            input.tokenId,
            [
              {
                accessProof: prepared.accessProof,
                ownershipProof: prepared.ownershipProof,
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
    signatureRef.current = null;
    setTransferPhase("idle");
    setIntent(null);
    setPendingCoSign(null);
    setPrepareError(null);
    setIsPreparing(false);
    setWritePending(false);
    setWriteError(null);
    queryClient.removeQueries({ queryKey: ["transfer-challenge"] });
  }, [queryClient]);

  return {
    prepare,
    coSign,
    confirm,
    isLoading: isPreparing || challengeQuery.isFetching || isWritePending,
    error: prepareError ?? challengeQuery.error ?? (writeError as Error | null),
    signature,
    coSignReceiver: pendingCoSign?.input.to ?? null,
    coSignNonce: pendingCoSign
      ? buildAccessProofMessage(pendingCoSign.input, pendingCoSign.challenge)
          .nonce
      : null,
    coSignHandoffUrl,
    applyHandoffSignature,
    reset,
    transferPhase,
  };
}
