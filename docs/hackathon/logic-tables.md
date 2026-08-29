# Axiom Protocol — Logic Explained (Tables)

Plain-language companion to the mermaid diagrams. Every table answers "what happens, why, and what does the user get."

---

## Table 1 — The four contracts and what each one guards

| Contract | Owns | The one rule that matters | What breaks without it |
| --- | --- | --- | --- |
| **AxiomTeeVerifier** | Proof validity | Only allowlisted signers verify; proofs are ≤7 days old, one-shot | A leaked TEE key forges transfers of every iNFT |
| **AxiomAgentNFT** (ERC-7857) | Identity + ownership | Transfers are iTransfers (re-keyed metadata), never bare ERC-721 | Buyer receives an agent whose secrets still open for the seller |
| **AxiomStrategyVault** | Funds | Daily spend limit + one-shot actions + expiry; non-upgradeable | A buggy strategy drains the vault; "upgrade fix" becomes the exploit |
| **AxiomPaymentProcessor** | Money split | One `_split()`, MAX_PAY cap, 1% protocol, creator credit | Three divergent splits drift; an over-pay becomes unrefundable |

---

## Table 2 — A user's first 10 minutes, click by click

| Step | What the user does | What the app does behind the scenes | What the chain records | Time |
| --- | --- | --- | --- | --- |
| 1 | Clicks "Connect wallet" | wagmi discovers the wallet via EIP-6963 (1-click, no modal detour) | — | 2s |
| 2 | Sees the FirstRunChecklist (Mint → Fund → Run) | App reads existing state; steps self-check as they complete | — | 0s |
| 3 | Types an agent name, clicks once | `POST /v1/agents/mint/encode {name, owner}` — server derives the dataHash (keccak256 of name) | — | 1s |
| 4 | Signs in the wallet popup | `walletClient.sendTransaction` with relayed calldata | `mint()` → iNFT #N, `CreatorSet` | ~2s |
| 5 | Funds the vault, sets a daily limit | One merged tx: `depositAndSetStrategy` | `Deposited` + `StrategySet` | ~2s |
| 6 | Runs a tick | Strategy context streams from 0G Compute; `strategyGuard` pre-checks the vault invariant in TS before any revert can happen | `execute()` or a *proven* revert | ~3s |
| 7 | (Later) transfers the agent | Receiver address only — oracle re-keys from custody | `iTransferFrom` + proofs swept | ~25s |
| — | — | — | **Total to a live, funded, running agent:** | **~10 min** |

---

## Table 3 — Where the intelligence lives (0G stack usage)

| 0G component | Axiom's usage | Depth markers (judges' 30% criterion) |
| --- | --- | --- |
| **0G Chain** | All four V2 contracts live on Galileo 16602; indexer polls every 3s | UUPS + timelocks + AccessControl + append-only storage layouts; 201 forge tests incl. fuzz; fresh V2 deploy executed per ADR-004 §3 |
| **0G Compute** | Strategy-tick inference via the router (qwen2.5-omni), SSE-streamed tokens into the chat console | `X-0G-Provider-Max-Price-Usd` caps (failover-safe cost ceiling), `Trust-Mode: verified`, per-provider `ComputeProviderPaid` accounting on-chain |
| **0G Storage** | Encrypted agent metadata blobs (AES via DEK, ECIES-sealed key transport); content-addressed rootHash binding | Wrong-key canary (AXIOM1 magic + typed error — silent ciphertext is impossible); custody store with delete-on-rekey |
| **0G Agentic ID** | ERC-7857 iNFTs with sealed-key re-keying on transfer — the standard's core loop, hardened beyond the Final spec | iClone semantics shipped, verifier signer-allowlist (containment), spec deviations documented |
| **0G Pay** | Rewards rail for the buildathon; ready as an agent top-up rail | — |

---

## Table 4 — Failure matrix (what happens when everything goes wrong)

