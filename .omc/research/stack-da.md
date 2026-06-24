# Stack Report: 0G Data Availability (DA) gRPC Integration

**Date:** 2026-06-24
**Scope:** Full-stack audit of the Axiom Protocol → 0G DA gRPC client integration
**Previous deep-dive:** `/home/eya/og/.omc/research/deep-02-da.md` (compares well, this is more exhaustive)

---

## Table of Contents

1. [Web Research Results](#1-web-research-results)
2. [Files Traced](#2-files-traced)
3. [Curl Endpoint Tests](#3-curl-endpoint-tests)
4. [Per-File Critique](#4-per-file-critique)
5. [Proto File Comparison: Vendored vs Official](#5-proto-file-comparison)
6. [Architecture Analysis](#6-architecture-analysis)
7. [Security & Production Gaps](#7-security--production-gaps)
8. [Test Coverage Analysis](#8-test-coverage-analysis)
9. [Deduplication Opportunities](#9-deduplication-opportunities)

---

## 1. Web Research Results

### Official 0G Documentation

| Source | URL | Key Content |
|--------|-----|-------------|
| 0G DA Integration Guide | https://docs.0g.ai/developer-hub/building-on-0g/da-integration | Max blob size 32,505,852 bytes; fee market (BLOB_PRICE); sidecar model (stand up DA Client + Encoder); gRPC port 51001 |
| 0G DA Node Guide | https://docs.0g.ai/run-a-node/da-node | DA Node hardware: 16GB RAM, 8 cores, 1TB NVMe; BLS key gen; DA entrance contract: `0x857C0A28A8634614BB2C96039Cf4a20AFF709Aa9` |
| 0G SDKs page | https://build.0g.ai/sdks | **No TypeScript DA SDK exists** — only `0g-da-rust-sdk` (Rust, `cargo add 0g-da-rust-sdk`). 0G Storage TS SDK exists (`@0gfoundation/0g-storage-ts-sdk`) but that's for storage, NOT DA |
| Storage SDK | https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk | Full TS SDK for 0G Storage (indexer upload/download), separate from DA |
| 0G DA Example (Rust) | https://github.com/0gfoundation/0g-da-example-rust | Example gRPC client in Rust with `disperser.proto` |
| 0G DA Client (Go) | https://github.com/0gfoundation/0g-da-client | Official Go implementation of the DA Client. Go-based, 107 commits. Includes API docs in `api/` directory |
| 0G DA White Paper | https://4134984757-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2FsEYMfeKUqxaOUwhkw6AT%2Fuploads%2Fgit-blob-4ab04030065ac783a7d398a1843994edf1c47da4%2F0g-whitepaper.pdf | "0G: Towards Data Availability 2.0" — DA built on top of decentralized storage; partition-based infinite scaling |

### Key Web Research Findings

1. **No official TypeScript/JavaScript SDK for 0G DA.** The builder hub at `build.0g.ai/sdks` lists:
   - `@0gfoundation/0g-storage-ts-sdk` — Storage only (NOT DA)
   - `0g-da-rust-sdk` — Rust only
   - `0g-storage-client` — Go only
   - **No `@0gfoundation/0g-da-ts-sdk` exists on npm**
   
   Therefore the Axiom team built a **custom gRPC client** using `@grpc/grpc-js` and `@grpc/proto-loader` — this is correct and necessary.

2. **Public DA gRPC endpoint:** NOT found. The DA Client is self-hosted. The docs show running a Docker container that listens on `:51001`. There is no `dgrpc-testnet.0g.ai` public endpoint for the Disperser service. The `.env.example` default `localhost:51001` confirms the sidecar model.

3. **Canonical proto:** Lives at https://github.com/0gfoundation/0g-da-client/blob/main/api/grpc/disperser/disperser.proto (Go repo) and https://github.com/0gfoundation/0g-da-example-rust/blob/main/src/disperser.proto (Rust example). Both are identical.

4. **Chain IDs:** Galileo testnet = 16602, Mainnet (Aristotle) = 16661.

5. **DA entrance contract (testnet):** `0x857C0A28A8634614BB2C96039Cf4a20AFF709Aa9`

---

## 2. Files Traced

### Core DA Files

| # | File | Lines | Purpose |
|---|------|-------|---------|
| 1 | `/home/eya/og/apps/indexer/src/da.ts` | 74 | DA submitter — `submitEvent()`, `makeRealSubmitter()` |
| 2 | `/home/eya/og/apps/indexer/src/da-client.ts` | 202 | Full `DaClient` gRPC class — `DisperseBlob`, `GetBlobStatus`, `RetrieveBlob`, `pollUntilFinalized`, `waitForReady`, `close` |
| 3 | `/home/eya/og/apps/indexer/src/disperser.proto` | 114 | Vendored 0G Disperser proto definition |
| 4 | `/home/eya/og/apps/indexer/src/da.test.ts` | 182 | Unit tests for `submitEvent` with mock submitter |

### Wiring Files

| # | File | Lines | Purpose |
|---|------|-------|---------|
| 5 | `/home/eya/og/apps/indexer/src/index.ts` | 302 | Main entry — env var reading, `EventSinkConfig`, `composeSinks()`, `makeRealSubmitter()` call |
| 6 | `/home/eya/og/apps/indexer/src/env.ts` | 1 | Re-exports from `@axiom/config/env` — no DA-specific config |
| 7 | `/home/eya/og/apps/indexer/src/sink.ts` | 100 | HTTP sink to backend (POST `/v1/events`) |
| 8 | `/home/eya/og/apps/indexer/src/serialization.ts` | 72 | RFC 8785 canonical JSON for event blob |
| 9 | `/home/eya/og/apps/indexer/src/events.ts` | 202 | Event type definitions and ABI items |
| 10 | `/home/eya/og/apps/indexer/src/watcher.ts` | 650 | Block watcher — polls chain, calls `EventSink` |
| 11 | `/home/eya/og/apps/indexer/package.json` | 33 | Dependencies: `@grpc/grpc-js` ^1.14.4, `@grpc/proto-loader` ^0.8.1 |
| 12 | `/home/eya/og/apps/indexer/Dockerfile` | 52 | Multi-stage Node 22 build; copies proto to `dist/` |

### Config/Env Files

| # | File | Lines | Purpose |
|---|------|-------|---------|
| 13 | `/home/eya/og/.env.example` | 57 | `DA_GRPC_URL` and `INDEXER_DA_ENABLED` present but commented out (lines 49-50) |
| 14 | `/home/eya/og/packages/config/src/env.ts` | 86 | Canonical env var definitions — **NO DA vars** (`DA_GRPC_URL`, `INDEXER_DA_ENABLED` not listed in `ENV_KEYS`) |
| 15 | `/home/eya/og/packages/config/src/networks.ts` | 54 | Network entries — **NO DA gRPC URL** (only `evmRpc` and `storageRpc`) |
| 16 | `/home/eya/og/packages/config/src/storage/0g.ts` | 56 | 0G Storage (NOT DA) upload/download helpers |

### Related Files

| # | File | Lines | Purpose |
|---|------|-------|---------|
| 17 | `/home/eya/og/apps/backend/src/storage/0g.ts` | 60 | Backend `ZeroGStorage` wrapper (Storage, not DA) |
| 18 | `/home/eya/og/apps/bench/live-e2e/da-chaos.sh` | 310 | Chaos test for 0G Storage (NOT DA gRPC) — tests storage indexer outage/recovery |
| 19 | `/home/eya/og/.omc/research/deep-02-da.md` | ~220 | Prior deep-dive — substantive overlap with this report |

### Key Code Snippets

#### da.ts — makeRealSubmitter (lines 63-74)
```typescript
export function makeRealSubmitter(daGrpcUrl: string): SubmitFn {
  const client = new DaClient(daGrpcUrl);
  // Fire-and-forget readiness check — logs fatal error at startup
  client.waitForReady(30_000).catch((err) => {
    console.error(JSON.stringify({
      level: "fatal",
      msg: "DA client failed to connect",
      daGrpcUrl,
      err: err instanceof Error ? err.message : String(err),
    }));
  });
  return async (bytes: Uint8Array) => {
    const { requestId } = await client.disperseBlob(bytes);
    return { txHash: requestId, seq: 0n };
  };
}
```

#### index.ts — 3-way DA config (lines 267-271)
```typescript
const daConfig: EventSinkConfig = daEnabled && daGrpcUrl
  ? { da: "grpc", grpcUrl: daGrpcUrl }
  : daEnabled && storageIndexer && storageSigner
    ? { da: "storage", storageIndexer, storageSigner }
    : { da: "disabled" };
```

#### da-client.ts — Insecure gRPC (line 73)
```typescript
this.client = new Disperser(grpcUrl, grpc.credentials.createInsecure());
```

---

## 3. Curl Endpoint Tests

```bash
# Test 1: dgrpc-testnet.0g.ai:9090 (suspected public gRPC)
$ curl -s --connect-timeout 5 http://dgrpc-testnet.0g.ai:9090/
Result: "gRPC port not HTTP-accessible"

# Test 2: localhost:51001 (expected sidecar)
$ curl -s --connect-timeout 5 http://localhost:51001/
Result: "no local DA sidecar"

# Test 3: dgrpc-testnet.0g.ai:443
$ curl -s --connect-timeout 5 https://dgrpc-testnet.0g.ai:443/
Result: "no HTTPS on dgrpc-testnet port 443"
```

**Interpretation:** There is no publicly hosted gRPC endpoint for the 0G DA Disperser. The `dgrpc-testnet.0g.ai` hostname may not even resolve or may not have port 9090 open. The DA Client MUST be self-hosted as a sidecar. The indexer design correctly assumes `localhost:51001`.

---

## 4. Per-File Critique

### 4.1 `da.ts` — DA Submitter

**Quality:** Good. Clean separation of concerns. `submitEvent()` is a safe, never-throws wrapper. The `SubmitFn` abstraction enables easy test mocking.

**Issues found:**
1. **`makeRealSubmitter` leaks gRPC client** — Creates a `DaClient` but never exposes `close()`. The client is created once and reused, which is fine for a long-lived process, but there's no `close()` path on the returned `SubmitFn`. If the indexer shuts down, the gRPC connection stays open until GC.
   
2. **Fire-and-forget readiness check** — `waitForReady(30_000)` is called with `.catch()` but the result is not awaited. If the connection fails after the initial check (e.g., the DA sidecar restarts), there's no reconnection logic. `disperseBlob()` will fail with a gRPC error caught by `submitEvent()`'s catch-all, but the client never retries.

3. **`seq: 0n` is always hardcoded** — `makeRealSubmitter` returns `{ txHash: requestId, seq: 0n }`. The `seq` field is always 0, suggesting it was planned for future use (maybe a sequence counter for ordering blobs) but never implemented.

### 4.2 `da-client.ts` — gRPC DaClient Class

**Quality:** Solid implementation. Properly handles proto loading, callback-to-Promise conversion, and the `waitForReady` deadline pattern.

**Issues found:**
1. **Insecure credentials hardcoded** (line 73): `grpc.credentials.createInsecure()` — No TLS support. Acceptable for dev but needs a production path.

2. **No connection reuse/reconnection strategy**: `waitForReady` is a one-shot. If the gRPC connection drops after the initial ready state, `disperseBlob()` calls will fail. The `@grpc/grpc-js` library has built-in reconnection (it's transparent for most cases), but there's no explicit `reconnect` callback or health check.

3. **`DisperseBlob` uses string-based method access** (line 79): `this.client["DisperseBlob"]()` — The type defs are via `any`. This works but loses type safety. The `protoLoader` and type system aren't well-integrated.

4. **Missing request deadline/timeout propagation**: `DisperseBlob` uses the default gRPC deadline (none). If the DA sidecar hangs, the Promise may never resolve. Should add a configurable deadline.

5. **No blob size validation**: The proto says data must be <= 31744 KiB (32,505,856 bytes). The client does not enforce this.

### 4.3 `disperser.proto` — Vendored Proto

**Quality:** Identical to canonical/official proto. Verified against:
- https://raw.githubusercontent.com/0gfoundation/0g-da-example-rust/main/src/disperser.proto
- https://github.com/0gfoundation/0g-da-client/blob/main/api/grpc/disperser/disperser.proto

**Issues found:** None. Proto is a verbatim copy. The Dockerfile copies it correctly to `dist/`.

### 4.4 `index.ts` — Main Wiring

**Issues found:**
1. **`DA_GRPC_URL` and `INDEXER_DA_ENABLED` read directly from `process.env`** — No validation, no Zod schema, no default. If `INDEXER_DA_ENABLED=true` but `DA_GRPC_URL` is empty, the indexer silently falls to `storage` or `disabled` mode without warning.

2. **`composeSinks()` creates a new `makeRealSubmitter()` on every event in "grpc" mode** (lines 145-158): The submitter is created inside the per-event switch case, NOT cached. This means a new `DaClient` is created for every single event. The `waitForReady` check fires repeatedly. This appears to be a **performance bug** — the `submitFn` should be created once and reused.

   ```typescript
   // index.ts lines 144-158 — BUG: recreates submitter on every event
   case "grpc": {
     const submitFn = makeRealSubmitter(config.grpcUrl);  // ← created per-event!
     try {
       await submitEvent(event, { submitFn });
     } catch (err) {
       ...
     }
     break;
   }
   ```

3. **Duplicate error handling**: `submitEvent()` already catches errors internally and logs them. The `composeSinks()` then wraps the call in another try/catch that also logs. This produces duplicate error log entries.

4. **`composeSinks()` switches on `config.da` but also checks `config.da === "storage"` separately** (lines 147 and 204). The switch exhaustiveness is partial — the "disabled" case is empty, "grpc" case only handles gRPC, and "storage" case ALSO handles 0G Storage batching below the switch. This is unclear control flow.

### 4.5 `.env.example`

**Issues found:**
1. `DA_GRPC_URL` is commented out with default `localhost:51001` — Good documentation.
2. `INDEXER_DA_ENABLED` is commented out with default `false` — Good.
3. No `OG_STORAGE_RPC` is shown in the Indexer section — But it's used in code for the 0G Storage fallback path.

### 4.6 `packages/config/src/env.ts`

**Issues found:**
1. `DA_GRPC_URL`, `INDEXER_DA_ENABLED` are **not listed** in `ENV_KEYS` const object (lines 59-74). They have no canonical documentation. This makes them "hidden" config keys.
2. No `getEnvWithAlias` pattern for DA vars.

### 4.7 `packages/config/src/networks.ts`

**Issues found:**
1. No `daGrpcUrl` field in `OGNetwork` type (line 7). Unlike `evmRpc` and `storageRpc`, there is no network-level default for the DA gRPC URL. This is partly justified since the DA client is self-hosted, but having a placeholder would improve discoverability.

### 4.8 `apps/indexer/Dockerfile`

**Issues found:**
1. Runtime stage copies proto via absolute workspace path — Works as long as Docker context is the repo root.
2. No `docker-compose.yml` for the DA sidecar (the file is gitignored). A developer needs to manually run the 0G DA Client Docker container alongside the indexer.

### 4.9 `apps/backend/src/storage/0g.ts` & `packages/config/src/storage/0g.ts`

**Important distinction:** These are for **0G Storage**, NOT **0G DA**. They upload/download files to 0G Storage nodes using the `@0gfoundation/0g-storage-ts-sdk`. This is a completely different system from the DA gRPC integration.

- The DA gRPC path (`da.ts` + `da-client.ts`) submits blobs to the DA network for data availability.
- The 0G Storage path (`config/src/storage/0g.ts`) uploads event batches to 0G Storage for permanence.
- These are two different data planes. The `index.ts` code treats them as alternatives in `EventSinkConfig`.

---

## 5. Proto File Comparison: Vendored vs Official

**Vendored:** `/home/eya/og/apps/indexer/src/disperser.proto`
**Official (canonical):** https://raw.githubusercontent.com/0gfoundation/0g-da-client/main/api/grpc/disperser/disperser.proto
**Official (Rust example):** https://raw.githubusercontent.com/0gfoundation/0g-da-example-rust/main/src/disperser.proto

**Result: IDENTICAL.** No differences in:
- Package name
- Service definition (3 RPCs)
- Message fields
- Enum values
- Comments
- Option declarations (`go_package`, `syntax`)

The vendored copy is up-to-date and accurate.

---

## 6. Architecture Analysis

### Current Data Flow

```
┌──────────────────────────────────────────────────────────┐
│  apps/indexer                                            │
│                                                           │
│  Watcher (polls 0G Chain for events)                     │
│    │                                                      │
│    ▼                                                     │
│  EventSink (= composedSink function)                     │
│    ├─ ▶ stdoutSink (one JSON line per event)              │
│    ├─ ▶ postEvent to backend HTTP                         │
│    └─ ▶ DA submission:                                    │
│         ├─ case "grpc":   makeRealSubmitter(daGrpcUrl)    │
│         │     → DaClient.disperseBlob(bytes)              │
│         │     → 0G DA Client (sidecar, :51001)             │
│         │     → DA Network                                │
│         ├─ case "storage": buffer → uploadToStorage()     │
│         │     → 0G Storage Indexer                         │
│         │     → 0G Storage Network                         │
│         └─ case "disabled": skip                          │
└──────────────────────────────────────────────────────────┘
```

### Sidecar Architecture

The indexer does NOT connect directly to the 0G DA network. Instead:
1. The operator runs a **0G DA Client** Docker container (from `0gfoundation/0g-da-client`) as a sidecar.
2. The DA Client handles: blob encoding, batcher logic, on-chain transaction submission, fee payment.
3. The indexer connects to the DA Client via gRPC on `localhost:51001`.
4. The DA Client uses its own private key to interact with the DA entrance contract.

This means the indexer operator must also provision and maintain a 0G DA Client with its own private key and wallet funding.

---

## 7. Security & Production Gaps

| # | Gap | Severity | Details |
|---|-----|----------|---------|
| 1 | **Insecure gRPC credentials** | 🔴 HIGH (prod) / 🟡 MED (dev) | `grpc.credentials.createInsecure()` hardcoded. For production over untrusted networks, TLS is mandatory. Should use `createSsl()` when a CA cert is provided. |
| 2 | **No gRPC reconnection strategy** | 🟡 MEDIUM | `waitForReady` called once at startup. If the DA sidecar restarts, the client connection is stale. `@grpc/grpc-js` has subchannel reconnection built-in, but it is not explicitly configured. |
| 3 | **No blob size validation** | 🟡 MEDIUM | Proto limits data to 31744 KiB, but the client does not check. Large blobs will fail with a gRPC error. Pre-validation would give a better error message. |
| 4 | **No request timeout for DisperseBlob** | 🟡 MEDIUM | No deadline set. If the DA sidecar hangs, the Promise never resolves. Should use `this.client.disperseBlob({...}, { deadline: ... })`. |
| 5 | **Config env vars not in shared schema** | 🟢 LOW | `DA_GRPC_URL` and `INDEXER_DA_ENABLED` not in `ENV_KEYS` or any Zod schema. No validation or documentation. |
| 6 | **Silent fallback with no warning** | 🟢 LOW | If `INDEXER_DA_ENABLED=true` but `DA_GRPC_URL` is unset, the fallback to "storage" or "disabled" is silent. Should log a warning. |
| 7 | **No health endpoint for DA** | 🟡 MEDIUM | No way for orchestration systems (K8s, Docker healthcheck) to determine if the DA connection is healthy. The fire-and-forget `waitForReady` is not observable. |
| 8 | **DaClient not closable from outside** | 🟢 LOW | `makeRealSubmitter` creates a `DaClient` but never exposes it. The gRPC connection cannot be cleanly closed on shutdown. |
| 9 | **No TLS/gRPC auth between indexer and DA sidecar** | 🟢 LOW | If the DA sidecar runs on a separate host, the gRPC connection is unauthenticated and unencrypted. Acceptable for localhost-only in dev. |

---

## 8. Test Coverage Analysis

### Test file: `/home/eya/og/apps/indexer/src/da.test.ts`

**What IS tested (4 test cases in 2 describe blocks):**
1. ✅ Canonical JSON serialization (RFC 8785) — 4 subtests
   - Key sorting
   - Bigint encoding as decimal strings (not JSON numbers)
   - Byte stability across repeated invocations
   - Array order preservation
2. ✅ `submitEvent` with mock submitFn — 4 subtests
   - Returns the txHash + seq from injected submitFn ✓
   - Passes canonical JSON bytes to submitFn ✓
   - Swallows submitFn errors, returns sentinel, logger called once ✓
   - Returns sentinel when no submitFn configured ✓

**What is NOT tested:**
| Area | Lines | Untested |
|------|-------|----------|
| `DaClient` class | da-client.ts: 48-201 | `constructor`, `disperseBlob`, `getBlobStatus`, `pollUntilFinalized`, `retrieveBlob`, `waitForReady`, `close` — **nothing tested** |
| `makeRealSubmitter()` | da.ts: 63-74 | **Completely untested** — no unit or integration test |
| `composeSinks()` | index.ts: 136-213 | **Completely untested** — the 3-way routing logic |
| `EventSinkConfig` fallback | index.ts: 267-271 | No test for `grpc→storage→disabled` routing |
| gRPC integration | da-client.ts + da.ts | No gRPC mock server test for the full data path |
| Error recovery | da-client.ts | No test for gRPC disconnection/reconnection behavior |

**Coverage gaps summary:**
- `DaClient`: 0% — hardest to test because it requires a gRPC server
- `makeRealSubmitter`: 0% — creates a real `DaClient`
- `composeSinks`: 0% — involves real env state
- `index.ts` DA wiring: 0%
- Total DA gRPC surface tested: ~15% (only `submitEvent` with mocks)

**Recommendation:** Add integration tests using a gRPC test server (or `@grpc/grpc-js` server mock) to test `DaClient.disperseBlob()` and `DaClient.getBlobStatus()`.

---

## 9. Deduplication Opportunities

### Between `da.ts` and `index.ts`

1. **`makeRealSubmitter` is called redundantly** — In `composeSinks()` (index.ts:145-158), a new submitter is created on every event call. The submitter should be cached outside the sink function. Compare:
   - `da.ts` line 63-74: `makeRealSubmitter(daGrpcUrl)` → returns `SubmitFn`
   - `index.ts` line 145: `const submitFn = makeRealSubmitter(config.grpcUrl);` — **called per-event instead of once**

2. **Error logging is duplicated** — `submitEvent()` (da.ts lines 46-55) catches and logs errors. Then `composeSinks()` (index.ts lines 148-158) wraps the call in ANOTHER try/catch that also logs. The `storage` case (index.ts lines 160-175) has the same issue with `submitEvent(event, {})`.

### Between `da.ts` and `da-client.ts`

3. **`DaClient.close()` is never called** — `makeRealSubmitter` has no way to close the gRPC connection. If a `close()` method were added to the submitter, it could be called during graceful shutdown (index.ts line 293 `await handle.stop()`).

### Between `packages/config/src/storage/0g.ts` and DA

4. **Two separate "storage" systems** — The `@axiom/config/storage/0g.ts` (0G Storage upload) and `da.ts` (DA gRPC) serve different purposes but are wired as alternatives in `EventSinkConfig`. The naming overload of "storage" is confusing. Consider renaming the DA gRPC path vs. the 0G Storage path to make the distinction clear (e.g., `da-grpc` vs `da-storage`).

### Between backend `storage/0g.ts` and config `storage/0g.ts`

5. **Backend `ZeroGStorage` is a thin wrapper** — `apps/backend/src/storage/0g.ts` just wraps `packages/config/src/storage/0g.ts` with retry logic. The retry could be pushed into the shared config module.

---

## Summary of All Gaps

| # | Priority | Area | Gap |
|---|----------|------|-----|
| P1 | 🔴 CRITICAL | Performance | `makeRealSubmitter` called on EVERY event — creates a new gRPC client per event. Should be cached. |
| P2 | 🟡 HIGH | Security | Insecure gRPC credentials hardcoded |
| P3 | 🟡 HIGH | Reliability | No gRPC reconnection after startup failure |
| P4 | 🟡 HIGH | Test coverage | `DaClient`, `makeRealSubmitter`, `composeSinks` all untested |
| P5 | 🟡 MEDIUM | Observability | No health endpoint; DA status not externally visible |
| P6 | 🟡 MEDIUM | Infrastructure | No `docker-compose.yml` for DA sidecar |
| P7 | 🟡 MEDIUM | Reliability | No blob size validation or request deadlines |
| P8 | 🟢 LOW | Config | DA env vars not in shared config schema |
| P9 | 🟢 LOW | Code quality | Duplicate error logging in `composeSinks()` |
| P10 | 🟢 LOW | Code quality | `DaClient.close()` not exposed via `SubmitFn` |
| P11 | 🟢 LOW | Documentation | `seq: 0n` always hardcoded — unclear if intentional |

---

## Key Sources

| Resource | URL |
|----------|-----|
| 0G DA Integration Guide | https://docs.0g.ai/developer-hub/building-on-0g/da-integration |
| 0G DA Node Guide | https://docs.0g.ai/run-a-node/da-node |
| 0G DA Client GitHub | https://github.com/0gfoundation/0g-da-client |
| 0G DA Example Rust | https://github.com/0gfoundation/0g-da-example-rust |
| 0G DA Rust SDK | https://github.com/0gfoundation/0g-da-rust-sdk |
| 0G SDKs Builder Hub | https://build.0g.ai/sdks |
| 0G Storage TS SDK | https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk |
| 0G Network Endpoints | https://drpc.org/chainlist/0g-mainnet-rpc |
| 0G White Paper | https://4134984757-files.gitbook.io/~/files/v0/b/gitbook-x-prod.appspot.com/o/spaces%2FsEYMfeKUqxaOUwhkw6AT%2Fuploads%2Fgit-blob-4ab04030065ac783a7d398a1843994edf1c47da4%2F0g-whitepaper.pdf |
| Canonical Disperser Proto | https://github.com/0gfoundation/0g-da-client/blob/main/api/grpc/disperser/disperser.proto |
| Rust Example Disperser Proto | https://raw.githubusercontent.com/0gfoundation/0g-da-example-rust/main/src/disperser.proto |
