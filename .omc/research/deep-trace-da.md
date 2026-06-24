# Deep Trace: 0G DA gRPC Integration in Axiom Indexer

**Date:** 2026-06-24  
**Scope:** Exhaustive code-path trace of DA event submission from block poll → gRPC `DisperseBlob`  
**Files analyzed:**
- `apps/indexer/src/index.ts`
- `apps/indexer/src/da.ts`
- `apps/indexer/src/da-client.ts`
- `apps/indexer/src/da.test.ts`
- `apps/indexer/src/watcher.ts`
- `apps/indexer/src/sink.ts`
- `apps/indexer/src/events.ts`
- `apps/indexer/src/serialization.ts`
- `apps/indexer/src/disperser.proto`
- `apps/indexer/src/env.ts`
- `apps/indexer/package.json`
- `packages/config/src/env.ts`
- `packages/config/src/storage/0g.ts`
- `.env`
- `.env.example`
- `node_modules/@grpc/grpc-js/src/*.ts` (client, channel-options, channel-credentials, constants, deadline, connectivity-state, retrying-call, backoff-timeout, load-balancer)

---

## 1. FULL EVENT → gRPC CALL CHAIN

### 1.1 Call chain

```
main()
  └─ composeSinks(daConfig, {backendUrl, rpcUrl})      ← called ONCE
        └─ returns async (event) => { ... }              ← closure, called PER EVENT
              ├─ case "grpc":
              │     const submitFn = makeRealSubmitter(config.grpcUrl)  ← ⚠️ NEW CLIENT PER CALL
              │     await submitEvent(event, { submitFn })
              ├─ stdoutSink(event)                                    ← always
              ├─ if backendUrl: postEvent(event, { backendUrl })       ← HTTP POST
              └─ case "storage":
                    eventBuffer.push(event)                            ← buffered path

makeRealSubmitter(daGrpcUrl):
  ├─ const client = new DaClient(daGrpcUrl)                           ← NEW gRPC CHANNEL
  ├─ client.waitForReady(30_000).catch(...)                           ← ⚠️ FIRE-AND-FORGET
  └─ return async (bytes) => client.disperseBlob(bytes)               ← returns { requestId, seq: 0n }

DaClient.constructor(grpcUrl):
  ├─ protoLoader.loadSync(PROTO_PATH, { ... })
  ├─ grpc.loadPackageDefinition(packageDefinition)
  ├─ new Disperser(grpcUrl, grpc.credentials.createInsecure())         ← ⚠️ NO TLS, NO OPTIONS
  └─ this.client = disperserClient

DaClient.disperseBlob(data):
  └─ new Promise((resolve, reject) => {
       this.client["DisperseBlob"]({ data }, (err, response) => {
         if (err) reject(err)
         else resolve({ requestId: Buffer.from(response.request_id).toString("hex"), blobStatus })
       })
     })

DaClient.waitForReady(timeoutMs = 30_000):
  └─ new Promise((resolve, reject) => {
       this.client.waitForReady(new Date(Date.now() + timeoutMs), callback)
     })
```

### 1.2 Critical: Per-Event `DaClient` Creation

In `apps/indexer/src/index.ts` line 146:

```typescript
case "grpc": {
  const submitFn = makeRealSubmitter(config.grpcUrl);  // ← inside the per-event closure!
  try {
    await submitEvent(event, { submitFn });
  } catch (err) { ... }
}
```

`makeRealSubmitter` (in `da.ts` lines 63-74) **creates a new `DaClient` (and thus a new gRPC channel) EVERY TIME it is called**:

```typescript
export function makeRealSubmitter(daGrpcUrl: string): SubmitFn {
  const client = new DaClient(daGrpcUrl);  // ← NEW CHANNEL PER EVENT
  client.waitForReady(30_000).catch(...);   // ← FIRE-AND-FORGET
  return async (bytes: Uint8Array) => {
    const { requestId } = await client.disperseBlob(bytes);
    return { txHash: requestId, seq: 0n };
  };
}
```

**This means:** if 100 blocks are polled with 3 events each in 50-block windows, that's **at least 3 new gRPC channels per tick × ~1 tick per 12s = 15+ orphaned channels per minute**.

