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
  /** Explicit storage fee (wei) — see ZeroGStorageConfig.fee. */
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
  protected readonly seenHashesFile: string;
  private dirtyCount = 0;
  private flushTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(seenHashesFile: string = ORACLE_SEEN_HASHES_FILE) {
    this.seenHashesFile = seenHashesFile;
    this.seenDataHashes = loadSeenDataHashes(seenHashesFile);
    registerSeenHashesExitFlush(this);
  }

  markDataHashSeen(rootHash: Hex): void {
    const hash = rootHash.toLowerCase();
    if (this.seenDataHashes.has(hash)) return;
    this.seenDataHashes.add(hash);
    this.dirtyCount += 1;
    if (
      // First mark persists synchronously so concurrently-started instances observe it (durability contract).
      (this.dirtyCount === 1 && !existsSync(this.seenHashesFile)) ||
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
    super(options.seenHashesFile);
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

/** Transport AES key resolution: env hex > persisted .data key (mode 600) > bun-test ephemeral. */
function resolveTransportKey(): Uint8Array {
  const raw = process.env.AXIOM_STORAGE_TRANSPORT_KEY?.trim();
  if (raw) {
    const hex = raw.replace(/^0x/, "");
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
    hex = readFileSync(file, "utf-8").trim();
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
  // 32-byte transport AES key: env hex wins verbatim, else load-or-create from AXIOM_DATA_DIR/.data (bun test: ephemeral).
  private readonly storageKey: Uint8Array;

  /** Exposes the transport AES key so a verify step on the same instance can decrypt. */
  get transportKey(): Uint8Array {
    return this.storageKey;
  }

  constructor(config: ZeroGStorageConfig, options: SeenHashesOptions = {}) {
    super(options.seenHashesFile);
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
    const { rootHash } = await this.uploadData(blob, options);
    return { rootHash };
  }

  async download(rootHash: Hex): Promise<Uint8Array> {
    const result = await this.downloadWithOpts(rootHash, { withProof: true });
    return result.data;
  }

  async uploadData(
    data: Uint8Array,
    options: UploadOptions = {},
  ): Promise<UploadResult> {
    const encryption = options.encryption ?? {
      type: "aes256",
      key: this.storageKey,
    };
    return uploadToStorage(
      this.indexer,
      data,
      this.config.evmRpc,
      this.config.signer,
      { ...options, encryption },
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
