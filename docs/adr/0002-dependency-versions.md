# ADR-0002 — Dependency Versions

- **Status:** Accepted
- **Date:** 2026-06-14
- **Deciders:** Axiom Protocol team

## Context

Every package version is a load-bearing choice. Three are especially sensitive:

1. **Solidity compiler** — the on-chain bytecode is permanent. A wrong version compiles to a different EVM target.
2. **OpenZeppelin Contracts** — the upgradeable pattern depends on ERC-7201 storage slots, which are version-specific.
3. **ethers.js** — the 0G SDKs declare it as a peer dependency with a specific version range.

We need a single source of truth that every implementer and reviewer can verify against.

## Decision

### Pinned versions (exact)

| Package | Version | Source / Reason |
|---------|---------|-----------------|
| `node` | `>=22.0.0` | `@0gfoundation/0g-compute-ts-sdk` Direct inference docs require Node 22 |
| `solc` | `0.8.20` | Matches `0gfoundation/0g-agent-nft` reference + 0G Hardhat config |
| `evm_version` | `cancun` | Mandatory on 0G Chain (per https://docs.0g.ai/developer-hub/building-on-0g/contracts-on-0g/deploy-contracts) |
| `forge` | `>=1.5.1` (latest stable) | Foundry stable channel |
| `@openzeppelin/contracts` | `5.0.2` | Pinned by 0G deployment scripts (https://raw.githubusercontent.com/0glabs/0g-deployment-scripts/main/README.md) |
| `@openzeppelin/contracts-upgradeable` | `5.0.2` | Same pin; required for UUPS pattern |
| `hardhat` | `^2.22.17` | Matches 0G reference repo |
| `ethers` | `^6.13.4` (peer of 0G SDKs) | Required by both `@0gfoundation/0g-ts-sdk` and `@0gfoundation/0g-compute-ts-sdk` |
| `viem` | `^2` | Frontend + backend chain reads |
| `wagmi` | `^2` | Frontend wallet stack |
| `@rainbow-me/rainbowkit` | `^2` | SSR-safe `getDefaultConfig` |
| `@0gfoundation/0g-ts-sdk` | `^1.2.8` | Canonical storage client (per Builder Hub) |
| `@0gfoundation/0g-compute-ts-sdk` | `^0.8.4` | Canonical compute broker |
| `@0gfoundation/0g-pay-sdk` | `^0.1.3` | Optional fiat on-ramp |
| `typescript` | `^5.5.4` | For wagmi/viem tooling |
| `vite` | `^5` | Frontend build |
| `react` | `^18` | Frontend |
| `node:test` | built-in | For `apps/oracle` tests (no test framework dep) |
| `pnpm` | `^11.5.1` | Workspace manager |

### Configuration (exact)

```toml
# apps/contracts/foundry.toml
evm_version = "cancun"
solc = "0.8.20"
optimizer = true
optimizer_runs = 200
via_ir = true
```

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"

allowBuilds:
  keccak: true
  secp256k1: true
```

## Consequences

### Positive

- **Reproducible builds** — `pnpm i && forge build` produces identical artifacts on every machine
- **CI determinism** — GitHub Actions installs exact versions, no floating ranges
- **No surprise breaking changes** — `^` ranges only allow patch + minor, never major, unless a major is intentional
- **Easier audit** — every dep version is a single source of truth in this ADR

### Negative

- **Pinning exact versions means manual upgrades** — when OpenZeppelin ships 5.0.3, we must bump and re-test
- **The 0G reference repo uses ethers ^6.13.4**; our peer dep says the same. If the 0G SDKs bump to ethers v7 in a future release, we must decide whether to follow or pin to v6

### Neutral

- **The "right" version is sometimes the latest minor** — for libraries we don't deeply care about (e.g. `dotenv`, `chai`), the `^` range is fine
- **Build tools (TypeScript, Prettier, ESLint) follow semver** — `^5.5.4` allows up to but not including 6.0.0

## How to update

1. Check the 0G release notes for any breaking changes: https://github.com/0glabs
2. Update this ADR with the new version + a one-line reason
3. Bump in `package.json` / `foundry.toml`
4. Run `pnpm -r run test` and `forge test -vvv`
5. If anything breaks, revert and open an issue

## References

- 0G reference repo: https://github.com/0gfoundation/0g-agent-nft (Hardhat 2.22.17 + Solidity 0.8.20 + OZ 5.0.2 + ethers v6.13.4)
- 0G deploy docs: https://docs.0g.ai/developer-hub/building-on-0g/contracts-on-0g/deploy-contracts (evmVersion cancun mandatory)
- 0G compute TS SDK: https://raw.githubusercontent.com/0glabs/0g-serving-user-broker/main/README.md (Node >= 22)
- 0G storage TS SDK: https://github.com/0glabs/0g-storage-ts-sdk (ethers peer dep)
