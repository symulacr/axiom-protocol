# Wave 4 — Assessment 5: Documentation & Observability Gaps

**Agent:** W4A5-DocsObservability  
**Date:** 2026-06-28  
**Scope:** Naming inconsistencies, logging quality, observability gaps across all Axiom Protocol apps  
**Constraint:** Read-only — no edits, no code changes.

---

## 1. Naming Assessment

### 1.1 Env Var Prefix Inconsistency: `AXIOM_` vs `OG_`

The canonical prefix is `AXIOM_` (per docs and schema), but `OG_` variants persist across the codebase as deprecated aliases, creating confusion:

| Canonical (`AXIOM_`) | Deprecated/Compat (`OG_`) | Files |
|---|---|---|
| `AXIOM_EVM_RPC` | `OG_RPC_URL`, `RPC_URL` | `packages/config/src/env.ts:30-31`, `apps/indexer/src/index.ts:24`, `.env:15` |
| `AXIOM_CHAIN_ID` | `OG_CHAIN_ID` | `packages/config/src/env.ts:34`, `apps/indexer/src/sink.ts:56`, `.env:16` |
| `AXIOM_STORAGE_RPC` | `OG_STORAGE_RPC` | `packages/config/src/env.ts:30`, `apps/indexer/src/index.ts:205`, `.env:22` |
| `AXIOM_COMPUTE_API_KEY` | `OG_COMPUTE_API_KEY` | `apps/backend/src/env-schema.ts:11`, `packages/config/src/env-schema.ts:16` |
| `AXIOM_COMPUTE_BASE_URL` | `OG_COMPUTE_BASE_URL` | `apps/backend/src/compute/router.ts:9,14`, `packages/config/src/env-schema.ts:20` |
| _(none canonical for DA)_ | `OG_DA_ENTRANCE_ADDR`, `OG_DA_GRPC_URL` | `.env:32-33` |

The `packages/config/src/env.ts:29-38` comments document these backward-compat aliases but do NOT emit a deprecation warning when they are used, so operators running with `OG_`-style `.env` files never know they should migrate.

Additionally, the `.env` file (the real runtime config) is heavily `OG_`-prefixed while `.env.example` uses `AXIOM_` — the running config trains a different naming convention than the documented one.

### 1.2 Deprecated Env Var Aliases (No Cleanup Timeline)

| Canonical | Legacy Alias(es) | Files |
|---|---|---|
| `AXIOM_AGENT_NFT_ADDRESS` | `AGENT_NFT_ADDRESS` | `apps/backend/src/env-schema.ts:23`, `apps/backend/src/index.ts:33-34` |
| `AXIOM_STRATEGY_VAULT_ADDRESS` | `VAULT_ADDRESS` | `apps/backend/src/env-schema.ts:24`, `apps/backend/src/index.ts:38-39` |
| `AXIOM_TEE_VERIFIER_ADDRESS` | `AXIOM_TEE_VERIFIER` | `apps/backend/src/env-schema.ts:25`, `apps/oracle/src/index.ts:15-16`, `packages/config/src/addresses.ts:6` |
| `AXIOM_PAYMENT_PROCESSOR_ADDRESS` | `PAYMENT_PROCESSOR_ADDRESS` | `apps/backend/src/env-schema.ts:26`, `.env.example:35` |
| `AXIOM_PAYMENT_TOKEN` | `AXIOM_MOCK_USDC_ADDRESS` | `.env:48-50`, `packages/config/src/addresses.ts:8` |
| `AXIOM_TEE_SIGNER_PK` | `TEE_SIGNER_PK` | `packages/config/src/env.ts:35`, `.env:7`, `apps/backend/src/cli/run-e2e.ts:21` |

The `.env.example:23` still shows `AGENT_NFT_ADDRESS=0x5a89...` even though canonical is `AXIOM_AGENT_NFT_ADDRESS`, compounding the confusion.

### 1.3 Unclear Variable Names

