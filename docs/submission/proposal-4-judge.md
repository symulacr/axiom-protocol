# Proposal 4 — AKINDO Judge Scoring Optimization (Axiom Protocol)

> Perspective: written to hit each scoring axis explicitly. Progress 40% / 0G Integration 30% / Technical 20% / Traction 10%. Every claim below is backed by a committed artifact, a deployment record, or a test count in this repo.

---

## Form fields

### Declared build goals

Axiom Protocol turns AI trading strategies into **ERC-7857 Intelligent NFTs (iNFTs)** on 0G Chain. Each iNFT carries an encrypted strategy payload on 0G Storage, runs its loop on 0G Compute, earns royalties through an on-chain PaymentProcessor, and is tradable/transferable with sealed DEK re-keying through a TEE-verifying oracle. The build goals declared across this campaign:

1. Ship the full iNFT lifecycle on 0G: mint with on-chain dataHash, vault deposit/withdraw/strategy, permissionless execute under daily limits, payments and royalties.
2. Make the whole user journey **gasless** via a GasTank + ERC-2771 forwarder + relayer purpose-built for 0G Chain, with Permit2 signature settlement.
3. Give the agent a chat surface that *does things*: swap, LP, borrow, pay, withdraw — DeFi tools executed through 0G's own rails (Compute for inference, Storage for transcripts, Chain for settlement).
4. Keep it honest: canonical cryptography, solvency invariants, mainnet safety gates, and a documented decision record for every 0G primitive we did or did not adopt.

### Product Category

**AI Agents on 0G** (primary) — agentic trading strategies tokenized as iNFTs with tool-calling chat. Secondary: **DeFi** (built-in swap pool / LP / lending inside the payment processor, Pyth-priced).

### Updates in this Wave

**9 executed waves in this campaign, each with committed code, tests, and live Galileo deploys. 699 commits on the public repo since June 23; 284 committed in the last 3.5 weeks of this V3 campaign alone (commit `1ca2244` baseline → HEAD). Every wave has a filed report under `docs/v3-proposals/waves/`.**

- **W1–W2 (contracts):** Permit2 witness settlement (`permitWitnessTransferFrom`), DelegationRegistry, StateView facade + Multicall3 batching, verifier NFT-caller gate with `ProofUsed`, payment-cap single-primitive, lifecycle fixes. Committed `f22ede9`, `934daf9`.
- **W3:** Fresh V3 suite deployed to Galileo (16602) — 7 contracts with proxies, backend/frontend cut over, in-script wiring assertions. Committed `1275aa7`; addresses in `docs/deployments/galileo-v3-2026-08-31.json`.
- **W4:** StateView folded into Processor, 6→5 contracts. Committed `6c131f6`.
- **W5:** `AxiomGasTank` + ERC-2771 retrofit across NFT and Processor, off-chain relayer (recover → simulate → sponsor-gate → queue → broadcast → reconcile), chat sponsor lane, full frontend tank UX (hook, card, badge, i18n). +58 tests in one wave. Committed `520352e`, `fd514c6`.
- **W6:** Constant-product swap pool, LP shares, and lending **inside** the PaymentProcessor (+26 forge tests, storage layout byte-identical), axmWETH mock, 1,000-axmUSDC faucet dripped through the relayer, Pyth price feed integration. Committed `dc23130`, `d081512`.
- **W7:** Mainnet-switch prep — `DeployAristotle.s.sol` extended to the full surface with 7 pre-broadcast safety gates; Permit2 verified live; **browser E2E of the gasless journey** executed via chrome-devtools with a mock EIP-6963 wallet, screenshots and RPC cross-checks filed. Committed `e060266`.
- **W8:** Found and fixed a real cryptography bug: the GasTank digest was non-canonical EIP-712 (dynamic-member expansion). Fixed to the canonical form matching Permit2's `hashWithWitness` pattern, redeployed, drift-guard test added. Committed `20c1761`.
- **W9:** Swap/borrow/LP exposed as gasless chat tools with server-side DeFi calldata gating (selector + target + pool-token checks before simulation). Committed `00d71e4`.

