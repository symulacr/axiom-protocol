<p align="center">
  <img src="docs/assets/banner-q95.jpg" alt="Axiom Protocol" width="100%" />
</p>

<h1 align="center">Axiom Protocol</h1>

<p align="center">
  Verifiable DeFi agents — ERC-7857 iNFTs re-keyed in TEE, running on 0G.
</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT">
    <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License" />
  </a>
  <a href="https://docs.soliditylang.org/en/v0.8.20/">
    <img src="https://img.shields.io/badge/Solidity-0.8.20-black?logo=solidity" alt="Solidity 0.8.20" />
  </a>
  <a href="https://github.com/symulacr/axiom-protocol/releases">
    <img src="https://img.shields.io/badge/release-v0.2.7-blue?logo=github" alt="v0.2.7" />
  </a>
</p>

---

## Overview

Axiom Protocol lets users mint, own, and transfer **intelligent NFTs (iNFTs)** — ERC-7857 tokens tied to AI agent metadata that is cryptographically sealed and re-keyed inside a TEE on transfer.

Built on [0G Chain](https://0g.ai) (Galileo testnet, Aristotle mainnet).

### How it works

1. **Mint** an iNFT — on-chain metadata + encrypted agent data stored on 0G Storage
2. **Run** strategies — the orchestrator calls an LLM via the 0G Compute Router (OpenAI-compatible) with vault state and market signals
3. **Transfer** — the oracle generates EIP-712 ownership proofs; the receiver's TEE unwraps the sealed encryption key
4. **Pay** — users pay agents directly via `payForAgent()` (user-signed); protocol pays compute providers

---

## Architecture

| Layer         | Tech                              | Role                                                                                                                       |
| ------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Contracts** | Solidity 0.8.20 + Foundry         | ERC-7857 iNFT, strategy vault, TEE verifier, payment processor. UUPS upgradeable.                                          |
| **Indexer**   | TypeScript + 0G Storage SDK       | Polls chain events, stores audit trail to 0G Storage, forwards to backend.                                                 |
| **Backend**   | Express + ethers v6 + Zod         | Orchestrates inference (0G Router API), on-chain settlement, storage encryption. Route registry at `GET /v1/admin/routes`. |
| **Oracle**    | Express + eciesjs                 | EIP-712 signing for ownership proofs, TEE re-encryption on transfer. Domain: `AxiomTeeVerifier`.                           |
| **Frontend**  | Vite + React + wagmi + RainbowKit | Mint/view/transfer iNFTs, chat UI, vault panels. Deployed on Vercel.                                                      |
| **Chat runtime** | Shared TS package (`@axiom/chat-runtime`) | Tool dispatcher + executors (read, encode, archive, orchestrate). Used by frontend chat and backend benches.            |
| **Config**    | Shared TS package                 | Env loading, network config, deployed addresses, Zod schemas, typed ABIs.                                                  |

---

## Live (Galileo demo)

| Service  | URL | Health |
| -------- | --- | ------ |
| Frontend | https://axiom-protocol-nine.vercel.app | static |
| Backend  | https://backend-production-4e2b.up.railway.app | `GET /health` |
| Oracle   | https://oracle-production-47ab.up.railway.app | `GET /health` |

Frontend env (Vercel production): `VITE_BACKEND_URL`, `VITE_ORACLE_URL`, `VITE_WALLETCONNECT_PROJECT_ID`.

Railway project: `axiom-backend` (services: `backend`, `oracle`). Deploy from **monorepo root** so workspace packages resolve.

```bash
curl -s https://backend-production-4e2b.up.railway.app/health | jq .
curl -s https://oracle-production-47ab.up.railway.app/health | jq .
```

---

## Quick Start

```bash
# Prerequisites: Node 22, pnpm 9, Foundry

pnpm install

# Configure environment
cp .env.example .env

# Build + start all services
make dev
```

### Manual start (per-service)

```bash
# Backend
pnpm --filter @axiom/backend dev

# Frontend
pnpm --filter @axiom/frontend dev

# Oracle
pnpm --filter @axiom/oracle dev

# Indexer
pnpm --filter @axiom/indexer dev
```

### Contracts

```bash
# Build
cd apps/contracts && forge build

# Test
cd apps/contracts && forge test

# Deploy to Galileo testnet (configure .env first)
cd apps/contracts && forge script script/DeployPaymentProcessor.s.sol --rpc-url https://evmrpc-testnet.0g.ai --broadcast
```

---

## Deployments

| Contract              | Galileo (testnet) | Aristotle (mainnet) |
| --------------------- | ----------------- | ------------------- |
| AxiomAgentNFT         | Deployed          | Not yet deployed    |
| AxiomStrategyVault    | Deployed          | Not yet deployed    |
| AxiomTeeVerifier      | Deployed          | Not yet deployed    |
| AxiomPaymentProcessor | Deployed          | Not yet deployed    |
| MockUSDC              | Deployed          | Not yet deployed    |

---

## 0G Integration

| Component                 | Status                                                                      |
| ------------------------- | --------------------------------------------------------------------------- |
| Chain (Galileo testnet)   | ✅ Deployed and verified                                                    |
| Chain (Aristotle mainnet) | ⏳ Not yet deployed                                                         |
| Storage                   | ✅ Upload/download with Merkle proofs via `@0gfoundation/0g-storage-ts-sdk` |
| Compute                   | ✅ Chat completions via Router API (OpenAI SDK)                             |
| Agentic ID (ERC-7857)     | ✅ On-chain + off-chain proof signing                                       |
| Data Availability         | ✅ Event audit trail via 0G Storage (gRPC DA removed)                       |

---

## Project Structure

```
apps/
  backend/     — Express server, orchestrator, payment processor
  frontend/    — React + wagmi UI
  contracts/   — Solidity contracts + Foundry scripts
  oracle/      — TEE signer service
  indexer/     — On-chain event watcher
  bench/       — Benchmarks and stress tests
packages/
  config/        — Shared env, networks, ABIs, types, storage client
  chat-runtime/  — Shared chat tool runtime (format, transport, executors)
```

CI: `.github/workflows/ci.yml` (typecheck, build, unit tests, chat-bench). Nightly live benches need GitHub secrets (`DEPLOYER_PK`, `E2E_*`, `AXIOM_COMPUTE_DIRECT_KEY`).

---

## License

MIT. Built for the [0G Bridge by AKINDO](https://app.akindo.io/wave-hacks/xKOgjd91kCmrN3ORz/) hackathon.
