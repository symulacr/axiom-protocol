# @axiom/backend

Express HTTP + WebSocket server — the Axiom orchestration engine. Routes agent inference through 0G Compute Router, settles on-chain payments, and manages encrypted agent storage.

**Depends on:** `@axiom/config`, `@axiom/oracle`

## Commands

| Command | Description |
| --------- | ------------- |
| `bun run dev` | Start directly from source (bun runtime, no build step) |
| `bun run build` | TypeScript compile |
| `bun run start` | Run compiled dist/ |
| `bun run test` | Run tests |
| `bun run run-e2e` | End-to-end integration test |

## Network

- **Port:** 3000 (default, via `AXIOM_PORT`)
- **Bind:** `127.0.0.1` (default, via `AXIOM_BIND`)
- **Protocol:** HTTP REST + WebSocket

## Environment

Root `.env` + `apps/backend/.env.example` for app-specific vars.
