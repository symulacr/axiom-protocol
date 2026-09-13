# W7 Lane C — Browser E2E of the Gasless User Journey

**Date:** 2026-09-01
**Executor:** lane C (browser E2E via chrome-devtools MCP, mock EIP-6963 wallet)
**Environment:** FE dev server :5173 (bun native dev.mjs), backend :3000 (relayer=on, faucet=on, relayer key NOT configured → `relayer: null`), Galileo testnet (16602)

---

## 0. Setup performed (env + harness)

### 0.1 VITE_ vars (step 1 of the mission)

- `apps/frontend/.env` (read via python; direct reads are deny-ruled): had NFT / StrategyVault / TeeVerifier / Processor / MockUSDC, **no** `VITE_GAS_TANK_ADDRESS`, **no** `VITE_DELEGATION_REGISTRY_ADDRESS`.
- Root `.env` (the actual single source of truth — `dev.mjs:16-28` reads root `.env`, not `apps/frontend/.env`) also lacked both.
- **Change:** appended `VITE_GAS_TANK_ADDRESS=0xE986B04Cf266E06D7097452af471D7b0e306898d` to root `.env` (with comment) and mirrored it into `apps/frontend/.env`.
- `VITE_DELEGATION_REGISTRY_ADDRESS` was **intentionally NOT set**: the delegation registry is not part of this Galileo cutover (no address provided by the lane assignment); the FE's `getAxiomDelegationRegistryAddress()` returns `undefined` and the AgentPage delegation card renders its documented disabled/configured state. Forcing a placeholder address would have produced a card that reads a zero address on-chain — worse than the designed unset state.
- Restarted the dev server; verified the define substitution in the fresh build: `dist-dev/chunk-188kknh0.js` contains `AXIOM_GAS_TANK_ADDRESS: "0xE986B04Cf266E06D7097452af471D7b0e306898d"`. Confirmed working in the browser: the GasTank card went from unset/loading to live reads against Galileo.

### 0.2 Mock wallet (step 2)

- Precedent found: `apps/frontend/e2e/w11-executor-b-theme.spec.ts` — a mock EIP-1193 provider announced via `eip6963:announceProvider` before app scripts run; WalletGate auto-connects when exactly one injected provider is present.
- Harness: chrome-devtools MCP `navigate_page` with an `initScript` that installs the same mock (address `0x129aA090bceb49578712b01DFB0c3789d60344e0`, the deterministic E2E account, chain `0x40da`). The mock has no private key — it returns deterministic filler for `personal_sign` / `eth_signTypedData_v4` (fine for the console sign-in) and relays `eth_sendTransaction` through `POST /api/relayer/send` (which does not exist on the backend — see bug B3).
- Auto-connect verified: locked route → "Connect wallet" → AppShell mounted as `0x129a…44e0` / "W7 Mock Wallet" / chain 16602. Screenshot `/tmp/e2e/01-locked-route-before-connect.png`.

### 0.3 FE source fix required to boot the dev server at all (sibling-lane bug, fixed — see B1)

The dirty W7 sibling changes (design-audit lane) added `@font-face` rules with `src: url("/fonts/Fraunces-*.woff2")` to `src/styles/index.css`. Bun's `Bun.build` (what `dev.mjs` uses) resolves CSS `url()` at build time and **cannot resolve root-absolute paths**, so `bun run dev` exited before `serve()` — :5173 was down for the entire lane until fixed. Minimal fix: point the two `url()`s at the font files co-located with the CSS (`./fonts/…`, copied into `src/styles/fonts/`), which Bun inlines as data URIs. Production (`build.mjs`/express static) and the `/public/fonts/` copy are unaffected.

---

## 1. Flow walk (step 3) — screenshots in `/tmp/e2e/`

### 3a. GasTank card — PASS (with env fix)

`/tmp/e2e/02-dashboard-gastank-initial.png`

- Card visible on Overview with **balance 0 0G**, "0 next op sponsored / ops left", **Grants: 0 of 3 used** progress bar, deposit input (Deposit disabled until ≥0.01), "Claim free gas grant" button, faucet row.
- Live read confirmed against Galileo via RPC probe: `gasGrant=0.01e18`, `grantsCap=3`, `tank(user)=0`, `grantsUsed(user)=0` — the FE numbers match chain state exactly.
- Backend view agrees: `GET /v1/relayer/tank/0x129a…44e0` → `{"balance":"0","grants":"0","grantsCap":"3","grantsLeft":"3","gasGrant":"10000000000000000","opsLeft":0,"reserve":"100000000000000000","nextNonce":"0"}`.

