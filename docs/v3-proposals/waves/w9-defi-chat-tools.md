# Wave 9 — DeFi chat tools (swap / LP / borrow) on the sponsored relayer surface

- **Type:** implementation report (chat/config/backend lane; no contract edits)
- **Date:** 2026-09-01
- **Base HEAD:** `20c1761` ("fix(v3-w8): canonical EIP-712 GasTank digest + redeploy — B4 closed"); working tree carried design-audit artifacts only (untouched)
- **Result:** config 62 pass, chat-runtime 100 pass, backend 249 pass, workspace tsc clean. All changes left **uncommitted**. Contracts untouched (live and final for this wave); `.env` untouched.

---

## 1. What this wave adds

W6 put the swap pool, LP shares, and lending on `AxiomPaymentProcessor`. W9 exposes that surface as chat tools so the agent can manage a treasury end-to-end: swap tokens, provide liquidity, borrow against collateral — gasless through the GasTank sponsor lane where the op shape allows it.

Three new catalog tools (encode class, `requiresWallet`, friction medium):

| Tool | Processor call | Permit2 prerequisite | Sponsor lane |
| --- | --- | --- | --- |
| `swap_tokens` | `swapExactIn(tokenIn, amountIn, minOut, permit, sig)` | single permit rides inside calldata; wallet must hold Permit2 allowance ≥ amountIn | **yes** |
| `add_liquidity` | `addLiquidity(usdcAmount, wethAmount, batchPermit, sig)` | Permit2 **batch** (both pool tokens) | **no — wallet lane only** (documented) |
| `borrow` | `borrow(amount)` | none — funds pay OUT to the caller | **yes** |

## 2. Tool specs (`packages/config/src/chat-tools.ts`)

### 2.1 swap_tokens

- Parameters: `tokenIn: "usdc"|"weth"` (pool symbol, required), `amountIn: string` (human units, required), `minOut?: string` (human out-units slippage floor; defaults to 1 wei when omitted).
- Symbol→address resolution: `resolveAxmTokenAddress()` (new, exported). `"usdc"` resolves from the session's `addresses.paymentToken`; `"weth"` from env `AXIOM_SWAP_PAIR_TOKEN` (the live Galileo axmWETH mock `0x62e5ead40c2105d44a705e87f370776bd12bf6ec`, per `apps/contracts/broadcast/DeployMockWETH.s.sol/16602/run-latest.json`). Unconfigured side → `null` → the tool fails with a hint instead of fabricating an address.
- Hard chat cap: 1000 tokens (same `parseTokenAmount` + cap ladder as `pay_for_agent`).
- Hint documents the GasTank sponsorship (gasless) and the Permit2 allowance prerequisite.
- Executor (`encodeSwap` in `packages/chat-runtime/src/executors/encode.ts`): reads the token's `allowance(owner, Permit2)` via `ctx.chain.readContract` **before any lane runs**; an unmet allowance returns a `requiresApproval` envelope carrying ready-to-sign `approve(Permit2, amount)` calldata and skips the relay entirely (a Permit2-pull swap without allowance deterministically reverts). With headroom, the op flows through the existing `executeSponsoredOrWallet` ladder: tank headroom check → `wallet.sponsor()` ForwardRequest signature → `POST /v1/relayer/sponsor` → 402 `TANK_EXHAUSTED` surfaces the remedy (deposit via GasTank UI or connect a wallet) → transient failures (429 rate limit, relayer off) fall through to the wallet-signing lane. The placeholder permit inside the calldata is bound at signing time: Permit2 hashes `spender = raw msg.sender`, so the user-signed ForwardRequest over the exact calldata keeps the pull user-bound (W6-A T25 pins the same contract for the direct-relay case).
- Estimated max gas cost: 300k gas @ 2 gwei (payment-sized op, well under the 0.001 OG sponsor ceiling).

### 2.2 add_liquidity