- **`DEPLOYER_PK`**: Used both as the backend wallet signer AND for on-chain storage uploads in the indexer (`apps/backend/src/index.ts:21`, `apps/indexer/src/index.ts:206`). The name suggests deployment-only use, but it powers the runtime backend.
- **`TEE_SIGNER_PK`**: In `.env:7` this is set to the same value as `DEPLOYER_PK`, so the key separation intended between deployer, TEE signer, and oracle admin is not actually enforced — all three env vars (`DEPLOYER_PK`, `TEE_SIGNER_PK`, `ORACLE_ADMIN_PK`) contain the same testnet key.
- **`ORACLE_ADMIN_PK`**: Defined in `.env:8` but never referenced in any source code — dead config variable.
- **`BENCH_*` vars** (`.env.example:31-36`): Five vars under `# Bench (testing only)` section with no indication which package consumes them or what the bench tool is.

### 1.4 Contract Script Naming

Found under `apps/contracts/script/`:
- `Deploy.s.sol` — generic name, contains mainnet + testnet deployment
- `DeployAristotle.s.sol` — specific mainnet deployment (Aristotle = mainnet chain name)
- `DeployPaymentProcessor.s.sol` — component-specific
- `RedeployTeeVerifier.s.sol` — mix of "Redeploy" (non-standard spelling)

The naming has no consistent pattern: one is generic (`Deploy.s.sol`), one is chain-specific (`DeployAristotle.s.sol`), one is component-specific (`DeployPaymentProcessor.s.sol`), and the redeploy script has a typo-style prefix (`Redeploy` vs `Redeploy`).

### 1.5 Variable Naming in Code

- **`frontend/src/hooks/usePoll.ts`**: Parameter `pollTick` (line 62) as a counter incremented to trigger re-poll — named like a noun but used as a number. `cancelled` (British spelling) in line 43 vs American spelling used elsewhere.
- **`apps/backend/src/server.ts:88`**: `ogChainId` variable uses the `OG_` prefix pattern while the env var it's derived from is `AXIOM_CHAIN_ID`. The `og` noun appears inconsistently.
- **`apps/indexer/src/watcher.ts:567`**: `logs.sort(logsByChainOrder)` — function name `logsByChainOrder` suggests a comparator but the naming doesn't make the order explicit (ascending? descending? by block or log index?).
- **`apps/backend/src/orchestrator/index.ts`**: `_actionHash` (line 157) is prefixed with underscore indicating unused, but it IS used by `keccak256` on line 157 — the underscore prefix is misleading.

---

## 2. Logging Assessment

### 2.1 Structured Loggers

| App | Logger | Structured? | Component-scoped? | Level filtering? |
|---|---|---|---|---|
| **Backend** | Custom `createLogger` (`apps/backend/src/utils/logger.ts`) | Yes (ISO timestamp, level, component, extra KV pairs) | Yes | No (always outputs to console.*) |
| **Oracle** | `console.log` / `console.error` directly | No — plain `[prefix]` strings | Ad-hoc `[oracle]` prefix in strings | No |
| **Indexer** | Mixed: `console.log` for stdout event stream, `console.error` via fallback logger in Watcher | Watcher logger is structured JSON (`apps/indexer/src/watcher.ts:514`), other calls are plain | Partial | No |

**Backend logger** (`apps/backend/src/utils/logger.ts:10-18`):
- Format: `2026-06-28T12:00:00.000Z INFO [component] message key=value`
- Supports key=value extra fields appended to log lines
- But: **no log level filtering** (always output), **no transport abstraction** (always console.*), **no configurable output destination**

**Oracle** (at `apps/oracle/src/server.ts:126,245,252-254` and `apps/oracle/src/index.ts:34,37,43,48`):
- Uses raw `console.log` / `console.error` — never imports the structured logger from `@axiom/backend`
- Error output: `console.error("[oracle] error:", err)` — prints raw error object which may include stack, no structured fields

**Indexer** (at `apps/indexer/src/index.ts:38,41-52,91` and `apps/indexer/src/watcher.ts:493,514,601`):
- `stdoutSink` at `apps/indexer/src/index.ts:37-39` outputs raw JSON to stdout for the event stream (deliberate — Dockerfile comment at line 54 says "one JSON event per line to stdout")
- Operational logging goes to stderr as structured JSON (`watcher.ts:514` fallback logger)
- But `index.ts` banner and startup messages use raw `console.log` strings

### 2.2 Entry/Exit Point Logging

