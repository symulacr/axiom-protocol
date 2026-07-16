# Axiom Protocol Wallets — Shared Funding Strategy

**Generated:** 2026-06-14
**Network:** 0G Galileo Testnet (chainId 16602, verified via cast)
**RPC:** https://evmrpc-testnet.0g.ai
**Faucet:** https://faucet.0g.ai (0.1 OG/day per address)
**Current block:** 38,652,235

## Funding Status (live from chain)

| Role | Address | Balance |
|------|---------|---------|
| Deployer (0xaf7c...) | `0xaf7c581b1C1C250aA69ac1F19f8014C0636c4d20` | 0.0 OG |
| TEE Signer (0x0553...) | `0x0553f58a0209Fb8DcE201fCD9406Be56da890D73` | 0.0 OG |
| Oracle Admin (0x4373...) | `0x437371dB1FBD534Bd01BD3f4E66DfA1675952F91` | **0.5 OG** |
| Test Receiver 1 (0x8450...) | `0x845016B204fb2db028Ff148990Fc75bb606EE239` | **0.5 OG** |
| Test Receiver 2 (0x4b4c...) | `0x4b4ce48b3e234ab057Ae9b25649a9B7F70e1A4C3` | **0.5 OG** |

**Total available: 1.5 OG across 3 funded wallets.**

## Shared-Funding Strategy

Per user directive, share the 1.5 OG across all roles rather than funding each separately. For Wave 1 (contracts skeleton on testnet), 0.5 OG is sufficient:

- **Primary operator wallet** = `0x437371dB1FBD534Bd01BD3f4E66DfA1675952F91` (Oracle Admin, 0.5 OG)
  - Serves as Deployer, Oracle Admin, AND TEE Signer for development.
  - The same keypair plays all three roles — this is fine for testnet where key separation is not security-critical.
- **Test wallet 1** = `0x845016B204fb2db028Ff148990Fc75bb606EE239` (0.5 OG)
  - Receives a transferred agent in the E2E test.
- **Test wallet 2** = `0x4b4ce48b3e234ab057Ae9b25649a9B7F70e1A4C3` (0.5 OG)
  - Optional second transfer test or multi-agent scenario.

The 0.0-OG wallets (Deployer 0xaf7c... and TEE Signer 0x0553...) are kept for reference but not used. If the operator wallet runs dry, fund it more from the faucet (0.1 OG/day).

## Environment Variables (use the operator wallet for everything)

```bash
# Primary operator wallet (Oracle Admin — plays all 3 roles on testnet)
# Set these from secure env (never commit raw PKs to git)
DEPLOYER_PK=<DEPLOYER_PK>
TEE_SIGNER_PK=<TEE_SIGNER_PK>
ORACLE_ADMIN_PK=<ORACLE_ADMIN_PK>
OG_RPC_URL=https://evmrpc-testnet.0g.ai
OG_CHAIN_ID=16602

# Test wallets
TEST_RECEIVER_1_PK=<TEST_RECEIVER_1_PK>
TEST_RECEIVER_2_PK=<TEST_RECEIVER_2_PK>
# E2E alias — the two-stage Step 9/10 receiver. Derives to 0x845016B204fb2db028Ff148990Fc75bb606EE239.
RECEIVER_PK=${TEST_RECEIVER_1_PK}
```

## Why this is safe on testnet

- All 5 wallets are **testnet-only** (0G Galileo, not mainnet).
- The operator wallet is a freshly generated keypair with no prior activity.
- Key separation matters in production (deployer = cold storage, TEE signer = HSM, oracle admin = multisig). On testnet, a single key is fine and matches the user's "share funded between them" instruction.
- When we deploy to 0G mainnet (Wave 18/19), we will generate fresh production keys with proper separation.

## Security

- Private key files are `chmod 400` (read-only by owner)
- **NEVER** commit `wallets/*.json` to git (already gitignored)
- Rotate keys after the buildathon
