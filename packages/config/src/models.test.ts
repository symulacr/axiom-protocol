import { describe, it, afterEach } from "bun:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { keccak256, Wallet } from "ethers";
import { InMemoryStorage, ZeroGStorage } from "./storage/0g.js";
import {
  AXIOM_ASSISTANT_NAME,
  DEFAULT_CHAT_MODEL,
  resolveChatModel,
} from "./chat-tools.js";
import {
  defaultChatModelForChain,
  resolveComputeRouterUrl,
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
});
