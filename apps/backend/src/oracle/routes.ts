import type { Express, Request, Response } from "express";
import { getBytes, hexlify, isAddress, toBeHex, zeroPadValue } from "ethers";
import { isHex, type Hex } from "viem";
import { HTTP } from "@axiom/config/constants";
import { ZodError } from "zod";

import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  concatEncrypted,
  parseEncrypted,
} from "@axiom/config/crypto/aes-gcm";
import {
  sealKeyForReceiver,
  unsealKeyForReceiver,
} from "@axiom/config/crypto/keys";
import type { TeeSigner } from "./signer.js";
import type { StorageAdapter } from "@axiom/config/storage/0g";
import { mintDataHashSchema } from "../route-schemas.js";
import type { BackendEnv } from "../env-schema.js";
import { extractErrorMessage } from "../utils/response.js";

/** In-process oracle deps: the TEE signer and storage are shared with the host backend (no HTTP hop). */
export interface OracleRouteDeps {
  signer: TeeSigner;
  storage: StorageAdapter;
  chainId: bigint;
  verifier: Hex;
  env?: BackendEnv;
}

/** Structured failure from the in-process helpers; the transfer route maps it to `status` + message. */
export class OracleRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const DEFAULT_MAX_PROOF_AGE_SECONDS = 7n * 24n * 3600n;

/**
 * Content-addressed blob LRU (key = rootHash, value = raw bytes). Roots are immutable by
 * construction (the transfer route rejects any rootHash ≠ URI binding), so entries never
 * need invalidation. Rekey challenges previously re-downloaded the old blob on every call
 * — the 20s-timeout storage leg — making repeat challenges ~free. Same helper is reusable
 * for runTick's modelDataRoot read and chat-history reads; only transferValidity is wired
 * this pass. Bounded by AXIOM_BLOB_CACHE_MAX_ENTRIES (default 32) and ~64 MB total.
 */
const blobCache = new Map<string, Uint8Array>();
const BLOB_CACHE_MAX_BYTES = 64 * 1024 * 1024;
let blobCacheBytes = 0;

function blobCacheMaxEntries(): number {
  const raw = Number(process.env.AXIOM_BLOB_CACHE_MAX_ENTRIES);
  return Number.isInteger(raw) && raw > 0 ? raw : 32;
}

/** @internal Cache lookup+fill for immutable storage roots; exposed for future adopters. */
export async function downloadBlobCached(
  storage: StorageAdapter,
  rootHash: string,
): Promise<Uint8Array> {
  const key = rootHash.toLowerCase();
  const cached = blobCache.get(key);
  if (cached) {
    // LRU touch: delete+set moves the entry to eviction-freshest position.
    blobCache.delete(key);
    blobCache.set(key, cached);
    return cached;
  }
  const blob = await storage.download(rootHash as `0x${string}`);
  blobCache.set(key, blob);
  blobCacheBytes += blob.length;
  while (
    blobCache.size > blobCacheMaxEntries() ||
    blobCacheBytes > BLOB_CACHE_MAX_BYTES
  ) {
    const oldest = blobCache.keys().next().value;
    if (oldest === undefined) break;
    const evicted = blobCache.get(oldest);
    blobCache.delete(oldest);
    if (evicted) blobCacheBytes -= evicted.length;
  }
  return blob;
}

/** Single funnel for BAD_REQUEST validation failures so every rejection keeps the same error shape. */
function requireCond(cond: unknown, message: string): asserts cond {
  if (!cond) throw new OracleRequestError(HTTP.BAD_REQUEST, message);
}

/** Non-validation failure (upstream storage/crypto): still surfaces as an OracleRequestError. */
function reject(status: number, message: string): never {
  throw new OracleRequestError(status, message);
}

function defaultValidUntil(): bigint {
  return BigInt(Math.floor(Date.now() / 1000)) + 86400n;
}

