import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
import type { EncryptionOption } from "@0gfoundation/0g-storage-ts-sdk";

import { getBytes, keccak256, toUtf8Bytes, type Signer } from "ethers";
import type { Hex } from "viem";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  dataFilePath,
  atomicWriteFileSync,
  backupFileBestEffort,
} from "../path.js";

interface UploadResult {
  rootHash: Hex;
  txHash: Hex;
  size: number;
}

interface DownloadResult {
  data: Uint8Array;
  rootHash: Hex;
  size: number;
}

/**
 * Thrown when a blob decrypted under the transport key does not match the canary the
 * adapter embeds at upload time. The 0G SDK's decrypt is best-effort (AES-CTR has no
 * authentication): a wrong key silently yields garbage bytes instead of an error, so the
 * canary check is the only wrong-key signal. Carries the rootHash for typed handling.
 */
export class WrongKeyOrCorruptError extends Error {
  readonly rootHash: Hex;
  readonly reason: string;
  constructor(rootHash: Hex, reason: string) {
    super(
      `0G download failed canary check for ${rootHash}: ${reason} — decryption key is wrong or the blob is corrupted`,
    );
    this.name = "WrongKeyOrCorruptError";
    this.rootHash = rootHash;
    this.reason = reason;
  }
}

/**
 * Canary prefix embedded before transport encryption on every upload so `download()` can
 * prove decryption actually happened: the SDK's decrypt is best-effort CTR with no
 * authentication AND strips the encryption header before returning, so a wrong key yields
 * garbage bytes that are shape-identical to plaintext. Bumped only with a migration plan.
 */
const STORAGE_CANARY_PREFIX = toUtf8Bytes("AXIOM1");

/** True when `data` starts with the adapter's canary magic. */
function hasCanaryPrefix(data: Uint8Array): boolean {
  if (data.length < STORAGE_CANARY_PREFIX.length) return false;
  for (let i = 0; i < STORAGE_CANARY_PREFIX.length; i++) {
    if (data[i] !== STORAGE_CANARY_PREFIX[i]) return false;
  }
  return true;
}

function withCanaryPrefix(blob: Uint8Array): Uint8Array {
  const out = new Uint8Array(STORAGE_CANARY_PREFIX.length + blob.length);
  out.set(STORAGE_CANARY_PREFIX, 0);
  out.set(blob, STORAGE_CANARY_PREFIX.length);
  return out;
}

/**
 * Wrong-key canary on a freshly decrypted download (RD2 S4, made stateless by OPT-09).
 * Semantics:
 * - Blob carries an SDK encryption header (`peekHeader` non-null → uploaded transport-
 *   encrypted by this adapter line) and the decrypted bytes lack the AXIOM1 magic →
 *   wrong transport key or corrupted blob → WrongKeyOrCorruptError (the SDK's CTR
 *   decrypt has no authentication, so this content check is the only signal).
 * - Bytes carry the magic → strip it; callers get the exact payload that was uploaded.
 * - Header-less blob → legacy upload (pre-canary era, or deploy/e2e-plane app
 *   ciphertext encrypted outside this adapter), returned untouched — no false positives.
 */
function verifyCanaryAndStrip(
  data: Uint8Array,
  rootHash: Hex,
  uploadedEncrypted: boolean,
): Uint8Array {
  if (!uploadedEncrypted) return data;
  if (!hasCanaryPrefix(data)) {
    throw new WrongKeyOrCorruptError(
      rootHash,
      "decrypted bytes lack the AXIOM1 canary prefix",
    );
  }
  return data.subarray(STORAGE_CANARY_PREFIX.length);
}

export interface StorageAdapter {
  upload(
    blob: Uint8Array,
    encryption?: Encryption,
  ): Promise<{ rootHash: Hex }> | { rootHash: Hex };
  download(rootHash: Hex): Promise<Uint8Array> | Uint8Array;
  markDataHashSeen(rootHash: Hex): void;
  hasSeenDataHash(rootHash: Hex): boolean;
}

interface ZeroGStorageConfig {
  indexerRpc: string;
  evmRpc: string;
  signer: Signer;
  /** Explicit storage fee (wei) applied to every upload. When >0 the SDK skips market() pricing — required on chains where the flow contract lacks market() (e.g. Galileo testnet). Default undefined = on-chain pricing. */
  fee?: bigint;
}

type Encryption = EncryptionOption;

interface UploadOptions {
  encryption?: Encryption;
  /** Explicit storage fee (wei) — see ZeroGStorageConfig.fee. */
  fee?: bigint;
  /** Blob tags for storage-explorer attribution (metadata only — nothing is submitted to 0G DA). Defaults to "axiom-protocol/1". */
  tags?: Uint8Array;
}