No `DaClient.close()` is ever called anywhere in the codebase.

### 1.3 Summary: How Many DaClient Instances?

| Scenario | DaClient instances | Correct? |
|----------|-------------------|----------|
| Current gRPC config (per-event) | 1 per event = unlimited leak | ❌ |
| Fix: singleton outside closure | 1 total | ✅ |
| Storage path | 0 (no gRPC) | ✅ |

**Should be exactly 1.** The `DaClient` should be created once in `main()` and passed to `composeSinks`.

---

## 2. PROTO COMPARISON: Vendored vs Official

### Vendored: `apps/indexer/src/disperser.proto`
### Official: `https://raw.githubusercontent.com/0gfoundation/0g-da-client/main/api/proto/disperser/disperser.proto`

**Result: IDENTICAL in content.** Only whitespace differs:
- Vendored: 2-space indentation
- Official: tab indentation

All RPCs, messages, enums, field numbers, comments match exactly.

### Proto structure

```protobuf
service Disperser {
  rpc DisperseBlob(DisperseBlobRequest) returns (DisperseBlobReply) {}
  rpc GetBlobStatus(BlobStatusRequest) returns (BlobStatusReply) {}
  rpc RetrieveBlob(RetrieveBlobRequest) returns (RetrieveBlobReply) {}
}
```

### Blob size limit (from proto comment)
> `// The size of data must be <= 31744 KiB.`

**31,744 KiB ≈ 31 MiB** per blob. The canonicalized AxiomEvent JSON is typically < 1 KiB, so this is not a constraint for individual events. However, if batching were added to the gRPC path, this would be the upper bound.

---

## 3. gRPC FEATURES AVAILABLE BUT UNUSED

The library is `@grpc/grpc-js@^1.14.4` — a full-featured version. The `DaClient` constructor passes zero channel options and uses `grpc.credentials.createInsecure()`.

### 3.1 Channel Credentials (Security)

| Feature | Available | Used | Risk |
|---------|-----------|------|------|
| `grpc.credentials.createInsecure()` | ✅ | ✅ (hardcoded) | ⚠️ No transport security |
| `grpc.credentials.createSsl()` | ✅ | ❌ | No TLS |
| `grpc.credentials.createFromSecureContext()` | ✅ | ❌ | No mTLS |
| Certificate-based credentials | ✅ (certificate-provider.ts) | ❌ | No PKI |

**Risk:** Traffic to the DA sidecar is unencrypted. If the DA sidecar is on a different host, anyone on the network can intercept blob data.

### 3.2 Channel Options (Connection Management)

Available via `ChannelOptions` but **zero are passed**:

| Option | Purpose | Not Used → Risk |
|--------|---------|-----------------|
| `grpc.keepalive_time_ms` | Periodic pings to detect dead connections | Connection may die silently |
| `grpc.keepalive_timeout_ms` | Ping response timeout | Long hang times on dead conns |
| `grpc.keepalive_permit_without_calls` | Ping even when no active RPCs | Channel idle death undetected |
| `grpc.max_send_message_length` | Limit outgoing message size | Default -1 (unlimited) |
| `grpc.max_receive_message_length` | Limit incoming message size | Default 4 MiB — may reject large replies |
| `grpc.enable_retries` | Automatic gRPC retry (default: enabled) | Relies on default, not explicit |
| `grpc.initial_reconnect_backoff_ms` | First reconnect delay (default 1000ms) | Uses default |
| `grpc.max_reconnect_backoff_ms` | Max reconnect delay (default 120000ms) | Uses default |
| `grpc.service_config` | JSON retry policy config | No custom retry policy |
| `grpc.max_connection_age_ms` | Max connection lifetime | Connections live forever |
| `grpc.max_connection_idle_ms` | Close idle connections | Connections never close |
| `grpc.enable_http_proxy` | HTTP CONNECT proxy | Proxy unsupported |
| `grpc.default_compression_algorithm` | Compress gRPC messages | No compression |
| `grpc.lb.*` | Load balancing policy | Only pick-first (default) |
| `grpc.enable_channelz` | gRPC debugging channelz | No observability |
| `grpc-node.flow_control_window` | HTTP/2 flow control | Default (no tuning) |

