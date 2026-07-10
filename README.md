<p align="center">
  <img src="docs/assets/banner-q95.jpg" alt="" width="100%" />
</p>

<p align="center">
  ERC-7857 iNFT agents on <a href="https://0g.ai">0G Chain</a> — mint, trade, and run on-chain AI strategies.
</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT" /></a>
  <a href="https://docs.soliditylang.org/en/v0.8.20/"><img src="https://img.shields.io/badge/Solidity-0.8.20-black?logo=solidity" alt="Solidity" /></a>
</p>

---

## Overview

Axiom Protocol turns an AI strategy into an **ERC-7857 Intelligent NFT (iNFT)**: an ownable,
transferable on-chain asset whose encrypted metadata is re-keyed on every transfer by a
**TEE-style signer** (simulated TEE today — a Node signer with a cleartext key, not Intel TDX/SEV).
Agents run vaults, execute strategy ticks, and trade on a live 0G Chain market.

## Live demo (Galileo testnet, chain ID 16602)

| Service | URL | Health |
| ------- | --- | ------ |
| Frontend | https://axiom-protocol-nine.vercel.app | — |
| Backend | https://backend-production-4e2b.up.railway.app | `/health/live` |
| Oracle | https://oracle-production-47ab.up.railway.app | `/health` |

## Features

- **Agents** — browse wallet-owned iNFTs with vault balances & performance metrics.
- **Mint** — tokenize an AI strategy as an ERC-7857 iNFT.
- **Agent detail** — execute ticks, deposit/withdraw, transfer, delegate, view event timeline.
- **Market** — live transfers (WebSocket), compute providers, and a leaderboard.
- **Chat** — streaming assistant (`POST /v1/chat/completions`, SSE) with on-chain/archive tools.
- **Keyboard shortcuts** — `G` agents, `M` market, `C` chat, `N` mint, `?` help.
- Wallet-gated routes (`/agents/new`, `/agents/:id`, `/chat`) via RainbowKit.

## Stack

| App | Role |
| --- | ---- |
| `apps/contracts` | ERC-7857 iNFT, vault, TEE verifier, payment processor (Foundry) |
| `apps/backend` | Express API, orchestrator, 0G compute router, 5 skill routers, archive |
| `apps/oracle` | EIP-712 ownership proofs + TEE re-encryption (port 8787) |
| `apps/frontend` | React 18 + Vite 5 + wagmi 2 / RainbowKit 2 + react-router 7 |
| `apps/indexer` | Chain events → 0G Storage audit trail |
| `apps/bench` | k6 load tests (tick / health / transfer) |
| `packages/config` | Networks, ABIs, env, EIP-712, crypto, auth |
| `packages/chat-runtime` | Shared chat tool runtime |

## Prerequisites

- Node ≥ 22, pnpm 11.5.1, Foundry (`forge`) for contracts.

## Quick start (local)

```bash
pnpm install
cp .env.galileo.example .env        # no .env.example exists; use the galileo template
pnpm --filter @axiom/config build
pnpm --filter @axiom/chat-runtime build   # required before backend/oracle dev
pnpm --filter @axiom/oracle dev            # :8787
pnpm --filter @axiom/backend dev           # :3000
pnpm --filter @axiom/frontend dev          # :5173
```

Contracts: `cd apps/contracts && pnpm build && pnpm test`

## Environment variables

See `docs/env-vars.md` for the full table. Essentials:
`AXIOM_TEE_SIGNER_PK`, `AXIOM_EVM_RPC`, `AXIOM_ORACLE_URL` (backend/oracle);
`VITE_BACKEND_URL`, `VITE_API_KEY`, `VITE_ORACLE_URL`, `VITE_CHAT_MODEL` (frontend).
Set `AXIOM_DISABLE_AUTH=true` for local dev (disables API-key auth).

## Deploy

Railway + Vercel. Root `railway.json` is backend; oracle/indexer use their own.
Railway runs `scripts/railway-build.sh` / `scripts/railway-start.sh` (branch by
`RAILWAY_SERVICE_NAME`); equivalent manual builds are `pnpm --filter @axiom/<svc> build`.
Vercel deploys the frontend only (after backend is up): `vercel --prod`.

## Scripts

`pnpm -r run test | typecheck | lint` (recursive). Per package: `dev`, `build`, `start`, `test`.
CI: `.github/workflows/ci.yml`.

## Docs & links

- `docs/README.md` — architecture, security, API, benchmarks.
- [0G Bridge by AKINDO](https://app.akindo.io/wave-hacks/xKOgjd91kCmrN3ORz/) · https://github.com/symulacr/axiom-protocol
