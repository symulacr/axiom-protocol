# Proposal 5 — Submit-Ready (Axiom Protocol, 0G Bridge Buildathon / AKINDO)

> Agent 5 of 5, perspective: concise synthesis and submit-ready polish. This is the
> version built to fit a 3,000-character field with margin. Every claim traces to
> proposal 1–4, the deployment records (`docs/deployments/galileo-v3-2026-08-31.json`),
> or live RPC reads (2026-09-02). GitHub: <https://github.com/symulacr/axiom-protocol>
> · Live app: <https://axiom-protocol.vercel.app>

---

## Updates in this Wave (final field)

Char count: **2,242** (limit 3,000; safety margin 758). Same text ships in
`FINAL-SUBMISSION.json`.

```text
Gasless agent infrastructure is live on 0G Galileo with on-chain end-to-end proof: a wallet with zero OG claims a 0.01 OG gas grant, mints 1,000 faucet axmUSDC, pays an agent gas-free through an ERC-2771 relay, and the creator's royalty split credits on-chain.

Delivered this campaign (9 executed waves, 284 commits):
- AxiomGasTank: lazy 0.01 OG grants (3/address), per-user nonces, ERC-1271 dual-path signing, relayer reimbursement clamped three ways, solvency invariant fuzz-verified over 257 runs.
- ERC-2771 retrofit of AgentNFT and PaymentProcessor via UUPS; backend relayer with EIP-712 recovery, eth_call simulation, 6 ops/min/user gating, dead-lettering.
- Swap pool, LP shares, collateralized lending inside the PaymentProcessor, zero new contracts, plus axmWETH and a relayer-dripped faucet.
- Sponsored chat tools: pay, withdraw, swap_tokens, borrow run gas-free behind a DeFi calldata gate (selector, target, pool-token checks).
- Canonical EIP-712 digest fix: browser E2E caught the live tank rejecting every wallet signature (InvalidUserSignature 0xe3fb657c); fixed, redeployed, digest parity verified on-chain, permanent drift-guard test added.
- Permit2 witness settlement, DelegationRegistry, and a deployed on Aristotle mainnet (16661) DeployAristotle.s.sol with 7 pre-broadcast safety gates; 0G's deployed Permit2 verified byte-identical to upstream (1 of 9,152 words, the cached domain).

Evidence: 907 tests green (forge 343/0, backend 249, chat-runtime 100, config 62, frontend 153); 699 public commits since June 23. Live on Galileo 16602: AgentNFT 0xe32f87C6F8070C89a82D51BDd3fab578C0d7be6f, Processor 0xe6956f663103c6E1e5077c3256c453b95924112a, Vault 0xe8B3B31E5CE0436cCfD19a47351943CcB7703722, TeeVerifier 0x4938F10B12051CE8DCd70E3F7555E71adb432545, GasTank 0x156D05Ea7D47Da0a264C43855240c91F8eA8c4B6, DelegationRegistry 0xeA411cC163CAab2678E3E40dF3C1622EB28CCD58. Demo: <https://axiom-protocol.vercel.app> · Code: <https://github.com/symulacr/axiom-protocol>

0G primitives: 0G Chain (settlement, gasless relay), 0G Storage (encrypted agent payloads with on-chain dataHash, chat transcripts, sealed-DEK custody), 0G Compute (chat + strategy-tick inference), Permit2, Pyth prices. DA was evaluated and declined with reasons recorded in ADR-002.
```text

---

## Product Category (final pick)

#### AI Agents, DeFi, Infrastructure
One line: the agent itself is the product (ERC-7857 iNFT with gasless chat tools), the
swap/lend treasury is the DeFi surface, and the GasTank/relayer is 0G infrastructure any
other builder can adopt — all three are live, so the pick costs nothing in honesty.

---

## 4th Wave Milestone (final)

One-command Aristotle mainnet cutover, proven gasless: a judge connects any wallet at the
demo URL and completes a gas-free agent payment on 0G mainnet (16661) — the gated deploy
script, canonical digest fix, and relayer are already verified on Galileo, so the
remaining work is funding, env cutover, and one recorded run.

---

## 5th Wave (final)

1. **Aristotle cutover.** Execute `DeployAristotle.s.sol` on 16661 (deploys and wires all
   seven instances with 7 pre-broadcast safety gates: non-zero pay cap, real swap pair,
   grants opt-in, admin wiring under a second oracle-admin broadcast, post-broadcast
   assertion wall). Cut env over per ADR-004 ordering.
