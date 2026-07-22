# Coverage Week — TODO Tracker

**Manifest (source of truth):** [`.coverage/manifest.json`](.coverage/manifest.json)  
**Full plan:** [`COVERAGE-WEEK-PLAN.md`](COVERAGE-WEEK-PLAN.md)  
**Status CLI:** `pnpm run coverage-status` · mark done: `pnpm run coverage-status -- done T-003`

Update manifest when you finish a task (or use the CLI). This file is a human-readable mirror — refresh checkboxes from manifest if they drift.

---

## Quick status

| Metric | Value |
|--------|-------|
| Week | Mon 6 Jul – Sun 12 Jul 2026 |
| Current day | **Day 7** |
| Tasks | **25/27 done** (see manifest) |
| Blockers | none (rate limit + USDC resolved) |

---

## Gates (end of week)

- [x] E2E REUSE wall time recorded (83s no-chat / 197s with live chat)
- [x] Load bench 100% @ c=1/5/10/20
- [x] Chat tool parity 100% (11/11 incl. archive)
- [x] Chat eval live ≥90%
- [x] Production eval ≥85%
- [x] CI PR + nightly (partial — needs live secrets in CI)
- [x] E2E-DISCOVERIES D-030–D-035

---

## Day 1 — Mon 6 Jul · Unblock live chat

- [x] **T-001** Restart backend `AXIOM_RATE_LIMIT_MAX=50000`
- [x] **T-002** *(skipped)* Per-route chat rate limit
- [x] **T-003** Live chat bench all green
- [x] **T-004** Log results → D-031

---

## Day 2 — Tue 7 Jul · E2E + REUSE

- [x] **T-005** `E2E_REUSE_TOKEN=1 E2E_LIVE_COMPUTE=1` E2E exit 0 (88% parity, 197s)
- [x] **T-006** Wall time with `E2E_CHAT_BENCH=0` → D-033 (83s)
- [x] **T-007** Fund operator MockUSDC (110474 units)
- [x] **T-008** E2E snapshot valid (`tokenId=34`, reuse verified)

---

## Day 3 — Wed 8 Jul · Archive + scripts

- [x] **T-009** Archive tools in `chat-bench.ts`
- [x] **T-010** `package.json` scripts
- [x] **T-011** CI-friendly parity `E2E_LIVE_COMPUTE=0`

---

## Day 4 — Thu 9 Jul · CI

- [x] **T-012** GitHub Actions PR: chat-bench
- [x] **T-013** Nightly: REUSE E2E + load bench
- [x] **T-014** Nightly live chat (`continue-on-error`)
- [x] **T-015** Document CI secrets

---

## Day 5 — Fri 10 Jul · Write tools + perf

- [x] **T-016** Write-tool decision → D-034 (B+C)
- [x] **T-017** Backend deposit/withdraw encode routes
- [x] **T-018** E2E operator sign micro-deposit (`runMicroDepositSignBench`)
- [x] **T-019** Agent list perf / TTL 120s

---

## Day 6 — Sat 11 Jul · Hardening

- [x] **T-020** `/health/live` split
- [x] **T-021** Connection reuse note
- [x] **T-022** Load bench chat-smoke lane
- [x] **T-023** Load bench re-run

---

## Day 7 — Sun 12 Jul · Ship

- [x] **T-024** E2E-DISCOVERIES D-030–D-035
- [ ] **T-025** PR stack to `origin` (32 commits ahead)
- [x] **T-026** Final verification (all gates)
- [x] **T-027** Plan checkboxes complete

---

## Baseline (already done)

- [x] **T-028** E2E KEEP/REUSE/mega fast paths
- [x] **T-029** `chat-bench.ts` + eval + scenarios
- [x] **T-030** Health cache + load bench 100%
- [x] **T-031** Chat bench wired in `run-e2e.ts`
- [x] **T-032** Live SSE keepalive + tools

---

## Blockers

| ID | Issue | Fix |
|----|-------|-----|
| `blk.rate-limit` | ~~Chat bench 429~~ | resolved — `AXIOM_RATE_LIMIT_MAX=50000` |
| `blk.usdc` | ~~Payment skipped~~ | resolved — deployer transfer 0.1 USDC |

---

## How to update state

```bash
pnpm --filter @axiom/backend run coverage-status
pnpm --filter @axiom/backend run coverage-status -- done T-001
```