**Backend** — GOOD:
- Request ID middleware (`apps/backend/src/server.ts:54-60`): Every request gets a `x-request-id` header + `res.locals.requestId`
- Request logging middleware (`apps/backend/src/server.ts:61-67`): Logs `METHOD /path STATUS` with `duration=XXms` on response finish
- WebSocket client errors logged (`apps/backend/src/server.ts:286`)

**Oracle** — MISSING:
- No request middleware to log entry/exit
- No request ID generation
- Only startup message logged (`apps/oracle/src/server.ts:251-254`) and shutdown signals (`apps/oracle/src/index.ts:42-51`)

**Indexer** — PARTIAL:
- Watcher logs every tick (`apps/indexer/src/watcher.ts:575-582`): `fromBlock`, `toBlock`, `latest`, `nextBlock`, `logCount`
- Banner at startup (`apps/indexer/src/index.ts:41-52` function `banner`)
- **No HTTP request logging** (the indexer has no HTTP server)

### 2.3 Error Path Logging

**Backend**:
- Central error handler (`apps/backend/src/server.ts:261-269`): logs `error` and `stack` via structured logger
- Route factory catches and forwards to `next(err)` (`apps/backend/src/routers/route-factory.ts:83-84`)
- Per-endpoint catch blocks in `server.ts` pass to `next(err)` (`server.ts:156,174`)
- **Missing**: No `process.on('unhandledRejection')` or `process.on('uncaughtException')` anywhere in backend

**Oracle**:
- Per-route catch blocks (`apps/oracle/src/server.ts:125-128`, `apps/oracle/src/server.ts:145-151`): logs via `console.error` with component prefix, but catch for `/v1/transfer-validity` catches ALL errors and responds 500 — includes Zod validation errors that should be 400
- Central error handler (`apps/oracle/src/server.ts:243-249`): logs via `console.error`, sanitizes message to 200 chars
- **Missing**: No `process.on('unhandledRejection')` or `process.on('uncaughtException')` — also no graceful error message for Zod errors in ownership endpoint (line 150 re-throws raw error)

**Indexer**:
- Watcher tick catch (`apps/indexer/src/watcher.ts:583-593`): logs level, message, error via logger callback, backs off with retry timer
- Checkpoint save catch (`apps/indexer/src/watcher.ts:492-494`): silently swallows checkpoint save errors — logs via `console.error` but does not retry
- Main function catch (`apps/indexer/src/index.ts:256-260`): catches top-level error, writes JSON to stderr, exits with code 1
- **Missing**: No `process.on('unhandledRejection')` — only unhandled promise rejections in main() are caught (because `await` propagates), but async operations outside main (timers, event emitters) could silently fail

**Frontend**:
- `ErrorBoundary.tsx:24-26`: Logs to `console.error` with `[ErrorBoundary]` prefix — no remote reporting
- `useTransfer.ts:51`: `useWarnTimeout` for slow oracle responses (timeout warning)
- `usePoll.ts:44`: Error handler callback for poll failures
- **No remote error reporting** — all errors are client-side only

### 2.4 Sensitive Data in Logs

| Risk | Location | Issue |
|---|---|---|
| **Signer addresses** logged at startup | `apps/backend/src/server.ts:292`, `apps/oracle/src/server.ts:253` | Public info, low risk |
| **RPC URLs** in startup banner | `apps/oracle/src/index.ts:34` | Could contain API keys in URL params |
| **Raw request IDs in logs** | `apps/backend/src/server.ts:64-65` | Cross-origin request IDs potentially identify sessions |
| **Error objects printed raw** | `apps/oracle/src/server.ts:245`, `apps/oracle/src/server.ts:126` | Error objects may contain stack traces with internal paths, query params, request bodies |
| **Stack traces in backend error handler** | `apps/backend/src/server.ts:262` | Backend logs full `err.stack` — may contain internal paths |
| **`modelDataRoot` zero-hash check logging** | `apps/oracle/src/index.ts:37` | Discloses that no storage is configured |
| **Oracle clear-text PK warning** | `apps/oracle/src/server.ts:254` | Explicitly logs "SIMULATED TEE: runs in Node.js with cleartext private key" |
| **E2E test runner** | `apps/backend/src/cli/run-e2e.ts:64-75` | Logs RPC URLs, storage URLs, deployer address, signer address, contract addresses — but these are testnet, so acceptable |

The oracle has a sanitization step at `apps/oracle/src/server.ts:247` that truncates messages >200 chars — this is reasonable but only applied to the central error handler, not to per-route catch blocks.