/** Accepts bigint / positive integer / decimal-or-hex string; null when unparseable. */
function parsePositiveBigInt(raw: string | number | bigint): bigint | null {
  try {
    if (typeof raw === "bigint") return raw;
    if (typeof raw === "number" && Number.isInteger(raw) && raw > 0)
      return BigInt(raw);
    if (typeof raw === "string" && (isHex(raw) || /^\d+$/.test(raw)))
      return BigInt(raw);
  } catch {
    /* fall through to null */
  }
  return null;
}

/** Canonical 32-byte nonce (see routers/agents.ts — minimal hex breaks
 * wallet `bytes` typing when the top nibble is zero). */
function canonicalNonce(value: string | number | undefined): `0x${string}` {
  return zeroPadValue(toBeHex(BigInt(value ?? 0)), 32) as `0x${string}`;
}

/**
 * On-chain max proof age: `_checkValidUntil` (AxiomTeeVerifier) rejects
 * `validUntil - now > maxProofAgeSeconds`. Deployed default is 7 days; override via
 * AXIOM_MAX_PROOF_AGE_SECONDS (decimal seconds) to match the deployed verifier.
 */
function maxProofAgeSeconds(env?: BackendEnv): bigint {
  const v =
    env?.AXIOM_MAX_PROOF_AGE_SECONDS ?? Number(DEFAULT_MAX_PROOF_AGE_SECONDS);
  return BigInt(v);
}

export interface TransferValidityInput {
  oldDataHash: `0x${string}`;
  oldDataUri: `0x${string}`;
  targetPubkey64: `0x${string}`;
  accessProofNonce: string | number;
  ownershipProofNonce?: string | number;
  oldDataEncryptionKey?: string;
  /** ECIES-sealed 32-byte DEK to the oracle TEE pubkey (preferred over cleartext). */
  sealedDataEncryptionKey?: string;
  to: `0x${string}`;
  nft: `0x${string}`;
}

interface TransferValidityResult {
  newDataUri: `0x${string}`;
  newDataHash: `0x${string}`;
  sealedKey: `0x${string}`;
  ownershipSignature: `0x${string}`;
  accessProofNonce: string | number;
  ownershipProofNonce: string | number;
  validUntil: string;
}

/**
 * Re-key path: download the old blob (E2 — a failed/missing download MUST abort, never fabricate
 * an empty blob), re-encrypt under a fresh 32-byte DEK, upload, seal the new DEK to the target
 * pubkey, and sign the ownership proof. Throws OracleRequestError on every failure path.
 */