2. **Relayer funding + public demo.** Top the relayer EOA to ≥0.5 OG (~800 sponsored ops
   at the measured 0.0006 OG/op; ~0.045 OG today covers a scripted demo only) and record
   one replayable session: fresh wallet claims grant, mints faucet USDC, sponsored swap +
   borrow, every op carrying a `Relayed` tx hash.
3. **Relayer durability.** Persist the sponsorship queue behind the EventStore;
   deadline-bounded signatures already allow re-submission.
4. **Lending v2.** External Pyth price for the LP collateral share (removes the documented
   feedback loop), interest accrual, liquidation path — testnet-rails-only until proven.
5. **Ops debt, explicitly not dropped.** Owner sweep helper for the retired tank
   `0xE986…898d` (holds 0.1 OG unreachable by `recoverReserve`, probed live) and an
   off-chain alarm on the Processor's `swapSolvency()` view so pool solvency is monitored,
   not just asserted at op-end.
6. **Mainnet params behind timelock.** Swap fee, borrow factor, and grants go behind the
   live 10-minute timelock pattern; frontend delegation card wired to the deployed
   DelegationRegistry in the same cutover.

---

## Declared build goals (previous waves)

1. **W1 — Payment security.** One capped pull primitive closing the MAX_PAY bypass on all
   pay lanes, compute-ratio cap so creators are never starved by 1-wei splits, verifier
   NFT-caller gate + one-shot `ProofUsed`, iData size caps.
2. **W2 — Signature settlement.** Permit2 witness settlement (`payForAgentWithPermit2`),
   DelegationRegistry with per-tx/windowed spend caps and mandatory Merkle selector roots,
   StateView facade with Multicall3 batch reads.
3. **W3 — Ship V3 to testnet.** Fresh Galileo deploy of the full V3 suite with in-script
   wiring assertions; backend, frontend, and ABIs re-pointed.
4. **W4 — Shrink the contract surface.** StateView folded into the Processor (6→5
   contracts), storage layout proven with `forge inspect` diffs, proxy upgraded live.
5. **W5 — Gasless users.** AxiomGasTank with lazy 0.01 OG grants, off-chain relayer
   (EIP-712, simulation, rate gates, dead-lettering), chat sponsor lane, frontend tank UX,
   so a user with zero ETH can act.
6. **W6 — Make it DeFi.** Constant-product pool, LP shares, lending inside the
   PaymentProcessor, axmWETH mock, 1,000-axmUSDC faucet, Pyth price endpoint — zero new
   contracts.
7. **W7–W9 — Prove it.** Mainnet-switch prep with browser E2E of the gasless journey,
   canonical EIP-712 digest fix found by that E2E and redeployed, sponsored DeFi chat
   tools behind a calldata gate.

---

## Merge table — what each draft contributed to the final

| Source | Best claim/line taken | Where it landed | Dropped or reconciled |
|---|---|---|---|
| proposal-1-product.md | "a user with zero ETH can pay an agent, swap, or borrow by typing a sentence" — the consumer framing of the sponsor lane | Updates field: "Sponsored chat tools: pay, withdraw, swap_tokens, borrow run gas-free" | P1's own Updates (2,354 chars) was the base skeleton; its digest-fix paragraph survives tightened |
| proposal-2-technical.md | "relayer reimbursement clamped three ways", "fuzz-verified over 257 runs", "Permit2 byte-identical to upstream (1 of 9,152 words)" | Updates bullets 1 and 6 | P2's 2,110-char Updates was too abstract for the lead; its GasTank spec details live in the 5th-wave context and bullets. "373 LOC" dropped: LOC is not a judge claim |
| proposal-3-evidence.md | The full E2E proof chain with tx hash, grant issuance inside `relay()`, and live relayer status JSON; the security ledger (S1–S6) | Updates lead sentence and Evidence line | P3's 907-test total adopted over P4's 908 (P3 re-verified live; P4's forge count of 344 disagrees by 1 — judges should never see two numbers). Its 4th-wave hash-level detail stays in P3, too long for the field |
| proposal-4-judge.md | "699 commits since June 23; 284 in the V3 campaign", the scoring-axis logic (Progress 40% + Traction 10% = ship and click), and the "fund the relayer + record one public demo" recommendation | Updates intro; 5th Wave item 2; milestone framing | P4's "908 tests" reconciled to 907 (see above). P4 cited the old tank `0xE986…898d` in its milestone — stale post-W8-redeploy; final uses `0xF192…CAaa` throughout |

Nothing load-bearing was lost: every address, test count, commit count, and the digest-fix
story appear in exactly one canonical form here, and `FINAL-SUBMISSION.json` carries the
same values for machine verification.
