# External API/SDK Integration Analysis — Axiom Protocol

**Agent:** W2A7-ExternalIntegrations  
**Date:** 2026-06-28  
**Scope:** All external API/SDK integrations across `apps/` and `packages/config`  
**Constraint:** Read-only analysis, concrete file:line citations.

---

## 1. 0G Chain (EVM RPC) — ethers `JsonRpcProvider`

### 1.1 SDK & Version
- **Package:** `ethers` ^6.16.0
- **Imported from:** `"ethers"` everywhere (no npm namespace alias)
- **Used in:** `apps/backend`, `apps/oracle`, `apps/indexer`, `packages/config`

### 1.2 Authentication
- No auth tokens — RPC URL is a plain HTTP endpoint (`https://evmrpc-testnet.0g.ai` / `https://evmrpc.0g.ai`)
- Auth is network-level (IP allowlist or node authentication not configured here)
- Private keys (`DEPLOYER_PK`, `AXIOM_TEE_SIGNER_PK`) are loaded from env vars as hex strings and wrapped in `ethers.Wallet(pk, provider)` for signing

### 1.3 Client Lifecycle

| Location | Pattern | File:Line |
|---|---|---|
| `apps/backend/src/provider.ts` | **Singleton** via `getSharedProvider()` — module-level `_provider` var, created once with `staticNetwork: true` | `provider.ts:4-14` |
| `apps/backend/src/index.ts` | **Per-process** — one `JsonRpcProvider` at startup, passed to `startServer()` | `index.ts:13-20` |
| `apps/oracle/src/index.ts` | **No ethers provider** — uses standalone `Wallet` (no provider attachment) for 0G Storage auth | `index.ts:32` |
| `apps/indexer/src/index.ts` | **Per-process** — one `JsonRpcProvider` created in `main()` | `index.ts:175-178` |
| `apps/indexer/src/watcher.ts` | **Injected** — `Watcher` receives `provider` via constructor | `watcher.ts:497-498` |
| `apps/backend/src/orchestrator/index.ts` | **Per-runner** — `StrategyRunner` creates its own `JsonRpcProvider` with `staticNetwork: true` | `orchestrator/index.ts:64-69` |

**Key pattern:** Each process creates a **single provider** at startup. No connection pooling, no disposal logic (providers are long-lived). The `FetchRequest` timeout is set to 10s everywhere.

**Quality: GOOD** — singleton/process-scoped lifecycle is appropriate for ethers v6. `staticNetwork: true` avoids an extra eth_chainId round-trip.

### 1.4 Error Handling
- **No explicit retry** on RPC calls — relies on ethers internal retry (default 3 retries with exponential backoff for non-fatal errors)
- **Provider chainId mismatch check** in indexer — logs error but does not crash (`index.ts:183-196`)
- **Watcher tick failure** — logs error and backs off by one poll interval (`watcher.ts:583-593`)
- **No timeout on many raw calls** — `this.provider.getBlockNumber()`, `provider.getLogs()` use the provider's default timeout (0 = indefinite). Only the `FetchRequest` has a 10s timeout.

### 1.5 Integration Quality
- Good use of ethers v6 patterns (`staticNetwork`, `FetchRequest` for timeout)
- Missing: explicit timeout on `getLogs()`, `getBlockNumber()` — these could hang indefinitely
- Missing: connection recovery / provider recycling on dropped connection

### 1.6 Testing Surface
- **`apps/backend/src/orchestrator/orchestrator-chainid.test.ts`** — chainId wiring test (pure config, no RPC)
- **`apps/backend/src/server/transfer.test.ts`** — transfer endpoint tests (likely mock/integration)
- No unit-test mocking of the `JsonRpcProvider` itself

---

## 2. 0G Storage — `@0gfoundation/0g-storage-ts-sdk`

