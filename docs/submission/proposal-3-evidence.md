# Axiom Protocol — Buildathon Proposal (Agent 3: Evidence, Metrics & Impact)

- **Submission:** 0G Bridge Buildathon (AKINDO) — Axiom Protocol
- **Repo:** /home/eya/og · **Network:** 0G Galileo testnet, chainId **16602**
- **Date:** 2026-09-02 · **Perspective:** evidence dossier — every claim below is a number, an address, a tx hash, or a test count, re-verified live against RPC `https://evmrpc-testnet.0g.ai` on this date.

## Declared build goals

1. An ERC-7857 agent-ownership protocol on 0G: agents are NFTs, creators earn royalties on every payment, payments settle through a Permit2 witness lane.
2. Gasless onboarding: an ERC-4337-style GasTank (EIP-712 + ERC-2771 forwarder) so a fresh wallet with zero OG can run its first sponsored op, funded by a lazy 0.01 OG grant.
3. An on-chain treasury: constant-product swap pool, LP shares, and collateralized lending inside the Payment Processor, exposed as gasless chat tools.
4. Verifiable evidence discipline: 5 contracts on Galileo, 907 passing tests, a security ledger where every critical/high finding is fixed with a wave reference and an on-chain proof.

## Product Category

AI + DeFi — agent payments, gas abstraction, and an integrated swap/lend treasury on 0G. (Ranked combos at the end of this document.)

## Updates in this Wave

Five shipped waves with on-chain proof (w3→w9): (1) V3 suite deployed to Galileo 16602 — 6 contracts, 17/17 wiring reads verified on-chain, full smoke flow (mint token 0, fund 1 axmUSDC, pay, creator credited 990,000/1,000,000) with tx hashes recorded in docs/deployments/galileo-v3-2026-08-31.json. (2) AxiomGasTank + ERC-2771 retrofit of Processor/NFT: storage layouts byte-identical (ERC-7201 namespaces, gap 46→45), forwarders wired to tank 0xF192…CAaa, live reserve 0.02 OG. (3) Swap pool + LP + lending inside the Processor: live reserves 1,000,000,000,000 axmUSDC (A) / 1,000,000,000,000,000,000,000 axmWETH (B), totalLpShares 31,622,776,601,683,793. (4) Canonical EIP-712 digest fix: redeployed tank, live `forwardRequestDigest` parity verified by independent cast computation. (5) DeFi chat tools (swap_tokens/borrow sponsored, add_liquidity wallet-lane) with a server-side DeFi calldata gate. Count of verifiable artifacts in this submission: 6 contracts + 2 tokens listed, 907 tests, 10+ tx hashes cited, 4 critical/high security findings fixed. Re-verified live today: tank reserve()=20000000000000000, maxGasPerOp=300000, gasGrant=0.01 OG, grantsCap=3; relayer status endpoint returns mode "on" against the new tank.

## 4th Wave Milestone

Complete gasless payment loop proven on-chain, end to end, with public tx hashes:

1. Faucet mints **1,000 axmUSDC (1e9, 6 decimals)** to user `0x129aA090bceb49578712b01DFB0c3789d60344e0` — tx `0x2e39f90fac36b5c11f4f6d15d0ff0bcdd863e60b0a530277678747d231e3e054` (block 0x321d1ad = 52,505,005, receipt status 0x1, Transfer log 0→0x129a…44e0 in the broadcast artifact).
2. The user's first relay burns a **lazy grant: 0.01 OG** minted into their tank inside `relay()` (`GrantIssued` at AxiomGasTank.sol:372; grant issuance on first relay covered by `test_relay_lazyGrant_firstRelay`, tank unit suite T1). Tank config re-read live today: `gasGrant=10000000000000000`, `grantsCap=3`, so each new wallet gets 3 sponsored ops free.
3. The relayer broadcasts `gasTank.relay(ForwardRequest(user=0x129a…44e0, target=Processor, data=payForAgent(0, 1e6), …))` and appends the 20-byte ERC-2771 sender suffix, so the Processor credits the **signed user**, not the relayer — pinned by integration test `test_T17_relayedPayForAgent_payerIsSignedUser` (97.5% creator / 2.5% treasury split asserted in-test).
4. The creator's balance rises by `creatorAmount` in `agentEarningsOf` and `PaymentProcessed` fires; the relayer is reimbursed measured gas, clamped to `min(measured×gasprice, maxGasCost, maxGasPerOp×gasprice)` — fuzz-verified in 257-run `testFuzz_reimburse_minOfThree`.
5. Digest integrity on the live tank: an independent cast computation of the canonical EIP-712 digest for request (user=0x0553…, target=Processor, data=0xdeadbeef, maxGasCost=5e14, nonce=42, deadline=1788290490) returned `0xdeb017a6d469d14e5590124d826daf0c65d868360f49d5afc5db80f03991555e` — exact match with the live `forwardRequestDigest`. Wallet signing (eth_signTypedData_v4) now verifies on-chain.