export async function transferValidity(
  deps: OracleRouteDeps,
  input: TransferValidityInput,
): Promise<TransferValidityResult> {
  const { signer, storage, env } = deps;
  const {
    oldDataHash,
    oldDataUri,
    targetPubkey64,
    accessProofNonce,
    ownershipProofNonce,
    oldDataEncryptionKey,
    sealedDataEncryptionKey,
    to,
    nft,
  } = input;

  requireCond(
    oldDataHash && oldDataUri && targetPubkey64,
    "Missing required field",
  );
  requireCond(
    targetPubkey64.length === 130,
    "targetPubkey64 must be 64 bytes (128 hex chars)",
  );
  const normHash = String(oldDataHash).toLowerCase().replace(/^0x/, "");
  const normUri = String(oldDataUri).toLowerCase().replace(/^0x/, "");
  requireCond(
    normHash === normUri,
    "oldDataUri must equal oldDataHash (blob root binding)",
  );

  const allowCleartext =
    env?.AXIOM_ALLOW_CLEARTEXT_DEK === "true" &&
    process.env.NODE_ENV !== "production";

  let oldDataKey: Uint8Array | undefined;
  if (
    typeof sealedDataEncryptionKey === "string" &&
    sealedDataEncryptionKey.length > 0
  ) {
    const hexEncoded = sealedDataEncryptionKey.startsWith("0x");
    const sealedBytes = Buffer.from(
      hexEncoded ? sealedDataEncryptionKey.slice(2) : sealedDataEncryptionKey,
      hexEncoded ? "hex" : "base64",
    );
    oldDataKey = unsealKeyForReceiver(signer.privateKeyBytes, sealedBytes);
  } else if (oldDataEncryptionKey && allowCleartext) {
    oldDataKey = Buffer.from(oldDataEncryptionKey, "base64");
  }
  requireCond(
    oldDataKey !== undefined,
    oldDataEncryptionKey
      ? "cleartext oldDataEncryptionKey rejected; send sealedDataEncryptionKey (ECIES to oracle pubkey from GET /oracle/health)"
      : "sealedDataEncryptionKey is required (ECIES-seal the 32-byte DEK to oracle uncompressed pubkey)",
  );
  requireCond(
    oldDataKey.length === 32,
    "data encryption key must be 32 bytes after unseal",
  );

  // E2: a failed or missing download MUST abort the transfer — falling back to an empty
  // blob would re-encrypt nothing and sign transfer proofs over fabricated data, silently
  // destroying the token's stored data (wrong transport key after restart, 0G outage, timeout).
  // Cached: rootHash is content-addressed and immutable, so repeat challenges never
  // re-download (the 20s storage leg vanishes on cache hit).
  let downloadTimer: NodeJS.Timeout | undefined;
  let oldBlob: Uint8Array;
  try {
    oldBlob = await Promise.race([
      Promise.resolve(downloadBlobCached(storage, oldDataUri)),
      new Promise<Uint8Array>((_, reject) => {
        downloadTimer = setTimeout(
          () => reject(new Error("storage.download timed out after 20000ms")),
          20_000,
        );
      }),
    ]);
  } catch (err) {
    reject(
      HTTP.BAD_GATEWAY,
      `Failed to download old blob ${oldDataUri}: ${extractErrorMessage(err)} — transfer aborted, no data fabricated`,
    );
  } finally {
    clearTimeout(downloadTimer);
  }
  if (oldBlob.length === 0) {
    reject(
      HTTP.BAD_GATEWAY,
      `Downloaded blob for ${oldDataUri} is empty — transfer aborted, no data fabricated`,
    );
  }
  const oldEnc = parseEncrypted(oldBlob);
  let oldPlaintext: Uint8Array;
  try {
    oldPlaintext = aesGcmDecrypt(oldDataKey, oldEnc);
  } catch (err) {
    reject(
      HTTP.BAD_GATEWAY,
      `Failed to decrypt old blob with the provided data key (${extractErrorMessage(err)}) — transfer aborted`,
    );
  }

  const newDataKey = crypto.getRandomValues(new Uint8Array(32));
  const newEnc = aesGcmEncrypt(newDataKey, oldPlaintext);
  const newBlob = concatEncrypted(newEnc);
  const { rootHash } = await storage.upload(newBlob);
  const newDataHash = rootHash as `0x${string}`;
  storage.markDataHashSeen(newDataHash);

  const targetPubkeyBytes = getBytes(targetPubkey64);
  const sealedKey = sealKeyForReceiver(targetPubkeyBytes, newDataKey);
  const sealedKeyHex = hexlify(sealedKey) as `0x${string}`;
  const validUntilDefault = defaultValidUntil();
  const ownershipSignature = signer.signOwnership({
    dataHash: oldDataHash,
    sealedKey: sealedKeyHex,
    targetPubkey: targetPubkey64,
    to,
    nft,
    nonce: canonicalNonce(ownershipProofNonce ?? accessProofNonce),
    validUntil: validUntilDefault,
  });

  return {
    newDataUri: newDataHash,
    newDataHash,
    sealedKey: sealedKeyHex,
    ownershipSignature,
    accessProofNonce: accessProofNonce ?? 0,
    ownershipProofNonce: ownershipProofNonce ?? accessProofNonce ?? 0,
    validUntil: validUntilDefault.toString(),
  };
}

