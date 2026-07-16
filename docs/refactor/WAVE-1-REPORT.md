# Wave 1 Report — Foundation & Process

## Fixed
- **C0:** Stopped gitignoring `*.test.ts`, `*.spec.ts`, `*.t.sol`; CLI e2e sources tracked
- CI proves tests tracked; unit job runs config + full chat-runtime + indexer
- pnpm unified to **10.22.0** (root, FE, oracle, Dockerfile, corepack)
- Root build: config → chat-runtime → oracle → backend
- nixpacks build cmds; vercel no hardcoded Railway hosts; server.mjs requires PROXY_* in production
- Living docs: `docs/current-state.md`, regenerated `env-vars.md` / `backend-api.md`

## Tests
- Config 14 pass; chat-runtime 45 pass (after glob fix)

## Remaining → later waves
- Security C1–C6, settlement, vault, oracle multi-instance polish
