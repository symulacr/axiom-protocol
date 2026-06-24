# Deep-Dive: DA (Data Availability) gRPC Integration — mig-02

**Status:** COMPLETE — integration is functional but has configuration and observability gaps

---

## Files Checked

| # | File | Purpose |
|---|------|---------|
| 1 | `apps/indexer/src/da.ts` | DA submitter entry point; exports `submitEvent()` and `makeRealSubmitter()` |
| 2 | `apps/indexer/src/da-client.ts` | Full gRPC `DaClient` class wrapping `DisperseBlob`, `GetBlobStatus`, `RetrieveBlob`, `waitForReady` |
| 3 | `apps/indexer/src/disperser.proto` | Vendored 0G DA Disperser proto definition |
| 4 | `apps/indexer/src/index.ts` | Main entry — wires env vars `DA_GRPC_URL` + `INDEXER_DA_ENABLED` into `EventSinkConfig` |
| 5 | `apps/indexer/src/env.ts` | Re-exports `loadEnv` / `getEnv` from `@axiom/config/env` (no DA-specific definitions) |
| 6 | `apps/indexer/src/da.test.ts` | Unit tests for `submitEvent` (mock submitter, error swallowing, sentinel) |
| 7 | `apps/indexer/Dockerfile` | Multi-stage Node 22 build; copies `disperser.proto` to `dist/` |
| 8 | `apps/indexer/package.json` | Dependencies include `@grpc/grpc-js` ^1.14.4, `@grpc/proto-loader` ^0.8.1 |
| 9 | `apps/backend/src/routers/health.ts` | Backend `/health` endpoint (does NOT report DA status) |
| 10 | `packages/config/src/env.ts` | Canonical env var definitions — no `DA_GRPC_URL` or `INDEXER_DA_ENABLED` |
| 11 | `packages/config/src/env-schema.ts` | Shared Zod schema — no DA fields |
| 12 | `packages/config/src/networks.ts` | Network entries — no DA gRPC endpoint |
| 13 | `packages/config/src/storage/0g.ts` | 0G Storage upload helper (separate from DA gRPC path) |
| 14 | `.env.example` | Root example env — `DA_GRPC_URL` and `INDEXER_DA_ENABLED` present but commented out |
| 15 | `Makefile` | References `docker-compose.yml` (gitignored, does not exist in repo) |
| 16 | `.gitignore` | `docker-compose.yml` is gitignored |

---

## 1. gRPC Client Implementation — COMPLETE

The core gRPC integration lives in two files:

**`apps/indexer/src/da.ts`**:
- `submitEvent(event, opts)` — main submission function; accepts an optional `submitFn` override (test seam). Never throws — returns sentinel `{ txHash: "", seq: 0n }` on failure.
- `makeRealSubmitter(daGrpcUrl)` — factory that creates a `DaClient`, starts a fire-and-forget `waitForReady(30_000)` readiness check, and returns an async function calling `daClient.disperseBlob(bytes)`.

**`apps/indexer/src/da-client.ts`** (`DaClient` class):
- Loads proto from vendored `disperser.proto` via `@grpc/proto-loader`
- Instantiates the `Disperser` gRPC client with **insecure credentials** (`grpc.credentials.createInsecure()`)
- Implements 4 methods:
  - `disperseBlob(data)` — calls `DisperseBlob` RPC, returns `{ requestId, blobStatus }`
  - `getBlobStatus(requestIdHex)` — polls processing status
  - `pollUntilFinalized(requestIdHex, pollIntervalMs, timeoutMs)` — polls until terminal state
  - `retrieveBlob(storageRoot, epoch, quorumId)` — retrieves blob data
  - `waitForReady(timeoutMs)` — waits for gRPC connection readiness
  - `close()` — closes the gRPC connection

**`apps/indexer/src/index.ts`** wiring:
```
const daEnabled = process.env["INDEXER_DA_ENABLED"] === "1"
  || process.env["INDEXER_DA_ENABLED"] === "true";
const daGrpcUrl = process.env["DA_GRPC_URL"];

const daConfig: EventSinkConfig = daEnabled && daGrpcUrl
  ? { da: "grpc", grpcUrl: daGrpcUrl }
  : daEnabled && storageIndexer && storageSigner
    ? { da: "storage", storageIndexer, storageSigner }
    : { da: "disabled" };
```
Three-way fallback: `grpc` → `storage` → `disabled`.

