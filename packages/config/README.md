# @axiom/config

Shared configuration package for all Axiom apps — environment loader (Zod schemas), network defaults (0G chain IDs + RPCs), deployed contract addresses, typed ABIs (generated from forge), reusable Typescript types, and 0G Storage client adapter.

**Used by:** `@axiom/backend`, `@axiom/frontend`, `@axiom/oracle`, `@axiom/indexer`

## Commands

| Command | Description |
|---------|-------------|
| `pnpm build` | Generate wagmi types + TypeScript compile |
| `pnpm typecheck` | TypeScript check only |
| `pnpm generate` | Regenerate wagmi bindings |
| `pnpm watch:contracts` | Watch for ABI changes |

## Environment

No app-specific env vars. Re-exports `sharedEnvSchema` consumed by all app env schemas. Refer to root `.env.example`.
