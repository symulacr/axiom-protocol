<p align="center">
  <img src="docs/assets/banner-q95.jpg" alt="" width="100%" />
</p>

<p align="center">
  ERC-7857 Agentic ID iNFTs on <a href="https://0g.ai">0G</a> — trade on 0G Chain, run via 0G Compute, store on 0G Storage.
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

## 0G Integration

Axiom Protocol is built on 0G's modular stack:

- **0G Chain** — ERC-7857 iNFT contracts (AgentNFT, StrategyVault, TeeVerifier, PaymentProcessor, MockUSDC) deployed and executed on 0G Chain.
- **0G Compute** — AI strategy inference and the TEE-style signer that re-keys encrypted metadata on every transfer.
- **0G Storage** — encrypted iNFT payloads uploaded to 0G Storage; the Merkle dataHash is registered on-chain.

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

- Node ≥ 22 (Railway pins 22, Vercel uses 24.x), pnpm 10.22.0, Foundry (`forge`) for contracts.

## Quick start (local)

```bash
pnpm install
cp .env.example .env                # canonical template; fill in deployed addresses + secrets
pnpm --filter @axiom/config build
pnpm --filter @axiom/chat-runtime build   # required before backend/oracle dev
pnpm --filter @axiom/oracle dev                       # :8787
pnpm --filter @axiom/backend dev                      # :3000 (includes indexer)
pnpm --filter @axiom/frontend dev                     # :5173
```

Contracts: `cd apps/contracts && pnpm build && pnpm test`

## Deployment

### Live URLs

| Service | URL |
|---------|-----|
| Backend API | `https://axiom-backend-production-2cf5.up.railway.app` |
| Oracle (TEE signer) | `https://oracle-production-9f7d.up.railway.app` |
| Frontend | `https://axiom-protocol.vercel.app` |

### Contracts (Aristotle mainnet, chain 16661)

| Contract | Address | Explorer |
|----------|---------|---------|
| AxiomTeeVerifier (proxy) | `0x7490D693364A31E0513bcef8E346397cc4BA9E9c` | [chainscan](https://chainscan.0g.ai/address/0x7490D693364A31E0513bcef8E346397cc4BA9E9c) |
| AxiomAgentNFT (proxy) | `0x4938F10B12051CE8DCd70E3F7555E71adb432545` | [chainscan](https://chainscan.0g.ai/address/0x4938F10B12051CE8DCd70E3F7555E71adb432545) |
| AxiomStrategyVault (proxy) | `0xe32f87C6F8070C89a82D51BDd3fab578C0d7be6f` | [chainscan](https://chainscan.0g.ai/address/0xe32f87C6F8070C89a82D51BDd3fab578C0d7be6f) |
| AxiomPaymentProcessor (proxy) | `0xe8B3B31E5CE0436cCfD19a47351943CcB7703722` | [chainscan](https://chainscan.0g.ai/address/0xe8B3B31E5CE0436cCfD19a47351943CcB7703722) |
| MockUSDC (payment token) | `0x354CA53bAB51C0666964fa050628d8351f8A7d19` | — |

All 8 contracts (impl + proxy for each) verified on chainscan.

