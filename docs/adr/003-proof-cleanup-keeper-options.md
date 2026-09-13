# ADR 003: Proof-Cleanup Keeper Options for `cleanExpiredProofs`

Status: DECISION PENDING — the user has NOT picked a keeper. No automation is
registered and no code path exists for any of the options below.
Date: 2026-08-27
Ledger row: M2 (session 2026-08-24, `waves-ledger.md`)
Research source: `analysis_reports/session-2026-08-24/r3-web-research.md` §2 (all
costs and citations below are R3's, Firecrawl-verified against official docs).

## Problem

`cleanExpiredProofs(bytes32[])` (AxiomTeeVerifier / `BaseVerifier.sol`) garbage-
collects used/expired proof nonces, and `transferAndCleanExpiredProofs`
(AxiomAgentNFT.sol:214) folds cleanup into a transfer. Both have **zero
production callers** — `usedProofs` grows unbounded on-chain. In practice the
only cleaner that runs is the e2e indexer-side job (`apps/backend/e2e/e2e/steps.ts:741-789`),
which is a test harness, not production maintenance.

All three options below are scheduled, permissioned (forwarder-allowlist) calls
requiring **no contract redeploy**.

## Option A — Chainlink Automation (time-based upkeep / Job Scheduler)

- Mechanism: register a cron-scheduled upkeep against the verifier address + ABI
  targeting `cleanExpiredProofs()`; funded with a LINK balance per upkeep. No
  Automation-compatible contract changes needed
  (docs.chain.link/chainlink-automation/guides/job-scheduler, scraped).
- Cost model (docs.chain.link/automation-economics, scraped):
  `Fee = gasPrice × gasUsed × (1 + premium%) + gasOverhead × gasPrice`.
  No registration fee; no fee for offchain computation. Worked Polygon example:
  110,051 gas ≈ **0.008077 LINK** (70% network premium + 80,000 gasOverhead) —
  R3's ~0.008 LINK/day estimate for a daily low-gas cleanup. Base (Axiom's
  chain) premium is materially lower than the Polygon 70% example; exact
  per-chain value is on the Supported Networks page (not captured).
  Cancellation fee 0.1 LINK for upkeeps that spent <0.1 LINK lifetime.
- Caveat: Chainlink positions CRE (Runtime Environment) as the successor
  (cron → offchain logic → `KeystoneForwarder`); a migration guide maps
  Time-based Upkeep → CRE. A new registration today should weigh starting on
  the successor.
- Trust: decentralized keeper network, well-audited; LINK funding/treasury
  friction is the main operational cost.
- Ops burden: low once funded (network performs the cron); monitor min-LINK
  balance (below it the network stops performing).

## Option B — Gelato Relay `callWithSyncFee`

- Mechanism: backend (or any relayer script) calls Gelato's
  `callWithSyncFee` targeting `cleanExpiredProofs()`; the **target contract
  pays the fee to Gelato's fee collector during execution** — the contract can
  fund its own cleanup (gelatodigital/how-tos-5-6-7-8-relay-intro, scraped;
  docs.gelato.network callWithSyncFee). `sponsoredCall` is the alternative
  where the developer's 1Balance pays.
- Cost: per-execution gas + Gelato fee, paid from the contract's balance (or
  1Balance); no LINK token exposure.
- Trust: centralized single-relayer network (Gelato), fee collector must be
  pre-authorized as an allowed caller on the verifier.
- Ops burden: requires something to trigger the relay call (a lightweight
  cron in the backend) and the contract to hold gas funds — AxiomTeeVerifier
  currently has no fee-funding path, which would need a product decision.

## Option C — e2e-indexer-as-cleaner (status quo, documented)

- Mechanism: no automation. Document the existing e2e indexer job
  (`cli/e2e/steps.ts:741-789`) as the sole cleaner and mark the on-chain
  `cleanExpiredProofs` path reserved-for-admin.
- Cost: zero (test-harness only).
- Trust: none required.
- Ops burden: zero — but `usedProofs` keeps growing unbounded on-chain, and
  cleanup depends on e2e runs happening.

## Decision table

