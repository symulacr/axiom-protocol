# Wave 5 lane B — off-chain relayer, chat integration, FE tank UX (V3 W5-B)

- **Type:** implementation report (off-chain lane; no contract edits by this lane)
- **Date:** 2026-08-31
- **Base:** `8a0f253a6` ("contracts(v3-w4): fold StateView into Processor — 6 to 5 contracts"), working tree clean at start
- **Companion doc:** `w5-plan-gastank-contract.md` (lane A, contract side)
- **Scope:** relayer module + HTTP surface, chat-runtime sponsor lane + `gas_tank_status`, FE tank UX (hook/card/badge/banner), env contract, tests

---

## 1. Relayer (apps/backend + packages/config)

### 1.1 Architecture

```text
browser/chat executor                     backend relayer
┌─────────────────────┐   POST /v1/relayer/sponsor   ┌──────────────────────────────┐
│ wallet.sponsor()    │ ───────────────────────────▶ │ recover EIP-712 signer       │
│ (signs ForwardReq)  │                              │ → simulate (eth_call)        │
└─────────────────────┘                              │ → sponsor gate (bucket+caps) │
                                                     │ → queue.enqueue              │
                                                     └──────────┬───────────────────┘
                                                                │ worker loop (interval)
                                                     ┌──────────▼───────────────────┐
                                                     │ relay() broadcast (relayer   │
                                                     │ PK) → Relayed-log reconcile  │
                                                     │ → confirmed / dead-letter    │
                                                     └──────────────────────────────┘
```

- **Queue** (`src/relayer/queue.ts`) — in-memory FIFO with per-user inflight cap
  (`AXIOM_RELAYER_SPONSOR_MAX_INFLIGHT_PER_USER`, default 2), reservation
  accounting (`reservedWei(user)` = sum of unconfirmed `maxGasCost`, risk §5),
  and dead-lettering on broadcast failure (single strike: the op is retryable
  client-side with a fresh nonce; looping burns relayer gas — plan §2.3 note).
  In-memory by design: signatures carry deadlines; clients re-submit on timeout.
- **Sponsor gate** (`src/relayer/sponsor.ts`) — per-user token bucket keyed on
  the **RECOVERED** EIP-712 signer (`SPONSOR_RATE_PER_MIN`, default 6/min) +
  `maxGasCost` ceiling (`SPONSOR_MAX_GAS_COST_WEI`, default 0.001e18).
