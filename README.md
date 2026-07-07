<p align="center">
  <img src="docs/assets/banner-q95.jpg" alt="Axiom Protocol" width="100%" />
</p>

<h1 align="center">Axiom Protocol</h1>

<p align="center">
  ERC-7857 iNFT agents on <a href="https://0g.ai">0G Chain</a> — sealed agent data, TEE oracle proofs, strategy vault, chat tools.
</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT" /></a>
  <a href="https://docs.soliditylang.org/en/v0.8.20/"><img src="https://img.shields.io/badge/Solidity-0.8.20-black?logo=solidity" alt="Solidity" /></a>
</p>

---

## Live demo (Galileo)

| Service | URL |
| ------- | --- |
| Frontend | https://axiom-protocol-nine.vercel.app |
| Backend | https://backend-production-4e2b.up.railway.app |
| Oracle | https://oracle-production-47ab.up.railway.app |

```bash
curl -s https://backend-production-4e2b.up.railway.app/health/live
curl -s https://backend-production-4e2b.up.railway.app/health
curl -s https://oracle-production-47ab.up.railway.app/health
```

**Deploy**

| Platform | Project | Notes |
| -------- | ------- | ----- |
| Vercel | `axiom-protocol` | Monorepo root; frontend only — `vercel --prod` after backend deploy |
| Railway | `axiom-backend` | Shared pnpm workspace — deploy from repo root |

**Railway services** (monorepo root, no `rootDirectory`):

| Service | Build | Start | Healthcheck |
| ------- | ----- | ----- | ----------- |
| `backend` | `pnpm --filter @axiom/config build && pnpm --filter @axiom/chat-runtime build && pnpm --filter @axiom/backend build` | `node apps/backend/dist/index.js` | `/health/live` |
| `oracle` | `pnpm --filter @axiom/config build && pnpm --filter @axiom/oracle build` | `node apps/oracle/dist/index.js` | `/health` |

```bash
railway link --project axiom-backend
railway up --service backend --detach
railway up --service oracle --detach
```

Root `railway.json` is the **backend** config. Oracle settings live in `apps/oracle/railway.json` (set per-service in the Railway dashboard or via `railway environment edit`).

---

## Stack

| App | Role |
| --- | ---- |
| `apps/contracts` | ERC-7857 iNFT, vault, TEE verifier, payment processor |
| `apps/backend` | API, orchestrator, 0G compute router, archive jobs |
| `apps/oracle` | EIP-712 ownership proofs, TEE re-encryption |
| `apps/frontend` | React + wagmi UI, chat, mint/transfer/vault |
| `apps/indexer` | Chain events → 0G Storage audit trail |
| `packages/config` | Networks, ABIs, env, types |
| `packages/chat-runtime` | Shared chat tool runtime |

---

## Local dev

```bash
pnpm install
cp .env.example .env   # if present at repo root

pnpm --filter @axiom/backend dev
pnpm --filter @axiom/oracle dev
pnpm --filter @axiom/frontend dev
```

Contracts: `cd apps/contracts && forge test`

CI: `.github/workflows/ci.yml`

---

## Repo

**Remote:** https://github.com/symulacr/axiom-protocol.git

MIT · [0G Bridge by AKINDO](https://app.akindo.io/wave-hacks/xKOgjd91kCmrN3ORz/)