### 3.3 Per-Call Options (Not Used in `DisperseBlob`)

The gRPC `Client` accepts `CallOptions`:

| Option | Available | Used | Impact |
|--------|-----------|------|--------|
| `deadline` | ✅ | ❌ | No per-call timeout; indefinite hang |
| `credentials` (CallCredentials) | ✅ | ❌ | No per-call auth tokens |
| `interceptors` | ✅ | ❌ | No logging/metrics middleware |
| `interceptor_providers` | ✅ | ❌ | No dynamic interceptors |
| `host` | ✅ | ❌ | No per-call host override |
| `propagate_flags` | ✅ | ❌ | No propagation control |

### 3.4 Retry Infrastructure

- `retrying-call.ts` — Full retry logic (RetryThrottler, status codes, hedging) is built into the library
- `grpc.enable_retries` defaults to enabled, **but** without a `service_config` specifying retry policy, the default retry policy is essentially "no retry" for most error codes
- The channel options `grpc.per_rpc_retry_buffer_size` and `grpc.retry_buffer_size` are unused

### 3.5 Load Balancing

Load balancers available:
- `load-balancer-pick-first.ts` (default — used)
- `load-balancer-round-robin.ts` ❌ not configured
- `load-balancer-weighted-round-robin.ts` ❌ not configured
- `load-balancer-outlier-detection.ts` ❌ not configured

Only `pick-first` is active by default. If the DA sidecar is a DNS name with multiple A records, only the first is used.

### 3.6 Connectivity State Machine

States: `IDLE → CONNECTING → READY → TRANSIENT_FAILURE → SHUTDOWN`

The current `waitForReady` approach only watches for `READY`. If the channel reaches `TRANSIENT_FAILURE` after being `READY` (e.g., DA sidecar restart), there is no reconnection logic at the application level. The `BackoffTimeout` class provides exponential backoff (initial 1s, multiplier 1.6, max 120s, jitter 0.2) but this is only used internally by the subchannel — the user code never observes it.

---

## 4. BACKPATH ANALYSIS

### 4.1 gRPC Path (current — no buffer)

```
eth_getLogs (up to 28 calls per tick, 50-block window)
  → decodeAxiomLog (per log)
    → composedSink (per event)
      → makeRealSubmitter → new DaClient (per event!)
        → waitForReady (fire-and-forget)
        → disperseBlob (awaited)
        → stdoutSink
        → postEvent (HTTP, if BACKEND_URL set)
```

**No buffer in this path.** The watcher loop (`watcher.ts` lines 560-620) awaits `this.sink(ev)` for each event sequentially. If the gRPC call takes 500ms, and there are 10 events, the poll tick takes 5+ seconds.

### 4.2 Storage Path (has buffer)

```
composedSink (per event)
  → eventBuffer.push(event)                              ← push to buffer
  → if buffer.length >= BATCH_MAX (default 10):          ← threshold flush
      stopBatchTimer()
      flushBuffer()
  → else if batchTimer === null: startBatchTimer()       ← timer flush every 5000ms
```

**Buffer cap:** `eventBuffer` has no hard upper bound in the push path — it grows unbounded until `BATCH_MAX` is reached. Only on *flush failure* does `MAX_BUFFER_SIZE = 10,000` apply (by dropping oldest events).

### 4.3 Failure Re-buffer (Storage Path, lines 96-101)

```typescript
catch (err) {
  const MAX_BUFFER_SIZE = 10000;
  for (const ev of batch) {
    if (eventBuffer.length >= MAX_BUFFER_SIZE) {
      eventBuffer.pop();  // drop oldest
      console.warn("event buffer full, dropping oldest event");
    }
  }
  eventBuffer.unshift(...batch);  // re-buffer in front
}
```

**Behavior:** On storage upload failure, the batch is spliced back to the *front* of the buffer (LIFO order for retries). If failures persist, the buffer grows to 10,000, then starts dropping the oldest events.

### 4.4 No Backpressure for gRPC Path

If the DA sidecar is overwhelmed:
1. Watcher tick blocks on `disperseBlob` response
2. No events are dropped (good) but the poll loop stalls (bad — events pile up on-chain)
3. No event buffer, no overflow protection, no circuit breaker

