# 0G Stack Cross-Cutting Audit — Axiom Protocol

**Date:** 2026-06-24  
**Scope:** Every 0G component integration across all apps/packages  
**Web Research:** Tavily search on 0G Labs GitHub, npm, documentation  
**Source Analysis:** Every source file referencing 0G code/SDKs/endpoints  

---

## 1. Complete Integration Map

### 1.1 Component × File Matrix

| 0G Component | File(s) | Role | Production? |
|---|---|---|---|
| **0G Storage** | `packages/config/src/storage/0g.ts` | Shared `uploadToStorage`/`downloadFromStorage` helpers | ✅ Yes |
| **0G Storage** | `apps/backend/src/storage/0g.ts` | `ZeroGStorage` class with retry, `withRetry`, re-exports | ✅ Yes |
| **0G Storage** | `apps/backend/src/storage/0g.test.ts` | Integration test (round-trip + AES-256) | Test |
| **0G Storage** | `apps/oracle/src/storage.ts` | `StorageAdapter` interface + **separate** `ZeroGStorage` class | ✅ Yes |
| **0G Storage** | `apps/oracle/src/server.ts` | Uses `StorageAdapter` for re-key flows | ✅ Yes |
| **0G Storage** | `apps/indexer/src/index.ts` | Direct `Indexer` usage + event batching → Storage upload | ✅ Yes |
| **0G Storage** | `apps/bench/live-e2e/stress-storage.ts` | Storage stress test | Test |
| **0G Storage** | `apps/bench/live-e2e/stress-indexer-worker.ts` | Indexer stress test | Test |
| **0G Storage** | `apps/bench/live-e2e/test-indexer-pipeline.ts` | Pipeline test | Test |
| **0G Storage** | `apps/bench/discovery/tee-verifier-and-storage-limits.ts` | Capacity discovery | Discovery |
| **0G Storage** | `apps/backend/src/server.ts` | Creates `ZeroGStorage` in `startServer()` | ✅ Yes |
| **0G Compute** | `apps/backend/src/compute/router.ts` | OpenAI client factory (Router API + Direct SDK proxy) | ✅ Yes |
| **0G Compute** | `apps/backend/src/server.ts` | `/v1/compute/chat/completions` handler | ✅ Yes |
| **0G Compute** | `apps/bench/live-e2e/integration-healthcheck.ts` | Direct SDK proxy health test | Test |
| **0G Chain** | `packages/config/src/networks.ts` | `OG_NETWORKS`, `pickOGNetwork`, `resolveRpcUrl` | ✅ Yes |
| **0G Chain** | `apps/frontend/src/config/chains.ts` | Wagmi chain config (Galileo + Aristotle) | ✅ Yes |
| **0G Chain** | `apps/contracts/script/DeployAristotle.s.sol` | Deployment script (network configs) | ✅ Yes |
| **0G DA** | `apps/indexer/src/da.ts` | `submitEvent` + `makeRealSubmitter` | ✅ Yes |
| **0G DA** | `apps/indexer/src/da-client.ts` | Custom gRPC `DaClient` (via vendored proto) | ✅ Yes |
| **0G DA** | `apps/indexer/src/disperser.proto` | Vendored `disperser.proto` from `0glabs/0g-da-client` | ✅ Yes |
| **0G DA** | `apps/indexer/src/index.ts` | DA sink (gRPC or Storage) in `composeSinks` | ✅ Yes |
| **0G DA** | `apps/bench/live-e2e/da-chaos.sh` | DA chaos test | Test |
| **Agentic ID** | `apps/oracle/src/crypto/eip712.ts` | EIP-712 OwnershipProof/AccessProof hashing | ✅ Yes |
| **Agentic ID** | `apps/oracle/src/signer.ts` | `TeeSigner` — signs EIP-712 OwnershipProofs | ✅ Yes |
| **Agentic ID** | `apps/contracts/src/extensions/AxiomMetadataJson.sol` | ERC-7857 metadata JSON encoding | ✅ Yes |
| **Agentic ID** | `apps/contracts/lib/0g-agent-nft/` | Vendored Agentic ID contracts (submodule) | ✅ Yes |
| **Agentic ID** | `apps/contracts/test/FuzzAxiomAgentNFT.t.sol` | Fuzz tests with Galileo fork | Test |
| **Agentic ID** | `apps/frontend/src/abi/eip712.ts` | Frontend EIP-712 domain (client-side) | ✅ Yes |

