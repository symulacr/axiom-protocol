<p align="center">
  <img src="docs/assets/banner-q95.jpg" alt="" width="100%" />
</p>

<p align="center">
  ERC-7857 iNFT agents on <a href="https://0g.ai">0G Chain</a> — mint, trade, and run on-chain AI strategies.
</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT" /></a>
</p>

---

## Overview

Axiom Protocol turns an AI strategy into an **ERC-7857 Intelligent NFT (iNFT)**: an ownable,
transferable on-chain asset whose encrypted metadata is re-keyed on every transfer by a
**TEE-style signer** (simulated TEE today — a Node signer with a cleartext key, not Intel TDX/SEV).
Agents run vaults, execute strategy ticks, and trade on a live 0G Chain market.

## Architecture

The iNFT lifecycle flows through the monorepo — `apps/{contracts,backend,oracle,frontend,indexer}`, `packages/{config,chat-runtime}` — and the TEE signer re-keys encrypted metadata on every transfer. Env vars are noted where each service reads them.

```mermaid
sequenceDiagram
    autonumber
    actor User
    box "Client" #E8F0FE
        participant FE as Frontend
    end
    box "Services" #FEF7E0
        participant BE as Backend
        participant OR as Oracle (TEE)
    end
    box "Chain" #E6F4EA
        participant CH as 0G Chain
    end

    Note over User,CH: 1) Mint — tokenize an AI strategy as an ERC-7857 iNFT
    User->>FE: Connect wallet (RainbowKit)
    User->>FE: Mint iNFT (strategy + encrypted metadata)
    FE->>BE: POST /mint (VITE_API_KEY)
    BE->>CH: Deploy ERC-7857 iNFT (AXIOM_EVM_RPC)

    Note over User,CH: 2) Run — ticks, deposits, transfers re-key metadata
    User->>FE: Execute tick / deposit / transfer
    FE->>BE: Strategy tick (VITE_CHAT_MODEL on chat)
    BE->>OR: Ownership proof (AXIOM_ORACLE_URL)
    OR->>OR: Re-key metadata (AXIOM_TEE_SIGNER_PK, simulated TEE)
    OR->>CH: EIP-712 TEE-signed proof

    Note over User,CH: 3) Chat — streaming assistant with on-chain tools
    User->>FE: Open chat assistant
    FE->>BE: SSE /v1/chat/completions (VITE_BACKEND_URL)
    BE-->>FE: Streamed response
    FE->>CH: Market WebSocket — transfers + leaderboard

    Note over BE,OR: Local dev: AXIOM_DISABLE_AUTH=true
```

## Prerequisites

- Node ≥ 22, pnpm 11.5.1, Foundry (`forge`) for contracts.

## Quick start (local)

```bash
pnpm install
cp .env.example .env                # canonical template; fill in deployed addresses + secrets
pnpm --filter @axiom/config build
pnpm --filter @axiom/chat-runtime build   # required before backend/oracle dev
pnpm --filter @axiom/oracle dev            # :8787
pnpm --filter @axiom/backend dev           # :3000
pnpm --filter @axiom/frontend dev          # :5173
```

Contracts: `cd apps/contracts && pnpm build && pnpm test`

## Deploy

Railway + Vercel. Root `railway.json` is backend; oracle/indexer use their own.
Railway runs `scripts/railway-build.sh` / `scripts/railway-start.sh` (branch by
`RAILWAY_SERVICE_NAME`); equivalent manual builds are `pnpm --filter @axiom/<svc> build`.
Vercel deploys the frontend only (after backend is up): `vercel --prod`.

## Docs & links

- `docs/README.md` — architecture, security, API.
- `docs/env-vars.md` — full environment-variable table.
- [0G Bridge by AKINDO](https://app.akindo.io/wave-hacks/xKOgjd91kCmrN3ORz/) · https://github.com/symulacr/axiom-protocol
