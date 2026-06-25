# Galileo Testnet Deployment Guide

## Prerequisites

1. Install Foundry: `curl -L https://foundry.paradigm.xyz | bash && foundryup`
2. Copy env: `cp .env.galileo.example .env.galileo`
3. Fill in private keys in `.env.galileo`
4. Set `AXIOM_TEE_SIGNER_PK` (must match the registered signer in `AxiomTeeVerifier`)

## Getting Testnet OG Tokens

The Galileo testnet faucet distributes **0.1 OG per address per day**.

| Resource        | URL                                   |
|-----------------|---------------------------------------|
| Faucet          | <https://faucet.0g.ai>                |
| Block explorer  | <https://chainscan-galileo.0g.ai>     |
| RPC             | <https://evmrpc-testnet.0g.ai>        |

**Steps:**

1. Go to <https://faucet.0g.ai>
2. Paste your deployer wallet address (EOA)
3. Complete the captcha and request funds
4. Verify: `cast balance <YOUR_ADDRESS> --rpc-url https://evmrpc-testnet.0g.ai`

**Wallet references** — the active funded wallets are documented in `wallets/ADDRESSES.md`:

- **Operator wallet** (`0x437371...`): plays Deployer + TEE Signer + Oracle Admin
  on testnet
- **Test Receiver 1** (`0x845016...`): receives transferred agents in E2E tests
- **Test Receiver 2** (`0x4b4ce...`): secondary test wallet

> **Tip:** If the operator wallet runs dry, fund it again from the faucet. All three
> active wallets may share the daily 0.1 OG limit from a single IP. Check balances
> with: `cast balance <ADDR> --rpc-url https://evmrpc-testnet.0g.ai`.

## Step 1: Deploy Contracts

```bash
cd apps/contracts
source ../.env.galileo

# Deploy AxiomTeeVerifier + AxiomAgentNFT + AxiomStrategyVault + AxiomPaymentProcessor
forge script script/Deploy.s.sol \
  --rpc-url https://evmrpc-testnet.0g.ai \
  --broadcast \
  --verify \
  -vvv
```

## Step 2: Update Contract Addresses

After deployment, update the hardcoded defaults in `packages/config/src/addresses.ts`
(or override via env vars `AXIOM_AGENT_NFT_ADDRESS`, `AXIOM_STRATEGY_VAULT_ADDRESS`,
`AXIOM_TEE_VERIFIER_ADDRESS`, `AXIOM_PAYMENT_PROCESSOR_ADDRESS` in `.env`).

## Step 3: Start Oracle

```bash
cd apps/oracle
source ../.env.galileo
pnpm dev
```

## Step 4: Start Backend

```bash
cd apps/backend
source ../.env.galileo
pnpm dev
```

## Step 5: Start Indexer

```bash
cd apps/indexer
source ../.env.galileo
pnpm dev
```

## Step 6: Verify

```bash
# Health check
curl http://127.0.0.1:3000/health

# Compute providers (on-chain discovery)
curl http://127.0.0.1:3000/v1/compute/providers

# Events
curl http://127.0.0.1:3000/v1/events
```
