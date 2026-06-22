# Axiom Protocol

Verifiable intelligence layer for DeFi — AI agents as ERC-7857 iNFTs, re-keyed in a TEE on every transfer, run on 0G Compute.

## Architecture

- **Contracts** — Four Solidity contracts on 0G Chain: `AxiomAgentNFT` (ERC-7857), `AxiomStrategyVault`, `AxiomTeeVerifier`, `AxiomPaymentProcessor`. Deployed on Galileo testnet (chainId 16602).
- **Indexer** — Polls chain events, stores audit trail to 0G Storage with batch uploads. Optionally submits to 0G DA via gRPC `DisperseBlob`.
- **Backend** — Express orchestrator coordinating compute inference (0G Compute Router/Direct SDK), storage encryption, and on-chain settlement.
- **Oracle** — EIP-712 signing service for ownership/access proofs. Re-encrypts agent intelligence on transfer.
- **Frontend** — Vite + React + wagmi + RainbowKit web UI for minting, viewing, and transferring iNFTs.
- **Shared Config** — `packages/config/` provides env loading, network definitions, deployed addresses, Zod schemas, and branded Hex/BigInt types.

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
Full plan: [docs/release-notes-v1.0.0.md](docs/release-notes-v1.0.0.md)
