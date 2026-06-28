# @axiom/contracts

Foundry Solidity smart contracts — AxiomAgentNFT (ERC-7857 iNFT), AxiomStrategyVault, AxiomPaymentProcessor, AxiomTeeVerifier. UUPS upgradeable. Deployed on 0G Galileo testnet.

**Depends on:** none (uses OpenZeppelin only)

## Commands

| Command | Description |
|---------|-------------|
| `forge build` | Compile contracts |
| `forge test -vv` | Run tests (verbose) |
| `pnpm generate-abis` | Export ABIs to `packages/config/abis/` |
| `forge coverage` | Coverage report |
| `forge fmt` | Format Solidity |
| `pnpm deploy:galileo` | Deploy to Galileo testnet |

## Environment

`apps/contracts/.env.galileo-deploy.example` (Galileo) and `apps/contracts/.env.aristotle.example` (mainnet).
