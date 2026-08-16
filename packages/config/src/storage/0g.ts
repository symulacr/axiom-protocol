import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
import type { EncryptionOption } from "@0gfoundation/0g-storage-ts-sdk";

import { getBytes, keccak256, toUtf8Bytes, type Signer } from "ethers";
import type { Hex } from "viem";
import { existsSync, readFileSync } from "node:fs";
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
  /** Explicit storage fee (wei). When >0 the SDK skips market() pricing — required on chains where the flow contract lacks market() (e.g. Galileo testnet). Default 0 = on-chain pricing. */
  fee?: bigint;
  /** Blob tags for DA/explorer attribution. Defaults to "axiom-protocol/1". */
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

function loadSeenDataHashes(file: string): Set<string> {
  try {
    if (!existsSync(file)) return new Set();
    const raw = readFileSync(file, "utf-8");
    const parsed = JSON.parse(raw) as { seenDataHashes?: unknown };
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !Array.isArray(parsed.seenDataHashes)
    ) {
      throw new Error("oracle seen-hashes file root is missing a string array");
    }
    const seen = new Set<string>();
    for (const item of parsed.seenDataHashes) {
      if (typeof item === "string") seen.add(item.toLowerCase());
    }
    return seen;
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

// Every SeenHashesMixin instance registers here so a single pair of exit handlers
// (SIGINT/SIGTERM) can flush in-memory marks to disk on process exit.
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
  // once: after the first signal the listener is removed, so processes without
  // their own signal handling keep Node's default exit-on-signal behavior.
  process.once("SIGINT", flushAll);
  process.once("SIGTERM", flushAll);
}

abstract class SeenHashesMixin {
  protected seenDataHashes: Set<string>;
  protected readonly seenHashesFile: string;
  private dirtyCount = 0;
  private flushTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(seenHashesFile: string) {
    this.seenHashesFile = seenHashesFile;
    this.seenDataHashes = loadSeenDataHashes(seenHashesFile);
    registerSeenHashesExitFlush(this);
  }

  markDataHashSeen(rootHash: Hex): void {
    const hash = rootHash.toLowerCase();
    if (this.seenDataHashes.has(hash)) return;
    this.seenDataHashes.add(hash);
    this.dirtyCount += 1;
    if (this.dirtyCount === 1 && !existsSync(this.seenHashesFile)) {
      // First-ever mark: persist synchronously so the backing file exists and a
      // concurrently-started instance observes the mark (durability contract).
      this.flushSeenDataHashes();
      return;
    }
    if (this.dirtyCount >= SEEN_HASHES_FLUSH_THRESHOLD) {
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
    persistSeenDataHashes(this.seenHashesFile, this.seenDataHashes);
    this.dirtyCount = 0;
  }

  hasSeenDataHash(rootHash: Hex): boolean {
    return this.seenDataHashes.has(rootHash.toLowerCase());
  }
}

export class InMemoryStorage extends SeenHashesMixin implements StorageAdapter {
  private store = new Map<string, Uint8Array>();

  constructor(options: SeenHashesOptions = {}) {
    super(options.seenHashesFile ?? ORACLE_SEEN_HASHES_FILE);
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
    ...(options.fee !== undefined ? { fee: options.fee } : {}),
  };
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
  if (opts.symmetricKey || opts.privateKey) {
    downloadOpts.decryption = {
      ...(opts.symmetricKey ? { symmetricKey: opts.symmetricKey } : {}),
      ...(opts.privateKey ? { privateKey: opts.privateKey } : {}),
    };
  }
  const [blob, err] = await indexer.downloadToBlob(rootHash, downloadOpts);
  if (err) throw new Error(`0G download failed: ${err.message ?? String(err)}`);
  if (!blob)
    throw new Error(`0G Storage download returned no blob for ${rootHash}`);
  const data = new Uint8Array(await blob.arrayBuffer());

