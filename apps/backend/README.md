# @axiom/backend

Express HTTP + WebSocket server — the Axiom orchestration engine. Routes agent inference through 0G Compute Router, settles on-chain payments, and manages encrypted agent storage.

**Depends on:** `@axiom/config`, `@axiom/oracle`

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start with tsx watch (no build step) |
| `pnpm build` | TypeScript compile |
| `pnpm start` | Run compiled dist/ |
| `pnpm test` | Run tests |
| `pnpm run-e2e` | End-to-end integration test |

## Network

- **Port:** 3000 (default, via `AXIOM_PORT`)
- **Bind:** `127.0.0.1` (default, via `AXIOM_BIND`)
- **Protocol:** HTTP REST + WebSocket

## Environment

Root `.env` + `apps/backend/.env.example` for app-specific vars.