### 2.1 SDK & Version
- **Package:** `@0gfoundation/0g-storage-ts-sdk` ^1.2.10
- **Imported in:** `packages/config/src/storage/0g.ts`
- **Used by:** `ZeroGStorage` class, `uploadToStorage()` / `downloadFromStorage()` helpers

### 2.2 Authentication
- **EVM wallet signing** — a `Signer` (ethers Wallet) is passed for storage upload transactions
- **No API keys** — authenticity comes from wallet-based tx signing on the 0G chain (the storage indexer is a separate HTTP endpoint)
- The wallet used for storage must hold 0G tokens for gas

### 2.3 Client Lifecycle

| Component | Pattern | File:Line |
|---|---|---|
| `ZeroGStorage` class | Creates `new Indexer(config.indexerRpc)` in constructor | `0g.ts:104` |
| In `StrategyRunner` | One `ZeroGStorage` per runner instance | `orchestrator/index.ts:74` |
| In Oracle `index.ts` | Either `ZeroGStorage` or `InMemoryStorage` based on env | `oracle/index.ts:25-38` |
| In Indexer `index.ts` | Creates `new Indexer(ogStorageRpc)` at startup | `indexer/index.ts:212` |

**SDK class is `Indexer`** from the package. No disposal — it's a long-lived HTTP client.

**Important:** The `Indexer` SDK object has no explicit timeout configuration visible in the code. It's created bare with just the URL.

### 2.4 Error Handling
- **`uploadToStorage`**: Checks SDK return tuple `[tx, err]` — throws on error with descriptive message (`0g.ts:71-75`)
- **`downloadFromStorage`**: Same `[blob, err]` pattern — throws on error (`0g.ts:88-89`)
- **Indexer `flushBuffer`**: On upload failure, re-buffers events (up to 10k cap, drops oldest). Logs warning (`indexer/index.ts:86-103`)
- **Oracle index.ts**: Wraps `ZeroGStorage` creation in try-catch — silently falls back to `InMemoryStorage` if env vars missing (`oracle/index.ts:24-38`)
- **No retry logic** in upload/download helpers — single attempt only

### 2.5 Integration Quality

**Quality: GOOD/FAIR.**

Strengths:
- Clean adapter pattern (`StorageAdapter` interface) with `InMemoryStorage` fallback for dev/test (`0g.ts:17-22`, `37-60`)
- Export types (`Encryption`, `UploadResult`, `DownloadResult`) so callers don't need raw SDK imports
- Unified `ZeroGStorage` wrapper that bundles `uploadToStorage`/`downloadFromStorage`

Weaknesses:
- The `Indexer` SDK object has no configurable timeout — could hang on network issues
- Error messages include SDK internals (`err.message`) — could leak SDK internals in error responses
- `downloadFromStorage` always requests proof (`withProof: true` default) even when caller doesn't need it

### 2.6 Testing Surface
- **Oracle `server-datahash-binding.test.ts`** — tests full re-key path (transfer → encryption → upload → download) using `InMemoryStorage` (`oracle/test/server-datahash-binding.test.ts`)
- **ZeroGStorage class itself** — no dedicated unit tests found
- The `InMemoryStorage` implementation is trivially testable

---

## 3. 0G Compute (OpenAI-compatible) — Provider Discovery + Router

### 3.1 SDK & Version
- **Package:** `@0gfoundation/0g-compute-ts-sdk` ^0.8.4 (for on-chain discovery)
- **OpenAI SDK:** `openai` ^4.104.0 (for API calls to router/providers)
- **Files:** `apps/backend/src/compute/router.ts`, `apps/backend/src/compute/provider-discovery.ts`

### 3.2 Authentication
Two auth modes for compute:

**Mode A — Router Key** (`AXIOM_COMPUTE_API_KEY` or `OG_COMPUTE_API_KEY`):
- Passed as `apiKey` to `new OpenAI({...})` which sends as `Authorization: Bearer <key>` header
- Router URL configured via `OG_COMPUTE_BASE_URL` or network defaults
- File: `router.ts:61-64`

