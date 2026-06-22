# Axiom Protocol — 0G Aristotle Mainnet Deployment

> **📋 TEMPLATE — Fill in after live broadcast.**
> Copy this file to `docs/deployments/aristotle-<YYYY-MM-DD>.md` after the
> `forge script --broadcast` run completes, then fill in the PENDING fields
> from the auto-generated `docs/deployments/aristotle-<DEPLOY_DATE>.json`.

**Deployed:** PENDING (fill in from `deployedAt` in the JSON manifest)
**Network:** 0G Aristotle Mainnet (chainId 16661)
**RPC:** https://evmrpc.0g.ai
**Explorer:** https://chainscan.0g.ai
**Storage indexer:** https://indexer-storage-turbo.0g.ai
**Mainnet Flow:** `0x62D4144dB0F0a6fBBaeb6296c785C71B3D57C526`

Sources: https://docs.0g.ai/developer-hub/mainnet/mainnet-overview, https://docs.0g.ai/ai-context

## Contract Addresses

| Contract | Address | Explorer |
|----------|---------|----------|
| **AxiomTeeVerifier** | `PENDING` | [View](https://chainscan.0g.ai/address/PENDING) |
| **AxiomAgentNFT (proxy)** | `PENDING` | [View](https://chainscan.0g.ai/address/PENDING) |
| **AxiomAgentNFT (impl)** | `PENDING` | [View](https://chainscan.0g.ai/address/PENDING) |
| **AxiomStrategyVault** | `PENDING` | [View](https://chainscan.0g.ai/address/PENDING) |
| **AxiomPaymentProcessor** | `PENDING` | [View](https://chainscan.0g.ai/address/PENDING) |

Copy the `contracts.*` fields from `docs/deployments/aristotle-<DEPLOY_DATE>.json`
into the rows above.

## Roles

| Role | Address | Key file |
|------|---------|----------|
| **TEE Signer** (registered in `AxiomTeeVerifier` at construction) | `PENDING` | `wallets/tee-signer.json` |
| **Oracle Admin** (DEFAULT_ADMIN_ROLE + ADMIN_ROLE + OPERATOR_ROLE + MINTER_ROLE on NFT, Ownable on Vault, Ownable + treasury on PaymentProcessor) | `PENDING` | `wallets/oracle-admin.json` |
| **Vault Owner** | `PENDING` | (same as Oracle Admin) |
| **Payment Processor Owner + Treasury** | `PENDING` | (same as Oracle Admin) |
| **Deployer** (EOA that paid gas; no on-chain role after deploy) | `PENDING` | `wallets/deployer.json` (one-time use) |

> **Key separation**: The deployer, TEE signer, and oracle admin MUST be three
> distinct addresses. See `apps/contracts/script/DeployAristotle.s.sol` for the
> on-chain key separation check enforced at deploy time.

## Broadcast Command

```bash
cd ~/og/apps/contracts
set -a; source .env.aristotle; set +a

AXIOM_DEPLOYER_PK=$AXIOM_DEPLOYER_PK \
  AXIOM_TEE_SIGNER_PK=$AXIOM_TEE_SIGNER_PK \
  AXIOM_ORACLE_ADMIN_PK=$AXIOM_ORACLE_ADMIN_PK \
  AXIOM_DEPLOY_DATE=$(date -u +%Y-%m-%d) \
  AXIOM_DEPLOYER_ADDRESS=$AXIOM_DEPLOYER_ADDRESS \
  PAYMENT_TOKEN_ADDR=$PAYMENT_TOKEN_ADDR \
  forge script script/DeployAristotle.s.sol \
    --rpc-url https://evmrpc.0g.ai \
    --chain-id 16661 \
    --broadcast --slow
```

## Verified On-Chain

Run after broadcast:

```bash
cast call <nft_proxy>    "name()(string)"            --rpc-url https://evmrpc.0g.ai
cast call <nft_proxy>    "symbol()(string)"          --rpc-url https://evmrpc.0g.ai
cast call <nft_proxy>    "verifier()(address)"       --rpc-url https://evmrpc.0g.ai
cast call <verifier>     "registeredSigner()(address)" --rpc-url https://evmrpc.0g.ai
cast call <verifier>     "maxProofAgeSeconds()(uint256)" --rpc-url https://evmrpc.0g.ai
```

Expected:
- `name() = "Axiom Agent NFT"`
- `symbol() = "AXM-A"`
- `maxProofAgeSeconds() = 604800` (7 days)
- `registeredSigner()` matches the TEE signer address from the deploy

## Contract Sizes

| Contract | Runtime bytecode | ~KB |
|----------|------------------|-----|
| AxiomTeeVerifier | PENDING | PENDING |
| AxiomAgentNFT (impl) | PENDING | PENDING |
| ERC1967Proxy (NFT) | PENDING | PENDING |
| AxiomStrategyVault | PENDING | PENDING |
| AxiomPaymentProcessor | PENDING | PENDING |

To compute: `cast code <addr> --rpc-url https://evmrpc.0g.ai | wc -c`

## Rollback

See `apps/contracts/README-aristotle.md` § Rollback plan.

## Cross-references

- `apps/contracts/script/DeployAristotle.s.sol` (deploy script with safety checks)
- `apps/contracts/README-aristotle.md` (full deploy runbook)
- `docs/deployments/aristotle-<DEPLOY_DATE>.json` (auto-generated address manifest)
- `apps/contracts/broadcast/DeployAristotle.s.sol/16661/run-latest.json` (broadcast trace)
