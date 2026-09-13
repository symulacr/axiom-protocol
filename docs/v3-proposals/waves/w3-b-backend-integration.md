# Wave 3 — Lane B: Backend Integration for the V3 Contract Surface

- **Status:** COMPLETE (uncommitted, per brief)
- **Date:** 2026-08-31
- **Base:** git HEAD `add2fdadf` (w2 commit). One pre-existing dirty file
  (`apps/contracts/src/interfaces/IERC7857.sol`, doc-comment line) was confirmed
  as the deploy lane's in-flight edit; my diffs do not touch it.
- **Not touched:** `packages/config/src/abis/*`, `.env`, deploy artifacts,
  `AxiomMockUSDC.sol`. No deployments. No suppressions/TODOs left behind.

---

## 1. Event-coverage table (new events → parser handlers)

All events are registered in `apps/backend/src/indexer/events.ts` (`EVENT_SOURCES`),
given typed `AxiomEvent` union variants, and decoded in
`apps/backend/src/indexer/events/parser.ts` (`EVENT_PARSERS`). Topic0 binding is
derived from the ABI (`TOPIC_TABLE`), so the parser is address-agnostic: it fires
wherever the watch list points it.

| Event | Source contract | ABI source | Parser handler | Emitted fields (payload) |
| --- | --- | --- | --- | --- |
| `ProofUsed(bytes32 indexed nonce, uint256 indexed timestamp)` | AxiomTeeVerifier | `TEE_VERIFIER_ABI` (already had it) | `ProofUsed` | `nonce` (canonical `0x` + 64 hex via `canonicalNonceHex`), `timestamp: bigint` |
| `DelegationInstalled(uint256 indexed agentTokenId, address indexed delegate, uint64 expiresAt, uint256 perTxCap, uint256 windowCap)` | AxiomDelegationRegistry | `DELEGATION_REGISTRY_ABI` | `DelegationInstalled` | `agentTokenId`, `delegate`, `expiresAt`, `perTxCap`, `windowCap` |
| `DelegationRevoked(uint256 indexed agentTokenId)` | AxiomDelegationRegistry | `DELEGATION_REGISTRY_ABI` | `DelegationRevoked` | `agentTokenId` |
| `DelegatedExecuted(uint256 indexed agentTokenId, address indexed delegate, address indexed target, uint256 value, bytes32 actionHash)` | AxiomDelegationRegistry | `DELEGATION_REGISTRY_ABI` | `DelegatedExecuted` | `agentTokenId`, `delegate`, `target`, `value`, `actionHash` |
| `Updated(uint256 indexed tokenId, bytes32 oldRoot, IntelligentData[] newDatas)` | AxiomAgentNFT | `AGENT_NFT_ABI` (Wave 1) | **already migrated** — verified | `tokenId`, `oldRoot`, `newDatasCount` (= `newDatas.length`) |

Note on `ProofUsed` watching: the TeeVerifier `ProofUsed` event is now watched by
the indexer watch list (added to the `AXIOM_TEE_VERIFIER` group). This is
duplicative of the keepers' own `queryFilter` scan by design — keepers'
`fetchProofUsedNonces` and the `/v1/events` surface now share one ABI source, and
the indexer's event store makes consumed nonces queryable by tokenId-scoped
consumers without a second RPC path.

### Address-agnostic configuration

`IndexerContractAddresses` gained an **optional** `AXIOM_DELEGATION_REGISTRY`
slot. `resolveIndexerAddresses()` includes it only when
`AXIOM_DELEGATION_REGISTRY_ADDRESS` is set; `buildDefaultWatchList()` drops the
registry watch group when the address is absent (boot never fails pre-deploy;
adding the env var post-deploy starts watching without code changes). Invalid
address strings still fail loudly (checksum/hex validation inside
`resolveAddress`).

## 2. StateView read route

**Route:** `GET /v1/agents/:id/state` — new file
`apps/backend/src/routers/stateview.ts`, registered in `server.ts` right after
the governance routes.

- **What it replaces:** the FE's multi-call pre-flight (processor caps read +
  USDC balanceOf + USDC allowance + vault balance + vault strategy/limit reads)
  collapses into **one call** against `AxiomStateView`:
  - `paymentSnapshot(payer, tokenId)` → `maxPayCap, computeRatioMax,
    agentBalance, payerAllowance, paymentToken`
  - `vaultHealthOf(tokenId)` → `balance, strategyRoot, dailyLimit, dailySpent,
    resetDay, validUntilDay, expired`
- **Query param:** `?payer=0x…` scopes the payment snapshot to a wallet;
  omitted ⇒ zero address (aggregate view). Input is lowercased before the call
  so ethers never routes a mixed-case string into its ENS `resolveName` path.
- **Degradation semantics:** the two reads run via `Promise.allSettled`. One
  failing view ⇒ `200` with the other view present and a per-read `errors`
  entry; both failing ⇒ `502`. Unset address ⇒ `503 ADDRESS_NOT_CONFIGURED`
  (via the standard `requireAddress: "stateView"` guard).