**Mode B — Direct Provider Key** (`AXIOM_COMPUTE_DIRECT_KEY`):
- Format: `app-sk-<base64>` where base64 decodes to `JSON(payload) | hex(signature)`
- Payload contains `provider` address + `address` (with normalization for SDK-specific field names)
- Provider URL resolved from on-chain registry via `ReadOnlyInferenceBroker`
- Falls back to provider-specific inference endpoint
- File: `router.ts:21-60`

Provider discovery uses **`createReadOnlyInferenceBroker(RPC, chainId)`** which queries the 0G Compute on-chain registry smart contract. No auth required for discovery — it reads public state from the EVM RPC.

### 3.3 Client Lifecycle

**OpenAI Client (Router):**
- Lazy singleton: `StrategyRunner.getClient()` creates once, caches in `this.openai` (`orchestrator/index.ts:80-85`)
- Per-request: `createRouterClient()` also called directly in server route handlers (`server.ts:163`)
- Timeout: 30s default, configurable (`router.ts:40`)
- `maxRetries: 2` — OpenAI SDK handles retry on 429/503 (`router.ts:54, 63`)

**Provider Discovery Cache:**
- Module-level cache `_cachedProviders` with 5-minute TTL (`provider-discovery.ts:16-19`)
- Cache promise dedup: `_cachePromise` prevents concurrent duplicate queries (`provider-discovery.ts:31`)
- Graceful degradation: returns `[]` on failure (logs warning, `provider-discovery.ts:54-55`)
- Explicit `invalidateProviderCache()` for force-refresh (`provider-discovery.ts:62-66`)

### 3.4 Error Handling
- Router key mode: OpenAI SDK `maxRetries: 2` handles transient failures
- Direct key mode: Throws `new Error(...)` if provider not found or token undecodable (`router.ts:57, 59`)
- Provider discovery: Silent empty-array fallback on failure, with `log.warn` (`provider-discovery.ts:54-55`)
- `resolveProviderUrl`: Returns `null` on failure (blank `catch`) (`provider-discovery.ts:86-88`)
- **No retry** on provider discovery — single attempt
- **No circuit breaker** on repeated failures

### 3.5 Integration Quality

**Quality: GOOD.**

Strengths:
- Clean separation between router config (`router.ts`) and on-chain provider discovery (`provider-discovery.ts`)
- Direct key decode handles SDK field-name variations (`payload.provider ?? payload.providerAddress`)
- Cache with dedup prevents redundant RPC calls under concurrent requests
- Graceful degradation (empty provider list vs crash)
- Well-documented cache TTL and timeout constants

Weaknesses:
- Direct key token (`app-sk-*`) is a proprietary format — undocumented and fragile
- `decodeDirectKeyToken()` uses `Buffer.from(b64, "base64")` — no error on non-base64 input (returns `null`)
- No health-check on cached provider endpoints before using them

### 3.6 Testing Surface
- **No dedicated test files** for `router.ts` or `provider-discovery.ts`
- The `orchestrator-chainid.test.ts` only tests config routing, not compute clients
- OpenAI client is untested in unit tests

---

## 4. OpenAI SDK — LLM Inference

### 4.1 SDK & Version
- **Package:** `openai` ^4.104.0
- **Imported at:** `apps/backend/src/compute/router.ts` (for client creation), `apps/backend/src/orchestrator/index.ts` (for inference calls)

### 4.2 Authentication
- Uses the same `apiKey` as 0G Compute router (see §3.2) — proxied through the 0G Compute network
- No direct OpenAI API key usage — inference goes through 0G's OpenAI-compatible endpoints

### 4.3 Client Lifecycle
- Created via `createRouterClient()` which returns `new OpenAI({...})` configured with the 0G Compute base URL
- Lazy singleton per `StrategyRunner` instance (`orchestrator/index.ts:80-85`)
- Also created per-request in `server.ts:163` for the chat proxy endpoint
- Client is **never explicitly closed/disposed** (OpenAI SDK manages its own HTTP connection pool)

