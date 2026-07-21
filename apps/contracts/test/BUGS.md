# AxiomAgentNFT — Bugs Discovered by Live-Contract Fuzz Testing (Index)

This file has been **split into per-milestone files** under `docs/bugs/`.
Below is the index linking each milestone section to its extracted file.

---

## Preamble — Wave 11 fuzz campaign (BUG-1 to BUG-6)

Originally was line 1-430. Contains the initial fuzz findings, BUG-1
(ERC-7201 storage slot mismatch) through BUG-6, verification commands,
bug-discovery matrix, and canonical sources.

➡ [docs/bugs/00-preamble.md](bugs/00-preamble.md) (431 lines)

---

## Wave 13 — Contract limits & discovery

| File | Lines | Description |
|------|-------|-------------|
| [docs/bugs/wave-13d.md](bugs/wave-13d.md) | 293 | TeeVerifier + 0G Storage Limits |
| [docs/bugs/wave-13c.md](bugs/wave-13c.md) | 355 | Payment Processor + 0G Compute Discovery |
| [docs/bugs/wave-13a.md](bugs/wave-13a.md) | 262 | AxiomAgentNFT Limits |

## Wave 14 — Fixes, discovery, and deployment tests

| File | Lines | Description |
|------|-------|-------------|
| [docs/bugs/wave-14a.md](bugs/wave-14a.md) | 159 | Payment Processor Redeploy |
| [docs/bugs/wave-14b.md](bugs/wave-14b.md) | 234 | AxiomTeeVerifier Timestamp Check + Immutable Getter |
| [docs/bugs/wave-14c.md](bugs/wave-14c.md) | 270 | Live on-chain E2E Replay After PaymentProcessor "Fix" |
| [docs/bugs/wave-14d.md](bugs/wave-14d.md) | 239 | TEE-signed Proof + Timestamp Variants |
| [docs/bugs/wave-14e.md](bugs/wave-14e.md) | 193 | NFT 100-Mint / 100-Transfer Hammer |
| [docs/bugs/wave-14f.md](bugs/wave-14f.md) | 274 | 5-Wallet Concurrent-Mint Race |

## Wave 15 — On-chain cross-checks

| File | Lines | Description |
|------|-------|-------------|
| [docs/bugs/wave-15a.md](bugs/wave-15a.md) | 377 | Cross-check of 4 bugs from Waves 11–14 |
| [docs/bugs/wave-15b.md](bugs/wave-15b.md) | 995 | Cross-check of 4 bugs from Wave 14C / 14E (includes 16A, 16B sub-sections) |
| [docs/bugs/wave-15c.md](bugs/wave-15c.md) | 267 | Cross-check of 8 bugs from Waves 11–14 (TEE bench, cast tooling, test infra) |
| [docs/bugs/wave-15d.md](bugs/wave-15d.md) | 474 | Cross-check of Wave 11A/11C/11D fuzz discoveries |

## Wave 17 — Deep-dive sub-waves (Wave 1 D1–D3, Wave 2 A–C)

| File | Lines | Description |
|------|-------|-------------|
| [docs/bugs/wave-17-d3.md](bugs/wave-17-d3.md) | 69 | 32-agent deep-dive, Wave 1 D3 (import rename + drift doc) |
| [docs/bugs/wave-17-d2.md](bugs/wave-17-d2.md) | 161 | 32-agent deep-dive, Wave 1 D2 (idempotent funding flow) |
| [docs/bugs/wave-17-d1.md](bugs/wave-17-d1.md) | 188 | 32-agent deep-dive, Wave 1 D1 (processResponse + chatID + per-provider secret) |
| [docs/bugs/wave-17-wave2c.md](bugs/wave-17-wave2c.md) | 68 | Wave 2 C — 0G Compute speech-to-text wrapper |
| [docs/bugs/wave-17-wave2b.md](bugs/wave-17-wave2b.md) | 122 | Wave 2 B — text-to-image via 0G Compute Network |

## Wave 1.5 — Simplify Findings (review of Wave 1)

➡ [docs/bugs/wave-1.5.md](bugs/wave-1.5.md) (113 lines)

## Wave 2 — Compute streaming

| File | Lines | Description |
|------|-------|-------------|
| [docs/bugs/wave-2a.md](bugs/wave-2a.md) | 74 | Wave 2 A — 0G Compute streaming chat completion (SSE) wrapper |
| [docs/bugs/wave-2.5.md](bugs/wave-2.5.md) | 77 | Simplify Findings (post-Wave 2 review of A/B/C compute files) |

## Wave 3 — Storage wrappers

| File | Lines | Description |
|------|-------|-------------|
| [docs/bugs/wave-3a.md](bugs/wave-3a.md) | 124 | Wave 3 A — 0G Storage KV (Batcher + KvClient) wrapper |
| [docs/bugs/wave-3b.md](bugs/wave-3b.md) | 215 | Wave 3 B — 0G Storage Indexer REST range fetch |
| [docs/bugs/wave-3c.md](bugs/wave-3c.md) | 124 | Wave 3 C — chainId picker for the orchestrator's storage URL |
| [docs/bugs/wave-3.5.md](bugs/wave-3.5.md) | 545 | Simplify Findings |