---

## 2. gRPC Endpoint Configuration

| Env Var | Example Value | Location | Default |
|---------|---------------|----------|---------|
| `DA_GRPC_URL` | `localhost:51001` | `.env.example:49` | (none — must set) |
| `INDEXER_DA_ENABLED` | `false` | `.env.example:50` | (falsy) |

**Key observations:**
- `DA_GRPC_URL` is read directly from `process.env` in `index.ts:246` — no validation, no Zod schema
- Not defined in `@axiom/config`'s canonical env vars (`packages/config/src/env.ts`)
- Not in the shared Zod schema (`packages/config/src/env-schema.ts`)
- No network-level default for DA gRPC in `packages/config/src/networks.ts` (unlike `evmRpc` and `storageRpc` which have default URLs per network)
- The default value `localhost:51001` in `.env.example:49` suggests a sidecar model (DA client runs alongside the indexer)

---

## 3. Proto File — PRESENT

**File:** `apps/indexer/src/disperser.proto`

- **Vendored directly in source** — not fetched from a remote dependency
- Package: `disperser`
- Service `Disperser` with 3 RPCs:
  - `DisperseBlob(DisperseBlobRequest) → DisperseBlobReply`
  - `GetBlobStatus(BlobStatusRequest) → BlobStatusReply`
  - `RetrieveBlob(RetrieveBlobRequest) → RetrieveBlobReply`
- Includes full `BlobStatus` enum (UNKNOWN, PROCESSING, CONFIRMED, FAILED, FINALIZED, INSUFFICIENT_SIGNATURES)
- Proto is copied to `dist/` in the Docker build: `COPY --from=builder /build/apps/indexer/src/disperser.proto dist/disperser.proto`

**Verification:** The `da-client.ts` loads the proto from a relative path `join(__dirname, "disperser.proto")` which resolves correctly both at dev time (via `tsx`) and in the Docker-built `dist/` output.

---

## 4. Docker Setup — HAS GAPS

**Dockerfile:** `apps/indexer/Dockerfile`
- Multi-stage Node 22 Alpine build
- Builds with `pnpm --filter @axiom/indexer... build`
- Runtime image copies `disperser.proto` to `dist/disperser.proto`
- CMD is `node dist/index.js`
- **Gap:** No `docker-compose.yml` in the repo (gitignored). The `Makefile` has `dev-up`/`dev-down`/`logs` targets that reference `docker-compose.yml`, but this file does not exist. A developer running `make dev-up` will get an error.

The 0G DA Client is expected to run as a sidecar (suggested by `localhost:51001` default). There is no Docker Compose service definition for the DA client in the project.

---

## 5. DA Configuration — COMPLETE (but minimal)

**Env var contract:**
- `INDEXER_DA_ENABLED=1` or `INDEXER_DA_ENABLED=true` enables DA submission
- `DA_GRPC_URL` sets the gRPC endpoint
- There is no `INDEXER_DA_DISABLED` — only positive enablement
- Falls back to 0G Storage path if DA gRPC is disabled but storage credentials exist

**Config type:**
```typescript
type EventSinkConfig =
  | { readonly da: "disabled" }
  | { readonly da: "grpc"; grpcUrl: string }
  | { readonly da: "storage"; storageIndexer: Indexer; storageSigner: ethers.Wallet };
```

**Gap:** `DA_GRPC_URL` and `INDEXER_DA_ENABLED` are not validated upfront. If `INDEXER_DA_ENABLED=true` but `DA_GRPC_URL` is empty, the indexer silently falls through to `storage` mode (or `disabled`). No warning is emitted for this misconfiguration.

---

## 6. Health Endpoint — NOT PRESENT

**The indexer has no HTTP server and no health endpoint.** It is a pure background polling process.

- `apps/backend/src/routers/health.ts` — backend has a `/health` route, but it does NOT report indexer or DA status
- The indexer's only DA health signal is the fire-and-forget `waitForReady(30_000)` call. If the DA connection fails:
  - A "fatal" log line is emitted (once, at startup)
  - The submitter continues to attempt calls (which will fail with gRPC errors)
  - These errors are caught and logged by `submitEvent()`'s error handler