- **Reconcile** (`src/relayer/reconcile.ts`) — Relayed-log scan over
  `LOG_LOOKBACK_BLOCKS` marks submitted records confirmed. `success:false` is a
  **normal terminal state** (target reverted; the relay itself succeeded — plan §7 #7).
- **Worker** (`src/relayer/index.ts`) — batch drain (`BATCH_MAX`, max 64) on
  `AXIOM_RELAYER_INTERVAL_MS`; reconcile on `AXIOM_RELAYER_RECONCILE_INTERVAL_MS`.
  Timers unref'd; stopped on httpServer close.
- **Mode gating** — routes always mount (they self-503 while `gasTank` is unset);
  the worker boots only when `AXIOM_RELAYER_MODE=on` **and** the address + key
  resolve. `NODE_ENV=production` with `mode=on` and missing `AXIOM_GAS_TANK_ADDRESS` /
  `AXIOM_RELAYER_PK` **refuses to start** (risk §1 fail-start).

### 1.2 Endpoints

| Method | Path | Auth tier | Description |
| --- | --- | --- | --- |
| POST | `/v1/relayer/sponsor` | server or client (browser) | EIP-712 ForwardRequest + userSig → simulate → gate → queue. `202` `{ok,id,nonce,sponsored:true}`; `400` `INVALID_SIGNATURE`/`INVALID_SIGNER`/`DEADLINE_PASSED`/`SIMULATION_FAILED`/`MAX_GAS_COST_EXCEEDED`; `402` `TANK_EXHAUSTED`; `429` `SPONSOR_RATE_LIMITED`/`SPONSOR_INFLIGHT_LIMIT`; `503` `ADDRESS_NOT_CONFIGURED`/`RESERVE_EXHAUSTED` |
| GET | `/v1/relayer/tank/:address` | server or client | Tank view: `balance`, `grants`, `grantsCap`, `grantsLeft`, `gasGrant` (live read), `opsLeft`, `reserve`, `nextNonce` (sequential, lane A) |
| GET | `/v1/relayer/status` | server or client | `mode on/off`, address, relayer address, admission knobs, queue counters |

Request schema `sponsorBodySchema` (`src/route-schemas.ts`): `user`/`target` as
`addressViem`, `data`/`signature` as `hexViem`, `maxGasCost`/`nonce`/`deadline`
as decimal strings (bigint-on-the-wire rule M2). OpenAPI: 3 new routes + 4 new
schemas (`SponsorBody`, `SponsorAccepted`, `RelayerStatus`, `RelayerTank`) —
regenerated via `bun run generate:openapi`, 57 paths / 60 operations / 101 schemas.
The wiring test's route-coverage check passes; it also exposed a **pre-existing
spec omission** for `GET /v1/agents/{id}/state` (route mounted in W4, entry
missing from the generator) which this lane restored in the generator.

### 1.3 Auth (§6 item 12)

`CLIENT_ALLOWED_ROUTES` (`packages/config/src/middleware/auth.ts`) gains:

- `GET /v1/relayer/tank/*` + `GET /v1/relayer/status`
- `POST /v1/relayer/sponsor`

Without these, browser keys (`AXIOM_CLIENT_API_KEY`) get `403 CLIENT_PATH_DENIED`.

---

## 2. Chat integration (packages/chat-runtime)

### 2.1 Tool/tool-status table (phase-1)

| Tool | Class | Sponsor lane | Status surface |
| --- | --- | --- | --- |
| `withdraw` | encode | **yes** (phase-1) | result envelope `sponsored:true` + `relayerNonce`; FE badge |
| `pay_for_agent` | encode | **yes** (phase-1) | same |
| `deposit` | encode | no (payable — relay() forwards data only) | unchanged |
| `mint_agent` | encode | no | unchanged (wallet lane) |
| `transfer` | encode | no (UI flow) | unchanged |
| `gas_tank_status` | **read (new)** | — | balance, grantsUsed/Cap/Left, `gasGrant` (live), `opsLeft`, `sponsored` |

`SPONSORED_TOOLS = ["withdraw","pay_for_agent"]` (`packages/config/chat-tools.ts`)
with `isSponsoredTool()` guard.

### 2.2 Sponsor lane (§2.3) — `executors/encode.ts`

`executeSponsoredOrWallet()` runs the fallback ladder:

1. **Sponsor lane** (only phase-1 tools, value-free ops, transport exposes
   `wallet.sponsor`): read `/v1/relayer/tank/:user` → headroom check
   (`balance >= maxGasCost || grantsLeft > 0`) → wallet signs the EIP-712
   ForwardRequest (capability returns `{signature}` **only** — the executor
   never sees key material) → POST `/v1/relayer/sponsor` with
   `deadline = now + 600s`.
2. `TANK_EXHAUSTED` (402) → **terminal** `toolFail` naming both remedies
   (deposit via GasTank UI / connect wallet). No wallet-lane fallback: signing
   directly does not fix an empty tank better than the user deciding explicitly.
3. Transient failures (rate limit, relayer off, network) → **fall through** to
   the wallet lane (sign+send) or the encode-only envelope.

Result envelope on success: `{ ok:true, …, sponsored:true, relayerNonce,
relayerId?, sponsoredMaxGasCost }`.

### 2.3 `gas_tank_status` read tool — `executors/read.ts`

Direct chain reads when `ctx.chain.readContract` is available (`balanceOf`,
`grantsUsed`, `grantsCap`, `gasGrant` — **gasGrant read live, never
hardcoded**); otherwise falls back to `GET /v1/relayer/tank/:owner`. Reports
`sponsored: balance > 0 || grantsLeft > 0` (lazy-grant semantics).

### 2.4 Prompt rule (§3)

`GAS-TANK` block added as the 5th rule, **immediately after PLAN TRACKING**
(byte-stable head; snapshot test pins the one-separator adjacency). Content:
withdraw/pay_for_agent normally run gas-free via the GasTank; on exhaustion
name the two remedies; use `gas_tank_status` before predicting sponsorship.

### 2.5 Transport type

`ToolWallet.sponsor?(req: SponsorRequest) → Promise<{signature}>` — optional
capability; `SponsorRequest` mirrors the on-chain `ForwardRequest` exactly
(user, target, data, maxGasCost, nonce, deadline).

---

## 3. Frontend (apps/frontend)

| Piece | File | Notes |
| --- | --- | --- |
| Address accessor | `src/abi/addresses.ts` | `getAxiomGasTankAddress()` via `resolveAddressOptional` (`VITE_GAS_TANK_ADDRESS`); undefined until deploy |
| Hook | `src/hooks/useGasTank.ts` | ONE `aggregateReads` batch (balanceOf, grantsUsed, grantsCap, gasGrant); env-gated early return → null tank; derived `opsLeft`/`sponsored`/`grantsLeft` via pure helper `gasTank.helpers.ts` |
| Card | `src/components/axiom/GasTankCard.tsx` | balance + ops-left + grants bar + refill button (grant claim) + deposit field with 0.01 min; `gas-tank-card--unset` disabled-when-unset state |
| Sponsor impl | `src/chat/transport-browser.ts` | `signTypedDataAsync` (wagmi) signs with domain `{AxiomGasTank, "1", chainId, gasTank}` + `GAS_TANK_FORWARD_REQUEST_TYPES`, `primaryType: "ForwardRequest"` → `{signature}` |
| Badge | `src/chat/MessageAtoms.tsx` | "sponsored" pill on successful tool cards whose result envelope has `sponsored:true` |
| Error mapping | `src/utils/format.ts` | `humanizeError`: tank-exhausted → user remedies; reserve-exhausted → operator-side, wait; sponsor rate limit → wait |
| Tank strip | `src/pages/ChatPage.tsx` (`TankStrip`) | low-tank `ChatBanner` when `sponsored:false`; silent when unset/no wallet (wallet-less first-run) |
| Mounts | `SettingsPage.tsx`, `DashboardPage.tsx` | GasTankCard in settings signing-context block + dashboard stats section |
| Copy | `src/lib/copy.ts` | `gasTank` section in Copy type + en/fr/de locales |
| Env types | `src/env.d.ts` | `VITE_GAS_TANK_ADDRESS?: string` |

---

## 4. Env contract (§5, complete table)

| Variable | Where parsed | Default | Notes |
| --- | --- | --- | --- |
| `AXIOM_RELAYER_MODE` | `packages/config/src/env-schema.ts` | `off` | `on`/`off` |
| `AXIOM_RELAYER_INTERVAL_MS` | same (optional) | 3000 | worker cadence |
| `AXIOM_RELAYER_BATCH_MAX` | same | 64 | **max 64** (schema-capped) |
| `AXIOM_RELAYER_GAS_CAP_GWEI` | same (optional) | 2 (`RELAYER_DEFAULTS`) | broadcast gas-price ceiling |
| `AXIOM_RELAYER_LOG_LOOKBACK_BLOCKS` | same (optional) | 2000 | Relayed-log reconcile window |
| `AXIOM_RELAYER_RECONCILE_INTERVAL_MS` | same | 60000 | reconcile cadence |
| `AXIOM_RELAYER_SPONSOR_RATE_PER_MIN` | same | 6 | per-user token bucket |
| `AXIOM_RELAYER_SPONSOR_MAX_GAS_COST_WEI` | same | `1000000000000000` (0.001e18) | user-signed ceiling |
| `AXIOM_RELAYER_SPONSOR_MAX_INFLIGHT_PER_USER` | same | 2 | queue admission |
| `AXIOM_GAS_TANK_ADDRESS` | `apps/backend/src/env-schema.ts` + `packages/config/src/addresses.ts` | unset | optional; fail-start in prod when mode=on |
| `AXIOM_RELAYER_PK` | `apps/backend/src/env-schema.ts` | unset | hex; fail-start in prod when mode=on; never printed |
| `VITE_GAS_TANK_ADDRESS` | `apps/frontend/src/abi/addresses.ts` | unset | FE gate; unset = tank UI disabled |

Non-env resolution: `getRelayerConfig()` in `packages/config/src/constants.ts`
(browser-safe, mirrors `getRuntimeConfig`) with `RELAYER_DEFAULTS`.

---

## 5. Interface-delta notes vs lane A (assumptions adapted to committed source)

The interface spec in the brief was written before lane A's source landed
mid-flight; `apps/contracts/src/AxiomGasTank.sol` was read and all deltas
adapted. The plan's §7 cross-lane table is updated accordingly:

| # | Spec draft (this lane's starting point) | Lane A committed source | Adaptation |
| --- | --- | --- | --- |
| 1 | `Relayed(uint256 indexed nonce, address indexed user, address indexed target, bool success)` | `Relayed(address indexed user, address indexed relayer, address indexed target, bool success, uint256 measured, uint256 reimburse, uint256 nonce)` — **nonce is the trailing UNINDEXED arg** | reconcile key changed to `user:nonce` from log args (`reconcile.ts`); ABI regenerated from artifact |
| 2 | `error ReserveDepleted()` | `error ReserveExhausted()` | router maps both strings (belt-and-braces), typed code `RESERVE_EXHAUSTED`; openapi updated |
| 3 | `grantsOf(address) → uint256 count` | **public mapping `grantsUsed(address)`** (no `grantsOf`) | tank view reads `grantsUsed`; `gas_tank_status` likewise |
| 4 | `refill()` | **`grantCredit()`** returns `uint256 credited`; reverts `TankExhausted` when `balance >= gasGrant` | FE refill button targets `grantCredit()` semantics; button disabled unless tank empty + grants left |
| 5 | `getNonce(address) → uint256` next-nonce | **public mapping `nonces(address)`** — sequential per user (confirmed sequential ✓) | tank view returns `nextNonce: nonces(user)`; sponsor lane reads it before signing |
| 6 | `relay(ForwardRequest, userSig)` (+ optional merkleProof per plan §2.2) | `relay(ForwardRequest calldata req, bytes calldata userSig)` — **no merkleProof arg** | relayer simulate/broadcast encode exactly 2 args; selector-allowlist root lives elsewhere in lane A's design |
| 7 | `grantsCap()`, `gasGrant()` admin-tunable, read live | confirmed: public storage vars + `capSettings()` view | all consumers read live; guard tests forbid hardcoded 0.01e18 |
| 8 | EIP-712 domain "AxiomGasTank"/"1" over ForwardRequest(user,target,data,maxGasCost,nonce,deadline) | **confirmed** (`EIP712("AxiomGasTank","1")`, typehash verbatim) | `packages/config/eip712.ts` constants + FE signing use exactly this |
| 9 | — | ERC-1271 dual-path sig check in `_verifySig` (contract wallets supported) | no relayer change needed; `verifyTypedData` EOA path matches |
| 10 | — | `TankExhausted` also fires inside lazy grant when `gasReserve < gasGrant`? **No** — lane A distinguishes `ReserveExhausted` there | relayer surfaces the distinction (402 user-side vs 503 operator-side), per plan §7 #2 |

ABI provenance: `packages/config/src/abis/gasTank.ts` was first generated from
the spec draft (marked for regen), then **regenerated from lane A's forge
artifact** (`apps/contracts/out/AxiomGasTank.sol/AxiomGasTank.json`, 69 entries)
using the repo's `generate-abis.sh` converter logic once lane A's build landed.
Lane A's `generate-abis.sh` anchors (`CONST_NAMES[AxiomGasTank]=GAS_TANK_ABI`,
`CONTRACTS` array, `ts_name="gasTank"`) match — future regens are drop-in.

