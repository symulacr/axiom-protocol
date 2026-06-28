# Wave 1: Discovery & Architecture Mapping — Closure Report

**Protocol:** 7×4 Wave Codebase Audit  
**Date:** 2026-06-28  
**Monorepo:** Axiom Protocol (`/home/eya/og`)  
**Agents:** 7/7 completed | **Duration:** ~6 minutes  

---

## Executive Summary

Axiom Protocol is a **verifiable DeFi intelligence layer** on 0G Chain. It manages **ERC-7857 iNFTs** (intelligent NFTs) whose encrypted metadata is re-keyed on every transfer via a **TEE oracle** attestation. Trading strategies execute through **0G Compute** (AI inference), data persists on **0G Storage**, and settlements occur on **0G Chain** (Galileo testnet / Aristotle mainnet).

The monorepo contains **6 apps + 1 shared package** across **TypeScript, Solidity, JavaScript (k6), and Bash**. Architecture is well-layered with a clean `@axiom/config` hub-and-spoke dependency pattern. Documentation quality is strong overall, with specific gaps in API documentation and per-package READMEs.

---

## 1. System Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│                        Frontend (Vite + React)                  │
│                   apps/frontend @axiom/frontend                 │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌──────┐ ┌───────────┐ │
│  │Agents   │ │Agent     │ │ChatPage  │ │Market│ │MintAgent  │ │
│  │Browser  │ │Detail    │ │          │ │Page  │ │Page       │ │
│  └────┬────┘ └────┬─────┘ └────┬─────┘ └──┬───┘ └─────┬─────┘ │
│       └───────────┴────────────┴──────────┴────────────┘       │
│                        hooks/ + utils/ + abi/                   │
└──────────────────────────┬─────────────────────────────────────┘
                           │ HTTP/WS
┌──────────────────────────▼─────────────────────────────────────┐
│                     Backend (Express + WS)                      │
│                   apps/backend @axiom/backend                    │
│  ┌──────────┐ ┌──────────┐ ┌────────┐ ┌──────┐ ┌────────────┐ │
│  │routers/  │ │orchestr.│ │compute/│ │events│ │payment/    │ │
│  │agents    │ │/index   │ │router  │ │/store│ │processor   │ │
│  │events    │ │Strategy │ │provider│ │      │ │            │ │
│  │health    │ │Runner   │ │discov. │ │      │ │            │ │
│  │perf.     │ │         │ │        │ │      │ │            │ │
│  └──────────┘ └─────────┘ └────────┘ └──────┘ └────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌───────────────┐ │
│  │ws/       │ │oracle/   │ │services/     │ │cli/run-e2e    │ │
│  │broadcast │ │client.ts │ │wayback.ts    │ │               │ │
│  └──────────┘ └──────────┘ └──────────────┘ └───────────────┘ │
└─────┬───────────────────┬────────────────────────┬────────────┘
      │ HTTP              │ HTTP                   │ RPC
┌─────▼──────┐   ┌────────▼────────┐   ┌──────────▼───────────┐
│ TEE Oracle  │   │    Indexer      │   │   Smart Contracts     │
│ apps/oracle │   │  apps/indexer   │   │  apps/contracts       │
│             │   │                 │   │  ┌─────────────────┐  │
│ POST /v1/   │   │ Events: 28      │   │  │AxiomAgentNFT    │  │
│ transfer-   │   │ types across    │   │  │(ERC-7857 iNFT)  │  │
│ validity    │   │ 4 contracts     │   │  ├─────────────────┤  │
│ POST /v1/   │   │                 │   │  │AxiomStrategy    │  │
│ ownership   │   │ Sinks: stdout   │   │  │Vault            │  │
│ crypto/     │   │ + backend POST  │   │  ├─────────────────┤  │
│ (EIP-712,   │   │ + 0G Storage    │   │  │AxiomPayment     │  │
│ AES-GCM,    │   │                 │   │  │Processor        │  │
│ ECIES)      │   │ docker-compose  │   │  ├─────────────────┤  │
└─────┬───────┘   └─────────────────┘   │  │AxiomTeeVerifier  │  │
      │                                 │  └─────────────────┘  │
      └─────────────────────────────────┴───────────────────────┘
                         │ 0G Chain (EVM)
                    ┌────▼────┐
                    │0G Chain │
                    │Galileo  │
                    │Aristotle│
                    └─────────┘