### 1.2 Endpoint/RPC Summary

| URL | Usage | Defined In |
|---|---|---|
| `https://evmrpc-testnet.0g.ai` | Galileo EVM RPC (testnet) | `networks.ts`, 7+ additional hardcoded locations |
| `https://evmrpc.0g.ai` | Aristotle EVM RPC (mainnet) | `networks.ts`, 3+ additional hardcoded locations |
| `https://indexer-storage-testnet-turbo.0g.ai` | Galileo storage indexer | `networks.ts`, 6+ hardcoded fallbacks |
| `https://indexer-storage-turbo.0g.ai` | Aristotle storage indexer | `networks.ts` |
| `https://router-api.0g.ai/v1` | Compute Router (mainnet) | `apps/backend/src/compute/router.ts` |
| `https://router-api-testnet.integratenetwork.work/v1` | Compute Router (testnet) | `apps/backend/src/compute/router.ts` |
| `https://compute-network-6.integratenetwork.work/v1/proxy` | Direct SDK proxy | `apps/backend/src/compute/router.ts` |
| `https://chainscan.0g.ai` | Block explorer (mainnet) | `frontend/src/config/chains.ts` |
| `https://chainscan-galileo.0g.ai` | Block explorer (testnet) | `frontend/src/config/chains.ts` |
| `https://0g-galileo-testnet.drpc.org` | dRPC fallback RPC | `0g.test.ts`, solidity tests |
| `https://faucet.0g.ai` | Testnet faucet | docs/comments only |
| `https://docs.0g.ai/` | Official docs | comments only |
| `0g.ai` | 0G website | hardcoded in `apps/bench/live-e2e/stress-chain.sh` |

---

## 2. Dependency Audit

### 2.1 0G Dependencies

| Package | Version | Used In | Actual Imports | Orphaned? |
|---|---|---|---|---|
| `@0gfoundation/0g-storage-ts-sdk` | `^1.2.10` | `packages/config` | `Indexer`, `MemData` | No — actively used |
| `@0gfoundation/0g-storage-ts-sdk` | `^1.2.10` | `apps/backend` | `Indexer` | No |
| `@0gfoundation/0g-storage-ts-sdk` | `^1.2.10` | `apps/oracle` | `Indexer` | No |
| `@0gfoundation/0g-storage-ts-sdk` | `^1.2.10` | `apps/indexer` | `Indexer` | No |
| `@0gfoundation/0g-storage-ts-sdk` | `^1.2.10` | `apps/bench` | `Indexer`, `MemData` | No |
| `@0gfoundation/0g-compute-ts-sdk` | **NOT INSTALLED** | — | — | **Missing** |
| `@0gfoundation/0g-da-client` (npm) | **NOT INSTALLED** | — | — | **Missing** |
| `@grpc/grpc-js` | `^1.14.4` | `apps/indexer` | gRPC client (custom, not via 0G SDK) | No |
| `@grpc/proto-loader` | `0.8.1` | `apps/indexer` | gRPC proto loader | No |

### 2.2 One npm package used: `@0gfoundation/0g-storage-ts-sdk`

All 5 packages that consume it do so at `^1.2.10` (consistent).  
The SDK exports used: `Indexer` (orchestrator class), `MemData` (in-memory blob wrapper).  
Notably NOT used from the SDK: `ZgFile`, `Blob`, `StorageNode`, `KvClient`.

