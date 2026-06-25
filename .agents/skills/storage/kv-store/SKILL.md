# 0G Storage KV Store

## Metadata

- **Category**: storage
- **SDK**: `@0gfoundation/0g-ts-sdk` ^1.2.8, `ethers` ^6.13.0
- **Activation Triggers**: "KV", "key-value", "Batcher", "KvClient", "StreamData", "put", "get on 0G"

## Purpose

Read and write small key-value pairs on top of 0G Storage's per-stream KV layer. Writes go
through a `Batcher` (collects `set` / `grant` ops, encodes a single `StreamData` payload,
submits it via the `Uploader` against the `Flow` contract). Reads go through a `KvClient`
(JSON-RPC to the storage node, returns the value bytes for a key).

KV is cheaper than uploading a whole file when you need to mutate a small set of named
fields many times. It is the canonical pattern for "I want a JSON document, indexed by
key, with each write on-chain".

## Prerequisites

- Node.js >= 18
- `ethers` v6 with a funded signer
- `@0gfoundation/0g-ts-sdk` (Batcher, Indexer, KvClient, StorageNode)
- A known sharding set, obtained via `indexer.selectNodes(1)` (the same path the SDK's
  `newUploaderFromIndexerNodes` uses internally)
- The Flow contract address for the connected chain (see `indexer-queries`)

## Quick Workflow

1. Build the `KVStoreConfig` (`evmRpc`, `indexerRpc`, `signer`, `chainId?`)
2. Discover a sharding set: `await indexer.selectNodes(1)`
3. Construct a `Batcher(streamId, shardingSet, uploader, config)` (KV protocol version
   constant = `0`)
4. Call `batcher.set(key, value)` then `batcher.exec(signer)` → on-chain tx hash
5. To read, call `kvClient.getValue(streamId, key)` and decode the returned base64 bytes

## Core Rules

### ALWAYS

- Use `indexer.selectNodes(1)` to build the sharding set. The SDK requires a non-empty
  `StorageNode[]` to construct a `Batcher`; hardcoding a node address is brittle.
- Use the Flow contract from the chain-id table — never hardcode it.
- Treat the `Batcher` instance as a SINGLE use: collect all `set` / `grant` ops, then
  call `exec(signer)` once. Do not reuse the same `Batcher` for two different streams
  or two different transactions.
- Decode KvClient responses from base64 to `Uint8Array` yourself — the SDK returns the
  raw base64 string. Do not assume it is a UTF-8 string.
- For missing keys, treat `null` (not an exception) as the canonical "not found" signal.

### NEVER

- Submit a KV write against the wrong chain's Flow contract (see `indexer-queries`).
- Mix the `KV_VERSION` constant across SDK versions. The on-chain encoding is
  version-prefixed; mismatched versions silently produce un-readable values.
- Reuse a `Batcher` after `exec()` — its internal queue is consumed.
- Hardcode the `signer`'s private key in source — load from `.env` via `loadEnv()`.
- Construct a `Batcher` against a `StorageNode[]` of length 0 (the SDK will throw a
  confusing error; the fix is `selectNodes(1)`).

## Code Examples

### Put and Get

```typescript
import { Batcher, Indexer, KvClient } from "@0gfoundation/0g-ts-sdk";
import { Wallet, JsonRpcProvider } from "ethers";

const KV_VERSION = 0; // 0G Storage KV protocol version (current stable).

const provider = new JsonRpcProvider(process.env.RPC_URL!);
const signer = new Wallet(process.env.PRIVATE_KEY!, provider);
const indexer = new Indexer(process.env.STORAGE_INDEXER!);
const flow = process.env.FLOW_CONTRACT!; // from pickOGNetwork(chainId)

const shardingSet = await indexer.selectNodes(1);
const uploader = await indexer.newUploaderFromIndexerNodes(1); // sharding-aware
const streamId = `agent:${signer.address.toLowerCase()}`;

const batcher = new Batcher(streamId, shardingSet, uploader, {
  flowContractAddress: flow,
  kvVersion: KV_VERSION,
});
await batcher.set("model:state", JSON.stringify({ epoch: 7, loss: 0.18 }));
const tx = await batcher.exec(signer);
console.log("KV write tx:", tx);

// Read back
const kvClient = new KvClient(process.env.STORAGE_INDEXER!);
const raw = await kvClient.getValue(streamId, "model:state");
if (raw === null) throw new Error("Key not found");
const decoded = Buffer.from(raw, "base64").toString("utf8");
console.log("model:state =", JSON.parse(decoded));
```

### List a Stream (key-sorted)

```typescript
const kvClient = new KvClient(process.env.STORAGE_INDEXER!);
const all = await kvClient.list(streamId); // returns { key, value, base64Value }[]
for (const row of all) {
  const v = Buffer.from(row.base64Value, "base64").toString("utf8");
  console.log(row.key, "=", v);
}
```

## Anti-Patterns

```typescript
// BAD: empty sharding set
const batcher = new Batcher(streamId, [], uploader, config);
// Batcher constructor throws because it cannot pick a node.

// BAD: hardcoded Flow contract
const batcher = new Batcher(streamId, shardingSet, uploader, {
  flowContractAddress: "0x22E03a6A89B950F1c82ec5e74F8eCa321a105296", // Galileo
  kvVersion: 0,
});
// Will silently submit to Galileo when connected to Aristotle.

// BAD: treating the SDK's base64 response as UTF-8
const raw = await kvClient.getValue(streamId, "model:state");
const decoded = JSON.parse(raw); // crash if the value contains non-ASCII bytes

// BAD: reusing a Batcher across two transactions
const batcher = new Batcher(streamId, shardingSet, uploader, config);
await batcher.set("a", "1");
await batcher.exec(signer); // first tx
await batcher.set("b", "2"); // Batcher queue is now inconsistent
await batcher.exec(signer); // may include the "a" write twice
```

## Common Errors & Fixes

| Error                                | Cause                                          | Fix                                                |
| ------------------------------------ | ---------------------------------------------- | -------------------------------------------------- |
| `Batcher requires non-empty nodes`   | `selectNodes(1)` not called before construction | Always call `indexer.selectNodes(1)` first        |
| `Flow contract revert: 0x09`         | Wrong Flow contract for the connected chain    | Use `pickOGNetwork(chainId)`                       |
| `getValue` returns `null`            | Key missing (or wrong `streamId`)              | Verify the `streamId` is identical to the writer's |
| Decoded value garbled                | The SDK returns base64 — not UTF-8             | `Buffer.from(raw, "base64").toString("utf8")`      |
| Write succeeds but read returns null | KV_VERSION mismatch between write and read     | Pin the `KV_VERSION` constant on both sides       |

## Related Skills

- [Upload File](../upload-file/SKILL.md) — for whole-file uploads
- [Indexer Queries](../indexer-queries/SKILL.md) — for the chain-id → indexer/flow lookup
- [Storage + Chain](../../cross-layer/storage-plus-chain/SKILL.md) — for the on-chain
  reference pattern (KV is a finer-grained variant)

## References

- [0G Storage KV SDK](https://docs.0g.ai/developer-hub/building-on-0g/storage/kv-store)
- [0G Storage SDK](https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk)
- [0G AI Context](https://docs.0g.ai/ai-context)
- [Storage Patterns](../../../patterns/STORAGE.md)
