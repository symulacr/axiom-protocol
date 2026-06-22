> **✅ CANONICAL — This is the current live testnet deployment.**
> Supersedes `docs/deployments/galileo-2026-06-14.md`. All contract addresses below
> are the correct live addresses on 0G Galileo (chainId 16602) as of 2026-06-16.

# Wave E-5 — Full Redeploy on 0G Galileo (2026-06-16) [CANONICAL]

## Summary
Full redeploy of all 5 Axiom Protocol contracts on 0G Galileo (chainId 16602) via `forge script script/Deploy.s.sol`. Replaces the Wave 16B (2026-06-15) deploy whose `AxiomTeeVerifier` v2 had a non-documented `require(false)` in a path not covered by the repo source, causing `iTransferFrom` to revert with no data on the live v2.

## Deploy command
```bash
cd apps/contracts
set -a; source ../../.env; set +a
export AXIOM_DEPLOYER_ADDRESS=0x437371dB1FBD534Bd01BD3f4E66DfA1675952F91
export PAYMENT_TOKEN_ADDR=0xeA13E136E59c6e919BeF2221f6ecDE2cBCEb0Dbf
forge script script/Deploy.s.sol \
  --rpc-url "$OG_RPC_URL" \
  --broadcast \
  --legacy \
  --gas-price 3000000000
```

## New contract addresses (0G Galileo, chainId 16602)

| Contract | Address |
|----------|---------|
| AxiomAgentNFT (proxy) | `0xf12F158a20c36a351b056FD60b3a7377ce4F1e09` |
| AxiomAgentNFT (impl) | `0xc1fF0C179B947b4CE3a6a2b784025b1DBBd37386` |
| AxiomTeeVerifier | `0x24f725198d64A3b03A8386cD8fa12BD7c591734A` |
| AxiomStrategyVault | `0xb7F89e50D5A3039Da7d39528436B820371572874` |
| AxiomPaymentProcessor | `0x096203fB54681b66dD8ab9bA47aaB462aA8C4A5f` |
| MockUSDC (paymentToken, unchanged) | `0xeA13E136E59c6e919BeF2221f6ecDE2cBCEb0Dbf` |

## Verifier configuration
- `maxProofAgeSeconds() = 604800` (7 days)
- `registeredSigner() = 0x437371dB1FBD534Bd01BD3f4E66DfA1675952F91` (operator/TEE)
- Owner: `0x437371dB1FBD534Bd01BD3f4E66DfA1675952F91`

## E2E verification (post-redeploy)
- `cd apps/backend && unset AGENT_NFT_ADDRESS AXIOM_TEE_VERIFIER VAULT_ADDRESS AXIOM_PAYMENT_PROCESSOR; pnpm run-e2e`
- **10/11 steps pass** (Step 6 fails: operator wallet low on native OG after deploy + previous deposits; pre-existing, requires user top-up)
- **Step 10 [OK]** — `iTransferFrom` on-chain succeeded:
  - tx: `0xbb38b0e2d60ec6592bf7023ecdbd330c0ab2641c802d63e518ed76a997a26278`
  - owner: `0x845016B204fb2db028Ff148990Fc75bb606EE239` (receiver)
  - accessSigner: `0x845016B204fb2db028Ff148990Fc75bb606EE239` (matches receiver)
  - tokenId: `1`

## Gas note
0G Galileo requires `gas tip cap > 2 gwei` (strict). The E2E CLI's `iTransferFrom` transaction was bumped from 2 gwei to 3 gwei (`apps/backend/src/cli/run-e2e.ts:273`) to clear the `gas tip cap 2000000000, minimum needed 2000000000` check.

## Env update
Local `.env` updated with new addresses. (`.env` is gitignored; update manually or via the canonical env sync script.)

## Broadcast artifact
`apps/contracts/broadcast/Deploy.s.sol/16602/run-latest.json` — full transaction bundle for the 5 deploys.

## Next
- User tops up operator wallet to clear Step 6 fund gap.
- Run `cast call $AGENT_NFT_ADDRESS "verifier()(address)" --rpc-url $OG_RPC_URL` to confirm wiring (returns `0x24f725…`).
- Optional: revoke `OPERATOR_ROLE` on the old Wave 16B proxy (`0x61D039…`) if no longer used.