---

## 3. Per-Wrapper Analysis

### 3.1 `packages/config/src/storage/0g.ts` — Shared Core

**Path:** `/home/eya/og/packages/config/src/storage/0g.ts`

```typescript
// Exports:
uploadToStorage(indexer, data, evmRpc, signer, encryption?) → UploadResult
downloadFromStorage(indexer, rootHash, opts?) → DownloadResult
```

**What it does:** Thin typed wrappers around `Indexer.upload()` and `Indexer.downloadToBlob()`. Handles the dual-return format (`{rootHash, txHash}` vs `{rootHashes[], txHashes[]}`) from the SDK.

**Canonical comparison:** The official `@0gfoundation/0g-storage-ts-sdk` `Indexer` class already supports:
- `indexer.upload(file, rpc, signer, opts)` → `[tx, err]` (same signature)
- `indexer.downloadToBlob(rootHash, opts)` → `[blob, err]` (same signature)
- `indexer.download(root, outputPath, opts)` → `[err]` (file-based)

**Assessment:** This wrapper is minimal and justified — it normalizes the SDK's dual-return format and adds proper TypeScript types. However, the `EncryptionOption` type is locally redefined when the SDK may already export it. **KEEP**, but consider importing from SDK if available.

---

### 3.2 `apps/backend/src/storage/0g.ts` — Backend ZeroGStorage

**Path:** `/home/eya/og/apps/backend/src/storage/0g.ts`

```typescript
// Exports:
withRetry(fn, opts?) → T              // 3-attempt exponential-backoff
ZeroGStorage                           // Class wrapping Indexer + retry
  .uploadData(data, encryption?)       // withRetry → uploadToStorage
  .download(rootHash, opts?)           // withRetry → downloadFromStorage
// Re-exports from config:
OG_NETWORKS, pickOGNetwork, OGNetwork
```

**What it does:**
1. Adds a `withRetry` wrapper (3 attempts, exponential backoff 100/400/900ms)
2. Creates a `ZeroGStorage` class that pre-configures the Indexer and wraps upload/download with retry
3. Re-exports network resolution from `@axiom/config/networks`

**Canonical comparison:** The official SDK's `Indexer` class has no built-in retry. Retry is a reasonable addition.

**Concerns:**
- **Duplicate class!** The oracle (`apps/oracle/src/storage.ts`) has its OWN `ZeroGStorage` class with the same constructor pattern but different (incompatible) method signatures:
  - Backend: `uploadData(data)` → `UploadResult`; `download(rootHash)` → `DownloadResult`
  - Oracle: `upload(blob)` → `{rootHash}`; `download(rootHash)` → `Uint8Array`
  - Oracle additionally implements `markDataHashSeen`/`hasSeenDataHash` (seen-set tracking), which backend doesn't need.
- The oracle's `ZeroGStorage` uses `downloadFromStorage` with `withProof: false` always, while backend's `download` allows configurable `withProof`.
- **REFACTOR OPPORTUNITY:** Extract oracle's seen-set into a separate mixin/tracker so both can use the same `ZeroGStorage` class from `packages/config`.

---

### 3.3 `apps/oracle/src/storage.ts` — Oracle StorageAdapter + ZeroGStorage

**Path:** `/home/eya/og/apps/oracle/src/storage.ts`

```typescript
// Exports:
interface StorageAdapter {
  upload(blob): { rootHash }
  download(rootHash): Uint8Array
  markDataHashSeen(rootHash): void
  hasSeenDataHash(rootHash): boolean
}
class InMemoryStorage implements StorageAdapter    // keccak256-based mock
class ZeroGStorage implements StorageAdapter       // real 0G
```

**What it does:**
1. Defines `StorageAdapter` interface (oracle-specific abstraction with seen-set)
2. `InMemoryStorage` — dev/test mock (uses `keccak256` as fake root hash)
3. `ZeroGStorage` — wraps `@axiom/config/storage/0g` helpers