## Wave 4 — Encryption, file handling, storage integrity

| File | Lines | Description |
|------|-------|-------------|
| [docs/bugs/wave-4a.md](bugs/wave-4a.md) | 58 | Client-side AES-256-GCM + ECIES seal wrapper |
| [docs/bugs/wave-4c.md](bugs/wave-4c.md) | 152 | 0G Storage ZgFile file-handle close (SDK contract) |
| [docs/bugs/wave-4.5.md](bugs/wave-4.5.md) | 176 | Simplify Findings (intro + files touched/not touched + canonical sources) |

## Wave 5 — Orchestrator fix + agent skills adoption

➡ [docs/bugs/wave-5.md](bugs/wave-5.md) (429 lines)
- Wave 5 C: Adopt 0G agent skills
- Wave 5 B: Verifier `validUntil` regression (live-fork test)
- Wave 5 A: orchestrator:73 fix
- Wave 5.5: Simplify Findings

## Wave 6 — SealedKey invariant + oracle storage binding

➡ [docs/bugs/wave-6.md](bugs/wave-6.md) (540 lines)
- Wave 6 C: E2E skill citations
- Wave 6 B: SealedKey 7-day re-seal invariant
- Wave 6 A: Oracle storage+chain binding
- Wave 6.5: Simplify Findings

## Wave 7 — Compute revisit (streaming, TTI, STT)

➡ [docs/bugs/wave-7.md](bugs/wave-7.md) (968 lines)
- Wave 7 A: streaming chat revisit
- Wave 7 B: text-to-image revisit
- Wave 7 C: speech-to-text revisit
- Wave 7.5: Simplify Findings

## Wave 8 — Provider discovery, context limits, SDK rename

➡ [docs/bugs/wave-8.md](bugs/wave-8.md) (759 lines)
- Wave 8 B: Context-limits + max_completion_tokens
- Wave 8 C: SDK rename (default swap)
- Wave 8 A: Data-driven provider discovery
- Wave 8.5: Simplify Findings + 3 HIGH fixes

## Wave 9 — DataHash, metadata, TEE picker

➡ [docs/bugs/wave-9.md](bugs/wave-9.md) (519 lines)
- Wave 9 A: dataHash identity check
- Wave 9 C: TEE-verified picker
- Wave 9 B: iNFT metadata decision
- Wave 9.5: Simplify Findings

## Wave 10 — Precompiles, router fallback, library conversion

➡ [docs/bugs/wave-10.md](bugs/wave-10.md) (654 lines)
- Wave 10 A: Chain precompile sanity
- Wave 10 B: Router fallback + DA chaos
- Wave 10 C: AxiomMetadataJson library conversion + wire-in
- Wave 10.5: Simplify Findings

## Wave 11 — Skill adoption verification

➡ [docs/bugs/wave-11.md](bugs/wave-11.md) (577 lines)
- Wave 11 B: SKILL-DRIFT doc finalization
- Wave 11 C: Skill-adoption cross-validation
- Wave 11 A: Skill adoption verification
- Wave 11.5: Simplify Findings

## Wave 12 — Dead code, storage sweep, concurrent mints

➡ [docs/bugs/wave-12.md](bugs/wave-12.md) (1047 lines)
- Wave 12 A: Dead-code scan + merge proposal
- Wave 12 C: 0G Compute 3-way parallel fan-out probe
- Wave 12 F: Skills README + 7 new skills
- Wave 12 B: Storage size sweep 1 KiB → 5 GiB
- Wave 12 E: Perf + storage footprint
- Wave 12 D: Concurrent wallet mints
- Wave 12.5: Simplify Findings + storage merge

## Wave 13 — Aristotle mainnet redeploy

➡ [docs/bugs/wave-13.md](bugs/wave-13.md) (315 lines)

## Wave 14 — Demo prep + FINAL render

➡ [docs/bugs/wave-14.md](bugs/wave-14.md) (329 lines)
- Wave 14: Token2049 / AKINDO WaveHack demo prep
- Wave 14 FINAL: MP4 render + Playwright capture + v1.0.0 tag

## Wave 1 P0 — Post-deployment hot-fixes

➡ [docs/bugs/wave-1-p0.md](bugs/wave-1-p0.md) (85 lines)
- Proof field mismatch + canonical replay nonce
- AxiomPaymentProcessor unregistered-creator / royalty-zero fixes

## Wave 2 P0 — Backend route stubs and indexer DA signer

➡ [docs/bugs/wave-2-p0.md](bugs/wave-2-p0.md) (178 lines)

---

> **Note:** This index replaces the original monolithic BUGS.md (13,488 lines).
> The historical table-of-contents comment (in `00-preamble.md`) references
> line numbers from the original combined file; use the index above to find
> each section's extracted file.
