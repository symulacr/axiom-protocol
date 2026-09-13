# Wave 6 lane B — axmWETH mock, testnet USDC faucet, chat/FE surfacing, Pyth prices (V3 W6-B)

- **Type:** implementation report (mocks-only on the contract side; lane A owns `AxiomPaymentProcessor.sol`)
- **Date:** 2026-08-31
- **Base:** `676c4bd` ("feat(v3-w5): timelock delay 1 day -> 20 minutes"); HEAD verified clean at start
- **Companion lane:** W6-A (swap/LP/lend on AxiomPaymentProcessor — its modified `AxiomPaymentProcessor.sol`, `ISignatureTransfer.sol`, swap tests, and regenerated `paymentProcessor.ts` ABI are in the same working tree; not touched by this lane)

---

## 1. Part 1 — axmWETH mock token

### 1.1 Contract

`apps/contracts/src/mocks/AxiomMockUSDC.sol` now hosts two contracts (per brief: same file, no new file):

- `AxiomMockUSDC` — unchanged (6 decimals, `mint()` permissionless).
- `AxiomMockWETH` — new: `"Axiom Mock WETH"` / `"axmWETH"`, **18 decimals** (OZ default, no override), same permissionless `mint(to, amount)`.

NatSpec header updated to name both tokens and their roles. Solhint: 0 errors (warnings are pre-existing patterns: `one-contract-per-file`, constructor-visibility — matches the file's original state). `forge build`: **Compiler run successful** (warnings only, all from OZ lib / lane A files).

### 1.2 Deploy script

`apps/contracts/script/DeployMockWETH.s.sol` (NEW) — simple broadcast of the axmWETH deploy + post-checks (`symbol == "axmWETH"`, `decimals == 18`) + `console2.log` of the address.

- Key discipline: `DEPLOYER_PK` read via `vm.envUint` from `../../.env` `TEE_SIGNER_PK` at run time; never printed or logged.
- Invocation documented in the script header: `--legacy --gas-price 2100000000 --slow` (matches recent Galileo deploys), chain-id asserted `16602` via `WrongChain` revert.
- **No broadcast performed** — parent orchestrates deploys (brief constraint).

### 1.3 generate-abis.sh — coordination note

Brief: "run it at the END so both lanes' ABIs land; check if lane A's artifacts exist in out/ first". Lane A's artifacts were present (`out/AxiomPaymentProcessor.sol/AxiomPaymentProcessor.json` etc.), so the script **was run**; 7 ABIs regenerated. Findings:

- `generate-abis.sh` maps `forge inspect AxiomMockUSDC abi` → `MOCK_USDC_ABI`. Because the mock file now holds **two** contracts, bare `forge inspect <file>` errors ("Multiple contracts found"); the script's by-contract-name call still resolves the USDC half correctly, so `packages/config/src/abis/mockUsdc.ts` and `packages/config/abi/AxiomMockUSDC.json` remain USDC-only — unchanged ABI surface for all existing consumers (the relayer faucet mints via a local 4-line `mint()` ABI fragment, not the generated file).
- A WETH ABI entry (`AxiomMockWETH` in `CONST_NAMES`/`CONTRACTS`) is a one-line follow-up for whoever consumes it from config; not added here because no W6-B code reads axmWETH's ABI and lane A owns the script's consumer surface.
- One regen side-effect (`packages/config/src/abis/gasTank.ts` lost its hand-added provenance comment lines) was reverted; lane A's `paymentProcessor.ts` regen diff is theirs.

---

## 2. Part 2 — 1,000-axmUSDC faucet via the relayer

### 2.1 Flow (diagram-in-text)

```text
first relay (either lane)                relayer (backend)
┌──────────────────────────┐   POST /v1/relayer/sponsor   ┌─────────────────────────────┐
│ browser FE "Claim" /     │ ───────────────────────────▶ │ recover → simulate → gate → │
│ chat tool / any sponsor  │                              │ queue.enqueue (user op)     │
│ op — user-signed fwd req │                              │      │                      │
└──────────────────────────┘                              │      ▼ dripOnFirstRelay()   │
                                                          │  fauceted set? balanceOf ≥  │
POST /v1/relayer/faucet/:address (Claim button,           │  1e6? → enqueue faucet-mint │
no user signature — mint is permissionless) ────────────▶ │  op (maxGasCost 0, marker)  │
                                                          │      │                      │
                                                          │      ▼ relayer key          │
                                                          │  axmUSDC.mint(user, 1000e6) │
                                                          │  → markConfirmed / on mint  │
                                                          │    failure markFailed +     │
                                                          │    unmark (retryable)       │
                                                          └─────────────────────────────┘
```

- **Module:** `apps/backend/src/relayer/faucet.ts` (NEW) — `Faucet` class with `dripOnFirstRelay()`, `statusOf()`, `execute()`; `buildFaucetRecord()` shapes the distinct op kind (`op: "faucet-mint"` marker on the queue record; `isFaucetRecord()` / `faucetAmountOf()` accessors) so reconcile/submit can tell it from user ops while reusing the same queue machinery.
- **Trigger:** the sponsor route calls `deps.faucet.dripOnFirstRelay(recovered)` (fire-and-forget) after a successful enqueue — a user's FIRST relay drips; failures never block the user op.
- **Dedup:** in-memory `fauceted` set + best-effort on-chain gate `balanceOf(user) < 1e6` (1 axmUSDC). Balance-gate failures log-and-pass-open (drip is one-per-process-lifetime per address); a failed mint unmarks the address so a later relay retries.
- **Broadcast:** relayer key sends `mint(user, amount)` directly to the axmUSDC (paymentToken) address — relayer-initiated, no user sig, no gasTank.relay().
- **Wiring:** `apps/backend/src/server.ts` constructs the `Faucet` inside the existing relayer boot block (only when mode=on AND relayer key AND paymentToken address exist); passed via `RelayerRouteDeps.faucet`.

### 2.2 Env

| Variable | Where | Default | Notes |
| --- | --- | --- | --- |
| `AXIOM_FAUCET_AMOUNT_USDC` | `packages/config/src/env-schema.ts` + `RELAYER_DEFAULTS.faucetAmountUsdc` | `1000000000` (1000e6) | drip size, base units (6 decimals) |
| `AXIOM_FAUCET_ENABLED` | same + `isFaucetEnabled()` in `packages/config/src/constants.ts` | `true` (testnet posture) | kill-switch; set `false` for mainnet |

`.env` untouched (constraint); both vars are code-parsed with defaults so no `.env.example` change is required for existing deploys.

### 2.3 Endpoints (`apps/backend/src/routers/relayer.ts`)

| Method | Path | Auth tier | Behavior |
| --- | --- | --- | --- |
| GET | `/v1/relayer/faucet/:address` | server or client (added to `CLIENT_ALLOWED_ROUTES`) | `{ eligible, amount, token: "axmUSDC" }`; `400 VALIDATION_ERROR` on malformed address; `503 ADDRESS_NOT_CONFIGURED` when relayer off |
| POST | `/v1/relayer/faucet/:address` | server or client | `{ ok, dripped, reason? }` — enqueue + immediate broadcast of the drip; `dripped:false` when already fauceted/ineligible |

Both mounted via `createRoute` (GET and POST are separate registrations — route-factory mounts one method per call). OpenAPI spec + `generate-openapi.mjs` updated (`FaucetStatus`, `FaucetClaim` schemas); spec regenerated: **59 paths, 63 operations, 104 schemas**.

---

## 3. Part 3 — chat + FE surfacing

### 3.1 Chat tool

- `packages/config/src/chat-tools.ts`: new `faucet_status` **read** tool (`requiresWallet`, capabilities `["read","faucet"]`, friction low) — flows through `CHAT_TOOL_CATALOG`/`CHAT_BENCH_*` automatically.
- `packages/chat-runtime/src/executors/read.ts`: new `case "faucet_status"` — proxies `GET /v1/relayer/faucet/<session wallet>`; `Wallet not connected` guard; backend error surfaced verbatim.

### 3.2 Frontend

- `apps/frontend/src/hooks/useFaucet.ts` (NEW): live axmUSDC `balanceOf` (formatted at 6 decimals) + eligibility from the GET endpoint; `claim()` POSTs `/v1/relayer/faucet/:address` — no signature lane (mint is permissionless).
- `apps/frontend/src/components/axiom/GasTankCard.tsx`: sibling row `gas-tank-card__faucet` — "Test tokens" balance line + eligibility badge + Claim button (claim disabled while in-flight; ineligible badge otherwise). Card's disabled-when-unset gate unchanged.
- `apps/frontend/src/lib/copy.ts`: `faucetBalanceLabel` / `faucetEligibleBadge` / `faucetIneligibleBadge` / `faucetClaimAction` in **en/fr/de** (type + 3 locale blocks). Wording avoids the repo's i18n-forbidden token-symbol hardcoding (`copy.test.ts` i18n contract passes).

---

## 4. Part 4 — Pyth price feed (backend-only, v1 off-chain)

### 4.1 Module

`apps/backend/src/oracle/pyth.ts` (NEW):

- `PYTH_FEED_IDS` — hardcoded top-15 map (BTC ETH SOL USDC ARB OP AVAX LINK POL DOGE ADA XRP BNB WBTC WETH), ids `0x`+64-hex. Every id was **verified live** against Hermes feed metadata (`/v2/price_feeds?query=<SYM>/USD`); canonical source cited in-file: pyth.network/developers/price-feed-ids. Note: Pyth migrated MATIC→POL; the map uses the live `POLUSD` feed (kept under key `POL`).
- `HERMES_URLS` — `https://hermes.pyth.network` primary, `https://hermes-beta.pyth.network` fallback; per-request 5s timeout.
- `PythOracle.latestAll()` — one `GET /api/latest_price_feeds?ids[]=…` call, parsed into `{ symbol, price, confidence, expo, publishedAt }` (expo applied to BigInt math; `publishedAt` = publish_time × 1000), 30s in-memory TTL cache (reuses `TTLCache`).
- `getPrice(symbol)` / `suggestedMinOut(outSymbol, expectedOut, slippageBps)` — typed single-price + slippage-sanity helpers the FE/swap UI can call (lane A's swap supplies the `minOut` value; this is the price source only).
- `getPythOracle()` / `setPythOracle()` — lazy shared instance + test seam. Graceful degrade: total Hermes failure throws internally, `pythPricesOrEmpty()` catches and reports `ok:false` — **no fabricated prices**.

### 4.2 Endpoint

`GET /v1/prices` (`apps/backend/src/routers/prices.ts`, NEW; registered in `server.ts`):

- `200 { prices: [...] }` with `Cache-Control: public, max-age=30`.
- `503 PRICES_UNAVAILABLE` when both Hermes URLs fail.
- Auth: added to `CLIENT_ALLOWED_ROUTES` (client/browser keys can read public market data, mirroring the skills pattern).
- OpenAPI: `PricesResponse` schema added; spec regenerated.

### 4.3 Which Hermes URL worked

**Neither, from this environment.** Both clusters returned `401 unauthorized` on every price-bearing path (`/api/latest_price_feeds`, `/v2/updates/price/latest`, `/v2/updates/price/stream`) while metadata paths (`/v2/price_feeds`) served normally. Probing showed the gate is entitlement-based (a Bearer header produces `403 "Not entitled: feed … (invalid API key)"` vs. the bare `401`), i.e. the operator's edge/authz layer now requires API keys for price data; feed **metadata** (id lookup) remains open. Mitigations in the implementation: dual-URL failover already coded; `AXIOM_HERMES_URLS`-style override is trivial if an entitled key/host is provisioned (the `PythOracle` constructor accepts `urls`/`fetchImpl`). All oracle tests use mocked fetch and pass; live price verification is the one item that could not be exercised end-to-end from this box and is flagged to the orchestrator.

---

## 5. Test inventory (before → after)

| Suite | Baseline | Now | New tests (this lane) |
| --- | --- | --- | --- |
| `@axiom/config` | 59 | **60 pass** (+1) | `relayer.test.ts`: faucet defaults/env-override + `isFaucetEnabled` kill-switch (merged with the defaults case) |
| `@axiom/chat-runtime` | 90 | **93 pass** (+3) | `executors/sponsor.test.ts` `faucet_status` (3): proxy+eligibility shape; no-wallet `toolFail`; backend-error surfacing |
| `@axiom/backend` | 224 | **243 pass** (+19) | `relayer/relayer.test.ts` (+8): first-relay drip / no re-faucet; balance gate; disabled flag; GET eligibility; POST claim + repeat; 503 relayer-off; failed-mint rollback; `buildFaucetRecord` marker contract. `oracle/pyth.test.ts` (+11): feed-id map shape (15 symbols); Hermes URL list; expo parsing; 30s cache hit/miss; degrade-throw; primary→fallback retry; `getPrice` unknown symbol; `suggestedMinOut` slippage + bad inputs; `pythPricesOrEmpty` degrade + shared-instance seam |
| `@axiom/frontend` | 153 | **160 pass** (+7, 0 new-code fails) | `hooks/useFaucet.guard.test.ts` (4): faucet row render states; POST-claim/no-signature transport; 6-decimal balance read; copy strings present in type + 3 locales. `useGasTank.card.test.ts` count unchanged. Two **pre-existing** failure classes unrelated to this lane remain: (a) `usePaymentSnapshot.guard.test.ts` "snapshot shape" — a formatter reformatted the hook's destructuring to multi-line at/before HEAD, breaking that guard's single-line string match (verified failing with this lane's files stashed; guard test byte-identical to HEAD; fix is lane-A/owner follow-up); (b) two git-ignored `e2e/*.spec.ts` Playwright files error under `bun test` when the runner sweeps them (excluded via `bun test src`, they don't affect the tracked suite) |
| **Total** | 526 | **556 pass** | +30 net (tsc clean on backend / chat-runtime / config / frontend; `forge build` clean) |

---

## 6. Constraints audit

- No edits to `apps/contracts/src/AxiomPaymentProcessor.sol` **by this lane** — the working tree contains lane A's own W6-A modifications to that file (verified untouched after lane B's file loss/recovery; content re-derived from lane A's committed-in-flight state).
- No suppressions/`TODO`s added; no keys printed; no deploys broadcast; `.env` untouched.
- All changes left **uncommitted** per brief.