| Criterion | A: Chainlink Automation | B: Gelato callWithSyncFee | C: e2e-as-cleaner (status quo) |
| --- | --- | --- | --- |
| Cost | ~0.008 LINK/day est. (per-execution gas + chain premium; Base premium lower than Polygon 70% example) | Per-execution gas + Gelato fee, paid by target contract | Zero |
| Trust | Decentralized keeper network | Centralized relayer (Gelato) | None |
| Ops burden | Low after LINK funding; watch min balance | Needs a cron trigger + contract fee-funding path (doesn't exist yet) | Zero, but unbounded on-chain growth persists |
| Contract changes | None | None (but needs a funding path decision) | None |
| Redeploy | No | No | No |

## Consequences

- Until a decision is made, no automation is registered anywhere and the only
  exerciser of `cleanExpiredProofs` remains the e2e suite.
- If the decision is A or B, register the upkeep/relay and record it here with
  its on-chain address and funding source. If C, mark the on-chain path
  reserved-for-admin in the deployment docs instead.

## Configurable implementation (wave I3)

Status: all three options above are now **executable by configuration** in the
backend — no contract change (this ADR requires none) and no automation is
registered. The decision remains pending; picking an option is now an env
change plus the third-party registration step, not a code campaign.

Module: `apps/backend/src/keepers/index.ts` (`startKeeper()`), wired into the
backend boot (`apps/backend/src/index.ts`) **after** `startServer`/indexer
start, torn down first in the shutdown drain. Default is OFF: existing deploys
behave exactly as before.

### Env matrix (validated in `@axiom/config` env-schema)

| Env | Default | Meaning |
| --- | --- | --- |
| `AXIOM_KEEPER_MODE` | `off` | `chainlink` \| `gelato` \| `indexer` \| `off`. `off` starts nothing. |
| `AXIOM_KEEPER_INTERVAL_MS` | `86400000` (24h) | Sweep cadence in `indexer` mode (ADR-003 Option C cadence; A/B are platform-driven, ignored). |
| `AXIOM_KEEPER_GAS_CAP_GWEI` | unset (no cap) | Skip the sweep when chain gasPrice exceeds this gwei cap. RPC fee-data failure is treated as within cap. |
| `AXIOM_KEEPER_NONCES` | unset | Operator-supplied candidate nonces (comma-separated; canonicalized to 32-byte hex). See nonce-sourcing note below. |
| `AXIOM_KEEPER_BATCH_MAX` | `256` | Sweep-batch ceiling; clamped to the contract's on-chain require of ≤ 256 (BaseVerifier.sol:24). |

### Mode mapping to the options above

- `indexer` → **Option C made operational**: the backend runtime-signer wallet
  calls `cleanExpiredProofs` directly on the poll interval (permissionless per
  `FuzzAxiomTeeVerifier.t.sol` "anyCallerCanClean"). No third-party account.
  Safety: per-tick error tolerance (one failed sweep never kills the interval),
  gas cap, batch clamp, `unref`'d timer so the keeper alone never holds the
  process open.
- `chainlink` → **Option A preparation, stub**: logs
  `keeper mode chainlink requires <prereq> — running in passive mode` (cites
  the cost model above) and exposes `upkeepHandler(candidateNonces)` — the
  exact entry point a registered time-based upkeep / custom-logic upkeep
  targets. Nothing is scheduled or faked until the upkeep is registered.
- `gelato` → **Option B preparation, stub**: same passive log (cites the
  missing contract fee-funding path decision) and exposes
  `relayCallHandler(candidateNonces)` for the relay task. Registration
  requires the fee-collector allowlist + funding-path product decision.

### Nonce sourcing constraint (why AXIOM_KEEPER_NONCES exists)

The on-chain `usedProofs` mapping is `internal` (BaseVerifier.sol:14), no
`ProofUsed` event is emitted, and the transfer route's challenge/final response
is not persisted — so a keeper cannot enumerate used nonces on-chain. Without a
contract change (none required by this ADR), the candidate set is
operator-supplied, collected the same way the e2e cleaner derives nonces
(`computeTransferProofNonce`, `apps/backend/e2e/e2e/steps.ts`). An empty list
skips the sweep with a log line. A future `ProofUsed`-style event or an
enumerable view would remove this limitation — contract-scope decision, not
this ADR's.

### Tests

`apps/backend/src/keepers/index.test.ts`: OFF/unset start nothing; indexer-mode
interval sweep (fake timers); gas-cap skip and RPC-failure-fails-open; batch
clamp to 256; error tolerance; empty-candidate skip; missing-verifier
refuse-to-start; passive stub modes; nonce canonicalization.