interface DownloadOptions {
  symmetricKey?: Uint8Array;
  privateKey?: Uint8Array | string;
  withProof?: boolean;
}

const ORACLE_SEEN_HASHES_FILE = dataFilePath("oracle-seen-hashes.json");

interface SeenHashesOptions {
  seenHashesFile?: string;
}

/** Persistence seam for SeenHashesMixin: where seen hashes live across restarts. */
interface SeenHashesSink {
  load(): Set<string>;
  persist(seen: Set<string>): void;
  exists(): boolean;
}

/** Real disk-backed sink: same load/persist/backup behavior as before injection. */
class FileSeenHashesSink implements SeenHashesSink {
  constructor(private readonly file: string) {}

  load(): Set<string> {
    return loadSeenDataHashes(this.file);
  }

  persist(seen: Set<string>): void {
    persistSeenDataHashes(this.file, seen);
  }

  exists(): boolean {
    return existsSync(this.file);
  }
}

/** Test-double sink: nothing ever touches the filesystem. */
class MemorySeenHashesSink implements SeenHashesSink {
  load(): Set<string> {
    return new Set();
  }

  persist(_seen: Set<string>): void {
    /* in-memory only */
  }

  exists(): boolean {
    return false;
  }
}

function loadSeenDataHashes(file: string): Set<string> {
  try {
    // ENOENT lands in the catch below, which skips the backup for a missing file.
    const raw = readFileSync(file, "utf-8");
    const parsed = JSON.parse(raw) as { seenDataHashes?: unknown };
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray(parsed.seenDataHashes)
    )
      throw new Error("oracle seen-hashes file root is missing a string array");
    return new Set(
      parsed.seenDataHashes
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.toLowerCase()),
    );
  } catch {
    if (existsSync(file)) backupFileBestEffort(file);
    return new Set();
  }
}

function persistSeenDataHashes(file: string, seen: Set<string>): void {
  atomicWriteFileSync(file, JSON.stringify({ seenDataHashes: [...seen] }));
}

const SEEN_HASHES_FLUSH_THRESHOLD = 8;
const SEEN_HASHES_FLUSH_INTERVAL_MS = 5_000;

// Every SeenHashesMixin instance registers here so one signal-handler pair flushes marks on exit.
const seenHashesInstances = new Set<SeenHashesMixin>();
let seenHashesExitFlushRegistered = false;