- **Cache:** 10 s `TTLCache` + `Cache-Control: public, max-age=10`, keyed by
  `tokenId:payer`.
- **Bigint handling:** all numeric return values are serialized as strings in
  the response (consistent with the rest of the API; `bigintReplacer` handles
  the store path).
- **Address wiring:** `ServerConfig.addresses` gained optional `stateView` and
  `delegationRegistry` slots; `apps/backend/src/index.ts` resolves them via the
  new `resolveAddressOptional()` (`packages/config/src/addresses.ts`, names
  `stateView` → `AXIOM_STATE_VIEW_ADDRESS`, `delegationRegistry` →
  `AXIOM_DELEGATION_REGISTRY_ADDRESS`). `resolveLiveAddresses()` skips
  code-check for unset optional addresses and logs an explicit
  "address not configured — routes will 503" boot line.
- **OpenAPI:** the route + `StateViewPaymentSnapshot`, `StateViewVaultHealth`,
  `AgentStateResponse` schemas were added to
  `apps/backend/docs/openapi.json` (the openapi-wiring test asserts every
  registered route appears in the spec, so this was mandatory, and it passes).

## 3. Keeper verification (Wave-1 ProofUsed log derivation vs the new ABI)

No code changes were needed — confirmed compatible:

- `TEE_VERIFIER_ABI` carries the new `ProofUsed(bytes32 indexed nonce,
  uint256 indexed timestamp)`. ethers computes topic0
  `0xfed988acc851f61b49ed5195271523fe601f9d547e09655f72c6afe920cff499` from this
  exact shape, and `fetchProofUsedNonces` (`queryFilter("ProofUsed", …)`) binds
  by event name, so `verifierRaw.queryFilter` resolves correctly against the
  new ABI (the previous W1 shape had no data section either — indexed
  `nonce,timestamp` decode positionally into `log.args[0]`).
- `canonicalNonceHex` (`keepers/index.ts`) normalizes each `args[0]` bytes32 to
  canonical `0x` + 64-hex — unchanged behavior; dedupe + 256 batch clamp intact.
- **Fallback path intact:** `deriveCandidates()` still prefers the live log
  scan and falls back to `AXIOM_KEEPER_NONCES` when the verifier predates the
  event (no `verifierRaw`), the scan returns empty, or the scan throws. All
  18 existing keeper tests pass, plus a new ABI-shape assertion test (below).
- The verifier address remains env-configurable (`AXIOM_TEE_VERIFIER_ADDRESS`,
  pre-existing).

## 4. Test inventory + exact bun test output

### New tests

**`apps/backend/src/indexer/events.w3b.test.ts`** (11 tests)

| # | Test | Covers |
| --- | --- | --- |
| 1 | ProofUsed > decodes nonce + timestamp | envelope fields + payload typing |
| 2 | ProofUsed > normalizes nonces to canonical 0x + 64 hex | `canonicalNonceHex` path shared with keepers |
| 3 | ProofUsed > topic0 matches ethers hash of the new ABI shape | guards against config-lane ABI drift silently unbinding the parser |
| 4 | DelegationInstalled > decodes all five fields | indexed topics + non-indexed `(uint64,uint256,uint256)` tail |
| 5 | DelegationRevoked > decodes the tokenId | single-indexed shape |
| 6 | DelegatedExecuted > decodes value-carrying execute | `(uint256 value, bytes32 actionHash)` tail |
| 7 | registry event topic0s are distinct and registered | TOPIC_TABLE + `KNOWN_EVENT_NAMES` |
| 8 | Updated > `newDatas` array length maps to `newDatasCount` | V3 tuple-array shape re-verified with a real ABI-encoded data section |
| 9 | unset registry address drops only the registry watch group | optional-address watch-list behavior |
| 10 | set address adds exactly the three registry events | env-driven enablement |
| 11 | invalid registry address fails loudly | checksum/hex validation |

**`apps/backend/src/routers/stateview.test.ts`** (6 tests) — fake-provider
pattern matching `governance.test.ts` (selector-matched `provider.call`):
both-reads-ok shape, `?payer=` forwarding into calldata (word-level assert),
partial failure (200 + `errors`), total failure (502), unset address (503
`ADDRESS_NOT_CONFIGURED`), non-numeric id (400).

**`apps/backend/src/keepers/index.test.ts`** — existing 18 keeper tests all
green against the new ABI (log-derived candidates, dedupe/clamp, empty-stream
fallback, failed-scan fallback, env-fallback stub path), **plus 1 new test**:
`fetchProofUsedNonces > resolves ProofUsed from the current (V3)
TEE_VERIFIER_ABI shape` — asserts topic0 against the hardcoded hash of the new
event shape and that nonce derivation still decodes positionally, guarding
against config-lane ABI drift.

### Exact bun test output

