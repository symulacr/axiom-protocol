# @axiom/frontend

Vite + React 18 + wagmi v2 + RainbowKit dApp dashboard for minting, viewing, and transferring iNFTs. Uses ABI types generated from Foundry artifacts.

**Depends on:** `@axiom/config`

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start Vite dev server with HMR |
| `pnpm build` | TypeScript check + Vite build |
| `pnpm preview` | Preview production build |
| `pnpm lint` | ESLint |

## Network

- **Port:** 5173 (Vite dev server)
- **Protocol:** HTTP

## Environment

Root `.env` + `apps/frontend/.env.example` for app-specific vars. Vercel deployments use `apps/frontend/.env.vercel`.
