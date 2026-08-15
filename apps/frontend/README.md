# @axiom/frontend

Bun + React 18 + wagmi v2 + RainbowKit dashboard for iNFT agents, vault ops, and AI chat. No Vite — `dev.mjs` (dev server proxying `/api` + `/oracle`) and `build.mjs` (production bundle to `dist/`) are Bun-native.

**Depends on:** `@axiom/config`, `@axiom/chat-runtime`

## Quick start

```bash
bun install
bun run build                                  # config + chat-runtime + backend
bun run --filter @axiom/backend dev            # :3000
bun run --filter @axiom/frontend dev           # :5173
```

## Environment

All env comes from the repo-root `.env` — the build scripts inline every `VITE_*` var into the bundle; there is no `apps/frontend/.env*`.

| Variable | Purpose |
| ---------- | --------- |
| `VITE_BACKEND_URL` | Backend API base (default `/api`, same-origin proxy) |
| `VITE_ORACLE_URL` | Oracle base (default `/oracle`) |
| `VITE_API_KEY` | Client API key, sent as `x-api-key`. Public by design — it is bundled into the browser build and only reaches client-allowlisted routes. |
| `VITE_WALLETCONNECT_PROJECT_ID` | WalletConnect/RainbowKit project id |
| `VITE_CHAIN_ID` / `VITE_EVM_RPC` | Chain selection (default 16661 mainnet) / RPC override |

## Chat

- Route: `/chat` — open, not wallet-gated (signing tools need a connection)
- 34 client tools via `@axiom/chat-runtime` + `src/chat/transport-browser.ts`
- Server history (`/v1/chat/history`) behind a wallet-signed proof; session lives in `sessionStorage`

## Commands

`bun run dev` · `bun run build` (typecheck + bundle) · `bun run typecheck` · `bun run lint` · `bun run test` · `bun run test:e2e` (Playwright)
