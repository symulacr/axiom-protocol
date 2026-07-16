# Final Before vs After — Axiom Protocol Hardening

## Before (deep-dive baseline)
| Area | State |
|------|--------|
| Tests | gitignored; CI unreliable on clean clone |
| pnpm | 10.22 vs 11.5.1 drift |
| Proxy | Hardcoded Railway URLs in vercel/server.mjs |
| DEK | Cleartext over HTTP |
| FE re-key | newDataHash in AccessProof (on-chain mismatch) |
| Vault execute | Client API key could hit server-signed execute |
| Settlement | Always skipped silently as "product" |
| Vault leaves | Replayable forever under daily limit |
| Bare NFT transfer | Orphaned sealed intel |
| Oracle bind | 127.0.0.1 default (Railway-break) |
| Indexer | Checkpoint past reorg depth; 4xx still advanced |
| Docs | Galileo/TEE/settlement overclaims |

## After
| Area | State |
|------|--------|
| Tests | Tracked; CI gate on `git ls-files` counts |
| pnpm | **10.22.0** everywhere |
| Proxy | PROXY_* required in production; no hardcoded hosts |
| DEK | ECIES sealed preferred; cleartext test-only flag |
| FE re-key | **old** dataHash only |
| Vault execute | **Server key only** |
| Settlement | Real execute **with** Merkle plan; else honest skip |
| Vault | One-shot action hashes |
| NFT | Bare transfer reverts `UseITransferWithProofs` |
| Oracle | Bind 0.0.0.0; URI=hash bind |
| Indexer | Reorg-safe checkpoint; 4xx fails sink |
| Docs | `current-state.md` + env/API refresh |

## Residual / honest gaps
- Hardware TEE still simulated software signer
- Merkle proof **producer** not auto-generated from LLM output (caller supplies plan)
- Skills surface still large; not full egress sandbox isolation
- No line-coverage % gate in CI yet (commands documented)
- Live Playwright not wired in CI (smoke exists)
