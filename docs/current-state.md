# Axiom Protocol — Current State (code truth)

> Living document. Prefer this file + `.env.example` + deploy JSON over marketing or older notes.

## Product

Axiom tokenizes AI trading strategies as **ERC-7857 Intelligent NFTs (iNFTs)** on **0G Chain**.

| Layer                                              | Role                                                                                                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0G Chain (default Galileo `16602`, env-driven)** | AgentNFT, StrategyVault, TeeVerifier, PaymentProcessor                                                                                                  |
| **0G Storage**                                     | Encrypted agent payloads (Merkle root = `dataHash`)                                                                                                     |
| **Oracle — in-process**                            | **Simulated TEE**: Node secp256k1 signer + re-encrypt service mounted at `/oracle/*` inside `apps/backend` (`src/oracle/`) — no standalone service/port |
| **Indexer — in-process**                           | Chain/event polling inside `apps/backend` (`src/indexer/`) — no standalone service                                                                      |
| **0G Compute**                                     | Chat + strategy-tick **inference**                                                                                                                      |
| **Backend**                                        | The single service: HTTP/WS orchestration + in-process oracle + indexer                                                                                 |
| **Frontend**                                       | Wallet dashboard + tool chat                                                                                                                            |

## 0G SDK integration (verified 2026-07-27)

| Component    | SDK / library                           | Version   | Status                                                                                                                                          |
| ------------ | --------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Storage      | `@0gfoundation/0g-storage-ts-sdk`       | 1.2.10    | Current — used in `packages/config`, `apps/bench`                                                                                               |
| Compute      | `openai` npm (API-key router path)      | 4.104.0   | SDK-recommended path for 0G Router. `@0gfoundation/0g-compute-ts-sdk` (0.9.0) is for the wallet-signed broker path, which the repo does NOT use |
| ERC-7857     | `lib/0g-agent-nft` (forge git dep, CC0) | —         | Canonical reference. No npm package exists                                                                                                      |
| Chain config | viem `zeroGMainnet`                     | ≥2.22     | Available in installed 2.52.2, not yet imported (custom `defineChain` in use)                                                                   |
| DA           | `@foundryprotocol/0gkit-da` (community) | 1.5.0     | Official `@0gfoundation/0g-da-ts-sdk` is 404 (Rust only). Community `0gkit-da` exists but not adopted — future opportunity                      |

**Note:** A prior analysis (2026-07-21) claimed ~220-250 LOC of SDK-replacement savings. Three independent discovery agents (2026-07-27) verified this was largely fictional — the referenced files/functions/packages do not exist. The repo already uses SDK-recommended patterns. Real cleanup opportunities (~122 LOC) are documented in `docs/refactor/0G-INTEGRATION-CLEANUP.md`.

## What works today

- Mint encode + wallet mint (dataHash registration at oracle is seen-set only unless payload is uploaded)
- **iTransfer** challenge/finalize with ownership proofs pinned to configured TEE key
- Vault deposit/withdraw/setStrategy (token owner)
- Payments / royalties via PaymentProcessor
- Chat completions + tool catalog / skills
- Event store + indexer poll (optional)

## What does **not** work as marketing often implies

| Claim                             | Reality                                                                                                                                                                                                                |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| “Real TEE”                        | Software `TeeSigner` with process key; browser re-key **ECIES-seals** the DEK to the oracle pubkey (`GET /oracle/health` → `sealedDataEncryptionKey`); cleartext DEK rejected unless test flag                         |
| “Ticks settle on-chain”           | Orchestrator may skip or require Merkle proof producer — see `settleOnChain`                                                                                                                                           |
| Aristotle mainnet is live/current | **Stale**: the `16661` deployment (2026-07-22) predates the merged-tx functions; default chain and current prototype are **Galileo testnet `16602`** (`AXIOM_CHAIN_ID` default in `packages/config/src/env-schema.ts`) |
| Vault execute is owner-only       | On-chain `execute` is **permissionless** given valid Merkle leaf + daily limit                                                                                                                                         |

## Networks

- **Default:** Galileo testnet chainId **16602** (env-driven — `AXIOM_CHAIN_ID` / `VITE_CHAIN_ID`; set `16661` for Aristotle)
- **Current prototype:** tx-merge deployment — `docs/deployments/galileo-merged-2026-08-13.json` (5 merged tx functions, e2e 12 → 6 on-chain txs)
- **Stale:** Aristotle mainnet 16661 (`docs/deployments/aristotle-2026-07-22.json`) — lacks the merged transaction functions; do not point current code at it

## Auth model

- Server API key: `AXIOM_API_KEY` (full access including vault execute, forensics, event inject)
- Client/browser key: `AXIOM_CLIENT_API_KEY` / `VITE_API_KEY` — **hard allowlist only**: agents/chat/encode/tick/read skills (evm/stocks/osint). Denied: vault execute, oss-forensics, unbroker execute, POST /v1/events, executionPlan on tick
- Cleartext DEK rejected on backend transfer **and** oracle (only `sealedDataEncryptionKey`)
- `AXIOM_DISABLE_AUTH=true` refused when `NODE_ENV=production`
- EventStore exclusive file lock (set `AXIOM_ALLOW_MULTI_INSTANCE=true` only if you accept split-brain)

## Deploy

- Railway: root `railway.json` — two services (`axiom-backend` standalone binary via `scripts/build-binaries.mjs`, `axiom-frontend` static + `apps/frontend/server.mjs`)
- Vercel: `vercel.json` static SPA from `apps/frontend/dist`, rewriting `/api/*` and `/oracle/*` to the Railway backend
- Package manager: **bun@1.4** (root `package.json` `packageManager`)

## Package layout

```text
apps/{backend,frontend,contracts,bench}
packages/{config,chat-runtime}
```

(`apps/backend` contains the in-process oracle `src/oracle/` and indexer `src/indexer/`.)

## Related docs

- `docs/env-vars.md` — env matrix
- `docs/oracle-api.md` — in-process oracle HTTP surface
- `apps/backend/docs/openapi.json` — generated backend API spec (source of truth for routes)
- `docs/deployments/` — deploy records (galileo-merged-2026-08-13.json is current)
