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
  <a href="https://devblogs.microsoft.com/typescript/announcing-typescript-5-5/">
    <img src="https://img.shields.io/badge/TypeScript-5.5-blue?logo=typescript" alt="TypeScript 5.5" />
  </a>
  <a href="https://pnpm.io/installation">
    <img src="https://img.shields.io/badge/pnpm-9-F69220?logo=pnpm" alt="pnpm 9" />
  </a>
</p>

---

## Architecture

| Layer | Description |
|-------|-------------|
| **Contracts** | Four Solidity contracts on 0G Chain: `AxiomAgentNFT` (ERC-7857), `AxiomStrategyVault`, `AxiomTeeVerifier`, `AxiomPaymentProcessor`. Deployed on Galileo testnet. |
| **Indexer** | Chain event watcher, stores audit trail to 0G Storage, optionally submits to 0G DA via gRPC. |
| **Backend** | Express orchestrator — compute inference, storage encryption, on-chain settlement. |
| **Oracle** | EIP-712 signing for ownership proofs, re-encrypts agent data on transfer. |
| **Frontend** | Vite + React + wagmi + RainbowKit UI for minting, viewing, and transferring iNFTs. |
| **Shared Config** | Env loading, network config, deployed addresses, Zod schemas, branded types. |

## 0G Integration

| Component | Status |
|-----------|--------|
| Chain (Galileo testnet) | ✅ Deployed and verified |
| Chain (Aristotle mainnet) | ⏳ Not yet deployed |
| Storage | ✅ Upload/download with Merkle proofs |
| Compute | ✅ Chat completions via Router API + Direct SDK |
| Agentic ID (ERC-7857) | ✅ On-chain + off-chain proof signing |
| Data Availability | ⏳ gRPC client ready, sidecar TBD |

## Quick Start

Requires Node 22 and pnpm 9.

```bash
pnpm install          # Install all workspace deps
cp .env.example .env  # Configure environment
make dev              # Start oracle + backend + indexer
```

## Resources

- [Release Notes (v0.0.1)](https://github.com/symulacr/axiom-protocol/releases/tag/v0.0.1)

## Acknowledgments

Built for the [0G Bridge by AKINDO](https://app.akindo.io/wave-hacks/xKOgjd91kCmrN3ORz/) hackathon.