  return { data, rootHash, size: data.length };
}

/**
 * Resolve the SDK transport AES key — load-or-create, so blobs stay decryptable
 * across restarts (same durability contract as the seen-hashes file):
 *  1. AXIOM_STORAGE_TRANSPORT_KEY (32-byte hex, optional 0x prefix) wins verbatim.
 *  2. Otherwise the key is loaded from (or first created in)
 *     AXIOM_DATA_DIR/.data/storage-transport-key — atomic tmp+rename, mode 600.
 *     A corrupt file is backed up and regenerated (blobs under the lost key warn).
 *  3. Under `bun test` (BUN_TEST=1) a fresh ephemeral random key is used — tests
 *     never touch the on-disk key.
 */
function resolveTransportKey(): Uint8Array {
  const raw = process.env.AXIOM_STORAGE_TRANSPORT_KEY;
  if (raw !== undefined && raw.trim() !== "") {
    const hex = raw.trim().replace(/^0x/, "");
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
      throw new Error(
        "AXIOM_STORAGE_TRANSPORT_KEY must be a 32-byte hex string (64 hex chars, optional 0x prefix)",
      );
    }
    return getBytes(`0x${hex}`);
  }
  if (process.env.BUN_TEST === "1") {
    return crypto.getRandomValues(new Uint8Array(32));
  }
  const file = dataFilePath("storage-transport-key");
  let hex = "";
  try {
    hex = existsSync(file) ? readFileSync(file, "utf-8").trim() : "";
  } catch {
    /* unreadable → regenerate below */
  }
  if (/^[0-9a-f]{64}$/.test(hex)) return getBytes(`0x${hex}`);
  if (hex !== "" || existsSync(file)) {
    console.warn(
      `[0g-storage] discarding corrupt transport-key file ${file} — blobs encrypted under the lost key become undecryptable`,
    );
    backupFileBestEffort(file);
  }
  const key = crypto.getRandomValues(new Uint8Array(32));
  atomicWriteFileSync(file, Buffer.from(key).toString("hex"), { mode: 0o600 });
  return key;
}

export class ZeroGStorage extends SeenHashesMixin implements StorageAdapter {
  readonly indexer: Indexer;
  readonly config: ZeroGStorageConfig;
  // 32-byte AES key for SDK transport encryption. AXIOM_STORAGE_TRANSPORT_KEY (32-byte
  // hex) wins verbatim; otherwise load-or-create from AXIOM_DATA_DIR/.data so restarts
  // (and co-located instances) decrypt every blob. `bun test` gets an ephemeral key.
  private readonly storageKey: Uint8Array;

  /** Exposes the transport AES key so a verify step on the same instance can decrypt. */
  get transportKey(): Uint8Array {
    return this.storageKey;
  }

  constructor(config: ZeroGStorageConfig, options: SeenHashesOptions = {}) {
    super(options.seenHashesFile ?? ORACLE_SEEN_HASHES_FILE);
    this.config = config;
    this.indexer = new Indexer(config.indexerRpc);
    this.storageKey = resolveTransportKey();
  }

  async upload(
    blob: Uint8Array,
    encryption?: Encryption,
  ): Promise<{ rootHash: Hex }> {
    const result = await uploadToStorage(
      this.indexer,
      blob,
      this.config.evmRpc,
      this.config.signer,
      {
        encryption: encryption ?? { type: "aes256", key: this.storageKey },
        ...(this.config.fee !== undefined ? { fee: this.config.fee } : {}),
      },
    );
    return { rootHash: result.rootHash };
  }

  async download(rootHash: Hex): Promise<Uint8Array> {
    const result = await downloadFromStorage(this.indexer, rootHash, {
      withProof: true,
      symmetricKey: this.storageKey,
    });
    return result.data;
  }

  async uploadData(
    data: Uint8Array,
    options: UploadOptions = {},
  ): Promise<UploadResult> {
    return uploadToStorage(
      this.indexer,
      data,
      this.config.evmRpc,
      this.config.signer,
      {
        ...options,
        encryption: options.encryption ?? {
          type: "aes256",
          key: this.storageKey,
        },
      },
    );
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