**Canonical comparison:** Same backend SDK (`@0gfoundation/0g-storage-ts-sdk`) via the same shared helpers. The `StorageAdapter` interface is oracle-specific and justified (needs seen-set for Agentic ID security).

**Problems:**
- **Duplicate code:** This `ZeroGStorage` class is structurally identical to `apps/backend/src/storage/0g.ts`'s `ZeroGStorage` but deliberately different (no retry, `withProof: false`, no `uploadData` name, has seen-set). This will cause drift.
- **SOLUTION:** Extract `StorageAdapter` (with seen-set) into `packages/config` and have both backends use the same base class.

---

### 3.4 `apps/backend/src/compute/router.ts` — Compute Router Client

**Path:** `/home/eya/og/apps/backend/src/compute/router.ts`

```typescript
// Exports:
getComputeBaseUrl(): string                          // Resolves Router URL
createRouterClient(timeout): OpenAI                  // Creates OpenAI client
// Internal:
decodeDirectKeyToken(token): {provider, address}|null  // Parses app-sk-* tokens
KNOWN_PROVIDERS: Record<string, string>              // Hardcoded provider endpoints
```

**What it does:**
1. Two authentication paths:
   - **Direct SDK proxy** (`AXIOM_COMPUTE_DIRECT_KEY`): decodes `app-sk-*` token, maps embedded provider address to hardcoded inference URL, creates OpenAI client against per-provider proxy
   - **Router API** (`AXIOM_COMPUTE_API_KEY` / `OG_COMPUTE_API_KEY`): standard OpenAI client against Router
2. Falls back through env vars to hardcoded defaults

**Canonical comparison:** The official `@0gfoundation/0g-compute-ts-sdk` (available on npm as `v0.8.0+`) provides:
- `BrokerService` singleton — manages provider discovery, account registration, fee settlement
- Proper service flow: acknowledge → transfer → query → settle
- CLI tools
- No raw OpenAI client required

**Axiom chose NOT to use the official Compute SDK.** Instead, they:
1. Use a raw OpenAI client against the Router API's OpenAI-compatible endpoint
2. Build a custom `app-sk-*` token parser for Direct SDK proxy access
3. Hardcode provider inference URLs