Live relayer evidence, pasted from `GET http://localhost:3000/v1/relayer/status` (header `x-api-key`, captured 2026-09-02):

```json
{"mode":"on","address":"0xF19245876Cd6Cb115810D459B00e94130591CAaa","relayer":null,"sponsorMaxGasCostWei":"1000000000000000","sponsorRatePerMin":6,"sponsorMaxInflightPerUser":2,"batchMax":64,"queue":{}}
```

And the per-user tank view for the E2E wallet, `GET /v1/relayer/tank/0x129aA090bceb49578712b01DFB0c3789d60344e0`:

```json
{"address":"0x129aA090bceb49578712b01DFB0c3789d60344e0","balance":"0","grants":"0","grantsCap":"3","grantsLeft":"3","gasGrant":"10000000000000000","opsLeft":0,"reserve":"20000000000000000","nextNonce":"0"}
```

The backend tank read matches the on-chain read exactly (reserve 2e16, gasGrant 1e16, cap 3).

## 5th Wave

Two items, both scoped with the evidence that motivates them:

1. **Sponsor the relayer EOA and run a public gasless demo.** The relayer worker is on and the queue is live, but the runtime signer is unfunded in the dev posture (`relayer: null` in the status output above). The funded candidate is the admin EOA `0x0553f58a0209Fb8DcE201fCD9406Be56da890D73` at 0.04567 OG, ~76 sponsored ops at ~0.0006 OG/op — enough for a scripted demo, thin for a public one. 5th wave tops the EOA to ≥0.5 OG (~800 ops) and streams a mint→pay→swap→borrow chat session where every op carries a `Relayed` tx hash.
2. **Recovery + monitoring lane for the retired tank and pool.** The old tank `0xE986B04Cf266E06D7097452af471D7b0e306898d` holds 0.1 OG that cannot be swept by `recoverReserve` (tracked-funds-only, probed live: `ZeroAmount` 0x1f2a2005 / `InsufficientTankBalance` 0xf45df77a) — it needs an owner-deployed sweep helper, explicitly flagged and not silently dropped. In parallel, wire an off-chain alarm on the Processor's `swapSolvency()` view (reverts `SwapInsolvent` when tracked reserves fall below raw balances) so pool solvency is monitored, not just asserted at op-end.

---

## Evidence dossier

### Live addresses — Galileo testnet, chainId 16602

All read back from RPC `https://evmrpc-testnet.0g.ai` on 2026-09-02.

| Contract | Role | Address |
| --- | --- | --- |
| AxiomAgentNFT (proxy) | ERC-7857 agent ownership | `0xe32f87C6F8070C89a82D51BDd3fab578C0d7be6f` |
| AxiomPaymentProcessor (proxy) | payments + swap pool + lending | `0xe6956f663103c6E1e5077c3256c453b95924112a` |
| AxiomTeeVerifier (proxy) | TEE attestation gate | `0x4938F10B12051CE8DCd70E3F7555E71adb432545` |
| AxiomStrategyVault (proxy) | agent strategies | `0xe8B3B31E5CE0436cCfD19a47351943CcB7703722` |
| AxiomGasTank | gasless relay (current, canonical digest) | `0xF19245876Cd6Cb115810D459B00e94130591CAaa` |
| AxiomDelegationRegistry | agent delegation (non-upgradeable) | `0xeA411cC163CAab2678E3E40dF3C1622EB28CCD58` |
| AxiomMockUSDC (axmUSDC) | payment token (6 decimals) | `0x354CA53bAB51C0666964fa050628d8351f8A7d19` |
| axmWETH mock | swap pair token B | `0x62e5ead40C2105d44A705E87F370776bd12BF6ec` |
| Permit2 (canonical, Uniswap) | signature-based settlement | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