**Gap:** No way to externally determine if the DA gRPC connection is healthy. No liveness/readiness probe available for container orchestration (Kubernetes, Docker Compose healthchecks).

---

## 7. Test Coverage — GOOD (unit level)

**File:** `apps/indexer/src/da.test.ts`

Tests cover:
- Canonical JSON serialization (RFC 8785) — key sorting, bigint encoding, byte stability, array order preservation
- Mock submitter path — successful submission returns expected txHash + seq
- Error swallowing — submitFn errors return sentinel, logged exactly once
- Missing submitFn — returns sentinel with a warning log

**Not tested:**
- `DaClient` class itself (actual gRPC calls)
- `makeRealSubmitter()` function
- `composeSinks()` in `index.ts`
- The three-way config fallback (`grpc` → `storage` → `disabled`)

---

## Summary of Gaps

| # | Gap | Severity | Recommendation |
|---|-----|----------|----------------|
| 1 | **No indexer health endpoint** | Medium | Add an HTTP health endpoint (e.g., `/health` or a dedicated port) that reports DA gRPC connection status, last successful submission timestamp, and blob processing backlog. Return 503 when DA is down. |
| 2 | **No docker-compose.yml** | Medium | Create a `docker-compose.yml` with the indexer service, database (if needed), and the 0G DA Client sidecar. Configure `DA_GRPC_URL` to point to the DA client container. |
| 3 | **Insecure gRPC credentials** | Low (dev only) | Add TLS support via `grpc.credentials.createSsl()` when a `DA_GRPC_CA_CERT` env var is set. Default to insecure in dev. |
| 4 | **DA env vars not in shared config** | Low | Add `DA_GRPC_URL` and `INDEXER_DA_ENABLED` to `packages/config/src/env.ts` canonical definitions for discoverability. Add default DA gRPC URLs to `packages/config/src/networks.ts`. |
| 5 | **No input validation for DA_GRPC_URL** | Low | Validate `DA_GRPC_URL` format at startup; log a warning if it's missing when `INDEXER_DA_ENABLED` is true. |
| 6 | **No gRPC reconnection** | Medium | `waitForReady` is called once at startup. If the connection drops later, calls fail silently. Add a reconnection strategy or use the gRPC client's built-in `waitForReady` per-call. |
| 7 | **No integration test for gRPC DaClient** | Low | Add integration tests that start a mock gRPC server and test `DaClient.disperseBlob()` and `DaClient.getBlobStatus()` against it. |

---

## Architecture Diagram (text)

```
┌──────────────────────────────────────────────────────┐
│  apps/indexer                                         │
│                                                        │
│  index.ts                                              │
│    ├─ reads DA_GRPC_URL + INDEXER_DA_ENABLED          │
│    └─ creates EventSinkConfig                          │
│         └─ composeSinks(config)                         │
│              └─ for "grpc" mode:                        │
│                   makeRealSubmitter(daGrpcUrl)           │
│                                                        │
│  da.ts                                                 │
│    ├─ submitEvent(event, opts)  ← never throws         │
│    └─ makeRealSubmitter(daGrpcUrl)                     │
│         └─ new DaClient(daGrpcUrl)                      │
│              └─ waitForReady(30s)  ← fire-and-forget   │
│                                                        │
│  da-client.ts                                          │
│    └─ DaClient                                          │
│         ├─ disperseBlob(data)                           │
│         ├─ getBlobStatus(requestId)                     │
│         ├─ pollUntilFinalized(requestId)                │
│         ├─ retrieveBlob(storageRoot, epoch, quorum)     │
│         └─ close()                                      │
│                                                        │
│  disperser.proto (vendored)                             │
│    └─ service Disperser { DisperseBlob, GetBlobStatus,  │
│                           RetrieveBlob }                │
└──────────────────────────────────────────────────────┘

        │  gRPC (insecure, localhost:51001)
        ▼
┌──────────────────┐
│ 0G DA Client     │  (expected sidecar)
│ - disperses to   │
│   0G DA network   │
└──────────────────┘
```