**Assessment:** Using raw OpenAI client is **simpler** for basic chat completions but:
- **Misses** proper fee settlement (the `/v1/compute/pay` endpoint in `server.ts` sends raw tx without the SDK's broker flow)
- **Misses** service discovery (hardcoded KNOWN_PROVIDERS map v.s. on-chain broker contract)
- **Misses** TEE attestation verification (provided by compute SDK)
- **APP GAP:** Axiom doesn't validate provider attestation reports
- **RECOMMENDATION:** Evaluate whether the full compute SDK flow is needed. For V1, the OpenAI proxy approach may be sufficient, but settling fees through the SDK's broker service would be more robust.

---

### 3.5 `apps/indexer/src/da.ts` + `da-client.ts` — DA Submitter

**Paths:** `/home/eya/og/apps/indexer/src/da.ts`, `/home/eya/og/apps/indexer/src/da-client.ts`

```typescript
// da.ts:
submitEvent(event, opts?) → SubmitResult           // Canonicalize + submit
makeRealSubmitter(grpcUrl): SubmitFn                // Factory for gRPC
// da-client.ts:
class DaClient {
  disperseBlob(data): Promise<DisperseBlobResult>
  getBlobStatus(requestId): Promise<BlobStatusResult>
  pollUntilFinalized(requestId, pollInterval?, timeout?)
  retrieveBlob(storageRoot, epoch, quorumId)
  waitForReady(timeout?)
  close()
}
```

**What it does:**
1. Vendors a `.proto` file for the 0G DA Disperser gRPC API
2. Builds a full gRPC client (`DaClient`) from that proto using `@grpc/grpc-js` + `@grpc/proto-loader`
3. Wraps it with `submitEvent`/`makeRealSubmitter` for the indexer's event pipeline

**Canonical comparison:** The official 0G DA ecosystem provides:
- **`0g-da-rust-sdk`** (Rust, `cargo add 0g-da-rust-sdk`)
- **`0g-da-client`** (Go implementation, full disperser/encoder/retriever)
- No official TypeScript/JS DA SDK on npm

**Assessment:**
- Since there is **no official TypeScript DA SDK**, building a gRPC client from the proto is **justified**.
- **BUT:** the proto is vendored as a local file and could drift from the canonical proto at `https://github.com/0glabs/0g-da-client`. 
- **SECURITY:** `grpc.credentials.createInsecure()` is used — no TLS. For production DA submission, this must use secure credentials.
- **GAP:** No reconnection logic in `DaClient` — if the gRPC connection drops, all subsequent `disperseBlob` calls will fail silently.
- **GAP:** `makeRealSubmitter` creates a new `DaClient` per call to `submitEvent` in `composeSinks` (in `da.ts`'s `composeSinks`, the `submitFn` is constructed **once** per event via `makeRealSubmitter` within the sink factory). Actually, looking closer, `makeRealSubmitter` is called once in `composeSinks` when `config.da === "grpc"`, and the returned `SubmitFn` is used for all events. But in `index.ts`, it's called in a closure within each event handler — wait, no: in `composeSinks`, `makeRealSubmitter(config.grpcUrl)` is called **once** inside the sink closure, but it's called on every `composeSinks` invocation. However, `composeSinks` is called once per `main()`, so it's fine.
- **RECOMMENDATION:** Add TLS support, reconnection, and a health-check watchdog. Consider auto-generating the proto client at build time from the canonical source.

---

### 3.6 `apps/oracle/src/crypto/eip712.ts` — EIP-712 Signing

**Path:** `/home/eya/og/apps/oracle/src/crypto/eip712.ts`

```typescript
// Exports:
domainSeparator(domain): Hex
ownershipStructHash(input): Hex
accessStructHash(input): Hex
ownershipMessageHash(input, domain): Hex
accessMessageHash(input, domain): Hex
recoverAccessSigner(signature, input, domain): Hex
```

**What it does:** Pure EIP-712 hashing functions for Agentic ID (ERC-7857) OwnershipProof and AccessProof structs. Mirrors the `AxiomTeeVerifier` Solidity contract's `_domainSeparator()` and `_hashTypedData()` logic.

**Canonical comparison:** The official Agentic ID/ERC-7857 SDK provides:
- `@0gfoundation/0g-agent-nft` / `@0glabs/0g-agent-nft` — Solidity contracts + example scripts
- No official TypeScript EIP-712 signing library specific to Agentic ID

**Assessment:** This is **custom code justified** because there's no official TypeScript EIP-712 library for Agentic ID. The implementation manually mirrors Solidity's `keccak256(abi.encode(EIP712Domain(...)))` pattern. It must exactly match the on-chain `AxiomTeeVerifier` contract — any drift would break signature verification.

**GAP:** No fuzz tests comparing the TypeScript EIP-712 output against the Solidity contract's output. A mismatch would be silent until a transfer fails on-chain.

---

## 4. Top 10 Simplification Opportunities

Ranked by impact × effort.

| # | Opportunity | Impact | Effort | Description |
|---|---|---|---|---|
| **1** | **Eliminate duplicate `ZeroGStorage` classes** | 🔴 High | 🟢 Low | Two separate `ZeroGStorage` classes (backend + oracle) with incompatible APIs. Consolidate into `packages/config` with optional retry + optional seen-set mixin. |
| **2** | **Add `@0gfoundation/0g-compute-ts-sdk` as dependency** | 🟡 Medium | 🟢 Low | Official Compute SDK provides provider discovery, fee settlement, attestation. Currently using raw OpenAI client — simpler but missing broker integration. |
| **3** | **Remove vendored `.proto` file** | 🟢 Low | 🟡 Medium | The `disperser.proto` is a static local copy. Auto-fetch from canonical upstream or publish a thin TS DA SDK wrapper. |
| **4** | **Consolidate env var naming** | 🟡 Medium | 🟡 Medium | Mix of `AXIOM_*`, `OG_*`, `0G_*` prefixes. Backend uses `AXIOM_STORAGE_RPC` but indexer uses `OG_STORAGE_RPC`. Causes confusion documented in `integration-healthcheck.ts` aliases. |
| **5** | **Eliminate hardcoded URLs** | 🟡 Medium | 🟡 Medium | URLs hardcoded in 15+ locations instead of resolving from `OG_NETWORKS`. E.g., `apps/indexer/src/index.ts:20` has fallback URL, `apps/backend/src/storage/0g.test.ts:10-11` hardcodes, etc. |
| **6** | **Move oracle's `InMemoryStorage` to devDependencies** | 🟢 Low | 🟢 Low | `InMemoryStorage` is a dev/test mock but lives in production source under `apps/oracle/src/storage.ts`. Extract to test utility. |
| **7** | **Stop re-exporting `OG_NETWORKS` from backend** | 🟢 Low | 🟢 Low | `apps/backend/src/storage/0g.ts` re-exports `OG_NETWORKS`, `pickOGNetwork` from config. Consumers should import from `@axiom/config/networks` directly. |
| **8** | **Remove `0g-agent-nft` git submodule** | 🟢 Low | 🟡 Medium | The vendored submodule at `apps/contracts/lib/0g-agent-nft/` should track a release tag and be documented. Currently unclear which version is pinned. |
| **9** | **Standardize `withRetry` location** | 🟢 Low | 🟢 Low | `withRetry` is in `apps/backend/src/storage/0g.ts` — only used there. If other apps need retry, extract to `packages/config`. |
| **10** | **Audit unused imports** | 🟢 Low | 🟢 Low | Several files import `Indexer` directly even though they use the shared wrapper (e.g., `apps/indexer/src/index.ts` imports both `Indexer` from SDK and `uploadToStorage` from config). |

---

## 5. Top 10 Production Gaps

| # | Gap | Severity | Component | Details |
|---|---|---|---|---|
| **1** | **DA gRPC uses `createInsecure()` — no TLS** | 🔴 Critical | DA | `apps/indexer/src/da-client.ts:73`: `grpc.credentials.createInsecure()`. In production, DA blob submissions could be intercepted. MUST use TLS/SSL credentials. |
| **2** | **No DA gRPC reconnection logic** | 🔴 Critical | DA | If the DA gRPC connection drops, `DisperseBlob` calls fail silently. The `waitForReady` is only called once at startup (and errors logged, not fatal). |
| **3** | **DA_GRPC_URL not validated in env schema** | 🟡 High | DA | `DA_GRPC_URL` is read from `process.env` directly in `apps/indexer/src/index.ts` without Zod validation. No `env-schema.ts` entry. Silent misconfiguration. |
| **4** | **Compute fee settlement bypasses 0G broker** | 🟡 High | Compute | Axiom's `/v1/compute/pay` sends a raw transfer to provider address. The official Compute SDK's broker manages fee settlement via `settleFee()` with proper on-chain accounting. |
| **5** | **No EIP-712 cross-validation tests** | 🟡 High | Agentic ID | The TypeScript EIP-712 implementation in `apps/oracle/src/crypto/eip712.ts` is manually mirrored from Solidity but has no fuzz test comparing hash output with the on-chain `AxiomTeeVerifier` contract. |
| **6** | **Oracle ZeroGStorage has no retry** | 🟡 High | Storage | The oracle's `ZeroGStorage.upload()` does NOT wrap calls with retry. If 0G Storage is congested, the oracle's re-key flow fails immediately. The backend's wrapper does have retry. |
| **7** | **Storage upload re-buffering unbounded memory** | 🟡 Medium | Storage | In `apps/indexer/src/index.ts`, the `eventBuffer` has a MAX_BUFFER_SIZE of 10000 events in memory. If storage is down for extended period, memory grows unboundedly. |
| **8** | **Provider inference URLs hardcoded** | 🟡 Medium | Compute | `known_PROVIDERS` in `apps/backend/src/compute/router.ts` are hardcoded testnet URLs. Mainnet will have different provider endpoints — this map must be populated at runtime from on-chain broker contract. |
| **9** | **`app-sk-*` token parsing is fragile** | 🟡 Medium | Compute | The `decodeDirectKeyToken` function in `router.ts` does base64 decode + JSON parse on a token format that may change. No schema validation on the decoded payload. |
| **10** | **No KV store usage for agent metadata** | 🟢 Low | Storage | 0G Storage KV (`KvClient` from SDK) enables direct key-value lookups without downloading full blobs. Axiom always downloads full blobs via `downloadToBlob`. For large agent metadata, a KV pattern would be more efficient. |

---

## 6. Recommendations by Component

### 6.1 0G Storage

| # | Action | Priority | 
|---|---|---|
| 1 | Consolidate `ZeroGStorage` into `packages/config/storage/0g.ts` | P0 |
| 2 | Add retry to oracle's `ZeroGStorage` | P0 |
| 3 | Remove `InMemoryStorage` from production source → test utility | P1 |
| 4 | Add disk-backed overflow for indexer's `eventBuffer` | P1 |
| 5 | Evaluate using `KvClient` for agent metadata lookups | P2 |

### 6.2 0G Compute

| # | Action | Priority |
|---|---|---|
| 1 | Add `@0gfoundation/0g-compute-ts-sdk` to `apps/backend` deps | P1 |
| 2 | Implement broker-based fee settlement for production | P1 |
| 3 | Resolve provider endpoints from on-chain broker contract | P1 |
| 4 | Add attestation report validation to compute flow | P2 |
| 5 | Add Zod schema validation for `app-sk-*` tokens | P2 |

### 6.3 0G Chain

| # | Action | Priority |
|---|---|---|
| 1 | Eliminate all hardcoded URLs — always resolve from `OG_NETWORKS` | P1 |
| 2 | Unify env vars to `AXIOM_*` prefix, keep `OG_*` as aliases | P1 |
| 3 | Add `resolveRpcUrl`/`resolveStorageRpc` usage everywhere | P1 |

### 6.4 0G DA

| # | Action | Priority |
|---|---|---|
| 1 | Add TLS encryption to gRPC client (`grpc.credentials.createSsl()`) | P0 |
| 2 | Add gRPC reconnection logic (exponential backoff) | P0 |
| 3 | Add `DA_GRPC_URL` to `env-schema.ts` with Zod validation | P0 |
| 4 | Auto-fetch `disperser.proto` at build time vs. vendoring | P1 |
| 5 | Add gRPC health-check endpoint monitoring | P1 |

### 6.5 Agentic ID / Oracle

| # | Action | Priority |
|---|---|---|
| 1 | Add EIP-712 fuzz tests (TypeScript vs. Solidity output comparison) | P0 |
| 2 | Add `DaClient` reconnection to oracle (if gRPC is used for DA) | P1 |
| 3 | Add storage upload retry to oracle's `ZeroGStorage` | P0 |

---

## 7. Official 0G SDK Status (from Web Research)

### npm Packages (used by Axiom)

| Package | Version | Notes |
|---|---|---|
| `@0gfoundation/0g-storage-ts-sdk` | v1.2.10 | Storage Indexer, ZgFile, MemData, Blob, StorageNode, KvClient. Axiom uses only `Indexer` + `MemData`. |

### npm Packages (NOT used by Axiom)

| Package | Description | Why Axiom Should Care |
|---|---|---|
| `@0gfoundation/0g-compute-ts-sdk` | Compute Network TS SDK (v0.8.0+) — broker service, provider discovery, fee settlement | Would replace custom OpenAI client + token parser |
| (none for DA in TS) | No official TS DA SDK exists yet | Vendored proto approach is valid |
| (none for KV in TS) | KV store built into storage SDK | `KvClient` is available but unused |

### GitHub Repositories (0gfoundation)

Key repos relevant to Axiom:
- `0g-storage-ts-sdk` — **USED**
- `0g-compute-ts-sdk` — **NOT USED** (should evaluate)
- `0g-da-client` — **PARTIALLY** (Axiom built gRPC client from its proto)
- `0g-storage-contracts` — contracts the SDK depends on
- `0g-agent-nft` — Agentic ID contracts (**vendored as submodule**)
- `0g-storage-node` — storage node implementation
- `0g-compute-ts-starter-kit` — starter for compute SDK patterns
- `0g-storage-ts-starter-kit` — reference for storage patterns
- `awesome-0g` — curated ecosystem list

### 0G Architecture Components (from docs.0g.ai)

1. **0G Chain** — EVM-compatible L1 (Axiom uses ✅)
2. **0G Storage** — decentralized storage (Axiom uses ✅)
3. **0G Compute** — decentralized GPU marketplace (Axiom uses via Router API ⚠️, not via SDK)
4. **0G DA** — data availability (Axiom uses via custom gRPC ⚠️)
5. **Agentic ID / ERC-7857** — AI agent identity standard (Axiom uses ✅)

---

## 8. Cross-Reference with Other Agent Reports

*(To be filled in when other agent reports are finalized)*

| Report | Key Cross-Cuts |
|---|---|
| Chain Audit | env vars, RPC URLs, network config |
| Compute Audit | router.ts, provider discovery, fee settlement |
| Storage Audit | ZeroGStorage classes, wrapper hierarchy, retry logic |
| DA Audit | DaClient, proto vendoring, gRPC security |
| Agentic ID Audit | EIP-712 hashing, signer.ts, oracle storage integration |

---

## 9. Key Files (Absolute Paths)

| File | Role |
|---|---|
| `/home/eya/og/packages/config/src/storage/0g.ts` | Shared upload/download helpers |
| `/home/eya/og/apps/backend/src/storage/0g.ts` | Backend ZeroGStorage (with retry) |
| `/home/eya/og/apps/backend/src/storage/0g.test.ts` | Storage integration test |
| `/home/eya/og/apps/oracle/src/storage.ts` | Oracle StorageAdapter (duplicate ZeroGStorage) |
| `/home/eya/og/apps/backend/src/compute/router.ts` | Compute Router + Direct SDK proxy |
| `/home/eya/og/apps/indexer/src/da.ts` | DA submitter wrapper |
| `/home/eya/og/apps/indexer/src/da-client.ts` | Custom gRPC client |
| `/home/eya/og/apps/indexer/src/disperser.proto` | Vendored 0G DA proto |
| `/home/eya/og/apps/oracle/src/crypto/eip712.ts` | EIP-712 hashing (Agentic ID) |
| `/home/eya/og/apps/oracle/src/signer.ts` | TeeSigner |
| `/home/eya/og/packages/config/src/networks.ts` | OG_NETWORKS, URL resolution |
| `/home/eya/og/apps/oracle/src/index.ts` | Oracle startup (0G Storage init) |
| `/home/eya/og/apps/indexer/src/index.ts` | Indexer startup (Storage + DA init) |
| `/home/eya/og/apps/backend/src/index.ts` | Backend startup |
| `/home/eya/og/apps/backend/src/server.ts` | Server (ZeroGStorage creation) |
| `/home/eya/og/apps/oracle/src/env-schema.ts` | Oracle env schema |
| `/home/eya/og/apps/backend/src/env-schema.ts` | Backend env schema |