### 3b. Faucet claim / first sponsored op — FAIL (blocked on-chain + relayer config)

`/tmp/e2e/03-after-grant-click.png`

- "Claim free gas grant" click → **no UI change, no notification, silent failure**. Root causes, in order:
  1. `GasTankCard.onRefill` POSTs `/api/v1/relayer/sponsor` **without the `x-api-key` header** (`apiFetch.apiKeyHeader()` is not used — it uses a bare `fetch`). Backend rejects with 401 `{"error":"unauthorized"}`. Bug B2.
  2. Even with the key (verified via curl with a correctly-signed request), the backend **simulates** `relay()` on-chain, which reverts `InvalidUserSignature (0xe3fb657c)`. Root cause: **the deployed GasTank digest diverges from the current source** (bug B4, detail in §4): `forwardRequestDigest()` on the live contract returns a different digest than `eth_signTypedData_v4` (what the FE wallet signs and what ethers `verifyTypedData` in the sponsor route recovers). ethers verification accepts the FE-style signature, then the on-chain simulation rejects it — the two checks disagree because they hash different things.
  3. Even with a signature over the contract's own digest (`forwardRequestDigest`), `relay()` does not revert but returns `ok=false` for `data=0x4e71d92d` (refill selector): the deployed build has **no `refill()`**; `grantCredit()` is `msg.sender`-based and cannot be forwarded — the relayer would be credited, not the user. The shipped contract only lazy-grants on a real op.
- Faucet claim button never appears: `GET /v1/relayer/faucet/:address` is 503 `relayer not enabled (AXIOM_RELAYER_MODE=off or gasTank unset)` with the client key too. Backend boots with relayer=on but **no `AXIOM_RELAYER_PK`** (dev posture → `relayerWallet=null`, `deps.faucet=undefined`), so the faucet dependency is absent despite "faucet=on" in the lane brief. Config issue, not FE code.
- Net: grant 1/3 could not be reached in-browser. **No chain state change** (verified: `grantsUsed` still 0 after the attempt).

### 3c. Mint an agent — PARTIAL (blocked at signature)

`/tmp/e2e/04-mint-page.png`, `/tmp/e2e/05-mint-submitted-fake-hash.png`

- The mint page renders fully (name field, review dialog, cost copy, identity stepper). Fill + "Review operation" → dialog with "Sign & execute" → click → mock wallet returns the deterministic filler signature → FE treats it as submitted → shows tx `0x0000…0000` and waits for a receipt that never comes.
- Expected: the mint fee is native and `eth_sendTransaction` requires a real signature; the mock cannot sign secp256k1. The FE flow itself behaved correctly up to the wallet boundary (validations, review dialog, submitted state, receipt wait all rendered as designed).
- The backend relayer path is the documented fallback for wallet-less mint, but it is unusable for the same two reasons as 3b (401 without key + digest divergence breaks relay).

### 3d. Pay an agent — N/A (gated)

`/tmp/e2e/06-payment-page.png`

- Payment page gates correctly: "You don't have an agent yet" + "Create agent" CTA, Approve/Confirm/Done stepper disabled. Correct behavior given 0 agents; could not exercise the Permit2 lane end-to-end without an agent. The Permit2 typed-data construction (`usePayment.payForAgentWithPermit2`) targets the Processor (which W7-B verified live) and does **not** touch the GasTank, so it is not affected by B4.

### 3e. Swap UI — N/A (does not exist)

- No swap surface in the FE rail (Overview/Chat/Transactions/Storage/Mint/Payment only). No swap component found in `src/`. Verified the pool indirectly instead: backend is up on the cutover addresses and W7-B (`docs/v3-proposals/waves/w7-b-permit2-live.md`) verified the live Processor swap/lend paths on these exact addresses this wave. No FE regression possible on a non-existent UI.

### 3f. Delegation card — PASS (disabled state as designed)

- `/payment` and `/mint` render without any delegation crash. `VITE_DELEGATION_REGISTRY_ADDRESS` unset → `getAxiomDelegationRegistryAddress()` → `undefined` → AgentPage renders the documented unset branch (`AgentPage.tsx:979-985`). No console errors attributable to delegation.

---

## 2. Regression hunt (step 4)

Pages navigated with the mock wallet connected, console errors after each:

