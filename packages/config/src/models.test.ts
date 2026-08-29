import { describe, it, afterEach } from "bun:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { keccak256, Wallet } from "ethers";
import { InMemoryStorage, ZeroGStorage } from "./storage/0g.js";
import type { WrongKeyOrCorruptError } from "./storage/0g.js";
import {
  AXIOM_ASSISTANT_NAME,
  DEFAULT_CHAT_MODEL,
  resolveChatModel,
} from "./chat-tools.js";
import {
  defaultChatModelForChain,
  resolveComputeRouterUrl,
  resolveRpcFallbackUrls,
} from "./networks.js";

describe("resolveChatModel", () => {
  it("returns the override when provided", () => {
    assert.equal(resolveChatModel("custom/model"), "custom/model");
  });

  it("returns the default when override is empty", () => {
    assert.equal(resolveChatModel(""), DEFAULT_CHAT_MODEL);
    assert.equal(DEFAULT_CHAT_MODEL, "deepseek-v4-flash");
  });

  it("returns the default when override is undefined", () => {
    assert.equal(resolveChatModel(undefined), DEFAULT_CHAT_MODEL);
  });

  it("brands the assistant as Axiom", () => {
    assert.equal(AXIOM_ASSISTANT_NAME, "Axiom");
  });
});

describe("chain-driven compute resolution", () => {
  const BASE_URL_KEYS = [
    "AXIOM_COMPUTE_BASE_URL",
    "OG_COMPUTE_BASE_URL",
  ] as const;
  const savedBaseUrls = BASE_URL_KEYS.map((k) => process.env[k]);

  afterEach(() => {
    for (const [i, key] of BASE_URL_KEYS.entries()) {
      if (savedBaseUrls[i] === undefined) delete process.env[key];
      else process.env[key] = savedBaseUrls[i];
    }
  });

  it("router URL defaults per chain: 16602→Galileo testnet router, 16661→mainnet router", () => {
    for (const key of BASE_URL_KEYS) delete process.env[key];
    assert.equal(
      resolveComputeRouterUrl(16602),
      "https://router-api-testnet.integratenetwork.work/v1",
    );
    assert.equal(resolveComputeRouterUrl(16661), "https://router-api.0g.ai/v1");
  });

  it("router URL: explicit env override beats the chain default", () => {
    for (const key of BASE_URL_KEYS) delete process.env[key];
    process.env.AXIOM_COMPUTE_BASE_URL = "https://custom-router.example/v1";
    assert.equal(
      resolveComputeRouterUrl(16602),
      "https://custom-router.example/v1",
    );
    delete process.env.AXIOM_COMPUTE_BASE_URL;
    process.env.OG_COMPUTE_BASE_URL = "https://og-alias.example/v1";
    assert.equal(resolveComputeRouterUrl(16661), "https://og-alias.example/v1");
  });

  it("router URL: absent/unknown chain falls back to the mainnet router", () => {
    for (const key of BASE_URL_KEYS) delete process.env[key];
    assert.equal(
      resolveComputeRouterUrl(undefined),
      "https://router-api.0g.ai/v1",
    );
    assert.equal(resolveComputeRouterUrl(31337), "https://router-api.0g.ai/v1");
  });

  it("default chat model per chain: 16602→qwen2.5-omni (Galileo-only catalog), 16661/absent→deepseek-v4-flash", () => {
    assert.equal(defaultChatModelForChain(16602), "qwen2.5-omni");
    assert.equal(defaultChatModelForChain(16661), DEFAULT_CHAT_MODEL);
    assert.equal(defaultChatModelForChain(undefined), DEFAULT_CHAT_MODEL);
    assert.equal(defaultChatModelForChain(31337), DEFAULT_CHAT_MODEL);
  });

  it("resolveChatModel: unset override → chain default; explicit override wins on any chain", () => {
    assert.equal(resolveChatModel(undefined, 16602), "qwen2.5-omni");
    assert.equal(resolveChatModel("", 16661), DEFAULT_CHAT_MODEL);
    assert.equal(resolveChatModel("custom/model", 16602), "custom/model");
  });
});

