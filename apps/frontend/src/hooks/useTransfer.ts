import { useCallback, useRef, useState } from "react";
import { useAccount, useChainId, useSignTypedData } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { type Hex, recoverTypedDataAddress, toHex } from "viem";
import type { Connector } from "wagmi";

import {
  getAxiomAgentNftAddress,
  useEip712Domain,
  ACCESS_PROOF_TYPES,
  toViemAbi,
} from "../abi/addresses.js";
import { ITRANSFER_FROM_ABI } from "@axiom/config/abis";
import {
  sealKeyForReceiver,
  hexToBytes,
  base64ToBytes,
} from "@axiom/config/crypto/keys";

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
  ReceiverAccountUnavailableError,
  isReceiverAccountUnavailable,
  type AccessProofMessage,
} from "../lib/transferHandoff.js";
import type {
  TransferInput,
  TransferResponse,
  TransferPhase,
} from "@axiom/config/types/transfer";
export type { TransferInput, TransferResponse, TransferPhase };

/** Thrown when the receiver address has no on-chain-recoverable public key
 * (GET /v1/registry/pubkey 404 NO_ONCHAIN_KEY) and no manual paste was
 * supplied — the GUI offers the Advanced paste field, never a dead end. */
export class ReceiverKeyUnknownError extends Error {
  readonly receiver: `0x${string}`;
  constructor(receiver: `0x${string}`) {
    super(
      `No public key found on-chain for ${receiver}. Ask the receiver to paste their public key (Advanced).`,
    );
    this.name = "ReceiverKeyUnknownError";
    this.receiver = receiver;
  }
}

/** prepare() outcome — self-transfers finish in one step ("ready");
 * cross-party transfers pause after the oracle challenge until the RECEIVER
 * co-signs the AccessProof (protocol requires recovered signer == recipient). */
type PrepareResult =
  | { status: "ready"; proof: TransferResponse }
  | { status: "co-sign-required"; receiver: `0x${string}` };

/** Thrown when the connected wallet cannot expose the receiver account, so the
 * co-sign can never succeed from this session — the GUI renders an honest
 * blocker (change recipient / let the receiver sign from their own session),
 * never a futile retry. Lives in transferHandoff.ts (pure module, no wagmi/env
 * graph) and is re-exported here for the hook's consumers. */
export { ReceiverAccountUnavailableError, isReceiverAccountUnavailable };

/** handoff: an acceptance code that is not a signature at all, or one that
 * recovers to a different address than the receiver. Both mean "ask the
 * receiver to sign the link again" — never submit a mismatched proof. */
export class HandoffSignatureInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HandoffSignatureInvalidError";
  }
}

type Eip1193Provider = {
  request: (args: {
    method: string;
    params?: unknown[] | Record<string, unknown>;
  }) => Promise<unknown>;
};

/** wagmi/viem wrap connector errors — walk the cause chain for the
 * ConnectorAccountNotFound signal (receiver not exposed by the wallet). */
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
   * address that must co-sign before confirm() can run. */
  coSignReceiver: `0x${string}` | null;
  /** Canonical-hex nonce of the paused challenge — lets callers match
   * receiver-produced results (localStorage cross-tab) to THIS challenge
   * before applying. */
  coSignNonce: `0x${string}` | null;
  /** URL the receiver opens on their own device to sign the acceptance. */
  coSignHandoffUrl: () => string | null;
  /** Verify + apply a receiver-produced acceptance signature. */
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

// Oracle TEE pubkey is deployment-static; cache it so each re-key transfer
// skips the /health hop. A mid-session pubkey rotation requires a page reload.
let cachedOraclePubkey: Uint8Array | null = null;

async function fetchOraclePubkey(signal?: AbortSignal): Promise<Uint8Array> {
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
  return pubBytes;
}