| Failure | Surface the user sees | On-chain truth | Proven by |
| --- | --- | --- | --- |
| Mint with wrong fee value | Encode relay rejects pre-send | `mint()` would revert | e2e failure matrix |
| Deposit of 0 | Guard pre-check | `ZeroAmount()` | e2e (exact selector) |
| Execute without a strategy | Guard pre-check blocks | `NoStrategySet()` | e2e (exact selector) |
| Execute over the daily limit | Guard pre-check blocks (TS mirror) | `DailyLimitExceeded()` | e2e + 12 chain-parity tests |
| Pay over MAX_PAY | Wallet shows revert at simulation | `PayAmountExceedsCap(amount, cap)` | e2e + live V2 tx |
| Transfer with expired proof | Honest error + retry guidance | `AxiomProofExpired()` | e2e (exact selector) |
| Revoked signer's proof | — (server-side) | `AxiomInvalidOwnershipProof()` | e2e (exact selector) |
| Non-admin tries to pause/set fee | — | `AccessControlUnauthorizedAccount` | e2e (exact selector) |
| RPC outage | App keeps working | — | wagmi fallback → dRPC/Ankr; **live-proven** (Ankr answered during a primary+dRPC abort) |
| Wrong-key blob download | Typed `WrongKeyOrCorruptError` | — | canary test (silent ciphertext impossible) |
| Checkpoint corruption | Loud error + `system.resync` event | — | indexer test (kill-switch: `AXIOM_QUIET_RESYNC`) |
| Compromised TEE signer | — | Revoke = 1 tx, same-block containment | Verifier allowlist tests (V2) |
| Compromised admin wallet | — | Upgrades + fee drain need a 1-day timelock | NFT timelock tests (V2) |

---

## Table 5 — Judging criteria mapping (0G Bridge, Wave 3)

| Criterion (weight) | What Axiom shows | Evidence |
| --- | --- | --- |
| **Progress & Momentum (40%)** | From RainbowKit-era V1 to a hardened V2 suite deployed fresh on testnet, plus a full test marathon, in one program wave | Git history (~690 commits), deployment record `galileo-v2-2026-08-28.json`, e2e Live Gate 43/43 |
| **0G Integration (30%)** | All four 0G components in production paths: Chain (V2 contracts), Compute (streamed strategy ticks + price caps), Storage (encrypted iNFT metadata + canary), Agentic ID (ERC-7857 Final, hardened) | Architecture diagrams §3–§5; adoption backlog executed (Wave I1) |
| **Technical Quality & Execution (20%)** | 577 tests green across 5 suites, 0 suppressions, ADRs 002–004, append-only storage layouts, machine-pinned cross-language parity | Test counts + ADRs + parity test (`strategy-guard.chain-parity.test.ts`) |
| **Traction & Communication (10%)** | This diagram pack + one-pager; incremental reports for every wave; honest failure documentation | `analysis_reports/session-2026-08-24/` (30+ evidence files) |

---

## Table 6 — V2 hardening vs V1 (what the rewrite bought)

| Surface | V1 | V2 |
| --- | --- | --- |
| Fee withdrawal | Instant, single admin key | 1-day timelock (propose/execute/cancel) |
| Contract upgrades | Instant `_authorizeUpgrade` | 1-day timelock behind DEFAULT_ADMIN |
| Payment governance | Ownable (2nd governance model) | AccessControl — one model suite-wide |
| Split logic | 3 divergent copies (drift risk) | 1 internal `_paySplit()` |
| Pay bound | App-level caps ("consistent by luck") | `MAX_PAY` chain invariant |
| Verifier signer | Single key; compromise = forgeable transfers for a 1-day cycle | Allowlist; revoke = same-block containment |
| Dead surfaces | `authorizeDelegateAndRevoke`, `OPERATOR_ROLE`, `payAndWithdrawEarnings` | Removed (audit surface shrunk) |
| Strategy invariants | Hand-mirrored Solidity ↔ TS (silent drift burned reverts) | Machine-pinned parity test (12 cases) |
| Blob integrity | Wrong-key download = silent ciphertext | Canary + typed error |