function registerSeenHashesExitFlush(instance: SeenHashesMixin): void {
  seenHashesInstances.add(instance);
  if (seenHashesExitFlushRegistered) return;
  seenHashesExitFlushRegistered = true;
  const flushAll = (): void => {
    for (const inst of seenHashesInstances) {
      try {
        inst.flushSeenDataHashes();
      } catch (err) {
        console.error(
          JSON.stringify({
            level: "error",
            msg: "failed to flush oracle seen-hashes on exit",
            error: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    }
  };
  // once: after the first signal the listener is removed, preserving Node's default exit-on-signal behavior.
  process.once("SIGINT", flushAll);
  process.once("SIGTERM", flushAll);
}

abstract class SeenHashesMixin {
  protected seenDataHashes: Set<string>;
  private readonly sink: SeenHashesSink;
  private dirtyCount = 0;
  private flushTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(sink: SeenHashesSink) {
    this.sink = sink;
    this.seenDataHashes = sink.load();
    registerSeenHashesExitFlush(this);
  }

  markDataHashSeen(rootHash: Hex): void {
    const hash = rootHash.toLowerCase();
    if (this.seenDataHashes.has(hash)) return;
    this.seenDataHashes.add(hash);
    this.dirtyCount += 1;
    if (
      // First mark persists synchronously so concurrently-started instances observe it (durability contract).
      (this.dirtyCount === 1 && !this.sink.exists()) ||
      this.dirtyCount >= SEEN_HASHES_FLUSH_THRESHOLD
    ) {
      this.flushSeenDataHashes();
      return;
    }
    if (this.flushTimer === undefined) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = undefined;
        this.flushSeenDataHashes();
      }, SEEN_HASHES_FLUSH_INTERVAL_MS);
      this.flushTimer.unref?.();
    }
  }

  /** Persist any in-memory marks not yet on disk. Safe to call repeatedly (no-op when clean). */
  flushSeenDataHashes(): void {
    if (this.dirtyCount === 0) return;
    this.sink.persist(this.seenDataHashes);
    this.dirtyCount = 0;
  }

  hasSeenDataHash(rootHash: Hex): boolean {
    return this.seenDataHashes.has(rootHash.toLowerCase());
  }
}

export class InMemoryStorage extends SeenHashesMixin implements StorageAdapter {
  private store = new Map<string, Uint8Array>();

  constructor(options: SeenHashesOptions = {}) {
    // Test double: default sink keeps everything in memory (no disk artifacts);
    // an explicit seenHashesFile opts back into durable persistence for tests.
    super(
      options.seenHashesFile !== undefined
        ? new FileSeenHashesSink(options.seenHashesFile)
        : new MemorySeenHashesSink(),
    );
  }

  upload(blob: Uint8Array, _encryption?: Encryption): { rootHash: Hex } {
    const rootHash = keccak256(blob) as Hex;
    this.store.set(rootHash.toLowerCase(), new Uint8Array(blob));
    return { rootHash };
  }

  download(rootHash: Hex): Uint8Array {
    const blob = this.store.get(rootHash.toLowerCase());
    if (!blob) throw new Error(`Blob not found: ${rootHash}`);
    return new Uint8Array(blob);
  }
}
async function uploadToStorage(
  indexer: Indexer,
  data: Uint8Array,
  evmRpc: string,
  signer: Signer,
  options: UploadOptions = {},
): Promise<UploadResult> {
  const memData = new MemData(data);
  const uploadOpts: Parameters<typeof indexer.upload>[3] = {
    encryption: options.encryption,
    tags: options.tags ?? toUtf8Bytes("axiom-protocol/1"),
  };
  if (options.fee !== undefined) uploadOpts.fee = options.fee;
  const [tx, err] = await indexer.upload(memData, evmRpc, signer, uploadOpts);
  if (err) throw new Error(`0G upload failed: ${err.message ?? String(err)}`);
  const result = tx as { rootHash: string; txHash: string };
  if (!result.rootHash)
    throw new Error("SDK upload returned unexpected format");
  return {
    rootHash: result.rootHash as Hex,
    txHash: result.txHash as Hex,
    size: data.length,
  };
}

async function downloadFromStorage(
  indexer: Indexer,
  rootHash: Hex,
  opts: DownloadOptions = {},
): Promise<DownloadResult> {
  const downloadOpts: Parameters<typeof indexer.downloadToBlob>[1] = {
    proof: opts.withProof ?? true,
  };
  const decryption = {
    ...(opts.symmetricKey && { symmetricKey: opts.symmetricKey }),
    ...(opts.privateKey && { privateKey: opts.privateKey }),
  };
  if (decryption.symmetricKey || decryption.privateKey)
    downloadOpts.decryption = decryption;
  const [blob, err] = await indexer.downloadToBlob(rootHash, downloadOpts);
  if (err) throw new Error(`0G download failed: ${err.message ?? String(err)}`);
  if (!blob)
    throw new Error(`0G Storage download returned no blob for ${rootHash}`);
  const data = new Uint8Array(await blob.arrayBuffer());
  return { data, rootHash, size: data.length };
}

/** Short non-reversible fingerprint for alarms — never log the key itself. */
function keyFingerprint(key: Uint8Array): string {
  return `sha256:${createHash("sha256").update(key).digest("hex").slice(0, 12)}`;
}

function readTransportKeyFile(file: string): string {
  try {
    return readFileSync(file, "utf-8").trim();
  } catch {
    return "";
  }
}

/**
 * Transport AES key resolution: env hex > persisted .data key (mode 600) > bun-test ephemeral.
 * Every resolution logs a fingerprint (never key material); a first-time generation or an env
 * override of a persisted key is a loud alarm, because either silently makes previously
 * uploaded blobs undecryptable (client-side encryption has no server-side recovery).
 */
function resolveTransportKey(): Uint8Array {
  const raw = process.env.AXIOM_STORAGE_TRANSPORT_KEY?.trim();
  if (raw) {
    const hex = raw.replace(/^0x/, "");
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      throw new Error(
        "AXIOM_STORAGE_TRANSPORT_KEY must be a 32-byte hex string (64 hex chars, optional 0x prefix)",
      );
    }
    const key = getBytes(`0x${hex}`);
    const fileHex = readTransportKeyFile(dataFilePath("storage-transport-key"));
    if (fileHex && fileHex !== hex) {
      console.warn(
        `[0g-storage] AXIOM_STORAGE_TRANSPORT_KEY overrides persisted key file (file=${keyFingerprint(getBytes(`0x${fileHex}`))} env=${keyFingerprint(key)}) — blobs encrypted under the file key become undecryptable until the env var is cleared`,
      );
    }
    console.log(
      `[0g-storage] transport key loaded (source=env) fingerprint=${keyFingerprint(key)}`,
    );
    return key;
  }
  if (process.env.BUN_TEST === "1") {
    return crypto.getRandomValues(new Uint8Array(32));
  }
  const file = dataFilePath("storage-transport-key");
  const hex = readTransportKeyFile(file);
  if (/^[0-9a-f]{64}$/.test(hex)) {
    const key = getBytes(`0x${hex}`);
    console.log(
      `[0g-storage] transport key loaded (source=file) fingerprint=${keyFingerprint(key)}`,
    );
    return key;
  }
  if (hex !== "" || existsSync(file)) {
    console.warn(
      `[0g-storage] discarding corrupt transport-key file ${file} — blobs encrypted under the lost key become undecryptable`,
    );
    backupFileBestEffort(file);
  }
  const key = crypto.getRandomValues(new Uint8Array(32));
  atomicWriteFileSync(file, Buffer.from(key).toString("hex"), { mode: 0o600 });
  console.warn(
    `[0g-storage] generated NEW transport key fingerprint=${keyFingerprint(key)} (persisted at ${file}) — blobs uploaded under any previous key are now undecryptable; back this key file up immediately`,
  );
  return key;
}