**Verification totals: 564 TypeScript tests green (config 62, chat-runtime 100, backend 249, frontend 153) + 344 Forge tests green (0 failed, 9 fork-gated skips) = 908 passing tests.** All deployed to Galileo testnet, not just run in CI: relayer worker on, faucet live, tank reads verified in-browser against chain state.

[char count: 2,517]

### 4th Wave Milestone

**The gasless DeFi agent, end to end on 0G Galileo.** Concretely, by the end of this wave the following is live and verifiable:

1. A user with **zero OG** can claim a gas grant from the GasTank, mint testnet USDC from the faucet, and then swap, provide liquidity, borrow against agent earnings + LP collateral, pay royalties, and withdraw — all through natural-language chat, all sponsored by the relayer (4 of the DeFi tools sponsored; `add_liquidity` deliberately wallet-lane because Permit2 batch permits bind the spender to `msg.sender`, documented in `w9`).
2. The relayer enforces admission server-side: EIP-712 signer recovery, `eth_call` simulation, per-user token bucket (6/min), inflight caps, `maxGasCost` ceiling, and a DeFi selector/target/token gate that rejects third tokens before the op ever touches the queue.
3. Every digest is canonical: the W8 fix made the GasTank's `forwardRequestDigest` match what wallets actually sign, proven by an on-chain probe (before `0x1f99abc5…` ≠ after `0xc54973dd…`) and pinned by test T17 forever.
4. Mainnet is one command away: `DeployAristotle.s.sol` deploys and wires 7 contracts with 7 pre-broadcast safety gates (required swap pair, non-zero pay cap, grants opt-in, relayer/key separation, admin-wiring under the oracle-admin leg, post-broadcast assertion wall), dry-run proven against anvil with negative cases filed.
5. Browser E2E evidence: tank card values match on-chain state exactly (`gasGrant 0.01e18`, `grantsCap 3`), sponsored ops relay through the real GasTank contract `0xE986…898d`, screenshots filed.

### 5th Wave

Planned next, in priority order:

1. **Aristotle mainnet cutover.** Execute the gated deploy script against `evmrpc.0g.ai` (16661), verify the artifact against chainscan, cut env over per ADR-004 ordering, fund the relayer EOA (top-up analysis in `w9` §6: ~0.0006 OG/op, ≥0.5 OG recommended for a public demo), smoke one gasless relay before opening traffic.
2. **Timelock + governance hardening on mainnet params.** Swap fee, borrow factor, and grants go behind the existing timelock pattern (10-minute timelock already live from W6, commit `ca1fbb3`).
3. **Relayer durability.** Persist the sponsorship queue behind the EventStore (deadline-bounded signatures already allow re-submission; identified in `w5-b` §8.1).
4. **Lending v2.** External oracle price for the LP B-share (removes the documented collateral feedback loop), interest accrual, liquidation path — scoped as testnet-rails-only today and stated as such in NatSpec.
5. **Delegation flows on the frontend.** The DelegationRegistry is deployed; the AgentPage delegation card is built and shows its documented unset state — wire it to a live address in the same cutover.

---

## Scoring-axis map (why this form scores)

**Progress 40%.** Nine executed waves, each closing with a commit, a filed report, and (where the wave touched contracts) a live Galileo deployment record. 699 public commits since June 23; 284 in the V3 sprint. 908 passing tests. The waves show a shipping rhythm, not a sprint-and-stall: contracts (W1–W4), gasless UX (W5), DeFi surface (W6), mainnet prep + E2E (W7), a cryptography fix found by adversarial self-review (W8), and chat-native DeFi tools (W9).

**0G Integration 30%.** Every 0G primitive, with where it lives in the code:

