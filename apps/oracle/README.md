# @axiom/oracle

TEE-attested signing service — generates ERC-7857 OwnershipProofs (EIP-712) and re-encrypts agent metadata on transfer using eciesjs for the receiving TEE.

**Depends on:** `@axiom/config`

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start with tsx watch (no build step) |
| `pnpm build` | TypeScript compile |
| `pnpm start` | Run compiled dist/ |
| `pnpm test` | Run tests |

## Network

- **Port:** 8787 (default, via `AXIOM_ORACLE_PORT`)
- **Bind:** `127.0.0.1` (default, via `AXIOM_ORACLE_BIND`)
- **Protocol:** HTTP REST (Express)

## Environment

Root `.env` (no app-specific .env file; see root `.env.example`).