### 4.5 Throughput Estimate

| Factor | Value |
|--------|-------|
| Poll interval | 12,000 ms |
| Block window | 50 blocks |
| Max eth_getLogs calls/tick | 28 (one per event type × address) |
| Typical events per block (idle) | ~1-3 |
| Max events per tick (peak) | Unknown (depends on on-chain activity) |
| gRPC disperse latency | Unknown (depends on DA sidecar) |
| Max throughput (sequential) | `1 event / max(disperseLatency, 5ms)` ≈ ~2-10 events/sec |

**Limiting factor:** Sequential dispatching. If `disperseBlob` latency is 200ms, max = 5 events/sec = ~60 events per 12s tick.

---

## 5. FAILURE PATH ANALYSIS

### 5.1 Every Failure Path

| Failure | Where | Caught? | Logged? | Outcome |
|---------|-------|---------|---------|---------|
| `disperseBlob` connection error | `da-client.ts:80-88` | Promise rejection | Yes (da.ts:48-56) | Returns `FAILED_SUBMIT` sentinel |
| `waitForReady` timeout | `da-client.ts:183-190` | `.catch()` handler | Yes (da.ts:68-73) | Logged as `"fatal"` — but disperse still attempted! |
| `submitEvent` missing submitFn | `da.ts:35-41` | Conditional check | Yes | Returns `FAILED_SUBMIT` |
| gRPC channel dead (UNAVAILABLE) | Library callback | Rejects `disperseBlob` promise | Yes (via catch) | `FAILED_SUBMIT`, event **silently lost** |
| gRPC channel DEADLINE_EXCEEDED | Library callback | Rejects promise | Yes (via catch) | `FAILED_SUBMIT`, event lost |
| gRPC blob too large (>31744 KiB) | Server-side rejection | Rejects promise | Yes | `FAILED_SUBMIT` (unlikely given event sizes) |
| `pollOnce` eth_getLogs fails | `watcher.ts:615-623` | Try/catch | Yes | Tick backed off by `intervalMs` |
| RPC chainId mismatch | `index.ts:229-238` | Immediate | Yes | `process.exit(1)` |
| Storage upload fails | `index.ts:94-111` | Try/catch | Yes | Re-buffered (up to 10,000 events) |
| HTTP backend POST fails | `index.ts:193-199` | Try/catch | Yes | Event still processed |
| Backend returns 4xx/5xx | `index.ts:181-191` | Status check | Yes (warn) | Event still processed |

### 5.2 What happens if DA sidecar is down for 10 minutes?

1. **gRPC path:** Every event creates a new `DaClient` that tries `waitForReady` (30s timeout) in the background, then immediately calls `disperseBlob`. Each call fails with `UNAVAILABLE` or `DEADLINE_EXCEEDED`. Each event logs an error. No retry. Events are **silently dropped** after logging. After 10 minutes: ~50 events × 1 gRPC channel leak each = 50 orphaned channels.

2. **Storage path:** Events buffer in memory. At 1 event/12s tick = 5 events/min = 50 events in 10 minutes. Buffer cap is 10,000. Buffer is never flushed. Events survive in memory until the DA sidecar comes back.

3. **HTTP backend (BACKEND_URL):** Still works independently. Events are posted to the backend regardless of DA status.

4. **Watcher cursor:** Advances regardless of DA submission success. If DA is down, the events are **gone forever** from the DA layer — the cursor does not roll back.

### 5.3 Risk: Silent Event Loss

The most dangerous failure mode: **no retry on gRPC failure, and cursor advances**. An event that fails DA submission is logged once and forgotten. There is no dead-letter queue, no re-queue, no retry count, no exponential backoff.

---

## 6. ENV VAR MISMATCH BUG

### Critical configuration disconnect

| File | Variable | Value |
|------|----------|-------|
| `.env` (line 33) | `OG_DA_GRPC_URL=localhost:51001` | ⚠️ SET but never read |
| `.env.example` (line 49) | `# DA_GRPC_URL=localhost:51001` | COMMENTED OUT |
| `index.ts` (line 246) | `process.env["DA_GRPC_URL"]` | Reads `DA_GRPC_URL`, NOT `OG_DA_GRPC_URL` |