interface SignOwnershipInput {
  dataHash: `0x${string}`;
  targetPubkey: `0x${string}`;
  sealedKey: `0x${string}`;
  nonce: string | number;
  to: `0x${string}`;
  nft: `0x${string}`;
  validUntil?: string | number | bigint;
}

interface SignOwnershipResult {
  signature: `0x${string}`;
  signer: `0x${string}`;
  validUntil: string;
}

/**
 * Sign an ownership proof for a dataHash the oracle has already seen (mint registration).
 * E3: a validUntil beyond the on-chain max proof age is rejected, not clamped — the proof
 * would be unverifiable DOA. Throws OracleRequestError on every failure path.
 */
export async function signOwnership(
  deps: OracleRouteDeps,
  input: SignOwnershipInput,
): Promise<SignOwnershipResult> {
  const { signer, storage, env } = deps;
  const {
    dataHash,
    targetPubkey,
    sealedKey,
    nonce,
    to,
    nft,
    validUntil: rawValidUntil,
  } = input;

  requireCond(dataHash && targetPubkey && sealedKey, "Missing required field");
  requireCond(
    storage.hasSeenDataHash(dataHash),
    `Unknown dataHash: not previously seen by oracle. POST {dataHash} to /v1/agents/mint first.`,
  );
  requireCond(
    to && isAddress(to),
    "'to' address is required and must be a valid non-zero address",
  );
  requireCond(
    nft && isAddress(nft),
    "'nft' address is required and must be a valid non-zero address",
  );

  const validUntilDefault = defaultValidUntil();
  let validUntil = validUntilDefault;
  if (rawValidUntil !== undefined) {
    const parsed = parsePositiveBigInt(rawValidUntil);
    requireCond(parsed !== null, "Invalid validUntil");
    // E3: on-chain _checkValidUntil rejects validUntil - now > maxProofAgeSeconds
    // (deployed 7 days). A proof signed with a farther deadline is unverifiable DOA,
    // so reject the request instead of clamping to a value the chain still rejects.
    const maxProofAge = maxProofAgeSeconds(env);
    requireCond(
      parsed <= BigInt(Math.floor(Date.now() / 1000)) + maxProofAge,
      `validUntil ${parsed} exceeds maximum proof validity (now + ${maxProofAge}s); on-chain _checkValidUntil rejects validUntil - now > maxProofAgeSeconds`,
    );
    validUntil = parsed;
  }

  const signature = signer.signOwnership({
    dataHash,
    sealedKey,
    targetPubkey,
    to,
    nft,
    nonce: canonicalNonce(nonce),
    validUntil,
  });
  return {
    signature,
    signer: signer.address,
    validUntil: validUntil.toString(),
  };
}

/**
 * Mount the in-process oracle surface. No middleware is added here — the host backend applies
 * express.json, helmet, cors, and API-key auth globally before route registrars. The /oracle
 * prefix preserves the frontend same-origin proxy contract (VITE_ORACLE_URL ?? "/oracle").
 */
export function registerOracleRoutes(
  app: Express,
  deps: OracleRouteDeps,
): void {
  const { signer, storage } = deps;

  app.get("/oracle/health", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      signer: signer.address,
      uncompressedPubkey: hexlify(signer.uncompressedPubkey),
      version: "0.1.0",
    });
  });

  app.post("/oracle/v1/agents/mint", (req: Request, res: Response) => {
    try {
      const { dataHash } = mintDataHashSchema.parse(req.body);
      requireCond(
        /^0x[0-9a-fA-F]{64}$/.test(dataHash),
        "dataHash must be a 32-byte hex string (0x + 64 hex chars)",
      );
      storage.markDataHashSeen(dataHash);
      res.json({ ok: true, dataHash, seen: true });
    } catch (err) {
      if (!(err instanceof OracleRequestError || err instanceof ZodError))
        throw err;
      res.status(HTTP.BAD_REQUEST).json({
        error:
          err instanceof ZodError
            ? (err.issues[0]?.message ?? "Validation error")
            : err.message,
      });
    }
  });
}