---

## 6. Test inventory (before → after)

| Suite | Before | After | New tests |
| --- | --- | --- | --- |
| `@axiom/config` | 53 pass | **59 pass** (+6) | `relayer.test.ts`: 402 constant; SPONSORED_TOOLS set; relayer defaults+overrides; optional gasTank address; EIP-712 domain/types parity; lane A ABI delta pins |
| `@axiom/chat-runtime` | 77 pass | **90 pass** (+13) | `executors/sponsor.test.ts` (12): withdraw/pay sponsor lane, headroom, TANK_EXHAUSTED terminal, capability-less fallback, encode-only contract, rate-limit fall-through, mint not sponsored; `gas_tank_status` (5 paths incl. live-grant read + backend fallback). `prompt.test.ts` (+1): GAS-TANK rule position/content |
| `@axiom/backend` | 199 pass | **224 pass** (+25) | `relayer/relayer.test.ts` (20): EIP-712 recovery parity; 202+queue; INVALID_SIGNER; deadline; TankExhausted→402; ReserveExhausted→503; maxGasCost→402; token bucket 429; inflight cap 429; schema 400; dead-letter; tank 503-unset; status on/off; queue (cap/reservedWei/FIFO); gate; tankResponse. `env-schema.test.ts` (+5): relayer block defaults/enums/caps/bigint. Wiring/server regression green (route coverage incl. restored `/v1/agents/{id}/state`) |
| `@axiom/frontend` | 139 pass + **1 pre-existing fail** | **153 pass, 0 fail** (+13 net) | `useGasTank.guard.test.ts` (4): one-multicall shape; live gasGrant (no hardcoded 0.01e18); env-gated early return; sponsored predicate. `useGasTank.card.test.ts` (9): humanizeError tank×3; card unset/deposit-min/refill-gate shapes; transport sponsor builder (domain+types+signature-only); ToolContext capability; pure shape derivation |
| **Total** | 468 (467 pass + 1 fail) | **526 pass, 0 fail** | +58 net, incl. the pre-existing FE failure fixed |

