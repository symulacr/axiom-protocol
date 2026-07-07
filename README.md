<p align="center">
  <img src="docs/assets/banner-q95.jpg" alt="" width="100%" />
</p>

<p align="center">
  ERC-7857 iNFT agents on <a href="https://0g.ai">0G Chain</a>.
</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT" /></a>
  <a href="https://docs.soliditylang.org/en/v0.8.20/"><img src="https://img.shields.io/badge/Solidity-0.8.20-black?logo=solidity" alt="Solidity" /></a>
</p>

---

## Live demo (Galileo testnet)

| Service | URL | Health |
| ------- | --- | ------ |
| Frontend | https://axiom-protocol-nine.vercel.app | — |
| Backend | https://backend-production-4e2b.up.railway.app | `/health/live` |
| Oracle | https://oracle-production-47ab.up.railway.app | `/health` |

```bash
curl -s https://backend-production-4e2b.up.railway.app/health/live
curl -s https://oracle-production-47ab.up.railway.app/health
```

## Deploy

Deploy from the **monorepo root** (no per-service `rootDirectory`).

| Platform | Project | Command |
| -------- | ------- | ------- |
| Vercel | `axiom-protocol` | `vercel --prod` (frontend only; after backend is up) |
| Railway | `axiom-backend` | `railway link --project axiom-backend` then `railway up --service <name> --detach` |

**Railway services** — root `railway.json` is backend-only; oracle and indexer use `apps/oracle/railway.json` and `apps/indexer/railway.json`.

| Service | Build | Start | Healthcheck |
| ------- | ----- | ----- | ----------- |
| `backend` | `pnpm --filter @axiom/config build && pnpm --filter @axiom/chat-runtime build && pnpm --filter @axiom/backend build` | `node apps/backend/dist/index.js` | `/health/live` |
| `oracle` | `pnpm --filter @axiom/config build && pnpm --filter @axiom/oracle build` | `node apps/oracle/dist/index.js` | `/health` |
| `indexer` | `pnpm --filter @axiom/config build && pnpm --filter @axiom/indexer build` | `node apps/indexer/dist/index.js` | `/health` |

If indexer still runs the backend binary, apply the table row once:

```bash
railway environment edit \
  --service-config indexer build.buildCommand "pnpm --filter @axiom/config build && pnpm --filter @axiom/indexer build" \
  --service-config indexer deploy.startCommand "node apps/indexer/dist/index.js" \
  --service-config indexer deploy.healthcheckPath "/health" \
  -m "indexer: correct build/start"
```

**Prod env (Railway):** backend needs `AXIOM_COMPUTE_DIRECT_KEY` (chat uses Direct mode, not `OG_COMPUTE_API_KEY` alone); oracle needs `AXIOM_FRONTEND_URL` set to the frontend URL above for CORS.

---

## Stack

| App | Role |
| --- | ---- |
| `apps/contracts` | ERC-7857 iNFT, vault, TEE verifier, payment processor |
| `apps/backend` | API, orchestrator, 0G compute router, archive jobs |
| `apps/oracle` | EIP-712 ownership proofs, TEE re-encryption |
| `apps/frontend` | React + wagmi UI, mint/transfer/vault |
| `apps/indexer` | Chain events → 0G Storage audit trail |
| `packages/config` | Networks, ABIs, env, types |
| `packages/chat-runtime` | Shared chat tool runtime (frontend + bench) |

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

[0G Bridge by AKINDO](https://app.akindo.io/wave-hacks/xKOgjd91kCmrN3ORz/) · https://github.com/symulacr/axiom-protocol