**Result:** The gRPC DA path can NEVER be activated with the current `.env` file. The code reads `DA_GRPC_URL` which is undefined, so `daGrpcUrl` is `undefined`, so `daEnabled && daGrpcUrl` is false, and the config falls through to `storage` or `disabled`.

This makes the entire gRPC code path dead code in the current deployment.

---

## 7. WATCHER BUFFER AND THROUGHPUT DETAILS

### 7.1 Poll Loop (watcher.ts lines 554-644)

```typescript
while (this.running) {
  await tick();                    // fetch + sink events + save checkpoint
  await sleep(this.intervalMs);    // 12,000ms
}
```

### 7.2 Per-Tick Behavior

1. `provider.getBlockNumber()` — 1 RPC call
2. For each of 28 watched events:
   - `provider.getLogs(filter)` — 1 RPC call per (event, address) pair = up to 28 calls
3. Sort logs by chain order
4. For each log sequentially:
   - `decodeAxiomLog(log)` — synchronous
   - `this.sink(ev)` — await (this blocks on gRPC + HTTP + storage)
5. `saveCheckpoint()` — atomic file write

### 7.3 Block Time on 0G Galileo

0G Galileo testnet targets ~2s block time. With `POLL_WINDOW_BLOCKS = 50n`, each tick covers ~100s of blocks. At `POLL_INTERVAL_MS = 12000`, the indexer polls every 12s for the last 50 blocks.

If the tick takes >12s (due to slow gRPC), the loop backs off via the error handler, causing the cursor to fall behind.

### 7.4 Checkpoint File

`data/checkpoint.json` — atomic write via rename. If the process crashes mid-tick (after processing some events but before saving checkpoint), those events will be re-processed on restart (at-least-once delivery). If the process crashes after saving checkpoint but before a gRPC disperse completes, those events are lost from DA.

---

## 8. DaClient LEAK DETAILS

### 8.1 Lifetime of each DaClient

```
makeRealSubmitter(url)
  → new DaClient(url)              ← gRPC channel created (socket opened)
    → waitForReady(30_000)         ← starts IDLE→CONNECTING→READY cycle (fire-and-forget)
    → disperseBlob(data)           ← sends RPC
      → promise resolves/rejects   ← RPC done
    → returns { txHash, seq: 0n }  ← function returns
    → (implicit) garbage collected? ← NO — gRPC channel holds refs, socket stays open
```

**`DaClient.close()` is never called.** Each orphaned channel keeps:
- An HTTP/2 socket connection
- A `setInterval` for keepalive (none configured, but internal timers)
- Channelz tracking objects
- Memory for channel internals

After 1000 events ≈ 1000 orphaned sockets.

### 8.2 Fix

Move `DaClient` creation to `main()`, pass into `composeSinks` as a shared instance:

```typescript
// In main():
const daClient = new DaClient(daGrpcUrl);
await daClient.waitForReady(30_000);  // actually await

// In composeSinks: use shared client
```

---

## 9. `waitForReady` FIRE-AND-FORGET ANALYSIS

In `da.ts` lines 65-72:

```typescript
client.waitForReady(30_000).catch((err) => {
  console.error(JSON.stringify({ level: "fatal", msg: "DA client failed to connect", ... }));
});
```

**The `.catch()` handler logs `"fatal"` but the code continues.** The `disperseBlob` call on the next line will execute regardless of whether the connection is ready.

If the connection has not reached `READY` within the gRPC library's internal state machine:
- The library queues the call internally (in CONNECTING state)
- The call eventually succeeds or fails with UNAVAILABLE
- If `waitForReady` already timed out, the gRPC channel may have entered TRANSIENT_FAILURE

**Risk:** A `"fatal"` log message is emitted, but the caller gets no signal to back off. The next event also creates a new client, also gets `"fatal"`, also tries to disperse — flooding the unreachable DA sidecar with connection attempts.

---

## 10. Serialization Path

Every event goes through `canonicalizeEvent()` → RFC 8785 JSON → `Uint8Array`.