```text
$ cd apps/backend && bun test

 199 pass
 0 fail
 6 expect() calls
Ran 199 tests across 43 files. [4.09s]
```

Baseline was **181 pass** (verified before any edits); lane B added **18**
(11 parser + 6 route + 1 keeper ABI-shape) → **199**. Fully green.

Companion runs:

- `packages/config` (`bun test`): **53 pass, 0 fail** — the `addresses.ts` /
  `index.ts` edits are covered.
- `tsc --noEmit` in `apps/backend` and `packages/config`: **0 errors**.

## 5. Integration notes — what must be set when the deploy lane finishes

Backend env additions (all optional; the backend boots and serves with them
unset, returning 503s on the affected surfaces until they are published):

| Env var | Consumer | Effect when set |
| --- | --- | --- |
| `AXIOM_DELEGATION_REGISTRY_ADDRESS` | indexer watch list (indexer/events.ts, indexer/index.ts) | starts watching `DelegationInstalled` / `DelegationRevoked` / `DelegatedExecuted` |
| `AXIOM_STATE_VIEW_ADDRESS` | `GET /v1/agents/:id/state` (routers/stateview.ts) | route flips from 503 `ADDRESS_NOT_CONFIGURED` to live reads |

Notes for the deploy lane:

1. Set both in the backend's `.env` (or the process environment). The values
   go through `resolveAddress` → viem `getAddress`, so mixed-checksum input
   throws at boot — copy addresses exactly.
2. Existing required vars (`AXIOM_AGENT_NFT_ADDRESS`,
   `AXIOM_STRATEGY_VAULT_ADDRESS`, `AXIOM_TEE_VERIFIER_ADDRESS`,
   `AXIOM_PAYMENT_PROCESSOR_ADDRESS`, payment token) are unchanged. The
   indexer additionally performs a live `getCode` check at boot
   (`resolveLiveAddresses`) — redeployed-at-a-new-address proxies must have
   code before backend restart or the affected routes will drop out (warned,
   not fatal).
3. No `.env` edits were made by this lane (explicitly out of scope).
4. `ProofUsed` (TeeVerifier) needs no new env — the verifier address already
   exists; the indexer watch and keepers' log scan activate with the new
   contract's logs automatically.
5. The event store (`events.json`) is schema-flexible: new event kinds persist
   and round-trip without migration; `/v1/events` accepts the new names
   immediately (`QUERYABLE_EVENT_NAMES` derives from `EVENT_SOURCES`).
6. FE follow-up (not this lane): the pre-flight fan-out can switch to
   `GET /v1/agents/{id}/state` — response shape documented in `openapi.json`.

## 6. Files changed (all uncommitted)

**Lane B's diff:**

- `apps/backend/src/indexer/events.ts` — +4 events (EVENT_SOURCES, AxiomEvent
  variants), optional `AXIOM_DELEGATION_REGISTRY` in `resolveIndexerAddresses`
- `apps/backend/src/indexer/parser.ts` → `events/parser.ts` — 4 parser handlers
- `apps/backend/src/indexer/index.ts` — watch groups (`ProofUsed`, registry
  group), `buildDefaultWatchList` optional-address filtering
- `apps/backend/src/routers/stateview.ts` — **new** (route + helpers)
- `apps/backend/src/routers/stateview.test.ts` — **new** (6 tests)
- `apps/backend/src/indexer/events.w3b.test.ts` — **new** (11 tests)
- `apps/backend/src/config-types.ts` — optional `stateView` /
  `delegationRegistry` address slots
- `apps/backend/src/index.ts` — optional address resolution + boot log
- `apps/backend/src/server.ts` — register `registerStateViewRoutes`
- `apps/backend/docs/openapi.json` — route + 3 schemas
- `packages/config/src/addresses.ts` — `delegationRegistry` / `stateView`
  names, `resolveAddressOptional`
- `packages/config/src/index.ts` — re-export `resolveAddressOptional`
- `docs/v3-proposals/waves/w3-b-backend-integration.md` — **this deliverable**

**Working-tree files owned by other lanes (untouched by lane B):** abis/*
changes, `.env.example`, `apps/frontend/*`, `apps/contracts/*`,
`docs/deployments/galileo-v3-2026-08-31.json`, `IERC7857.sol` comment.

## 7. Risks / residuals

1. `DelegatedExecuted` watcher activates only post-deploy (by design). Until
   then the registry's `delegatedExecute` activity is invisible to the event
   store — acceptable for the pre-deploy window.
2. `paymentSnapshot` with the zero-address payer returns processor-level caps
   but likely zero allowance/balance; FE should always pass `?payer=` for
   per-wallet gating (documented in the spec description).
3. The `Updated` parser surfaces only `newDatasCount`, not the full payload —
   matches the pre-W3 contract and keeps event payloads small; extend if a
   consumer needs per-item hashes.
4. The keeper's `verifierRaw` is skipped when a test stubs `verifier` —
   pre-existing seam, unchanged; production always has `verifierRaw`.