- **0G Chain (Galileo 16602):** all settlement and contracts — TeeVerifier, AgentNFT, StrategyVault, PaymentProcessor, GasTank, DelegationRegistry, StateView, mocks. Seven deployment records under `docs/deployments/`.
- **0G Storage:** `@0gfoundation/0g-storage-ts-sdk` 1.2.11 against the Turbo indexer (`indexer-storage-turbo.0g.ai` / testnet variant, `packages/config/src/networks.ts`). Encrypted agent payloads whose Merkle root registers on-chain as `dataHash`; chat transcripts persisted to the `chat::transcript` bucket; sealed-DEK custody (`AXIOM_DEK_CUSTODY`, senderless re-key with row deletion, commit `e48052c`).
- **0G Compute:** agent chat + strategy-tick inference through the 0G router (`router-api.0g.ai`), via the SDK-recommended `openai` npm path, with router price-cap headers added in `abb0e89`.
- **GasTank gas abstraction:** built for 0G Chain specifically — lazy gas grants, ERC-2771 forwarding on both the NFT and Processor, per-op gas ceiling, reserves and grants fully on-chain.
- **Permit2 / forwarders:** the pattern native to 0G tooling — witness settlement on the pay lane, single + batch permits on swap/LP/repay, and the documented non-relayability cases (W6 T25, W9 `add_liquidity`).
- **Pyth:** price feeds power the DeFi surface (`apps/backend/src/oracle/pyth.ts`, `/v1/prices` router, W6-B).
- **DA:** honestly evaluated and declined in ADR-002 (`docs/adr/002-da-not-applicable.md`), with the 0G Storage-based reasoning and a corrected audit note. Judges should not have to guess why DA is absent; it is written down.

**Technical 20%.**

- **Canonical EIP-712:** W8's digest fix matches Permit2's `hashWithWitness` expansion exactly — dynamic members hashed into one word, never ABI-in-place. The probe (before/after digests) and the permanent T17 drift-guard test are the evidence.
- **ERC-7857, fully implemented:** mint with dataHash registration, iTransfer challenge/finalize with ownership proofs, sealed-DEK re-keying through the oracle, Permit2-denominated royalties. The TEE verifier is a software signer with an explicit honesty note in `docs/current-state.md` — we claim the implementation, not fake hardware.
- **DeFi math inside the payment processor:** Uniswap-V2-mirror `getAmountOut` with fee on input, hand-computed test assertions (T6: `498_003_490_519_951_608` wei), sqrt LP shares with min-side protection, and a `swapSolvency()` invariant (tracked reserves ≤ raw balance) asserted after every state-changing pool op and tested to catch underfunding (T15).
- **Mainnet deploy discipline:** 7 safety gates in `DeployAristotle.s.sol`, all proven to fire pre-broadcast in filed dry-run negative cases.

**Traction 10%.** Live relayer worker and faucet on Galileo; browser-verified UI (W7-C screenshots, tank reads matching chain); 908 green tests; the full history is public at **github.com/symulacr/axiom-protocol** — judges can verify every commit, report, and deployment record themselves rather than trusting this form.

---

## 3 ranked product-category combos

1. **AI Agents × DeFi on 0G** (recommended). The agent chat that swaps/LPs/borrows gaslessly is the differentiator; it exercises Chain, Storage, Compute, and the GasTank in one demo. Strongest fit to 0G's "AI + DeFi" positioning and to the Progress/Integration axes, which carry 70% of the weight.
2. **AI Agents (primary) × Infra (secondary).** Lead with iNFTs as 0G-native AI agent ownership (ERC-7857 + sealed DEK custody on 0G Storage), with the GasTank/relayer as 0G infrastructure contribution. Better if judges reward novel 0G-only primitives over DeFi breadth.
3. **DeFi (primary) × AI (secondary).** Lead with the in-processor swap/LP/lend + Pyth + Permit2 stack, with the agent as the interface. Weakest of the three: it buries the ERC-7857 agent work that no other submission will have, and DeFi-only submissions are the most crowded lane.

## One thing that would most raise the score

**Top up the relayer EOA (≥0.5 OG, per the W9 runway analysis) and record one public, replayable gasless demo — a single browser session where a fresh wallet claims a grant, mints faucet USDC, and executes a sponsored swap + borrow, posted as a video or live URL.** Right now the relayer holds ~0.045 OG (~76 sponsored ops), which covers a scripted demo but not judge traffic, and the W7-C E2E evidence lives in screenshots judges must dig for. The scoring split puts 40% on Progress and 10% on Traction; both are measured substantially by "does it run when I click it." A funded relayer plus one unambiguous live demo converts the strongest claims in this form (gasless agent DeFi on 0G) from documented to observable, and it costs less OG than any other improvement available.