```typescript
canonicalizeEvent(event: AxiomEvent) {
  return new TextEncoder().encode(canonicalize(eventToJsonValue(event)));
}
```

- Keys sorted lexicographically
- BigInts encoded as decimal strings (lossless)
- Arrays preserve order
- Byte-stable (deterministic)

**Size range:** ~200 bytes (Transfer) to ~2 KiB (Executed with large result). Each is a single blob sent to `DisperseBlob`.

---

## 11. BLOB SIZE LIMITS

From proto: `// The size of data must be <= 31744 KiB.`

This is ~31 MiB per blob. No individual AxiomEvent even approaches this limit. However, if batching were implemented (e.g., batch multiple events into one DisperseBlob), the limit would be relevant.

The 0G Storage SDK (`uploadToStorage`) uses the `Indexer` class which uploads via the `splitableUpload` method, which handles fragmentation internally. No explicit size limit seen in the SDK, but the underlying flow contract may have gas limits.

---

## 12. COMPLETE RISK REGISTER

### Critical

| # | Risk | Impact | Root Cause |
|---|------|--------|------------|
| 1 | **Env var mismatch**: `OG_DA_GRPC_URL` ≠ `process.env["DA_GRPC_URL"]` | gRPC DA path is dead code | `.env` has `OG_DA_GRPC_URL`, code reads `DA_GRPC_URL` |
| 2 | **DaClient leak**: new channel per event | Socket leak, OOM over time | `makeRealSubmitter()` called inside event closure |
| 3 | **Silent event loss**: no retry on gRPC failure | Events missing from DA | No retry, cursor advances regardless |
| 4 | **Unencrypted transport**: `createInsecure()` | Blob data in plaintext on network | No TLS configured |

### High

| # | Risk | Impact | Root Cause |
|---|------|--------|------------|
| 5 | `waitForReady` fire-and-forget | Disperse attempted before channel ready | `.catch()` not awaited |
| 6 | No reconnect after TRANSIENT_FAILURE | All subsequent events fail silently | No health check loop |
| 7 | No per-call deadline | gRPC call can hang indefinitely | No `CallOptions.deadline` |
| 8 | No event buffer on gRPC path | No backpressure, watcher stalls | gRPC path bypasses `eventBuffer` |

### Medium

| # | Risk | Impact | Root Cause |
|---|------|--------|------------|
| 9 | gRPC channel not closed on shutdown | Socket leak on restart | `DaClient.close()` never called |
| 10 | No dead-letter queue | Events unrecoverable after fail | No persistent event log |
| 11 | Sequential dispatch limiting throughput | Indexer falls behind under load | One event at a time in sink |
| 12 | No service config for retry policy | Default retry may be insufficient | No `grpc.service_config` passed |

### Low

| # | Risk | Impact | Root Cause |
|---|------|--------|------------|
| 13 | No keepalive pings | Dead connection detection delayed | No `grpc.keepalive_time_ms` |
| 14 | No compression | Higher bandwidth usage | No `grpc.default_compression_algorithm` |
| 15 | No channelz | Hard to debug gRPC issues | No `grpc.enable_channelz` |
| 16 | Blob status polling unused (`pollUntilFinalized`) | Can't verify blob was stored | `getBlobStatus`/`pollUntilFinalized` never called after disperse |

---

## 13. SUMMARY OF RECOMMENDATIONS

1. **Fix env var name**: Change `.env` to use `DA_GRPC_URL` or change code to read `OG_DA_GRPC_URL`
2. **Singleton DaClient**: Create once in `main()`, share across all events, `await waitForReady`, call `close()` on shutdown
3. **Add event buffer for gRPC path**: Same pattern as storage path (or unified buffer)
4. **Add retry with backoff**: Wrap `disperseBlob` in exponential backoff (3 retries, 1s/2s/4s)
5. **Set per-call deadline**: 30s timeout on `DisperseBlob` calls
6. **Enable TLS**: Use `grpc.credentials.createSsl()` if the DA sidecar supports it
7. **Add health checking**: Periodic `GetBlobStatus` or connection health probe
8. **Add graceful shutdown**: Call `DaClient.close()` in the SIGINT/SIGTERM handler
9. **Consider persistent event log**: Write events to disk before DA submission for crash recovery
