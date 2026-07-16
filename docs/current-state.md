# Axiom Protocol — Current State (code truth)

> Living document. Updated as part of the 7-wave production hardening campaign.
> Prefer this file + `.env.example` + deploy JSON over marketing or old Galileo notes.

## Product

Axiom tokenizes AI trading strategies as **ERC-7857 Intelligent NFTs (iNFTs)** on **0G Chain**.

| Layer | Role |
|-------|------|
| **0G Chain (Aristotle `16661`)** | AgentNFT, StrategyVault, TeeVerifier, PaymentProcessor |
| **0G Storage** | Encrypted agent payloads (Merkle root = `dataHash`) |
| **Oracle** | **Simulated TEE**: Node secp256k1 signer + re-encrypt service (not Intel TDX/SEV) |
| **0G Compute** | Chat + strategy-tick **inference** |
| **Backend** | HTTP/WS orchestration |
| **Frontend** | Wallet dashboard + tool chat |

## What works today

- Mint encode + wallet mint (dataHash registration at oracle is seen-set only unless payload is uploaded)
- **iTransfer** challenge/finalize with ownership proofs pinned to configured TEE key
- Vault deposit/withdraw/setStrategy (token owner)
- Payments / royalties via PaymentProcessor
- Chat completions + tool catalog / skills
- Event store + indexer poll (optional)

## What does **not** work as marketing often implies

| Claim | Reality |
|-------|---------|
| “Real TEE” | Software `TeeSigner` with process key; browser re-key **ECIES-seals** the DEK to the oracle pubkey (`GET /health` → `sealedDataEncryptionKey`); cleartext DEK rejected unless test flag |
| “Ticks settle on-chain” | Orchestrator may skip or require Merkle proof producer — see `settleOnChain` |
| Galileo testnet is primary | **Aristotle mainnet `16661` is the default** in `packages/config` and frontend wagmi |
| Vault execute is owner-only | On-chain `execute` is **permissionless** given valid Merkle leaf + daily limit |

## Networks

- **Primary:** Aristotle mainnet chainId **16661**
- **Historical:** Galileo testnet 16602 (scripts/docs may still mention it)
- Deploy addresses: `docs/deployments/aristotle-2026-07-13.json`

## Auth model

- Server API key: `AXIOM_API_KEY` (operator / trusted services)
- Client/browser key: `AXIOM_CLIENT_API_KEY` / `VITE_API_KEY` — **capability-limited** (read + encode + chat; not vault execute)
- `AXIOM_DISABLE_AUTH=true` refused when `NODE_ENV=production`

## Deploy

- Railway: per-app `railway.json` + optional root multi-service
- Frontend proxy: **`PROXY_BACKEND_URL` / `PROXY_ORACLE_URL` required in production** (no hardcoded Railway hosts)
- Vercel: SPA build; set rewrite destinations via project env / dashboard, not baked secrets in git when possible
- Package manager: **pnpm@10.22.0** everywhere

## Package layout

```
apps/{backend,oracle,indexer,frontend,contracts,bench}
packages/{config,chat-runtime}
```

## Related docs

- `docs/env-vars.md` — env matrix
- `docs/backend-api.md` / `docs/oracle-api.md` — HTTP surfaces
- `docs/refactor/` — wave reports and progress tracker