### 2.5 Monitoring Hooks

**None found.** The codebase has zero monitoring infrastructure:
- No Prometheus metrics (`prom-client`)
- No OpenTelemetry instrumentation
- No Sentry integration (despite `@sentry/tracing` appearing in `pnpm-lock.yaml`, it is NEVER imported in any source file)
- No Datadog, New Relic, or Grafana agent integration
- No custom counters, gauges, or histograms

The only "monitoring" is:
- Frontend `/health` polling every 30s (`apps/frontend/src/hooks/useHealth.ts:13`)
- Backend's `REGISTERED_ROUTES` array (`apps/backend/src/routers/route-factory.ts:13`) could serve as an introspection endpoint but is NOT exposed via any HTTP endpoint

---

## 3. Observability Gaps

### 3.1 Crash Recovery / Restart Mechanisms

| Service | Restart on crash? | Signal handling? | Docker? |
|---|---|---|---|
| **Backend** | **None** — `apps/backend/src/index.ts:53` calls `startServer()` with no error boundary. If startup fails, the process dies silently. | **None** — no process.on('SIGTERM') or SIGINT | No Dockerfile |
| **Oracle** | **None** — `apps/oracle/src/index.ts` has no try/catch around `startServer()`. | **Yes** at `apps/oracle/src/index.ts:42-51` — drains connections on SIGTERM/SIGINT and calls `process.exit(0)` | No Dockerfile |
| **Indexer** | **Minimal** — `apps/indexer/src/index.ts:256-260` catches main() errors and exits(1). | **Yes** at `apps/indexer/src/index.ts:238-244` — graceful shutdown with `Promise.withResolvers()` | **Yes** (`apps/indexer/Dockerfile`) |

Critical gaps:
- **No process-level `unhandledRejection` handler anywhere** in the entire monorepo — a single unhandled promise rejection crashes the process.
- **No process-level `uncaughtException` handler anywhere** — synchronous throw kills the process.
- No PM2, supervisor, systemd, or container orchestrator restart policy for any service.
- The only Dockerfile is for the indexer; backend and oracle have no container configuration.

### 3.2 Health Check Endpoints

| Service | Endpoint | Diagnostic Info | Status Codes | File |
|---|---|---|---|---|
| **Backend** | `GET /health` | `ok`, `version: "0.1.0"`, `signer`, `chainHead`, `oracle ("up"/"down")`, `addresses` | 200 (healthy), 503 (unhealthy) | `apps/backend/src/routers/health.ts:10-28` |
| **Oracle** | `GET /health` | `ok: true`, `signer`, `uncompressedPubkey`, `version: "0.1.0"` | Always 200 (no failure state) | `apps/oracle/src/server.ts:51-58` |
| **Indexer** | **None** | N/A | N/A | N/A |

Health endpoint gaps:
- Oracle health endpoint **always returns 200** — never returns 503 even if storage or signer is broken
- Indexer has **no health endpoint** at all. The `HEALTH_PORT=9091` in `.env.example:62` and `.env.galileo.example:27` suggests one was planned, but it was never implemented. The indexer only writes to stdout/stderr.
- Backend health endpoint is good — checks chain provider and oracle, returns 503 if chain head is 0, reports oracle status independently.
- **No liveness vs readiness separation** — all endpoints are effectively liveness-only with no readiness checks (database/storage/oracle connection status).
- **No `/metrics` endpoint** exists anywhere.

### 3.3 Structured Error Codes

| App | Error codes used? | Codes | File |
|---|---|---|---|
| **Backend** | **Yes** | `VALIDATION_ERROR`, `HTTP_4xx`, `UPSTREAM_ERROR`, `INTERNAL_ERROR` | `apps/backend/src/server.ts:261-269` |
| **Backend (route factory)** | **No** | Generic `{ error: "Missing id" }`, `{ error: "X address not configured" }` | `apps/backend/src/routers/route-factory.ts:66,71` |
| **Oracle** | **Partially** | `INTERNAL_ERROR` only | `apps/oracle/src/server.ts:248` |
| **Oracle (per-route)** | **No** | `{ error: "Transfer validity check failed" }` — no code | `apps/oracle/src/server.ts:127` |
| **Indexer** | **N/A** | HTTP-returned errors don't apply (no HTTP server) | N/A |