- Parameters: `usdcAmount: string`, `wethAmount: string` (human units, both required, both > 0 — the contract reverts `ZeroAmount` otherwise).
- **Wallet lane only, deliberately.** The batch permit needs one EIP-712 signature over BOTH pool tokens (`PermitBatchTransferFrom`); the transport's `sponsor` capability models a single ForwardRequest signature, and Permit2 binds the spender to raw `msg.sender`, so a relayed batch pull reverts at the permit leg. Extending the capability to carry batch permits was rejected as out of scope for this wave (it touches every transport, not just chat). The tool hint documents this: "does NOT use the GasTank sponsor lane." The executor still encodes the full batch-permit calldata so the wallet lane signs and broadcasts one tx.
- Same cap ladder (1000 tokens per side); estimated max gas 400k @ 2 gwei.

### 2.3 borrow

- Parameters: `amount: string` (human axmUSDC, required, chat cap 1000).
- No permit leg (the processor sends tokens TO the caller), so no Permit2 prerequisite and no allowance read. Fully relayable via the GasTank forwarder: `borrow(amount)` has no msg.sender-dependent signature input beyond the ERC-2771 forwarder itself.
- Sponsor lane identical to `withdraw`/`pay_for_agent` wiring (headroom → sponsor sign → submit → 402 handling → fallback). Estimated max gas 200k @ 2 gwei.

### 2.4 SPONSORED_TOOLS

`packages/config/src/chat-tools.ts`:

```ts
export const SPONSORED_TOOLS = ["withdraw", "pay_for_agent", "swap_tokens", "borrow"] as const;
```

`add_liquidity` is intentionally absent. `CHAT_BENCH_ENCODE_TOOLS` picks the three tools up automatically (class filter).

## 3. Sponsorship flow per tool (executor → backend)

```text
chat tool ──┐
 withdraw ──┤  tank headroom read (GET /v1/relayer/tank/:user)
 pay_for_… ─┤  → ForwardRequest signed by wallet.sponsor() (EIP-712 AxiomGasTank/1)
 swap_tokens┤  → POST /v1/relayer/sponsor
 borrow ────┘  → recover → [W9: DeFi selector gate] → simulate → gate → queue
                    → relayer key broadcasts gasTank.relay() → Relayed log reconcile
 add_liquidity ── encode calldata → wallet signs+broadcasts directly (no relay leg)
```

## 4. Backend allowlist changes (`apps/backend/src/routers/relayer.ts`)

The sponsor route previously validated only signature recovery, deadline, maxGasCost ceiling, simulation, rate bucket, and inflight cap — any (target, calldata) the GasTank's `relay()` would accept passed through. The W9 gate adds server-side calldata admission **before** simulate (no state hit):

1. `validateDefiCalldata(target, data, config)` classifies the 4-byte selector against `swapExactIn` / `borrow` / `addLiquidity` (an `Interface` fragment mirroring `packages/config/src/abis/paymentProcessor.ts`). Non-DeFi calldata passes unchanged — the existing withdraw/pay surface is untouched.
2. DeFi selectors must target the PaymentProcessor: matched against `config.addresses.paymentProcessor` plus the env-keyed candidates (`AXIOM_PAYMENT_PROCESSOR_ADDRESS`, `PAYMENT_PROCESSOR_ADDRESS`, `AXIOM_PAYMENT_PROCESSOR`) so the gate survives config/pre-proxy drift. Otherwise **400 `DEFI_TARGET_REJECTED`**.
3. `swapExactIn` arg 0 (`tokenIn`) must be a pool token: `paymentToken` (config/env `AXIOM_PAYMENT_TOKEN`) or env `AXIOM_SWAP_PAIR_TOKEN`. Otherwise **400 `DEFI_TOKEN_REJECTED`** — mirrors the on-chain `InvalidSwapToken` revert and keeps third tokens away from the permit pull before the op reaches the queue. `borrow`/`addLiquidity` carry no user-chosen token, so no token check applies.

