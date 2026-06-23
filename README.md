<p align="center">
  <img src="docs/assets/banner-q95.jpg" alt="Axiom Protocol" width="100%" />
</p>

<h1 align="center">Axiom Protocol</h1>

<p align="center">
  <b>Verifiable intelligence layer for DeFi</b><br />
  AI agents as ERC-7857 iNFTs, re-keyed in a TEE on every transfer, running on 0G Compute
</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT">
    <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License" />
  </a>
  <a href="#">
    <img src="https://img.shields.io/badge/Solidity-%5E0.8.20-black?logo=solidity" alt="Solidity ^0.8.20" />
  </a>
  <a href="#">
    <img src="https://img.shields.io/badge/TypeScript-5.5-blue?logo=typescript" alt="TypeScript 5.5" />
  </a>
  <a href="#">
    <img src="https://img.shields.io/badge/Node-%5E22-339933?logo=nodedotjs" alt="Node ^22" />
  </a>
  <a href="#">
    <img src="https://img.shields.io/badge/pnpm-%5E9-F69220?logo=pnpm" alt="pnpm ^9" />
  </a>
  <a href="#">
    <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react" alt="React 18" />
  </a>
  <a href="#">
    <img src="https://img.shields.io/badge/Express-4-000?logo=express" alt="Express" />
  </a>
  <a href="#">
    <img src="https://img.shields.io/badge/Foundry-✓-orange" alt="Foundry" />
  </a>
  <a href="#">
    <img src="https://img.shields.io/github/actions/workflow/status/symulacr/axiom-protocol/contracts.yml?branch=master&label=CI" alt="CI" />
  </a>
</p>

---

## Architecture

| Layer | Description |
|-------|-------------|
| **Contracts** | Four Solidity contracts on 0G Chain: `AxiomAgentNFT` (ERC-7857), `AxiomStrategyVault`, `AxiomTeeVerifier`, `AxiomPaymentProcessor`. Deployed on Galileo testnet (chainId 16602) |
| **Indexer** | Polls chain events, stores audit trail to 0G Storage with batch uploads. Optionally submits to 0G DA via gRPC `DisperseBlob` |
| **Backend** | Express orchestrator coordinating compute inference (0G Compute Router / Direct SDK), storage encryption, and on-chain settlement |
| **Oracle** | EIP-712 signing service for ownership / access proofs. Re-encrypts agent intelligence on transfer |
| **Frontend** | Vite + React + wagmi + RainbowKit web UI for minting, viewing, and transferring iNFTs |
| **Shared Config** | `packages/config/` — environment loading, network definitions, deployed addresses, Zod schemas, and branded Hex / BigInt types |

## 0G Integration

| Component | Status |
|-----------|--------|
| Chain (Galileo + Aristotle) | ✅ Deployed and verified |
| Storage (Turbo indexer) | ✅ Upload/download with Merkle proofs |
| Compute (Router API + Direct SDK) | ✅ Chat completions working |
| Agentic ID (ERC-7857) | ✅ On-chain + off-chain proof signing |
| Data Availability (gRPC) | ⏳ Client complete, sidecar needs build from source |

## Quick Start

```bash
pnpm install && pnpm -r build
cp .env.example .env
make dev
```

## Resources

- [Release Notes](docs/release-notes-v1.0.0.md)
- [Architecture Diagrams](docs/architecture/system-diagram.mmd)
- [Runbook](docs/runbook.md)