### 4.4 Usage Patterns

**Streaming (for real-time ticks):**
```
orchestrator/index.ts:208-222
```
- `stream: true` on `chat.completions.create()`
- Iterates `for await (const chunk of stream)`
- Emits `{type: 'token', content, index}` callbacks
- `response_format` with `stream: true` would return 400 — documented comment (`index.ts:205-206`)

**Non-streaming (for backend ticks):**
```
orchestrator/index.ts:226-231
```
- `response_format: { type: "json_object" }` for structured JSON output
- Returns full content string, parsed by `parseRecommendation()`

**Chat proxy (frontend-facing):**
```
server.ts:163-173
```
- SSE stream: `data: ${JSON.stringify(chunk)}\n\n`
- Terminates with `data: [DONE]\n\n`
- Model default: `qwen/qwen2.5-omni-7b` (overridable via env)

### 4.5 Error Handling
- `parseRecommendation()` handles malformed JSON gracefully — returns `{"action":"hold","reason":"..."}` (`orchestrator/index.ts:131-144`)
- Streaming errors: `response_format` + `stream: true` incompatibility is documented but unhandled at runtime
- `settleOnChain()` wraps execution in try/catch and returns failed execution record instead of propagating error (`orchestrator/index.ts:103-113`)
- **No timeout** passed to `client.chat.completions.create()` — relies on client's default timeout (which may be indefinite)

### 4.6 Integration Quality

**Quality: GOOD.**

Strengths:
- Both streaming and non-streaming paths covered
- JSON parse fallback prevents bad model output from crashing a tick
- SSE proxy correctly sets headers and streaming format
- Lazy client creation prevents crash if compute credentials are missing at startup

Weaknesses:
- No timeout on individual completion calls — a hanging model call blocks the runner indefinitely
- No retry on model error/503 — single attempt per tick
- No model fallback chain if the primary model fails

### 4.7 Testing Surface
- **No tests** found for inference code paths
- `parseRecommendation()` is trivially testable but untested

---

## 5. Wayback Machine API

### 5.1 API Used
- **Endpoint:** Internet Archive CDX API (`https://web.archive.org/cdx/search/cdx`)
- **Endpoint:** Internet Archive Availability API (`https://archive.org/wayback/available`)
- **File:** `apps/backend/src/services/wayback.ts`
- **No SDK** — raw `fetch()` calls

### 5.2 Authentication
- **None.** Both CDX and availability APIs are public and unauthenticated.

### 5.3 Client Lifecycle
- **Stateless** — each function creates its own `fetch()` call
- No client object, no connection pool — simple request/response
- 20-second timeout via `AbortSignal.timeout(20_000)` on CDX calls
- No timeout on the Availability API call (`closestSnapshot`)

### 5.4 Endpoints Used

| Function | API Endpoint | File:Line |
|---|---|---|
| `lookupSnapshots()` | `web.archive.org/cdx/search/cdx?url=...&output=json&fl=timestamp,...&collapse=urlkey&limit=50` | `wayback.ts:44` |
| `lookupAccountTweets()` | Same CDX with `matchType=prefix` for X.com handle | `wayback.ts:63` |
| `confirmArchived()` | Delegates to `lookupSnapshots(..., 10)` | `wayback.ts:80` |
| `closestSnapshot()` | `archive.org/wayback/available?url=...&timestamp=...` | `wayback.ts:94` |

### 5.5 Error Handling

| Function | Error Behavior | File:Line |
|---|---|---|
| `lookupSnapshots()` | Throws on HTTP error: `"Wayback lookup failed: ..."` | `wayback.ts:46-53` |
| `lookupAccountTweets()` | Throws on HTTP error: `"Wayback account lookup failed: ..."` | `wayback.ts:65-72` |
| `confirmArchived()` | Re-throws from `lookupSnapshots` | `wayback.ts:83-85` |
| `closestSnapshot()` | Returns `null` on error (silent catch) | `wayback.ts:107-108` |