describe("resolveRpcFallbackUrls (RPC resilience, rd2 §1)", () => {
  const FALLBACK_KEYS = ["AXIOM_EVM_RPC_FALLBACKS"] as const;
  const savedFallbacks = FALLBACK_KEYS.map((k) => process.env[k]);

  afterEach(() => {
    for (const [i, key] of FALLBACK_KEYS.entries()) {
      if (savedFallbacks[i] === undefined) delete process.env[key];
      else process.env[key] = savedFallbacks[i];
    }
  });

  it("defaults to the chain registry's sanctioned 3rd-party list for 16602", () => {
    delete process.env.AXIOM_EVM_RPC_FALLBACKS;
    assert.deepEqual(resolveRpcFallbackUrls(16602), [
      "https://0g-galileo-testnet.drpc.org",
      "https://rpc.ankr.com/0g_galileo_testnet_evm",
    ]);
  });

  it("returns an empty list for mainnet (no verified 3rd-party endpoints)", () => {
    delete process.env.AXIOM_EVM_RPC_FALLBACKS;
    assert.deepEqual(resolveRpcFallbackUrls(16661), []);
    assert.deepEqual(resolveRpcFallbackUrls(31337), []);
  });

  it("explicit env comma-list beats the registry and is trimmed/whitespace-tolerant", () => {
    process.env.AXIOM_EVM_RPC_FALLBACKS =
      " https://a.example , https://b.example ,,https://c.example ";
    assert.deepEqual(resolveRpcFallbackUrls(16661), [
      "https://a.example",
      "https://b.example",
      "https://c.example",
    ]);
    assert.deepEqual(resolveRpcFallbackUrls(16602), [
      "https://a.example",
      "https://b.example",
      "https://c.example",
    ]);
  });
});