No selector for `removeLiquidity` or `repay` is admitted this wave (not in the brief); adding them is a one-line fragment + case each.

## 5. Test inventory (before → after)

| Suite | Baseline | Now | New tests |
| --- | --- | --- | --- |
| `@axiom/config` | 60/0 | **62 pass / 0 fail** | `relayer.test.ts` (+2): W9 catalog membership (encode class, wallet gate, medium friction, GasTank+Permit2 hint text, `swap_tokens`/`borrow` sponsored, `add_liquidity` NOT sponsored, encode-bench filter) ; `resolveAxmTokenAddress` symbol map (usdc from session, weth from env, unconfigured/invalid sides → null). The phase-1 `SPONSORED_TOOLS` pin updated to the extended set. |
| `@axiom/chat-runtime` | 93/0 | **100 pass / 0 fail** | `executors/sponsor.test.ts` (+7): swap sponsor-lane happy path (selector + target asserted on the submitted ForwardRequest); unmet Permit2 allowance → `requiresApproval` envelope with no relay POST; 402 TANK_EXHAUSTED → terminal toolFail with remedy; transient sponsor failure → wallet-lane fallback; borrow sponsor happy path (no Permit2 prerequisite — chain stripped); add_liquidity wallet-lane-only (sponsor never called); weth without `AXIOM_SWAP_PAIR_TOKEN` → toolFail. |
| `@axiom/backend` | 246/0 | **249 pass / 0 fail** | `relayer/relayer.test.ts` (+3): swapExactIn targeting the Processor with pool token → 202 + queued; swapExactIn with non-pool tokenIn → 400 `DEFI_TOKEN_REJECTED`, nothing queued; borrow to a non-Processor target → 400 `DEFI_TARGET_REJECTED`. `signedBody()` gained a `data` override so DeFi calldata rides a correctly-signed ForwardRequest. |

All three suites green; `bun run typecheck` clean across config/chat-runtime/backend/frontend (fresh output in the run log, not assumed).

**Pre-existing break fixed to unblock the gate:** `apps/backend/src/routers/relayer.ts` tank-read catch referenced `${id}` where the param is `addrParam` — `tsc` failed on HEAD *before* this lane's changes (verified via `git stash`). Fixed to `${addrParam}`; no behavior change.

## 6. Relayer funding status

- The running backend (`/tmp/axiom-backendE.log`, boot `2026-09-01T19:20:19Z`, port 3000) has the relayer worker ON but **no `AXIOM_RELAYER_PK`** logged and `relayerAddress: "0xdd…"` only in tests — matching the W7-C finding B5 ("relayer=on but relayer: null, dev posture"). The funded candidate EOA on Galileo (16602) is the TEE admin/oracleAdmin `0x0553f58a0209Fb8DcE201fCD9406Be56da890D73` (V3 W3-A funding record), queried live via `evmrpc-testnet.0g.ai`:
  - `0x0553…0D73`: **0.04567 OG** (down from ~0.081 earlier this campaign)
  - runtime signer `0xaf7c…4d20` (deployer, for reference): 0.00433 OG
- Runway at ~0.0006 OG/op: **~76 sponsored ops** before the relay leg start-fails.
- **Top-up needed for a public demo: yes.** ~76 ops covers a scripted demo, but a public one burns the balance quickly (rate limit caps at 6 ops/min/user; a handful of concurrent demo wallets reach the floor within minutes). Recommend topping the relayer EOA to ≥ 0.5 OG (~800 ops headroom). Per brief: NOT topped up here — parent handles.

## 7. Constraints audit

- No edits to `apps/contracts/**`; no `.env` changes; no suppressions/TODOs added; no keys printed.
- The mock wallet cannot sign — all new executor tests use mock `sponsor`/`signAndSend` capabilities and a mocked chain read; no live signing anywhere.
- Changes left uncommitted per brief.