Backend's central error handler at `apps/backend/src/server.ts:261-269` has a reasonable code scheme, but:
- Route factory routes return error responses without codes
- The oracle has only one code (`INTERNAL_ERROR`) for everything
- No standardized error code documentation exists

### 3.4 Tracing Support

**No distributed tracing.** The codebase has:
- **Manual request correlation** via `x-request-id` header in backend (`apps/backend/src/server.ts:54-60`) — this is a good foundation but not propagated to:
  - Oracle calls (the `OracleClient` at `apps/backend/src/oracle/client.ts` does not forward the `x-request-id` header)
  - Indexer events (the `sink.ts` `postEvent` function does not include a trace ID)
  - Frontend (no trace ID in poll requests)
- **No OpenTelemetry SDK** — no `@opentelemetry/instrumentation-http`, no span creation, no trace export
- **No Sentry tracing** — `@sentry/tracing` in `pnpm-lock.yaml` but never imported in source code (this appears to be a transitive dependency, not deliberate)
- **No distributed context propagation** across service boundaries

The `x-request-id` in the backend middleware is a solid building block, but it only covers the backend itself and is not forwarded to downstream services.

### 3.5 Additional Observability Gaps

**No startup validation:**
- `apps/backend/src/index.ts:11` parses env schema with `backendEnvSchema.parse(process.env)` — if validation fails, unhandled error crashes the process without logging the specific field failure
- `apps/oracle/src/index.ts:13` same pattern: `oracleEnvSchema.parse(process.env)` — unhandled error on bad config
- `apps/indexer/src/index.ts` uses `getEnvWithAlias` with fallbacks, but `chainId()` throws on invalid input (`index.ts:35`) with no context about which env var was wrong

**No audit trail for state changes:**
- Checkpoint file (`apps/indexer/src/watcher.ts:17`): written as `data/checkpoint.json` — no logging of when checkpoints are written or what the old vs new value was (beyond the tick log)
- No event replay tracking: if the indexer restarts and skips blocks, there's no alert

**Frontend lacks remote error reporting:**
- `ErrorBoundary.tsx` renders a "Something went wrong" message and a reload button — but errors are logged only to browser console
- No error reporting service (Sentry, LogRocket, etc.)
- No performance monitoring (Web Vitals, API call latency tracking)

---

## 4. Summary of Findings by Severity

### Critical (should be addressed before production)
1. **No `unhandledRejection` / `uncaughtException` handlers anywhere** — any async throw crashes the process
2. **No restart mechanism** — none of the services will restart after a crash
3. **No monitoring/metrics infrastructure** — zero observability into production behavior
4. **No distributed tracing** — request context is not propagated between services
5. **Oracle has no structured logger** — uses raw `console.log` only

### High
6. **Env var naming inconsistency (`AXIOM_` vs `OG_`)** — operators can't tell which is canonical
7. **Indexer has no health endpoint** — `HEALTH_PORT` configured but unimplemented
8. **Oracle health check never returns failure** — always 200 regardless of actual state
9. **No event/log transport abstraction** — all logs go to stdout/stderr, no centralized logging support
10. **Frontend has no remote error reporting** — silent client failures

### Medium
11. **Deprecated env var aliases have no migration path or warnings**
12. **`DEPLOYER_PK` used for runtime backend signer** — confusing naming
13. **Oracle error sanitization inconsistent** — applied in central handler but not per-route
14. **Error codes incomplete** — route factory and oracle per-route handlers return code-less errors
15. **`x-request-id` not forwarded to downstream services**
16. **Four dead config vars**: `ORACLE_ADMIN_PK`, `AXIOM_PROXY_VERIFIER_NOW`, `AXIOM_AGENT_NFT_IMPL`, all `BENCH_*` vars

### Low
17. **Backend logger has no level filtering** — debug messages are always output
18. **Checkpoint save failures silently swallowed** in indexer
19. **Variable naming**: `cancelled` (British) vs American spelling elsewhere, `ogChainId` uses `og` prefix inconsistently, `_actionHash` misleading underscore
20. **`.env.example` shows deprecated `AGENT_NFT_ADDRESS` instead of canonical `AXIOM_AGENT_NFT_ADDRESS`**