```

---

## 2. Entry Points (14 identified)

| # | Entry Point | Type | Port | Start Mechanism |
|---|---|---|---|---|
| 1 | `apps/backend/src/index.ts` | HTTP+WS server | 3000 | `pnpm start` / `node dist/index.js` |
| 2 | `apps/backend/src/cli/run-e2e.ts` | CLI one-shot | — | `pnpm run-e2e` |
| 3 | `apps/oracle/src/index.ts` | HTTP server | 8787 | `pnpm start` |
| 4 | `apps/indexer/src/index.ts` | Event watcher | — | `pnpm start` / Docker CMD |
| 5 | `apps/contracts/script/Deploy.s.sol` | Forge deploy | — | `forge script --broadcast` |
| 6 | `apps/contracts/script/DeployAristotle.s.sol` | Forge deploy | — | `forge script --broadcast` |
| 7 | `apps/contracts/script/DeployPaymentProcessor.s.sol` | Forge deploy | — | `forge script --broadcast` |
| 8 | `apps/contracts/script/RedeployTeeVerifier.s.sol` | Forge deploy | — | `forge script --broadcast` |
| 9 | `apps/frontend/src/main.tsx` | Vite SPA | 5173 | `vite` / `vite build` |
| 10-12 | `apps/bench/scripts/*.js` | k6 load tests | — | `k6 run` |
| 13 | `apps/indexer/Dockerfile` | Container | — | `docker build` |
| 14 | `.github/workflows/*.yml` (5) | CI/CD runners | — | GitHub push |

**Key finding:** 9 active server/background processes (backend, oracle, indexer, WebSocket, Docker), 4 CLI/deploy scripts, 5 CI/CD workflows.

---

## 3. Module Structure

| Module | Role | Technology | Boundaries |
|---|---|---|---|
| **`apps/backend/`** | Central orchestration engine: REST API, WebSocket, strategy runner, payment processing | Express 4, ws, ethers v6, viem v2, OpenAI SDK, Zod | Exposes HTTP/WS API; hides RPC provider, wallet PK, oracle auth |
| **`apps/frontend/`** | Browser dApp dashboard for iNFT management | React 18, Vite 5, wagmi 2, RainbowKit 2, TanStack Query 5 | Exposes user-facing UI; hides wallet keys (RainbowKit) |
| **`apps/contracts/`** | ERC-7857 iNFT contracts + vault + verifier + payment processor | Solidity 0.8.20, Foundry, OpenZeppelin 5.0.2 | Exposes ABIs via `@axiom/config`; hides upgradeability internals |
| **`apps/oracle/`** | TEE-attested signing service — EIP-712 proofs, re-encryption | TypeScript, Express 4, eciesjs, ethers v6 | Exposes 4 HTTP endpoints; hides signing key |
| **`apps/indexer/`** | Blockchain event watcher — polls 4 contracts, 28 event types | TypeScript, ethers v6 | Exposes event data to backend; hides poll loop internals |
| **`apps/bench/`** | Load testing + discovery harnesses | k6, TypeScript, ethers v6 | Standalone; no internal consumers |
| **`packages/config/`** | Shared config hub: env, addresses, ABIs, types, storage, auth middleware | TypeScript | Hub-and-spoke — consumed by all apps |

---

## 4. Internal Dependency Graph

```
@axiom/config  (leaf — consumed by all 5 TypeScript apps)
    ├── @axiom/oracle      (config: env, schemas, storage, auth middleware)
    ├── @axiom/indexer     (config: env, addresses, networks, types, storage)
    ├── @axiom/frontend    (config: addresses, networks, ABIs, types)
    ├── @axiom/backend     (config + oracle: signer types, crypto)
    └── @axiom/bench       (config: types)

@axiom/contracts — standalone (no workspace deps — uses git submodules)
```

**Clean layering:** Config is the sole shared dependency. Only cross-app import: `backend → oracle` (signer types + crypto helpers — pragmatic, not architectural coupling).

**Unused deps flagged:** `omnichron` in backend and config packages, `ethereum-cryptography` in backend devDeps, `@0gfoundation/0g-storage-ts-sdk` in bench (limited usage).

---

## 5. Core Domain Logic (6 domains)

| Domain | Primary Files | Key Contracts/Functions |
|---|---|---|
| **1. iNFT Minting & Metadata** | `AxiomAgentNFT.sol`, `AxiomMetadataJson.sol`, `useAgentMetadata.ts` | `mint()`, `mintWithRole()`, `update()`, `buildMetadataJson()` |
| **2. Intelligent Transfer (TEE Re-key)** | `ERC7857Upgradeable.sol`, `routers/agents.ts`, `oracle/src/server.ts` | `iTransferFrom()`, `_proofCheck()`, `POST /v1/transfer-validity` |
| **3. Authorized Usage & Cloning** | `ERC7857AuthorizeUpgradeable.sol`, `ERC7857CloneableUpgradeable.sol` | `authorizeUsage()`, `iClone()`, `_clone()` |
| **4. TEE Oracle Attestation** | `AxiomTeeVerifier.sol`, `oracle/src/signer.ts`, `oracle/src/crypto/*` | `verifyTransferValidity()`, `TeeSigner.sign()`, EIP-712 proofs |
| **5. Strategy Vault Execution** | `AxiomStrategyVault.sol`, `orchestrator/index.ts`, `compute/router.ts` | `execute()`, `StrategyRunner.tick()`, `POST /v1/orchestrator/tick` |
| **6. Payment & Monetization** | `AxiomPaymentProcessor.sol`, `payment/processor.ts` | `payForAgent()`, `payComputeProvider()`, `withdrawAgentEarnings()` |

---

## 6. Configuration & Environment

**10 `.env*` files** across root + 3 apps. Validation is layered via Zod schema `.merge()`:

```
sharedEnvSchema (packages/config)
    ├── backendEnvSchema (apps/backend) — adds RPC, oracle URL, signer PK, compute keys
    └── oracleEnvSchema  (apps/oracle) — adds signer PK, storage RPCs
```

**Key findings:**
- **3 private keys in live `.env` (committed):** `DEPLOYER_PK`, `TEE_SIGNER_PK`, `ORACLE_ADMIN_PK` all same key on testnet — not a production risk (testnet) but a hygiene issue
- **Dual naming migration in progress:** `OG_*` → `AXIOM_*` — both prefixes exist; env-schemas accept both
- **Compute key precedence chain:** `AXIOM_COMPUTE_DIRECT_KEY` > `AXIOM_COMPUTE_API_KEY` > `OG_COMPUTE_API_KEY`
- **10 env gaps documented:** live PKs in committed `.env`, missing `da-client.env.example`, dual naming incomplete, 4+ bench scripts with duplicate `.env` parsers

---

## 7. Technology Stack

| Layer | Technology | Version |
|---|---|---|
| **Blockchain** | Solidity (EVM Cancun), Foundry, OpenZeppelin | ^0.8.20, ^1.16+, 5.0.2 |
| **Backend** | TypeScript, Express, ws, ethers, viem | ^5.5.4, ^4, ^6, ^2 |
| **Frontend** | React, Vite, wagmi, RainbowKit, TanStack Query | ^18, ^5, ^2, ^2, ^5 |
| **AI** | OpenAI SDK, 0G Compute SDK | ^4, latest |
| **Storage** | 0G Storage SDK | latest |
| **Oracle** | eciesjs, ethereum-cryptography, AES-256-GCM | latest |
| **Testing** | forge test (fuzz+invariant), node:test, k6, cast | — |
| **CI/CD** | GitHub Actions (5 workflows), Vercel, Docker | — |
| **Quality** | ESLint 9, Prettier 3, Solhint, markdownlint, cSpell, Husky 9 | — |

---

## 8. Documentation Quality

| Category | Score | Notes |
|---|---|---|
| README Files | Fair | Root README excellent; zero per-package READMEs |
| Inline Comments | Good | Solidity excellent; backend good; frontend fair |
| Docstrings/JSDoc | Good | Solidity NatSpec excellent; frontend poor (zero hook docs) |
| Architecture Docs | Excellent | DESIGN.md (289 lines), PRODUCT.md, sequence diagrams |
| Configuration Docs | Excellent | Thorough .env.example files, Zod schemas documented |
| API Documentation | Poor | No OpenAPI/Swagger; routes only documented in source |
| Contract NatSpec | Excellent | Every contract, function, error annotated |
| Change Logs | Good | Per-version changelogs in docs/; no root CHANGELOG.md |

**Critical gaps:** No CONTRIBUTING.md, no LICENSE file, no root CHANGELOG.md, no per-app READMEs, no API docs.

---

## 9. Cross-Cutting Observations

### Strengths
1. **Clean dependency architecture** — hub-and-spoke via `@axiom/config`; minimal coupling between apps
2. **Thorough Solidity development** — NatSpec, ERC-7201 storage slots, UUPS upgradeable, comprehensive interfaces
3. **Well-documented design system** — `DESIGN.md` is production-grade
4. **Two-phase transfer security** — TEE oracle re-key + on-chain proof verification is well-architected
5. **Layered env validation** — Zod schemas compose via `.merge()` with clear boundaries

### Concerns / Risks
1. **No API documentation** — 28+ HTTP routes, zero are documented externally (OpenAPI/Swagger)
2. **Live private keys in committed `.env`** — testnet, but bad precedent
3. **Dual naming (`OG_*` / `AXIOM_*`)** — migration incomplete; risk of config drift
4. **Empty `storage/` directory** — reserved for future 0G Storage client but unused; could confuse
5. **Frontend lacks TSDoc** — hooks, components, and utilities mostly undocumented
6. **No per-app READMEs** — new developers must read source to understand each app

---

## 10. Agent Reports Index

| Agent | Report File | Key Metric |
|---|---|---|
| W1-A1 Entry Points | `local://w1-a1-entry-points.md` | 14 entry points cataloged |
| W1-A2 Module Structure | `local://w1-a2-module-structure.md` | 7 modules mapped, depth 3+ |
| W1-A3 Dependency Graph | `local://w1-a3-dependency-graph.md` | 3 unused deps flagged |
| W1-A4 Core Domain Logic | `local://w1-a4-core-domain-logic.md` | 6 domains identified |
| W1-A5 Config & Environment | `local://w1-a5-config-env.md` | 10 env gaps documented |
| W1-A6 Technology Stack | `local://w1-a6-technology-stack.md` | 65 files analyzed across 7 modules |
| W1-A7 Documentation Quality | `local://w1-a7-documentation-quality.md` | 8 categories scored, 45 files sampled |

---

*End of Wave 1 Closure Report. Ready for Wave 2: Flow Tracing & Data Lineage.*