| Route | Result | New console errors from W6/W7 changes? |
| --- | --- | --- |
| `/app` (Overview/Dashboard) | renders, live GasTank reads, receipts/agents empty states correct | No (only the documented 403/503 network noise + B2's silent 401) |
| `/chat` | renders: threads rail, restore-history (1 signature) row, 36 tools, provider selector | No |
| `/transactions` | renders | No |
| `/storage` | renders | No |
| `/mint` | full flow to wallet boundary | No |
| `/payment` | gated empty state correct | No |
| `/` (Landing) | renders with W7 design-audit changes (Fraunces hero, eyebrow pill) after the B1 CSS fix | No |
| `/agents` (public hub) | renders | No (2× 403 = Ankr RPC rate-limit noise, pre-existing) |

Mobile viewport (390×812) on `/app`:

- `/tmp/e2e/10-mobile-dashboard-gastank.png`, `/tmp/e2e/11-mobile-gastank-card.png`
- GasTank card found via `data-testid=gas-tank-card`, width 453px, renders below the fold without horizontal overflow (`scrollWidth <= innerWidth` → false). Card readable, grant bar and deposit input stack correctly.

Screenshots: 13 in `/tmp/e2e/` (`01-…` through `13-…`).

---

## 3. Console error inventory (post-navigation, all pages)

| Error | Count | Attribution |
| --- | --- | --- |
| `403` on `rpc.ankr.com/0g_galileo_testnet_evm` | 40+ per page | Pre-existing: Ankr rejects unauthenticated POSTs; wagmi `fallback()` rank just probes it. Not W6/W7. |
| `503` on `/api/v1/relayer/faucet/:address` | 2 | Expected given relayer-without-key boot (§3b.3); the FE degrades to the ineligible badge as designed. |
| `401` on `/api/v1/relayer/*` | several | **B2** (FE sponsor call missing API key header) and expected for keyless curl probes. |
| `WebSocket …/api/v1/stream failed: Invalid frame header` | 1 | Backend stream endpoint vs the dev proxy; pre-existing dev-proxy behavior, not introduced this wave. |
| `Uncaught (in promise)` | 1 | Fired during the grant-claim click (B2's rejected fetch); silenced user-visible error. |
| Lit dev-mode warning | 1 | Tooling noise. |

---

## 4. Root-cause evidence for B4 (the load-bearing finding)

The signature lane of the gasless journey is broken at the contract level, independent of FE or backend code:

1. **Backend admission accepts the FE signature.** Signed `ForwardRequest` (viem, spec EIP-712, domain `AxiomGasTank`/`1`/16602/`0xE986…98d`) → ethers `verifyTypedData` (what `routers/relayer.ts:253` does) recovers the signer correctly. Reproduced locally with ethers v6.
2. **The contract rejects the same signature.** `eth_call` of `relay(req, sig)` with that exact request reverts `InvalidUserSignature (0xe3fb657c)` — this is the backend's `simulate` step failing (`server.ts:457`), surfaced as 502 `SIMULATION_FAILED`.
3. **The digests disagree.** Live `forwardRequestDigest(req)` returns `0x891e376c…0250202`; the spec EIP-712 digest (viem, ethers, and hand-rolled OZ `_hashTypedDataV4` over the same fields) is `0xc2e783fa…304233`. A signature over the *contract's* digest passes `_verifySig` (relay sim returns without revert), proving the deployed code hashes a differently-structured preimage.
4. **The deployed bytecode is not the current source build.** `eth_getCode` vs `apps/contracts/out/AxiomGasTank.sol/AxiomGasTank.json` (same length, 6534 bytes) differs in 28 byte regions: the live code contains a PUSH32 constant `0x2cedd313…750e7` absent from the current build, plus baked name/version/contract constants that the current build leaves for immutables. The deployed tank was built from a different (older or locally-modified) source revision than `apps/contracts/src/AxiomGasTank.sol` at `520352e`.
5. **Compounding spec gap:** the shipped source has no forwardable refill. `grantCredit()` (GasTank.sol:230) credits `msg.sender`, and `relay()` appends the ERC-2771 20-byte sender suffix to `req.data` — so even a correctly-signed `grantCredit` calldata relayed by the backend would credit the relayer address, not the user. The FE's "Claim free gas grant" sends `refill()` selector `0x4e71d92d` as a placeholder (`GasTankCard.tsx:69-76`, commented as such) which no contract version implements.

**Impact:** every gasless op that depends on the GasTank relay — grant claim, sponsored first op, chat `sponsor` tool (`transport-browser.ts:102-137` signs the same spec digest) — fails against the live tank. The FE and backend are consistent with each other and with EIP-712; the deployed contract is the odd one out.

---

## 5. Found-bugs list

| # | Severity | Where | Bug | Status |
| --- | --- | --- | --- | --- |
| B1 | **Blocker** (dev server) | `apps/frontend/src/styles/index.css:19,27` (W7 sibling design-audit change) | Root-absolute `url("/fonts/…")` breaks `Bun.build` → `bun run dev` exits pre-serve, :5173 down | **Fixed in FE** (allowed lane): URLs → `./fonts/…`, fonts copied to `src/styles/fonts/`; inlined as data URIs by Bun. Production build/static serving unaffected. |
| B2 | **High** | `apps/frontend/src/components/axiom/GasTankCard.tsx:66-72` | `onRefill` uses bare `fetch` without `apiKeyHeader()` → 401 before any chain interaction; failure also silent to the user (swallowed, no notification) | **Not fixed** (owner: FE lane, 2-line fix + error surfacing; noted for W8) |
| B3 | **High** | `apps/frontend/src/chat/transport-browser.ts:102-137` + mock note | Chat sponsor path signs the spec digest → will always fail against the live tank (see B4); mock wallet also cannot produce real signatures | **Not fixable in FE** (blocked by B4) |
| B4 | **Critical** (contracts) | deployed `0xE986…98d` | Live GasTank bytecode ≠ current source; `forwardRequestDigest` diverges from the EIP-712 digest the FE/backend sign & verify → `relay()` always reverts `InvalidUserSignature` for wallet-signed ops. Plus: no forwardable refill (`grantCredit` is `msg.sender`-based; `refill()` doesn't exist) | **Out of lane scope** (contracts lane must rebuild/redeploy from current source + add a forwardable grant-credit path); evidence in §4 |
| B5 | **Medium** (ops/config) | backend env | Relayer boots `mode:"on"` but `relayer: null` (no `AXIOM_RELAYER_PK`) → faucet 503, sponsor queue would dead-letter on submit. Lane brief said "faucet=on"; it is not functional without the key | **Not fixed** (no backend restarts allowed) |
| B6 | **Low** (test debt) | lane C harness | Mock wallet cannot sign secp256k1, so mint (native fee) and Permit2 signing cannot pass the wallet boundary in-browser; `/api/relayer/send` fallback endpoint does not exist on the backend | Documented; deterministic-key mock or funded anvil-style account needed for full mint E2E |

## 6. FE changes made (allowed: genuine bug found)

1. `apps/frontend/src/styles/index.css:19,27` — font `src` URLs root-absolute → relative (`./fonts/…`), files added at `src/styles/fonts/`. Before: dev server crash at boot. After: `bun run dev` boots, fonts inlined, Landing renders with the intended Fraunces hero.
2. `apps/frontend/public/__h3b_mock.js` — new: browser-served mock EIP-6963 provider used by this and future manual E2E passes (not referenced by `index.html`; loaded via CDP `initScript` in this run, or by temporarily adding one script tag). Harmless in production builds (never requested by the app).

Env: `VITE_GAS_TANK_ADDRESS` appended to root `.env` + `apps/frontend/.env` mirror. No backend or contract files touched.

## 7. Chain state changes observed

- **None caused by this E2E.** GasTank reads only: `gasGrant=0.01e18`, `grantsCap=3`, `reserve=0.1e18`, `tank/grantsUsed/nonces(0x129a…44e0 and 0x7099…79C8)=0`, `paused=false`, `eip712Domain()` name/version/chainId/verifyingContract as expected. All eth_call simulations (`relay` with both digest variants) reverted or returned `ok=false` without state changes by design (grant rollback on revert).
- Mint tx was never broadcast (fake hash accepted by the UI but nothing sent — the mock's `eth_sendTransaction` path posts to a nonexistent relayer endpoint and returns a filler hash; nothing leaves the browser).

## 8. Verification evidence

- `dist-dev/chunk-188kknh0.js` contains the baked `VITE_GAS_TANK_ADDRESS` value; GasTank card switched from unset to live-read after the env change.
- `curl /v1/relayer/status` (with key): `mode:"on"`, `address:0xE986…98d`, `relayer:null`.
- `curl /v1/relayer/tank/:address` (with key): matches the FE card values exactly.
- ethers `verifyTypedData` recovery of the FE-style sig: `0x7099…79C8` (locally reproduced) vs on-chain `eth_call relay` revert `0xe3fb657c`; `forwardRequestDigest` live `0x891e…` vs spec `0xc2e7…`; sig over `0x891e…` passes `_verifySig` (sim returns `0x00`, no revert). Bytecode diff: 28 regions, live-only PUSH32 `0x2cedd313…`.
- `ss -tln` confirmed :5173 listening after the CSS fix; the running dev server (detached, `bun run dev`, log `/tmp/e2e-devserver.log`) is left up for sibling lanes.