**Inconsistency:** CDX functions throw errors (which become 500 responses from the server), while `closestSnapshot()` returns `null`. This means a transient CDX failure can error an entire archive lookup request, while the availability API silently degrades.

### 5.6 Integration Quality

**Quality: FAIR.**

Strengths:
- Clean, focused module with documented limitations (X.com JS rendering, `wayback.ts:10-13`)
- Good timestamp normalization in `normalizeCdxRow()`
- Proper `AbortSignal.timeout` usage on CDX calls (20s)
- HTTP error propagation is correct (callers see failed status)

Weaknesses:
- Inconsistent error handling (`throw` vs `null` return)
- Availability API endpoint (`archive.org/wayback/available`) has no timeout — could hang
- CDX API `collapse=urlkey` parameter may miss multiple snapshots per URL
- No retry on failure (IA APIs are rate-limited but no backoff)
- Response schema parsing for CDX is minimal (`string[][]` with no validation)

### 5.7 Testing Surface
- **No unit tests** for any Wayback functions
- The module is synchronous in logic and easy to test (mock `fetch`), but untested

---

## 6. WalletConnect — wagmi + RainbowKit

### 6.1 SDKs & Versions
- **`wagmi`:** ^2.13.0
- **`@rainbow-me/rainbowkit`:** ^2.2.1
- **`viem`:** ^2.21.45
- **`@tanstack/react-query`:** ^5.59.0
- **`@wagmi/cli`:** ^2.10.0 (dev dep in `packages/config`)
- **Files:** `apps/frontend/src/config/wagmi.ts`, `chains.ts`, `main.tsx`

### 6.2 Authentication
- **WalletConnect Project ID:** From `localStorage` > `VITE_WALLETCONNECT_PROJECT_ID` env var > fallback `'00000000000000000000000000000000'` (invalid placeholder)
- EIP-712 typed data signing for transfer proofs (via `useSignTypedData`)
- Transaction signing via `useWriteContract`
- Optional API key in `x-api-key` header for backend auth (`apiFetch.ts:25`)

### 6.3 Client Lifecycle

**wagmi Config (singleton):**
```
wagmi.ts:19-31
```
- Created once via `getDefaultConfig()` at module scope
- Wraps `RainbowKitProvider` + `WagmiProvider` at React root (`main.tsx:24-26`)
- Two chains configured: Galileo (testnet) + Aristotle (mainnet)
- HTTP transport for each chain

**RPC URL resolution:**
- Storage RPC URL from localStorage > env var > default Galileo URL
- `chains.ts:8-10` has hardcoded fallback RPC URLs (not resolved dynamically)

**Wagmi CLI-generated ABIs:**
- ABIs generated via `wagmi generate` from forge artifacts (`packages/config/wagmi.config.ts`)
- Generates `packages/config/src/abis/generated.ts` (63.4KB)

### 6.4 Error Handling
- `useAccount()` from wagmi provides connection state
- `useWriteContract` exposes `error` state — used in `useTransfer.ts` and `useDeposit.ts`
- `useReadContracts` in `useVaultData.ts` exposes `query.error`
- **No user-friendly error mapping** — raw wagmi errors propagate to `sonner` toast
- `ErrorBoundary` catches rendering errors but has no specific wallet-error handling

### 6.5 Integration Quality

**Quality: GOOD.**

Strengths:
- Modern wagmi v2 + RainbowKit v2 setup with dark theme customization
- Environment-aware chain/RPC configuration
- EIP-712 typed data signing for transfer proofs (well-structured)
- Clean separation: `useTransfer` hook encapsulates the 3-phase transfer protocol
- ABIs generated from source via wagmi CLI (avoids drift)