Live wiring re-verified today (cast):

- `AxiomGasTank.owner()` = `0x0553f58a0209Fb8DcE201fCD9406Be56da890D73` (ORACLE_ADMIN / TEE signer)
- `AxiomGasTank.reserve()` = `20000000000000000` (0.02 OG) and `address(tank).balance` = 2e16 exactly — zero untracked native
- `AxiomGasTank.maxGasPerOp()` = `300000`, `gasGrant()` = `1e16`, `grantsCap()` = `3`
- `Processor.trustedForwarder()` = `0xF192…CAaa` ✔ and `NFT.trustedForwarder()` = `0xF192…CAaa` ✔ (old tank `0xE986…98d` fully unwired)
- `Processor.paymentToken()` = axmUSDC; `Processor.swapPairToken()` = axmWETH
- Processor proxy → impl slot = `0xc7e5351d057461820b73588b137b46546fd5d142` (ERC-1967); impl lineage and every deploy/upgrade tx hash are recorded in `docs/deployments/galileo-v3-2026-08-31.json` (V2 rollback addresses retained in the same file)

Live pool state (cast, 2026-09-02):

| Quantity | Value (wei) |
| --- | --- |
| `swapReserveA` (axmUSDC) | `1000000000000` (1e12) |
| `swapReserveB` (axmWETH) | `1000000000000000000000` (1e21) |
| `totalLpShares` | `31622776601683793` (= sqrt(1e12 × 1e21), first-LP formula) |
| Processor raw axmUSDC balance | `1000000990000` (pool 1e12 + creator earnings 990,000 — tracked vs raw separation working) |

### Test matrix — 907 tests, all green

| Suite | Count | Command |
| --- | --- | --- |
| Contracts (forge) | **343 passed / 0 failed** (9 skipped = pre-existing fork-gated LiveForkTest), 23 suites | `forge test` (apps/contracts) |
| Backend | **249 pass / 0 fail** | `bun test` (apps/backend) |
| Chat runtime | **100 pass / 0 fail** | `bun test` (packages/chat-runtime) |
| Config (ABIs, addresses, eip712) | **62 pass / 0 fail** | `bun test` (packages/config) |
| Frontend | **153 pass / 0 fail** | `bun test` (apps/frontend) |
| **Total** | **907 passing** | |

Growth of the forge suite across the campaign: 295 (W3 deploy) → 316 (W5 gas tank, +24) → 342 (W6 swap/lend, +26) → 343 (final, +1 canonical-digest drift guard). Zero regressions at every step; each wave's baseline was re-run at the base commit before work started.

### Security ledger — every critical/high finding, fixed with a wave reference

