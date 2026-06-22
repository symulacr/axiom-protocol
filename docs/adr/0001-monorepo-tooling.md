# ADR-0001 — Monorepo Tooling

- **Status:** Accepted
- **Date:** 2026-06-14
- **Deciders:** Axiom Protocol team

## Context

We are building a full-stack Web3 protocol (smart contracts, TEE oracle, backend, frontend, indexer) on the 0G stack. The repo must support:

- **5 languages** (Solidity, TypeScript/Node, shell, Mermaid, Markdown)
- **Multiple toolchains** (Foundry, Hardhat, Vite, Node 22, pnpm)
- **Multiple deploy targets** (Vercel for frontend, Fly.io for backend, 0G Chain for contracts)
- **The 0G WaveHack buildathon** (Aug 14 – Nov 15, 2026) with weekly deliverables

## Decision

Use a **pnpm workspace monorepo** at `~/og/` with the following top-level structure:

```
~/og/
├── apps/
│   ├── contracts/    # Foundry + Hardhat
│   ├── oracle/       # TEE signer service
│   ├── backend/      # Orchestration engine + HTTP/WS
│   ├── frontend/     # Vite + React 18 + wagmi
│   └── indexer/      # Event watcher → 0G DA
├── packages/
│   ├── sdk/          # Typed TS SDK
│   └── protocol/     # Shared JSON-schema/types
├── docs/             # Brand, architecture, security, ops
├── wallets/          # Testnet keys (gitignored)
└── local://          # Plan + research notes
```

**Tooling choices** (all pinned):

- **Node.js >= 22.0.0** — required by `@0gfoundation/0g-compute-ts-sdk`
- **pnpm >= 9** (using 11.5.1) — workspace manager with `allowBuilds` for keccak/secp256k1 native modules
- **Foundry** (forge + anvil + cast + chisel) — primary Solidity toolchain
- **Hardhat 2.22.17** — only for the `verify` step (0G Etherscan custom chains are Hardhat-only)
- **Solidity 0.8.20** with `evmVersion = "cancun"` — per 0G docs and reference repo
- **OpenZeppelin Contracts 5.0.2** (standard) + **OpenZeppelin Contracts Upgradeable 5.0.2** (UUPS pattern)
- **TypeScript 5.5+** with `moduleResolution: "Bundler"` and `strict: true`
- **Vite 5 + React 18** — frontend
- **wagmi 2 + viem 2 + RainbowKit 2** — wallet stack
- **ethers 6.16.0** — required by 0G SDKs

## Consequences

### Positive

- **One repo, one set of dependencies, one `pnpm i`** — onboarding a new contributor is `git clone && pnpm i && make test`
- **Cross-workspace imports work** (`@axiom/sdk` can be used in `apps/frontend` and `apps/backend` without publishing)
- **Single source of truth for shared types** (the `packages/protocol` workspace holds the shared JSON-schema, ABI exports, and TypeScript types)
- **CI runs once at the root** with `pnpm -r run test`
- **Lockfile at the root** (`pnpm-lock.yaml`) gives deterministic installs

### Negative

- **Foundry + Hardhat in the same package** is unusual. Foundry is the primary test runner; Hardhat is only used for `npx hardhat verify --network galileo`. Two toolchains mean two config files (`foundry.toml` + `hardhat.config.cjs`).
- **Hardhat config must be `.cjs` not `.ts`** because `package.json` doesn't have `"type": "module"` but Hardhat's loader still complains about TypeScript syntax in `.cjs`. Plain CommonJS `require` / `module.exports` is required.
- **pnpm 11 deprecated the `pnpm` field in `package.json`** — `onlyBuiltDependencies` must be in `pnpm-workspace.yaml` as `allowBuilds`. Old docs are misleading.
- **The frontend is Vite, not Next.js** — `VITE_` prefix is required for browser-visible env vars. `NEXT_PUBLIC_` does not work in Vite.

### Neutral

- **Turborepo not used** — pnpm workspace filter (`pnpm -r run <cmd>`) is sufficient for 6 workspaces. Turborepo would add cache complexity without proportional benefit at this scale.
- **Nix not used** — the toolchain is reproducible via `node --version` + `forge --version` + the pinned `package.json` engines. Nix would help for hermetic CI but isn't required for a 6-week buildathon.

## References

- 0G WaveHack buildathon: https://app.akindo.io/wave-hacks/Z4MlX4vreI72ol6pd
- pnpm 11 release notes: https://pnpm.io/blog/releases/11.0
- 0G AI Coding Context: https://docs.0g.ai/ai-context
- 0G reference repo: https://github.com/0gfoundation/0g-agent-nft