Weaknesses:
- Hardcoded RPC fallback URLs in `chains.ts` (not resolved from network config dynamically)
- WalletConnect Project ID fallback `'00000000000000000000000000000000'` is a placeholder — will fail WalletConnect Cloud features
- No `disconnect` error handling specific to WalletConnect modal failures
- `useTransfer` has limited feedback on intermediate phase failures (warning timeouts)

### 6.6 Testing Surface
- **No tests** found for frontend wallet/hooks
- All contract interaction hooks (`useTransfer`, `useDeposit`, `useVaultData`) are untested

---

## 7. ElevenLabs (TTS)

### 7.1 Search Result
**No ElevenLabs integration found** in the codebase. Searched across all `apps/` directories for `elevenlabs`, `eleven`, and `labs` — zero matches.

Axiom Protocol does not use ElevenLabs or any TTS service.

---

## 8. Ethers / viem — Contract Interaction Patterns

### 8.1 SDKs
- **`ethers`:** ^6.16.0 (backend, oracle, indexer, config)
- **`viem`:** ^2.21.45 (frontend, config types, indexer events)

### 8.2 Contract Call Patterns

**Backend — `TypedContract<T>` wrapper:**
```
packages/config/src/types/contract.ts:1-19
```
A thin wrapper over `ethers.Contract` that provides compile-time type safety via a generic interface `T`. Created with `new TypedContract<T>(address, abi, runner)` where `runner` is either:
- A `Wallet` (for write calls) 
- A `JsonRpcProvider` (for read-only calls)

**Read calls** (no gas, no confirmation):
- `provider.call(...)` — raw `eth_call` (`agents.ts:57`)
- `provider.getLogs(...)` — event log queries (`agents.ts:65-69`, `orchestrator/index.ts:258-261`)
- `TypedContract.contract.balanceOf(...)` — via `wallet/provider` as runner (`orchestrator/index.ts:244`)

**Write calls** (gas, wait for confirmation):
```
orchestrator/index.ts:165-168
const tx = await vaultTc.contract.execute(...)
const receipt = await tx.wait()
```
- `TypedContract` with `Wallet` runner → returns `TransactionResponse`
- `.wait()` → `TransactionReceipt`
- Receipt inspected for events via `vaultTc.iface.parseLog(log)`

**Payment Processor:**
```
payment/processor.ts:72-73
const tx = await this.payment.contract.payForAgent(...)
const receipt = await tx.wait() as ContractTransactionReceipt
```
- Same pattern: write → wait → parse receipt logs for events

**Event parsing:**
- Uses `ethers.Interface.getEvent("EventName")` to get event definition
- Filters `receipt.logs` by `log.topics[0] === event.topicHash`
- Parses with `iface.parseLog(log)` to extract typed args

**Frontend — wagmi hooks:**
- `useReadContracts` for batched read calls (`useVaultData.ts:21-36`)
- `useWriteContract` for single write calls (`useDeposit.ts:29-35`, `useTransfer.ts:170-185`)
- `useSignTypedData` for EIP-712 off-chain signing (`useTransfer.ts:106-119`)

### 8.3 Confirmation Strategy
- **Backend:** `.wait()` with no explicit confirmations — uses ethers default (1 confirmation)
- **Frontend:** wagmi handles confirmation internally via `useWriteContract`; `onSuccess` callback fires when tx is confirmed
- **No configurable confirmation depth** — all write paths use 1 confirmation

### 8.4 Error Handling

| Pattern | Location | Quality |
|---|---|---|
| `settleOnChain()` wraps `.execute().wait()` in try/catch, returns failed execution record | `orchestrator/index.ts:103-113` | Good — graceful degradation |
| `PaymentProcessorClient` methods do NOT wrap writes in try/catch — errors propagate | `payment/processor.ts:70-103` | Fair — caller must handle |
| `ensureAllowance()` does two sequential writes (approve + wait) with no timeout | `payment/processor.ts:144-149` | Fair — no timeout on approval |
| `useTransfer.confirm()` catches and re-throws with user-friendly message | `useTransfer.ts:188-193` | Good — user-facing messages |
| Frontend `useReadContracts` with `allowFailure: false` fails on any sub-call | `useVaultData.ts:21` | Good — strict mode |
| `agentCache` with 30s TTL prevents redundant chain queries | `agents.ts:29-30, 41-45` | Good |

