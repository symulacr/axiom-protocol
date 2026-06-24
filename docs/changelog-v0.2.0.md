
# Changelog — v0.2.0 0G Integration Update

**16 commits | 65 source files | +1,815 / -1,078 = +737 net**

---

## 0G Chain Integration
- All 6 ethers providers hardened: FetchRequest timeout (10s) + explicit chainId + `staticNetwork: true`
- dRPC third-party RPC eliminated from 7 files (5 Solidity tests, 2 TS tests) → official `evmrpc-testnet.0g.ai`
- Chain-aware address getters: `getAxiomAgentNftAddress(chainId?)`, `getAxiomTeeVerifierAddress(chainId?)`, etc.
- `OGNetwork` expanded from 5→10 fields: `computeRouterUrl`, `computeDirectProxyUrl`, `daGrpcUrl`, `blockExplorer`, `explorerApiUrl`
- 5 new resolver functions: `resolveComputeRouterUrl()`, `resolveComputeDirectProxyUrl()`, `resolveDaGrpcUrl()`, `resolveBlockExplorerUrl()`, `resolveExplorerApiUrl()`
- `ENV_KEYS` expanded 14→35 entries
- Frontend explorer URLs centralized via `resolveBlockExplorerUrl(chainId)`

## 0G Compute (Router API)
- SSE streaming enabled (was hardcoded `stream: false`) with TEE attestation via `x-0g-trace` header extraction
- `chatCompletionsSchema` expanded from 5→28+ OpenAI features: `tools`, `tool_choice`, `response_format`, `stream_options`, `reasoning_effort`, `logprobs`, `seed`, etc.
- Static `KNOWN_PROVIDERS` eliminated → on-chain `InferenceServing.getAllServices()` discovery
- New `compute/provider-discovery.ts` module with lazy cache (process-lifetime, mutex-guarded)
- `createRouterClient()` is now async with zero hardcoded fallback URLs
- `decodeDirectKeyToken` hardened with field normalization (`provider`/`providerAddress`, `address`/`user`)
- Frontend SSE consumption: `tickStream()` via browser `ReadableStream` + ExecutePanel streaming UI

## 0G Storage
- 3 `ZeroGStorage` classes consolidated → 1 unified class in `packages/config/src/storage/0g.ts`
- `tryDecrypt` false-positive guard **removed** (SDK `downloadToBlob()` already decrypts internally)
- Encryption aligned to app-layer AES-256-GCM only (removed SDK AES-256-CTR passthrough)
- `InMemoryStorage`, `StorageAdapter`, `withRetry()` unified in config package
- Old storage wrappers deleted: `apps/backend/src/storage/0g.ts` (−61), `apps/oracle/src/storage.ts` (−62)
- 11 consumer import paths migrated to `@axiom/config/storage/0g`

## 0G DA (gRPC)
- **Critical fix**: env var mismatch `OG_DA_GRPC_URL` vs `DA_GRPC_URL` — gRPC DA path was completely dead code
- Singleton `DaClient`: no more per-event TCP connection leak (was creating new gRPC channel per event)
- gRPC channel options: reconnection backoff (`initial_reconnect_backoff_ms`, `max_reconnect_backoff_ms`), keepalive (10s ping)
- TLS support via `DA_GRPC_CA_CERT` / `DA_GRPC_TLS_ENABLED` env vars
- Per-call deadlines: 60s disperse, 30s status/retrieve
- Blob size validation (31,744 KiB max)
- Health endpoint on `HEALTH_PORT` (default 9091)
- Docker compose with DA sidecar + indexer, `da-client.env.example` with 27 env keys

## ERC-7857 (Agentic ID)
- Added `iTransfer(address,uint256,proof[])` — was missing 3-arg form
- Added `iClone(address,uint256,proof[])` — was missing 3-arg form
- Added `Transferred(uint256,address indexed,address indexed)` event
- Fixed `iTransfer` to emit `PublishedSealedKey` (was calling 3-arg OZ `_transfer`)
- Fixed Authorization event param order per EIP-7857 spec
- `ProofAlreadyUsed` custom error replaces string require (~20k gas saved)
- `intelligentDataOf(uint256)` view alias added
- `ERC7857InvalidAssistant(address)` parameter fixed
- `unsealKeyForReceiver` function exported
- 13 new contract tests + 3 new fuzz tests for iCloneFrom

## Cross-Cutting
- Backward imports fixed: `server/transfer.test.ts` (5× `../../../oracle/` → `@axiom/oracle/*`)
- 7 dead files deleted (−325 LOC): `contract-types.ts`, `create-route.ts`, old storage wrappers, 4 dead config modules
- 12+ hardcoded URLs eliminated via centralized resolver functions
- Unused `ethers` dep removed from frontend, `@0gfoundation/0g-compute-ts-sdk` removed from bench
- Galileo testnet deployment guide (`docs/testnet-deployment.md`) + `.env.galileo.example`
- Live endpoint verification: all 14/14 0G endpoints reachable
- All 6 packages typecheck clean; `forge build` clean

---

## Files Changed

```
 66 files changed, 1815 insertions(+), 1811 deletions(-)