The pre-existing FE failure (`usePaymentSnapshot.guard.test.ts` — prettier had
multi-lined the destructuring the guard string-matches) was repaired by
restoring the pinned single-line form in `usePaymentSnapshot.ts`; no guard
loosened.

## 7. Verification evidence (fresh runs)

- `bun run build` (config → chat-runtime → backend): all exit 0
- `bun run --filter @axiom/frontend build`: exit 0 (100 files to dist)
- `bun run typecheck` (all four packages): exit 0
- Backend: `AXIOM_API_KEY= AXIOM_CLIENT_API_KEY= bun test --parallel --max-concurrency=1` → 224 pass / 0 fail
- FE: `bun run test` → 153 pass / 0 fail (26 files)
- openapi.json regenerated deterministically; openapi-wiring suite green
- No `.env` touched; no keys printed; nothing deployed; no TODO/FIXME/console.log
  left in new sources

## 8. Risks & follow-ups (critique §7 continuation)

1. **In-memory queue** — process restart drops queued sponsorships. Signatures
   are deadline-bounded and clients re-submit; if durability becomes a product
   requirement, persist the queue behind the EventStore (same pattern as
   `events/store.ts`). Not done here: smallest viable diff.
2. **Relayer key isolation** — the worker uses `AXIOM_RELAYER_PK` in-process.
   Risk §8 HIGH (relayer compromise ≈ signed-op forgery) is bounded by the
   selector allowlist + caps on-chain and the admission gates off-chain, but the
   key must still be distinct from admin keys in prod (deployment-lane concern).
3. **`opsLeft` semantics** — approximate (floor of `balance / gasGrant`); the
   FE labels it "~ops". Lazy grants make the true number potentially +1.
4. **Wallet-less first-run** — chat-only users without a connected wallet get
   `gas_tank_status` → "Wallet not connected" and encode tools → "Wallet not
   connected" (sponsor signing inherently requires a wallet). Tank UI stays
   silent pre-deploy.
5. **`refill` button phase-1 wiring** — the card's refill action posts to the
   sponsor endpoint; the exact `grantCredit()` calldata path goes through the
   same sponsor lane once lane A publishes the initial selector tree (the card
   currently gates the button and routes via the relayer's sponsored flow —
   backend simulation is the enforcement point).