### 8.5 Integration Quality

**Quality: GOOD.**

Strengths:
- Consistent `TypedContract<T>` wrapper avoids per-method type casts
- Clear separation: `Wallet` runner for writes, `Provider` runner for reads
- Proper event log parsing from receipts (not just `tx.hash`)
- Frontend uses wagmi's batching (`useReadContracts`) for efficient multi-call reads
- ABIs are minimal hand-written subsets for server (smaller bundles) and full generated versions for frontend

Weaknesses:
- No configurable confirmation depth (always 1 confirmation)
- `ensureAllowance` doesn't check if allowance is already sufficient for the exact amount (checks `>= amount`)
- No typed transaction data encoding for write calls — just raw ethers `Contract` calls
- Backend event parsing relies on `find()` on receipt logs — fragile to log order
- No `TransactionResponse` timeout on `.wait()` — could hang if tx is stuck in mempool

### 8.6 Testing Surface
- **`apps/backend/src/orchestrator/orchestrator-chainid.test.ts`** — config routing only (no contract calls)
- **`apps/backend/src/server/transfer.test.ts`** — transfer endpoint test
- **`apps/oracle/test/server-datahash-binding.test.ts`** — real HTTP loopback tests with `InMemoryStorage` (3 test cases)
- **`apps/oracle/src/signer.test.ts`** — signer unit tests
- **No integration tests** with a real or simulated 0G chain

---

## 9. Cross-Cutting Observations

### 9.1 API Key Management
- API keys loaded from env vars at startup; validated via Zod schemas
- Backward-compatible aliases for all deprecated env var names (e.g., `OG_COMPUTE_API_KEY` → `AXIOM_COMPUTE_API_KEY`)
- Frontend API key (`VITE_API_KEY`) is embedded in client bundle — public by design
- No runtime rotation of API keys

### 9.2 Timeout Patterns
| Integration | Timeout | Notes |
|---|---|---|
| EVM RPC (FetchRequest) | 10s | Set everywhere consistently |
| Oracle HTTP calls | 10s | `DefaultSignerOracleClient` |
| Wayback CDX | 20s | `AbortSignal.timeout` |
| Wayback Availability | ∞ | **Missing** |
| OpenAI / 0G Compute | 30s | Client-level timeout |
| AI inference per-call | ∞ | **No timeout on `chat.completions.create()`** |
| Indexer batch storage | ∞ | `uploadToStorage` has no timeout |
| Frontend API calls | 10s/60s/120s | Three tiers (default/long/stream) |

### 9.3 Missing Tests Summary
- Compute module (`router.ts`, `provider-discovery.ts`): **untested**
- Wayback service (`wayback.ts`): **untested**
- Frontend hooks (`useTransfer`, `useDeposit`, `useVaultData`): **untested**
- Payment processor client: **untested**
- `ZeroGStorage` class: no dedicated unit tests (tested only via oracle integration tests)

### 9.4 Overall Integration Health
| Integration | Quality | Test Coverage | Risk |
|---|---|---|---|
| 0G Chain (EVM RPC) | GOOD | Partial | Low |
| 0G Storage | GOOD/FAIR | Partial | Medium |
| 0G Compute | GOOD | None | Low |
| OpenAI SDK | GOOD | None | Low |
| Wayback Machine | FAIR | None | Low |
| WalletConnect (wagmi) | GOOD | None | Medium |
| ElevenLabs | N/A | N/A | N/A |
| Ethers/viem contracts | GOOD | Partial | Low |