async function sealDekForOracle(
  oldDataEncryptionKeyB64: string,
  signal?: AbortSignal,
): Promise<string> {
  const pubBytes = cachedOraclePubkey ?? (await fetchOraclePubkey(signal));
  cachedOraclePubkey = pubBytes;
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
  const { domain } = useEip712Domain();
  const queryClient = useQueryClient();

  const [signature, setSignature] = useState<TransferResponse | null>(null);
  // Ref mirror of `signature`: chained prepare→confirm runs in one stale closure, so confirm() reads this ref.
  const signatureRef = useRef<TransferResponse | null>(null);
  const [transferPhase, setTransferPhase] = useState<TransferPhase>("idle");
  const [isPreparing, setIsPreparing] = useState(false);
  const [prepareError, setPrepareError] = useState<Error | null>(null);
  // paused cross-party transfer — challenge is fetched, receiver co-sign outstanding
  const [pendingCoSign, setPendingCoSign] = useState<{
    input: TransferInput;
    challenge: TransferChallenge;
  } | null>(null);
  // Intent-start marker: each prepare() bumps `attempt` so the fetchQuery
  // cache key is fresh every time (nonces are single-use — never reuse one).
  const attemptRef = useRef(0);

  /** Normalize + record a failure — shared by every prepare/coSign/apply catch path. */
  const failWith = useCallback((err: unknown): Error => {
    const wrapped = err instanceof Error ? err : new Error(String(err));
    setPrepareError(wrapped);
    return wrapped;
  }, []);

  /** Guard shared by the paused-challenge consumers (coSign, handoff apply). */
  const requirePendingCoSign = useCallback(() => {
    if (!pendingCoSign)
      throw new Error("no transfer is waiting for a receiver co-sign");
    return pendingCoSign;
  }, [pendingCoSign]);

  /** Shared shell for prepare/coSign/handoff-apply: clears stale errors,
   * gates isLoading, resets phase + records a normalized failure. `translate`
   * lets coSign map a lost wallet account onto the honest blocker. */
  const runStep = useCallback(
    async <T>(
      translate: ((err: unknown) => unknown) | null,
      fn: () => Promise<T>,
    ): Promise<T> => {
      setPrepareError(null);
      setIsPreparing(true);
      try {
        return await fn();
      } catch (err) {
        setTransferPhase("idle");
        throw failWith(translate ? translate(err) : err);
      } finally {
        setIsPreparing(false);
      }
    },
    [failWith],
  );

  const runChallenge = useCallback(
    async ({
      input,
      signal,
    }: {
      input: TransferInput;
      signal?: AbortSignal;
    }): Promise<TransferChallenge> => {
      const path = agentTransferPath(input.tokenId);

      // P3 §(b)#4: resolve the receiver pubkey from the address at prepare
      // time (manual 130-hex paste wins). Backend nonce default verified
      // read-only (routers/agents.ts `BigInt(accessProofNonce ?? 0)` +
      // oracle/routes.ts canonicalNonce `?? 0`) — no client nonce is sent.
      const receiverPubKey64 = await resolveReceiverPubKey(
        input.to,
        input.receiverPubKeyManual,
        signal,
      );

      const challengeBody: Record<string, unknown> = {
        to: input.to,
        receiverPubKey64,
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
          "backend did not return a transfer challenge. Challenge failed — try again.",
        );
      }
      if (
        !challenge.dataHash ||
        !challenge.targetPubkey ||
        challenge.accessProofNonce === undefined ||
        challenge.validUntil === undefined
      ) {
        throw new Error(
          "incomplete transfer challenge from backend — start over",
        );
      }
      return challenge as TransferChallenge;
    },
    [],
  );

  /** P3 §(b)#4: manual 130-hex paste wins; otherwise resolve the receiver's
   * uncompressed pubkey from their address via the backend registry (ecrecover
   * over their latest outgoing tx). 404 NO_ONCHAIN_KEY → ReceiverKeyUnknownError. */
  async function resolveReceiverPubKey(
    address: `0x${string}`,
    manual: string | undefined,
    signal?: AbortSignal,
  ): Promise<`0x${string}`> {
    if (manual && manual.length === 130) {
      return manual as `0x${string}`;
    }
    const r = await apiFetch<{ receiverPubKey64?: `0x${string}` }>(
      `/v1/registry/pubkey/${address}`,
      { signal },
    );
    if (!r.receiverPubKey64) {
      throw new ReceiverKeyUnknownError(address);
    }
    return r.receiverPubKey64;
  }

  // The challenge is fetched once per attempt inside prepare() via
  // queryClient.fetchQuery (nonces are single-use, so no cache reuse) —
  // a useQuery subscription here would only mirror isLoading/error that
  // runStep + prepareError already surface.

  // Finalize logic lives in finalizePrepared — shared by sign and handoff-apply paths (signature origin is the only diff).

  /** Canonical AccessProof message for a paused/active challenge — the one
   * structure the wallet signs, the sender validates handoff codes against
   * and the backend verifier hashes (shared by sign + handoff paths). */
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
        // Canonical 32-byte hex — minimal hex of a decimal nonce can be odd-length, which wallets reject.
        nonce: toHex(nonce, { size: 32 }),
        validUntil,
      };
    },
    [chainId],
  );

  /** Exchanges a receiver signature for the final proof structs (no wallet
   * action) — shared by the in-wallet co-sign and the handoff apply. */
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
            receiverPubKey64: challenge.targetPubkey,
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
   * it for the final proof structs. Shared by the self-transfer one-step path
   * (signer == connected owner) and the cross-party co-sign step (signer ==
   * recipient). */
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
        // Passing the connector forces a fresh getAccounts() probe — cached connections lag account switches.
        ...(signerConnector ? { connector: signerConnector } : {}),
      });
      return finalizePrepared({ input, challenge, accessSignature });
    },
    [domain, signTypedDataAsync, buildAccessProofMessage, finalizePrepared],
  );

  /** Asks the wallet to expose/switch accounts (wallet_requestPermissions,
   * fallback eth_requestAccounts), then re-probes the connector account list. */
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
          // No permission flow (or denied) — plain eth_requestAccounts is the only other lever injected wallets expose.
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
      // Manual paste (when supplied) must still be the exact 64-byte shape;
      // without a paste, runChallenge resolves the key from the address.
      if (
        input.receiverPubKeyManual !== undefined &&
        input.receiverPubKeyManual.length > 0 &&
        input.receiverPubKeyManual.length !== 130
      ) {
        throw new Error(
          "receiverPubKey64 must be 0x-prefixed 64 raw bytes (X||Y, no 0x04 prefix)",
        );
      }

      setPendingCoSign(null);
      const attempt = attemptRef.current + 1;
      attemptRef.current = attempt;
      setTransferPhase("challenge");
      return runStep(null, async () => {
        const challenge = await queryClient.fetchQuery({
          queryKey: ["transfer-challenge", attempt],
          queryFn: ({ signal }) => runChallenge({ input, signal }),
          staleTime: Infinity,
          retry: false,
        });

        // AccessProof must recover to the RECIPIENT: self-transfers stay one-step; cross-party pauses for coSign().
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
      });
    },
    [from, queryClient, runChallenge, signAndFinalize, runStep],
  );

  /** receiver co-sign: signs the paused challenge's AccessProof AS the
   * recipient. If the wallet does not expose the receiver account, asks it to
   * switch/add the account once; when that is impossible the caller gets a
   * ReceiverAccountUnavailableError (honest blocker, not a retry loop). The
   * connected sender session is never replaced — after this resolves, the
   * sender's own confirm() submits the transfer. */
  const coSign = useCallback(async (): Promise<TransferResponse> => {
    const pending = requirePendingCoSign();
    const receiver = pending.input.to;
    // Wallet lost the receiver account between probe and prompt — same honest blocker.
    return runStep(
      (err) =>
        !isReceiverAccountUnavailable(err) && isAccountNotFound(err)
          ? new ReceiverAccountUnavailableError(receiver)
          : err,
      async () => {
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
      },
    );
  }, [
    requirePendingCoSign,
    runStep,
    connector,
    requestReceiverExposure,
    signAndFinalize,
  ]);

  /** cross-wallet handoff: URL the receiver opens on their own device —
   * the paused challenge's typed data, base64url-encoded on the canonical
   * /transfer/co-sign receive path. Null unless a co-sign is pending. */
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

  /** handoff apply: accept a signature the receiver's wallet produced on
   * another device/browser. The signature is verified LOCALLY against the
   * paused challenge (recover → must equal the receiver address) before the
   * finalize call — a mismatched or damaged code never reaches the backend.
   * The sender still calls confirm() for the on-chain submission. */
  const applyHandoffSignature = useCallback(
    async (signature: `0x${string}`): Promise<TransferResponse> => {
      const pending = requirePendingCoSign();
      if (!ACCEPTANCE_CODE_SHAPE.test(signature)) {
        throw new HandoffSignatureInvalidError(
          "This acceptance code is not a wallet signature.",
        );
      }
      return runStep(null, async () => {
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
      });
    },
    [
      requirePendingCoSign,
      runStep,
      buildAccessProofMessage,
      domain,
      finalizePrepared,
    ],
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
        setTransferPhase("idle");
        return txHash;
      } catch (err) {
        setTransferPhase("idle");
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `On-chain transaction failed: ${msg}. Your prepared proof is still valid — click "Edit" to restart the flow with a fresh nonce.`,
          { cause: err },
        );
      } finally {
        setWritePending(false);
      }
    },
    [chainId, from, signature, write],
  );

  const reset = useCallback((): void => {
    setSignature(null);
    signatureRef.current = null;
    setTransferPhase("idle");
    setPendingCoSign(null);
    setPrepareError(null);
    setIsPreparing(false);
    setWritePending(false);
    queryClient.removeQueries({ queryKey: ["transfer-challenge"] });
  }, [queryClient]);

  return {
    prepare,
    coSign,
    confirm,
    isLoading: isPreparing || isWritePending,
    error: prepareError,
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
