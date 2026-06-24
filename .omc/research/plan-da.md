# Fix Plan: 0G DA gRPC Integration

**Date:** 2026-06-24
**Status:** Research complete — revised plan with replacement code
**Source research:** `/home/eya/og/.omc/research/stack-da.md`, `/home/eya/og/.omc/research/deep-trace-da.md`

---

## Table of Contents

1. [P0: Env var mismatch — OG_DA_GRPC_URL vs DA_GRPC_URL](#p0-env-var-mismatch)
2. [P1: Singleton DaClient (per-event leak + missing close)](#p1-singleton-daclient)
3. [P1: gRPC channel options (reconnection, keepalive, retries)](#p1-grpc-channel-options)
4. [P1: TLS credentials](#p1-tls-credentials)
5. [P2: DA env vars in shared config](#p2-da-env-vars-in-shared-config)
6. [P2: Remove duplicate error logging](#p2-remove-duplicate-error-logging)
7. [P2: Add request deadlines](#p2-add-request-deadlines)
8. [P3: Health endpoint](#p3-health-endpoint)
9. [P4: Blob size validation](#p4-blob-size-validation)
10. [Implementation order](#implementation-order)

---

## P0: Env var mismatch — OG_DA_GRPC_URL vs DA_GRPC_URL

### Issue

`.env` (line 31) sets `OG_DA_GRPC_URL=localhost:51001`, but `apps/indexer/src/index.ts` line 246 reads `process.env["DA_GRPC_URL"]`. These are **different variable names**. The gRPC DA code path is dead code — `daGrpcUrl` is always `undefined`, so the config falls through to `storage` or `disabled`.

### Severity

🔴 **CRITICAL** — The gRPC DA path is completely non-functional.

### Affected files

| File | Lines | Role |
|------|-------|------|
| `/home/eya/og/.env` | 31 | Sets `OG_DA_GRPC_URL` |
| `/home/eya/og/apps/indexer/src/index.ts` | 246 | Reads `DA_GRPC_URL` |

### Fix

Rename the env var in `.env` to match what the code reads. This is the minimal fix and follows the codebase convention (e.g., `BACKEND_URL`, `OG_RPC_URL` are read directly):

```diff
# .env line 31:
- OG_DA_GRPC_URL=localhost:51001
+ DA_GRPC_URL=localhost:51001
```

Also uncomment `DA_GRPC_URL` in `.env.example` (line 49) to make it active by default:

```diff
# .env.example line 49:
- # DA_GRPC_URL=localhost:51001
+ DA_GRPC_URL=localhost:51001
```

If backward compatibility with `OG_DA_GRPC_URL` is desired, add a fallback in `index.ts` (single line, no deprecation warning ceremony needed since this is a dev-only env):

```typescript
// index.ts line 246 — add OG_DA_GRPC_URL fallback
const daGrpcUrl = process.env["DA_GRPC_URL"] ?? process.env["OG_DA_GRPC_URL"];
```

### Validation

1. Before fix: `daGrpcUrl` is `undefined` with current `.env`.
2. After fix: `daGrpcUrl` is `"localhost:51001"`.
3. The indexer starts in `"grpc"` mode when `INDEXER_DA_ENABLED=true`.

### Risk

- **Very low.** Pure config fix. No code logic changes.

---

## P1: Singleton DaClient (per-event leak + missing close)

### Issue

`makeRealSubmitter()` creates a **new `DaClient` (new gRPC connection) on every single event**. The call site in `composeSinks()` (`index.ts` line 145) calls `makeRealSubmitter(config.grpcUrl)` inside the per-event sink function body rather than once at startup. This means:
- A new gRPC TCP connection is opened per event
- `waitForReady(30_000)` fires on every event (30s timeout each time)
- New proto load + package definition parse per event
- `DaClient.close()` is never called — sockets leak

### Severity

🔴 **CRITICAL (performance)** — Production with ~1 event/block (2s blocks) causes constant connection churn and eventual resource exhaustion.

### Affected files

| File | Lines | Role |
|------|-------|------|
| `/home/eya/og/apps/indexer/src/index.ts` | 145 | **BUG**: `const submitFn = makeRealSubmitter(config.grpcUrl);` inside per-event sink |
| `/home/eya/og/apps/indexer/src/da.ts` | 63–74 | `makeRealSubmitter()` — correct code, wrong call-site |

### Fix

**Move `makeRealSubmitter()` (or rather, create the `DaClient` directly) outside the sink closure**, into `main()` scope, and pass it to `composeSinks`. This also solves P4 (`DaClient.close()` not exposed) since the client is now in scope for graceful shutdown.

**1. Update `main()` in `index.ts` (~lines 264-297):**

```typescript
// Create the gRPC client ONCE, outside the sink closure
const grpcClient = daEnabled && daGrpcUrl
  ? new DaClient(daGrpcUrl)
  : undefined;

const composedSink = composeSinks(daConfig, {
  backendUrl,
  rpcUrl: url,
  grpcClient,   // ← pass pre-created client
});

// ... watcher setup ...

// Graceful shutdown
const handle = watcher.start();
await shutdown;
await handle.stop();
stopBatchTimer();
await flushBuffer();
if (grpcClient) grpcClient.close();  // ← NOW reachable
process.stderr.write(JSON.stringify({ level: "info", msg: "stopped" }) + "\n");
```

**2. Update `composeSinks` signature and body (`index.ts` ~lines 130-210):**

```typescript
type EventSinkConfig =
  | { readonly da: "disabled" }
  | { readonly da: "grpc"; grpcUrl: string }
  | { readonly da: "storage"; storageIndexer: Indexer; storageSigner: ethers.Wallet };

function composeSinks(config: EventSinkConfig, extra: {
  backendUrl: string | undefined;
  rpcUrl: string;
  grpcClient?: DaClient;
}) {
  // Build submitFn ONCE from the shared client
  // (makeRealSubmitter exists at da.ts:63; we use it with the single client)
  const grpcSubmitFn: SubmitFn | undefined =
    config.da === "grpc" && extra.grpcClient
      ? makeRealSubmitterFromClient(extra.grpcClient)
      : undefined;

  return async (event: AxiomEvent) => {
    switch (config.da) {
      case "disabled":
        break;
      case "grpc": {
        await submitEvent(event, { submitFn: grpcSubmitFn });
        break;
      }
      case "storage":
        await submitEvent(event, {});
        break;
    }
    stdoutSink(event);
    // backend POST, storage buffer unchanged ...
  };
}
```

**3. Add `makeRealSubmitterFromClient` to `da.ts`:**

```typescript
/** Build a SubmitFn from an existing DaClient (singleton pattern). */
export function makeRealSubmitterFromClient(client: DaClient): SubmitFn {
  return async (bytes: Uint8Array) => {
    const { requestId } = await client.disperseBlob(bytes);
    return { txHash: requestId, seq: 0n };
  };
}
```

After this change, `makeRealSubmitter(url)` in `da.ts:63` can remain as a convenience wrapper for simple usage — or be removed if no longer needed.

### Cross-refs

- `DaClient.disperseBlob()` at `da-client.ts:75`
- `DaClient.close()` at `da-client.ts:195`
- `submitEvent()` at `da.ts:28` — already catches errors internally (see [P2 duplicate logging fix](#p2-remove-duplicate-error-logging))

### Validation

1. **Unit test**: Verify `composeSinks` in "grpc" mode calls `makeRealSubmitterFromClient` exactly once.
2. **Integration test**: Feed 10 events, verify only 1 gRPC channel created (check `DaClient` constructor call count).
3. Send SIGTERM, verify `DaClient.close()` is called (no orphaned sockets).

### Risk

- **Low.** The `DaClient` is designed to be long-lived. Connection reuse is standard gRPC practice.

---

## P1: gRPC channel options (reconnection, keepalive, retries)

### Issue

`DaClient` constructor (`da-client.ts:63-73`) passes **zero channel options** to the gRPC client. While `@grpc/grpc-js@^1.14.4` has built-in subchannel reconnection with exponential backoff (`BackoffTimeout`: initial 1s, multiplier 1.6, max 120s, jitter 0.2), the defaults are tuned for general use and the indexer has no visibility into connection state. Additionally:
- No keepalive pings → dead connections go undetected until an RPC is attempted
- No explicit reconnect bounds → operator can't control backoff behavior
- No retry service config → automatic retries are not configured for transient failures
- Message size limits use library defaults (receive: 4 MiB, send: unlimited)

### Severity

🟡 **MEDIUM** (reliability / operations) for production deployments.

### Affected files

| File | Lines | Role |
|------|-------|------|
| `/home/eya/og/apps/indexer/src/da-client.ts` | 63–73 | `DaClient` constructor — no channel options |

### Fix

**Pass channel options to the gRPC client constructor.** `@grpc/grpc-js` supports these as the 3rd argument to `new Disperser(url, creds, options)` (confirmed in `client.js` — `Client` constructor accepts `ChannelOptions`).

```typescript
// da-client.ts — update constructor
constructor(grpcUrl: string, channelOptions?: grpc.ChannelOptions) {
  // ... proto loading ...

  const credentials = this.loadCredentials();  // see TLS section

  this.client = new Disperser(grpcUrl, credentials, {
    // Keepalive: detect dead connections within ~15s
    "grpc.keepalive_time_ms": 10_000,
    "grpc.keepalive_timeout_ms": 5_000,
    "grpc.keepalive_permit_without_calls": 1,
    // Reconnect backoff bounds (library handles actual retry loop)
    "grpc.initial_reconnect_backoff_ms": 1_000,
    "grpc.max_reconnect_backoff_ms": 60_000,
    // Enable automatic retry for UNAVAILABLE etc.
    "grpc.enable_retries": 1,
    // Message size limits (64 MiB — covers max 31 MiB blob + metadata)
    "grpc.max_send_message_length": 64 * 1024 * 1024,
    "grpc.max_receive_message_length": 64 * 1024 * 1024,
    // Caller overrides
    ...channelOptions,
  });
}
```

**No custom connection monitor is needed.** The library's subchannel retry loop (`BackoffTimeout` in `backoff-timeout.ts`) already handles IDLE→CONNECTING→READY→TRANSIENT_FAILURE cycling with exponential backoff. The channel options above just set the bounds.

To expose connection state for the health endpoint (see P3), add a `connected` getter using the library's connectivity state API:

```typescript
// da-client.ts — add connection state getter
import { ConnectivityState } from "@grpc/grpc-js";

export class DaClient {
  // ... fields ...

  /** Whether the gRPC channel is currently in READY state. */
  get connected(): boolean {
    // getConnectivityState is available on grpc.Client
    return this.client.getConnectivityState(false) === ConnectivityState.READY;
  }
}
```

The `waitForReady` call in `makeRealSubmitter` (`da.ts:65`) should also be **awaited** rather than fire-and-forget, so the indexer doesn't attempt disperse before the channel is ready:

```typescript
// da.ts — change from fire-and-forget to awaited
export async function makeRealSubmitter(daGrpcUrl: string): Promise<SubmitFn> {
  const client = new DaClient(daGrpcUrl);
  await client.waitForReady(30_000); // ← awaited
  return async (bytes: Uint8Array) => {
    const { requestId } = await client.disperseBlob(bytes);
    return { txHash: requestId, seq: 0n };
  };
}
```

(When the singleton pattern from P2 is implemented, this becomes `makeRealSubmitterFromClient` which doesn't need `waitForReady` — the shared client is already ready.)

### Cross-refs

- `@grpc/grpc-js` `Client` accepts `ChannelOptions` 3rd argument: `node_modules/@grpc/grpc-js/build/src/client.js`
- `ConnectivityState` enum: `node_modules/@grpc/grpc-js/build/src/connectivity-state.js`
- `BackoffTimeout` implementation: `node_modules/@grpc/grpc-js/build/src/backoff-timeout.js`

### Validation

1. Pass channel options, verify they appear in the gRPC channel config.
2. `grpc.keepalive_time_ms=10000`: verify periodic HTTP/2 PING frames on the wire.
3. Kill DA sidecar, verify library reconnects within `grpc.max_reconnect_backoff_ms`.

### Risk

- **Very low.** These are standard gRPC channel options with well-defined defaults.

---

## P1: TLS credentials

### Issue

`grpc.credentials.createInsecure()` is hardcoded in `DaClient` constructor (`da-client.ts` line 73). In production deployments where the DA sidecar is on a separate host, all blob data is transmitted in plaintext.

### Severity

🔴 **HIGH** over network boundaries. 🟡 **MEDIUM** for localhost-only dev deployments.

### Affected files

| File | Lines | Role |
|------|-------|------|
| `/home/eya/og/apps/indexer/src/da-client.ts` | ~73 | Hardcoded `createInsecure()` |
| `/home/eya/og/packages/config/src/env.ts` | 59–74 | No TLS env vars in `ENV_KEYS` |

### Fix

Add `loadCredentials()` to `DaClient` that reads `DA_GRPC_CA_CERT` (PEM CA cert path → `createSsl(ca)`) or `DA_GRPC_TLS_ENABLED` (system root CAs → `createSsl()`) from the environment. Falls back to `createInsecure()` for dev convenience.

```typescript
// da-client.ts — credentials selection
import { readFileSync } from "node:fs";

export class DaClient {
  // ... fields ...

  constructor(grpcUrl: string, channelOptions?: grpc.ChannelOptions) {
    // ... proto loading ...
    const credentials = this.loadCredentials();
    this.client = new Disperser(grpcUrl, credentials, { /* channel options */ });
  }

  private loadCredentials(): grpc.ChannelCredentials {
    const caCertPath = process.env["DA_GRPC_CA_CERT"];
    if (caCertPath) {
      try {
        const caCert = readFileSync(caCertPath);
        return grpc.credentials.createSsl(caCert);
      } catch (err) {
        process.stderr.write(JSON.stringify({
          level: "fatal",
          msg: "Failed to load DA gRPC TLS CA cert",
          path: caCertPath,
          err: err instanceof Error ? err.message : String(err),
        }) + "\n");
        process.exit(1);
      }
    }
    if (process.env["DA_GRPC_TLS_ENABLED"] === "1" || process.env["DA_GRPC_TLS_ENABLED"] === "true") {
      return grpc.credentials.createSsl();  // system root CAs
    }
    return grpc.credentials.createInsecure();
  }
}
```

**Add to `ENV_KEYS` in `packages/config/src/env.ts`:**

```typescript
export const ENV_KEYS = {
  // ... existing keys ...
  DA_GRPC_URL: "DA_GRPC_URL",
  INDEXER_DA_ENABLED: "INDEXER_DA_ENABLED",
  DA_GRPC_CA_CERT: "DA_GRPC_CA_CERT",
  DA_GRPC_TLS_ENABLED: "DA_GRPC_TLS_ENABLED",
} as const;
```

### Validation

1. **No TLS env**: `createInsecure()` used (backward-compatible).
2. **`DA_GRPC_CA_CERT` set**: `readFileSync` + `createSsl(caCert)`.
3. **`DA_GRPC_TLS_ENABLED=true`**: `createSsl()` with no args (system CAs).
4. **Invalid CA path**: Process exits with fatal error.

### Risk

- **Low.** Backward-compatible for dev. `readFileSync` is a one-time blocking call at startup, which is acceptable.

---

## P2: DA env vars in shared config

### Issue

`DA_GRPC_URL` and `INDEXER_DA_ENABLED` are read directly from `process.env` in `index.ts` (lines 246-248) with **no canonical definition** in `ENV_KEYS`, no network-level defaults. They are "hidden" config keys — discoverable only by reading source code.

Additionally, if `INDEXER_DA_ENABLED=true` but `DA_GRPC_URL` is unset, the code silently falls through to "storage" or "disabled" without warning.

### Severity

🟡 **MEDIUM** (maintainability / operator experience).

### Affected files

| File | Lines | Role |
|------|-------|------|
| `/home/eya/og/packages/config/src/env.ts` | 59–74 | Missing `DA_GRPC_URL`, `INDEXER_DA_ENABLED` in `ENV_KEYS` |
| `/home/eya/og/apps/indexer/src/index.ts` | 246–248 | Direct `process.env` reads with no validation |

### Fix

**1. Add DA env vars to `ENV_KEYS`** (shown above in the TLS section).

**2. Add validation + warning in `index.ts`:**

```typescript
// index.ts — replace lines 246-251
const daEnabled = process.env["INDEXER_DA_ENABLED"] === "1"
  || process.env["INDEXER_DA_ENABLED"] === "true";
const daGrpcUrl = process.env["DA_GRPC_URL"] ?? process.env["OG_DA_GRPC_URL"];

if (daEnabled && !daGrpcUrl) {
  process.stderr.write(JSON.stringify({
    level: "warn",
    msg: "INDEXER_DA_ENABLED is set but DA_GRPC_URL is undefined — DA submission disabled",
  }) + "\n");
}
```

**3. Update `.env.example`** (line 49) to uncomment `DA_GRPC_URL` and add TLS docs:

```env
# ─── Indexer ────────────────────────────────────────────────────────────────
OG_RPC_URL=https://evmrpc-testnet.0g.ai
BACKEND_URL=http://127.0.0.1:3000
# OG_CHAIN_ID=16602
DA_GRPC_URL=localhost:51001                          # 0G DA Client gRPC endpoint
INDEXER_DA_ENABLED=true                              # gate DA submitter
# DA_GRPC_CA_CERT=/path/to/ca.pem                   # optional: TLS with custom CA
# DA_GRPC_TLS_ENABLED=true                           # optional: TLS with system CAs
# STORAGE_BATCH_INTERVAL_MS=5000                     # event batch upload interval
# STORAGE_BATCH_MAX_EVENTS=10                        # max events per batch upload
```

### Full env var reference

| Variable | Default | Description |
|----------|---------|-------------|
| `DA_GRPC_URL` | — | gRPC endpoint for 0G DA Client (host:port) |
| `OG_DA_GRPC_URL` | (fallback) | Legacy alias for `DA_GRPC_URL` |
| `INDEXER_DA_ENABLED` | `false` | Set to `true` to enable DA submission |
| `DA_GRPC_CA_CERT` | — | Path to PEM CA cert for TLS |
| `DA_GRPC_TLS_ENABLED` | `false` | Enable TLS with system root CAs |

### Validation

1. `ENV_KEYS.DA_GRPC_URL` is defined.
2. `INDEXER_DA_ENABLED=true` without `DA_GRPC_URL` → warning emitted.
3. Both set → "grpc" mode selected.

### Risk

- **Very low.** Pure additive change.

---

## P2: Remove duplicate error logging

### Issue

`submitEvent()` (`da.ts` lines 46-55) already catches errors internally, logs them, and returns a sentinel. Then `composeSinks()` (`index.ts` lines 147-158) wraps the call in an **additional** try/catch that also logs. This produces **two error log entries** for every DA submission failure.

### Severity

🟡 **MEDIUM** (observability noise).

### Affected files

| File | Lines | Role |
|------|-------|------|
| `/home/eya/og/apps/indexer/src/index.ts` | 147–158 | Redundant try/catch around `submitEvent()` |
| `/home/eya/og/apps/indexer/src/da.ts` | 46–55 | `submitEvent()` internal catch (keep this one) |

### Fix

**Remove the outer try/catch in `composeSinks()`.** `submitEvent()` guarantees it never throws (confirmed by `da.test.ts` "swallows submitFn errors" test case at line 148).

```typescript
// index.ts — simplified "grpc" and "storage" cases
case "grpc": {
  // submitEvent never throws; errors are logged internally, sentinel returned
  await submitEvent(event, { submitFn: grpcSubmitFn });
  break;
}
case "storage":
  await submitEvent(event, {});
  break;
```

Also add a `@neverthrows` contract comment to `submitEvent()` in `da.ts`:

```typescript
/**
 * Submit one event to 0G DA. Never throws — returns sentinel on failure.
 * Callers rely on this guarantee. Errors are logged internally.
 */
export async function submitEvent(
  event: AxiomEvent,
  opts: SubmitEventOptions = {},
): Promise<SubmitResult> {
```

### Cross-refs

- `submitEvent()` guarantees: `da.test.ts` line 148 — "swallows submitFn errors and returns the sentinel"
- `submitEvent()` internal catch: `da.ts` lines 46-55

### Validation

1. Inject a failing `submitFn`, run through `composeSinks`, verify exactly 1 error log entry.
2. Verify successful submissions produce 0 error log entries.

### Risk

- **Low.** The fix relies on `submitEvent()`'s guarantee of never throwing. The existing test suite enforces this.

---

## P2: Add request deadlines

### Issue

`DisperseBlob` is called with **no gRPC deadline**. If the DA sidecar hangs, the Promise never resolves, blocking the sink for that event indefinitely.

### Severity

🟡 **MEDIUM** (reliability — potential for event processing stall).

### Affected files

| File | Lines | Role |
|------|-------|------|
| `/home/eya/og/apps/indexer/src/da-client.ts` | 75–91 | `disperseBlob()` — no deadline parameter |

### Fix

Add a configurable deadline via gRPC `CallOptions.deadline` (a `Date` object) to all three RPC methods. `@grpc/grpc-js` natively supports this — when the deadline is exceeded, the call fails with `DEADLINE_EXCEEDED` status.

```typescript
// da-client.ts — add deadline to disperseBlob

/** Default deadline for DisperseBlob calls (60 seconds). */
const DEFAULT_DISPERSE_DEADLINE_MS = 60_000;
/** Default deadline for status/retrieve calls (30 seconds). */
const DEFAULT_STATUS_DEADLINE_MS = 30_000;

disperseBlob(data: Uint8Array, timeoutMs = DEFAULT_DISPERSE_DEADLINE_MS): Promise<DisperseBlobResult> {
  return new Promise((resolve, reject) => {
    const deadline = new Date(Date.now() + timeoutMs);
    this.client["DisperseBlob"](
      { data },
      { deadline },  // ← gRPC CallOptions with deadline
      (err: grpc.ServiceError | null, response: Record<string, unknown>) => {
        if (err) { reject(err); return; }
        resolve({
          requestId: Buffer.from(response["request_id"] as Uint8Array).toString("hex"),
          blobStatus: response["result"] as BlobStatus,
        });
      },
    );
  });
}
```

Apply the same `{ deadline }` pattern to `getBlobStatus` and `retrieveBlob`.

### Cross-refs

- `@grpc/grpc-js` `CallOptions` interface: `node_modules/@grpc/grpc-js/build/src/call-options.d.ts`
- Standard gRPC pattern: `new Date(Date.now() + timeoutMs)` passed as `{ deadline }`

### Validation

1. Mock gRPC method to never call back; verify Promise rejects with `DEADLINE_EXCEEDED`.
2. Point at a non-responsive endpoint; verify timeout error is raised.
3. In `submitEvent()`, `DEADLINE_EXCEEDED` is caught and returns `FAILED_SUBMIT` sentinel.

### Risk

- **Low.** Deadlines are standard gRPC. Defaults (60s/30s) are generous.

---

## P3: Health endpoint

### Issue

There is **no way** for orchestration systems (Kubernetes liveness/readiness probes, Docker HEALTHCHECK) to determine if the DA gRPC connection is healthy. `waitForReady` is fire-and-forget and not externally observable.

### Severity

🟡 **MEDIUM** (observability / operations).

### Affected files

| File | Lines | Role |
|------|-------|------|
| `/home/eya/og/apps/indexer/src/da-client.ts` | 48 | `DaClient` — no health check API |

### Fix

Add an HTTP health endpoint using stdlib `node:http`. Reports `DaClient.connected` (via `getConnectivityState` — see channel options section).

```typescript
// Add to index.ts main() or near it
import { createServer } from "node:http";

function startHealthServer(port: number, daConnected: () => boolean) {
  const server = createServer((req, res) => {
    if (req.url === "/health") {
      const healthy = daConnected();
      res.writeHead(healthy ? 200 : 503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: healthy ? "ok" : "degraded",
        da: healthy ? "connected" : "disconnected",
      }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  server.listen(port);
  return server;
}
```

**Usage in `main()`:**

```typescript
const healthPort = parseInt(process.env["HEALTH_PORT"] ?? "9091", 10);
const healthServer = grpcClient
  ? startHealthServer(healthPort, () => grpcClient.connected)
  : undefined;

// On shutdown:
if (healthServer) healthServer.close();
```

### Validation

1. `curl localhost:9091/health` returns `{"status":"ok","da":"connected"}` when DA is connected.
2. Kill DA sidecar → returns `{"status":"degraded","da":"disconnected"}`.
3. Restart DA sidecar → returns `{"status":"ok","da":"connected"}` within backoff window.

### Risk

- **Low.** Simple HTTP server, zero external dependencies.

---

## P4: Blob size validation

### Issue

The proto specifies data must be `<= 31744 KiB` (32,505,856 bytes), but `disperseBlob()` does not validate this. Oversized blobs will be rejected server-side with a cryptic error. (Note: canonicalized AxiomEvents are ~200B–2KiB, so this is purely defensive.)

### Severity

🟢 **LOW** (defensive coding).

### Affected files

| File | Lines | Role |
|------|-------|------|
| `/home/eya/og/apps/indexer/src/da-client.ts` | 75–91 | `disperseBlob()` — no size check |

### Fix

Add a fast O(1) size guard at the top of `disperseBlob()`:

```typescript
// da-client.ts
/** Maximum blob size per 0G DA spec: 31744 KiB. */
const MAX_BLOB_SIZE_BYTES = 31_744 * 1024;  // 32,505,856 bytes

disperseBlob(data: Uint8Array, timeoutMs = DEFAULT_DISPERSE_DEADLINE_MS): Promise<DisperseBlobResult> {
  if (data.byteLength > MAX_BLOB_SIZE_BYTES) {
    return Promise.reject(
      new RangeError(
        `Blob size ${data.byteLength} exceeds max ${MAX_BLOB_SIZE_BYTES} bytes (${MAX_BLOB_SIZE_BYTES / 1024 / 1024} MiB)`,
      ),
    );
  }
  // ... rest of existing implementation with deadline ...
}
```

### Validation

1. Call `disperseBlob()` with data > `MAX_BLOB_SIZE_BYTES` → immediate `RangeError`.
2. Call with normal data (1 KiB) → passes through to gRPC call.

### Risk

- **Very low.** Guard is O(1). Actual event sizes (~200B–2KiB) never approach the limit.

---

## Implementation order

| Order | Issue | File(s) | Complexity | Impact |
|-------|-------|---------|-----------|--------|
| 1 | **P0: Env var mismatch** | `.env`, `.env.example` | Trivial | 🔴 Unblocks gRPC path |
| 2 | **P2: Remove duplicate logging** | `index.ts` | Trivial | 🟡 Cleaner logs |
| 3 | **P2: DA env vars in shared config** | `env.ts`, `index.ts`, `.env.example` | Trivial | 🟡 Maintainability |
| 4 | **P1: Singleton DaClient** | `index.ts`, `da.ts` | Medium | 🔴 Stops connection leak |
| 5 | **P1: gRPC channel options** | `da-client.ts` | Small | 🟡 Reliability |
| 6 | **P2: Request deadlines** | `da-client.ts` | Small | 🟡 Prevents hangs |
| 7 | **P1: TLS credentials** | `da-client.ts` | Small | 🔴 Security for prod |
| 8 | **P4: Blob size validation** | `da-client.ts` | Trivial | 🟢 Defensive |
| 9 | **P3: Health endpoint** | `index.ts` | Small | 🟡 Observability |

**Recommendation:** Implement in order 1→2→3→4→7→6→5→8→9. Orders 5-8 can be parallelized since they touch different parts of `da-client.ts`.