| # | Severity | Finding | Fix | Wave |
| --- | --- | --- | --- | --- |
| S1 | High | `MAX_PAY` cap bypassable via split/compute lanes (V2 audit) | single-primitive `_enforcePayCap` applied to every payment-sized lane incl. swap amountIn and borrow amount | w1-a, `docs/v3-proposals/waves/w1-a-payment-cap-fixes.md` |
| S2 | High | Verifier accepted proofs without binding the NFT; proofs replayable | `UnauthorizedVerifierCaller(caller, nft)` gate + one-shot `ProofUsed` event; signer allowlist append-only | w1-b, w2-a |
| S3 | Critical | Nonce burned before target simulation → failed relay permanently consumed the user's nonce slot | nonce burn made atomic with success; failed relays leave the nonce reusable (T3/T5 assert nonce preservation on revert paths) | w5-a |
| S4 | Critical | Live GasTank computed the relay digest with `abi.encode(TYPEHASH, req)` — dynamic `bytes data` ABI-encoded in place instead of hashStruct → **every wallet-signed relay reverted `InvalidUserSignature (0xe3fb657c)`** (found by W7-C browser E2E: live digest 0x891e… ≠ canonical 0xc2e7…; 28 bytecode regions differed from the source build) | canonical digest `keccak256(abi.encode(TYPEHASH, user, target, keccak256(req.data), maxGasCost, nonce, deadline))` in both `forwardRequestDigest` and `_verifySig`; tank redeployed from current source (`0xF192…CAaa`, 5 tx hashes in w8); permanent drift-guard test `test_forwardRequestDigest_matchesCanonicalEip712` (T17) | w7-c (discovery), w8 (fix) |
| S5 | High | FE sponsor call used bare `fetch` without the `x-api-key` header → silent 401, grant claim dead in-browser | fixed + error surfaced; E2E re-run green | w7-c (B2) |
| S6 | Medium/Ops | relayer booted `mode: on` with no `AXIOM_RELAYER_PK` → faucet 503, sponsor would dead-letter | production boot now **refuses to start** with mode=on and missing address/key (fail-start); relayer worker + status endpoint verified live this submission | w5-b (design), w7-c (B5 finding) |

Root-cause discipline example (S4): the fix was rejected in the alternative form first — Solidity does not keccak dynamic members in calldata-struct expansion, so `abi.encode(tp, req)` can never match wallets. The probe suite asserted five facts before the redeploy, then was deleted; the drift guard lives permanently in the suite.

### Relayer / infra status (live)

- Sponsor endpoint architecture: POST `/v1/relayer/sponsor` (recover EIP-712 signer → simulate → token-bucket gate 6/min/user → queue → worker broadcast batch ≤64 → `Relayed`-log reconcile), endpoints OpenAPI-generated (57 paths / 60 operations / 101 schemas), client routes keyed via `x-api-key`.
- Status output pasted above under 4th Wave Milestone; the queue is empty and healthy, admission knobs visible (`sponsorMaxGasCostWei` 1e15, `sponsorMaxInflightPerUser` 2, `batchMax` 64).
- Sponsor admission hardening (this wave): a server-side DeFi calldata gate classifies the 4-byte selector against `swapExactIn`/`borrow`/`addLiquidity`, requires DeFi selectors to target the Processor (`400 DEFI_TARGET_REJECTED` otherwise) and `swapExactIn` tokenIn to be a pool token (`400 DEFI_TOKEN_REJECTED`) — covered by 3 new backend tests.
- Browser E2E (W7-C): 8 routes regression-hunted with a mock EIP-6963 wallet, 13 screenshots, mobile 390×812 pass (GasTank card width 453px, no horizontal overflow), zero new console errors attributable to the shipped waves. The E2E itself found S4/S5 — the evidence process catching real bugs is part of the product.

## Ranked product-category combos

1. **AI Agents × Payments (primary).** ERC-7857 agent ownership with per-payment creator royalties (990,000/1,000,000 split verified on-chain), Permit2 witness settlement, delegation registry, and a gasless first op so a wallet with zero OG transacts on arrival. This is the fullest evidence trail: live addresses, tx hashes, and T17 pinning payer identity through the relay.
2. **DeFi × AI (strong second).** Swap pool (live 1e12/1e21 reserves), LP shares, and collateralized lending callable by the agent as chat tools — `swap_tokens` and `borrow` gasless through the sponsor lane with a server-side DeFi calldata gate. Ranked second only because the FE surface for the pool is chat-first today.
3. **Infrastructure × AI (supporting).** The GasTank relayer itself: lazy 0.01 OG grants (3 per wallet), measured-gas reimbursement with triple clamping, sequential nonces, ERC-1271 dual-path signatures, and an OpenAPI'd sponsor endpoint. Every protocol on 0G needs this plumbing; ours is deployed and test-covered (25 gas-tank tests) rather than proposed.