export class ZeroGStorage extends SeenHashesMixin implements StorageAdapter {
  readonly indexer: Indexer;
  readonly config: ZeroGStorageConfig;
  // 32-byte transport AES key: env hex wins verbatim, else load-or-create from AXIOM_DATA_DIR/.data (bun test: ephemeral).
  private readonly storageKey: Uint8Array;
  /** root → blob-is-transport-encrypted (from peekHeader). Roots are immutable; failures are not cached. */
  private readonly headerCache = new Map<string, boolean>();

  /** Exposes the transport AES key so a verify step on the same instance can decrypt. */
  get transportKey(): Uint8Array {
    return this.storageKey;
  }

  constructor(config: ZeroGStorageConfig, options: SeenHashesOptions = {}) {
    // Production storage always persists seen hashes — default file unchanged.
    super(
      new FileSeenHashesSink(options.seenHashesFile ?? ORACLE_SEEN_HASHES_FILE),
    );
    this.config = config;
    this.indexer = new Indexer(config.indexerRpc);
    this.storageKey = resolveTransportKey();
  }

  async upload(
    blob: Uint8Array,
    encryption?: Encryption,
  ): Promise<{ rootHash: Hex }> {
    // uploadData applies the storageKey aes256 default when encryption is omitted.
    const options: UploadOptions = { encryption };
    if (this.config.fee !== undefined) options.fee = this.config.fee;
    // Canary prefix travels inside the encrypted envelope; download() verifies + strips it.
    const result = await this.uploadData(withCanaryPrefix(blob), options);
    return { rootHash: result.rootHash };
  }

  async download(rootHash: Hex): Promise<Uint8Array> {
    // Stateless wrong-key detection (OPT-09): the blob's own encryption header decides
    // whether the canary is mandatory — detection travels with the blob on 0G instead
    // of a fail-open sidecar registry file.
    const uploadedEncrypted = await this.peekEncrypted(rootHash);
    const result = await this.downloadWithOpts(rootHash, { withProof: true });
    return verifyCanaryAndStrip(result.data, rootHash, uploadedEncrypted);
  }

  /**
   * True when the root's blob has an SDK encryption header (aes256/ecies). Header-less
   * = legacy plaintext-plane blob. peekHeader errors are transient indexer failures:
   * fail-open (treated as legacy, never false-throwing) and NOT cached so the next
   * download re-checks.
   */
  private async peekEncrypted(rootHash: Hex): Promise<boolean> {
    const key = rootHash.toLowerCase();
    const cached = this.headerCache.get(key);
    if (cached !== undefined) return cached;
    const [header, err] = await this.indexer.peekHeader(rootHash);
    if (err) {
      console.warn(
        `[0g-storage] peekHeader failed for ${rootHash} — treating as legacy (fail-open): ${err.message ?? String(err)}`,
      );
      return false;
    }
    const encrypted = header !== null;
    this.headerCache.set(key, encrypted);
    return encrypted;
  }

  async uploadData(
    data: Uint8Array,
    options: UploadOptions = {},
  ): Promise<UploadResult> {
    const encryption = options.encryption ?? {
      type: "aes256",
      key: this.storageKey,
    };
    const result = await uploadToStorage(
      this.indexer,
      data,
      this.config.evmRpc,
      this.config.signer,
      { ...options, encryption },
    );
    return result;
  }

  async downloadWithOpts(
    rootHash: Hex,
    opts: DownloadOptions = {},
  ): Promise<DownloadResult> {
    return downloadFromStorage(this.indexer, rootHash, {
      ...opts,
      symmetricKey: opts.symmetricKey ?? this.storageKey,
    });
  }
}