describe("storage adapters", () => {
  const dir = mkdtempSync(join(tmpdir(), "axiom-config-storage-"));
  const seenFile = (name: string) => join(dir, name);

  it("InMemoryStorage round-trips a blob and throws on a missing root", () => {
    const storage = new InMemoryStorage({
      seenHashesFile: seenFile("mem.json"),
    });
    const blob = new TextEncoder().encode("hello storage");
    const { rootHash } = storage.upload(blob);
    assert.equal(rootHash, keccak256(blob), "root hash is the blob keccak");
    const out = storage.download(rootHash);
    assert.equal(new TextDecoder().decode(out), "hello storage");
    const missing = ("0x" + "ff".repeat(32)) as `0x${string}`;
    assert.throws(() => storage.download(missing), /Blob not found/);
  });

  it("SeenHashesMixin persists seen hashes across adapter instances", () => {
    const file = seenFile("persist.json");
    const a = new InMemoryStorage({ seenHashesFile: file });
    const hash = ("0x" + "aa".repeat(32)) as `0x${string}`;
    a.markDataHashSeen(hash);

    const b = new InMemoryStorage({ seenHashesFile: file });
    assert.equal(b.hasSeenDataHash(hash), true, "reloaded from disk");
    assert.equal(
      b.hasSeenDataHash(("0x" + "bb".repeat(32)) as `0x${string}`),
      false,
    );
    // case-insensitive: an uppercase variant of the same root still matches
    assert.equal(
      b.hasSeenDataHash(("0x" + "AA".repeat(32)) as `0x${string}`),
      true,
    );
  });

  it("backs up a corrupt seen-hashes file and starts empty", () => {
    const file = seenFile("corrupt.json");
    writeFileSync(file, "not json at all");
    const storage = new InMemoryStorage({ seenHashesFile: file });
    assert.equal(
      storage.hasSeenDataHash(("0x" + "aa".repeat(32)) as `0x${string}`),
      false,
      "corrupt file must not crash startup",
    );
    assert.ok(existsSync(`${file}.bak`), "corrupt file renamed to .bak");
  });

  it("default InMemoryStorage is a pure test double — zero fs writes", () => {
    // Guard W-5: the double's sink must never touch the filesystem, including
    // via the module-level exit-flush (SIGINT/SIGTERM → flushSeenDataHashes).
    // Proof shape: atomicWriteFileSync always mkdirs the .data home before any
    // write, so an untouched dir after a full mark/flush/exit-flush cycle and
    // concurrent doubles rules out every disk write path.
    const dir = mkdtempSync(join(tmpdir(), "axiom-memstorage-clean-"));
    const realDataDir = process.env.AXIOM_DATA_DIR;
    process.env.AXIOM_DATA_DIR = dir;
    try {
      const storage = new InMemoryStorage();
      const concurrent = new InMemoryStorage(); // durability contract exercises the sync first-mark path
      const hash = ("0x" + "ee".repeat(32)) as `0x${string}`;
      storage.markDataHashSeen(hash);
      concurrent.markDataHashSeen(("0x" + "ff".repeat(32)) as `0x${string}`);
      // threshold + timer + explicit exit-flush paths all exercised:
      for (let i = 0; i < 10; i++) storage.markDataHashSeen(hash);
      storage.flushSeenDataHashes();
      concurrent.flushSeenDataHashes();
      assert.equal(
        storage.hasSeenDataHash(hash),
        true,
        "marks stay visible in memory",
      );
      assert.deepEqual(
        storage.download(storage.upload(new Uint8Array([9])).rootHash),
        new Uint8Array([9]),
      );
      assert.equal(
        existsSync(join(dir, ".data")),
        false,
        "no .data dir created",
      );
      assert.equal(
        existsSync(join(dir, ".data", "oracle-seen-hashes.json")),
        false,
        "no seen-hashes file written",
      );
    } finally {
      process.env.AXIOM_DATA_DIR = realDataDir;
    }
  });

  it("ZeroGStorage shares the seen-hash mixin and uploads via the SDK indexer", async () => {
    const storage = new ZeroGStorage(
      {
        indexerRpc: "http://127.0.0.1:1",
        evmRpc: "http://127.0.0.1:1",
        signer: new Wallet("0x" + "11".repeat(32)),
      },
      { seenHashesFile: seenFile("0g.json") },
    );
    const sdkResult = {
      rootHash: "0x" + "aa".repeat(32),
      txHash: "0x" + "bb".repeat(32),
    };
    // Instance-level SDK stub — no network: swap the indexer's upload method.
    (storage.indexer as unknown as { upload: unknown }).upload = async () => [
      sdkResult,
      null,
    ];
    const { rootHash } = await storage.upload(new Uint8Array([1, 2, 3]));
    assert.equal(rootHash, sdkResult.rootHash);
    storage.markDataHashSeen(rootHash);
    assert.equal(storage.hasSeenDataHash(rootHash), true);
  });

  it("ZeroGStorage surfaces SDK upload failures", async () => {
    const storage = new ZeroGStorage(
      {
        indexerRpc: "http://127.0.0.1:1",
        evmRpc: "http://127.0.0.1:1",
        signer: new Wallet("0x" + "11".repeat(32)),
      },
      { seenHashesFile: seenFile("0g-err.json") },
    );
    (storage.indexer as unknown as { upload: unknown }).upload = async () => [
      null,
      new Error("boom"),
    ];
    await assert.rejects(
      () => storage.upload(new Uint8Array([1])),
      /0G upload failed: boom/,
    );
  });

  // Download canary (rd2 §2 S4): the SDK's decrypt is best-effort CTR with no auth and
  // never throws on a wrong key, so ZeroGStorage embeds an AXIOM1 prefix inside the
  // encrypted envelope and rejects registered roots whose plaintext lacks it.
  it("ZeroGStorage download round-trips a JSON payload: canary verified + stripped", async () => {
    const storage = new ZeroGStorage(
      {
        indexerRpc: "http://127.0.0.1:1",
        evmRpc: "http://127.0.0.1:1",
        signer: new Wallet("0x" + "11".repeat(32)),
      },
      { seenHashesFile: seenFile("0g-canary.json") },
    );
    const rootHash = ("0x" + "c1".repeat(32)) as `0x${string}`;
    const payload = JSON.stringify({ messages: [{ role: "user" }] });
    (storage.indexer as unknown as { upload: unknown }).upload = async () => [
      { rootHash, txHash: "0x" + "bb".repeat(32) },
      null,
    ];
    await storage.upload(new TextEncoder().encode(payload));
    // Simulated correct-key SDK return: plaintext with the canary prefix intact.
    const canaryBytes = new TextEncoder().encode(`AXIOM1${payload}`);
    (storage.indexer as unknown as { downloadToBlob: unknown }).downloadToBlob =
      async () => [new Blob([canaryBytes]), null];
    const out = await storage.download(rootHash);
    assert.equal(
      new TextDecoder().decode(out),
      payload,
      "canary stripped — caller sees the exact uploaded payload",
    );
  });

  it("ZeroGStorage download throws WrongKeyOrCorruptError on ciphertext bytes (wrong-key signal)", async () => {
    const storage = new ZeroGStorage(
      {
        indexerRpc: "http://127.0.0.1:1",
        evmRpc: "http://127.0.0.1:1",
        signer: new Wallet("0x" + "11".repeat(32)),
      },
      { seenHashesFile: seenFile("0g-canary-wrong.json") },
    );
    const rootHash = ("0x" + "c2".repeat(32)) as `0x${string}`;
    (storage.indexer as unknown as { upload: unknown }).upload = async () => [
      { rootHash, txHash: "0x" + "bb".repeat(32) },
      null,
    ];
    await storage.upload(new TextEncoder().encode("{}"));
    // Simulated wrong-key SDK return: raw ciphertext bytes, Error=null (SDK never throws).
    (storage.indexer as unknown as { downloadToBlob: unknown }).downloadToBlob =
      async () => [new Blob([new Uint8Array([9, 9, 9, 9, 7, 7])]), null];
    let caught: WrongKeyOrCorruptError | undefined;
    try {
      await storage.download(rootHash);
    } catch (err) {
      caught = err as WrongKeyOrCorruptError;
    }
    assert.ok(caught, "wrong-key download must throw");
    assert.equal(caught.name, "WrongKeyOrCorruptError");
    assert.match(
      caught.message,
      /canary check/,
      "error names the canary check, not a generic failure",
    );
    assert.equal(caught.rootHash, rootHash, "typed error carries the rootHash");
  });

  it("ZeroGStorage download passes unregistered legacy roots through untouched", async () => {
    const storage = new ZeroGStorage(
      {
        indexerRpc: "http://127.0.0.1:1",
        evmRpc: "http://127.0.0.1:1",
        signer: new Wallet("0x" + "11".repeat(32)),
      },
      { seenHashesFile: seenFile("0g-canary-legacy.json") },
    );
    // Deploy/e2e plane uploads raw app ciphertext via uploadData on pre-canary roots;
    // a canary-era check on those would false-throw. Unregistered = legacy = pass-through.
    const legacyCiphertext = new Uint8Array([1, 2, 3, 4, 5]);
    const rootHash = ("0x" + "c3".repeat(32)) as `0x${string}`;
    (storage.indexer as unknown as { downloadToBlob: unknown }).downloadToBlob =
      async () => [new Blob([legacyCiphertext]), null];
    const out = await storage.download(rootHash);
    assert.deepEqual([...out], [...legacyCiphertext]);
  });
});
