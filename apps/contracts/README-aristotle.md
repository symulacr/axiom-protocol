# Deploying Axiom Protocol to 0G Aristotle Mainnet

This document describes the production mainnet deploy of the Axiom Protocol
contracts to **0G Aristotle** (chainId 16661). It is the mainnet companion to
the existing Galileo testnet deploy (`docs/deployments/galileo-2026-06-14.md`)
and mirrors the deploy pattern from `script/Deploy.s.sol` with extra safety
controls.

## Network reference

| Field | Value | Source |
|-------|-------|--------|
| Network | 0G Aristotle mainnet | <https://docs.0g.ai/developer-hub/mainnet/mainnet-overview> |
| Chain ID | 16661 | <https://docs.0g.ai/ai-context> |
| RPC | `https://evmrpc.0g.ai` | <https://docs.0g.ai/developer-hub/mainnet/mainnet-overview> |
| Explorer | `https://chainscan.0g.ai` | <https://docs.0g.ai/ai-context> |
| Storage indexer | `https://indexer-storage-turbo.0g.ai` | <https://docs.0g.ai/developer-hub/mainnet/mainnet-overview> |
| Mainnet Flow | `0x62D4144dB0F0a6fBBaeb6296c785C71B3D57C526` | <https://docs.0g.ai/ai-context> |

## Required environment variables

The script reads the following env vars. A ready-to-fill template lives in
`apps/contracts/.env.aristotle.example`; copy it to `.env.aristotle` and `set -a; source .env.aristotle; set +a` before invoking `forge script`.

| Var | Required | Purpose |
|-----|----------|---------|
| `AXIOM_DEPLOYER_PK` | yes | EOA that pays gas. Funded with ≥ 0.5 OG. The address derived from this key must match `AXIOM_DEPLOYER_ADDRESS`. |
| `AXIOM_TEE_SIGNER_PK` | yes | secp256k1 key for the off-chain TEE signer service. The derived address is registered as the trusted signer in `AxiomTeeVerifier` at construction time. MUST differ from `AXIOM_DEPLOYER_PK` and `AXIOM_ORACLE_ADMIN_PK`. |
| `AXIOM_ORACLE_ADMIN_PK` | yes | EOA that owns the NFT, vault, and payment processor post-deploy. MUST differ from `AXIOM_DEPLOYER_PK` and `AXIOM_TEE_SIGNER_PK` for blast-radius isolation. |
| `AXIOM_DEPLOY_DATE` | yes | `YYYY-MM-DD` stamp used to name `docs/deployments/aristotle-<date>.json`. |
| `AXIOM_DEPLOYER_ADDRESS` | yes | The address that will own the `AxiomTeeVerifier` after deploy (can be a multisig). |
| `PAYMENT_TOKEN_ADDR` | yes | The ERC-20 payment token address (e.g. USDC.e / USDG on 0G). |
| `ETHERSCAN_API_KEY` | yes (for verify) | Blockscout-compatible API key for `npx hardhat verify --network mainnet`. |
| `AXIOM_LEGACY` | opt | Set to `1` to dry-run the script against Galileo testnet (chainId 16602). The script reverts on any other chain id. |

## Expected gas (estimate from `forge`)

The four constructor transactions, run with `forge build` optimizer settings
(200 runs, viaIR) on `solc 0.8.20`:

| Contract | Constructor bytecode | ~Deployment cost (canary @ 30 gwei) |
|----------|----------------------|--------------------------------------|
| `AxiomTeeVerifier` | ~3 KB | ~250k gas |
| `AxiomAgentNFT` (impl) | ~20 KB | ~1.6M gas |
| `ERC1967Proxy` (NFT) | ~0.1 KB | ~80k gas |
| `AxiomStrategyVault` | ~3 KB | ~250k gas |
| `AxiomPaymentProcessor` | ~3 KB | ~250k gas |
| **Total** | | **~2.4M gas ≈ 0.05 OG @ 30 gwei** |

Verify with `forge test --gas-report` against the existing test suite and
re-measure on the actual mainnet block before broadcasting. Add a 20% safety
margin when funding `DEPLOYER_PK`. Source: <https://book.getfoundry.sh/forge/deploying-and-running>

## Deploy procedure

### 1. Pre-flight

```bash
# Verify the script parses + the network guard works.
cd ~/og/apps/contracts
forge build
AXIOM_LEGACY=1 \
  AXIOM_DEPLOYER_PK=$AXIOM_DEPLOYER_PK \
  AXIOM_TEE_SIGNER_PK=$AXIOM_TEE_SIGNER_PK \
  AXIOM_ORACLE_ADMIN_PK=$AXIOM_ORACLE_ADMIN_PK \
  AXIOM_DEPLOY_DATE=2026-06-14 \
  AXIOM_DEPLOYER_ADDRESS=$AXIOM_DEPLOYER_ADDRESS \
  PAYMENT_TOKEN_ADDR=$PAYMENT_TOKEN_ADDR \
  forge script script/DeployAristotle.s.sol \
    --rpc-url https://evmrpc-testnet.0g.ai \
    --chain-id 16602

# Sanity-check the deployer balance on mainnet.
cast balance $AXIOM_DEPLOYER_ADDRESS --rpc-url https://evmrpc.0g.ai
```

### 2. Broadcast

```bash
cd ~/og/apps/contracts

# ── Pre-flight: source env ──────────────────────────────────────────────
set -a; source .env.aristotle; set +a

# ── Dry-run on Galileo (confirm script parses + env reads + no reverts) ──
AXIOM_LEGACY=1 \
  AXIOM_DEPLOYER_PK=$AXIOM_DEPLOYER_PK \
  AXIOM_TEE_SIGNER_PK=$AXIOM_TEE_SIGNER_PK \
  AXIOM_ORACLE_ADMIN_PK=$AXIOM_ORACLE_ADMIN_PK \
  AXIOM_DEPLOY_DATE=$(date -u +%Y-%m-%d) \
  AXIOM_DEPLOYER_ADDRESS=$AXIOM_DEPLOYER_ADDRESS \
  PAYMENT_TOKEN_ADDR=$PAYMENT_TOKEN_ADDR \
  forge script script/DeployAristotle.s.sol \
    --rpc-url https://evmrpc-testnet.0g.ai

# ── Live broadcast (IRREVERSIBLE) ───────────────────────────────────────
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

# ── Verify on Blockscout ────────────────────────────────────────────────
npx hardhat verify --network mainnet 0x<verifier>   0x<axiom_deployer>  0x<tee_signer>  604800
npx hardhat verify --network mainnet 0x<nft_impl>
npx hardhat verify --network mainnet 0x<nft_proxy> \
  "Axiom Agent NFT" "AXM-A" "ipfs://axiom-storage" 0x<verifier> 0x<oracle_admin>
npx hardhat verify --network mainnet 0x<vault>      0x<nft_proxy>  0x<oracle_admin>
npx hardhat verify --network mainnet 0x<processor>  0x<nft_proxy>  0x<payment_token>  0x<oracle_admin>  100  0x<oracle_admin>
```

The script:
1. Reads `block.chainid` and reverts with `WrongChain(actual, expected)` unless it is 16661 (or 16602 + `LEGACY=1`).
2. Deploys the four contracts in the same order as `script/Deploy.s.sol`.
3. The TEE signer pubkey is registered into `AxiomTeeVerifier` at construction time (see `src/verifiers/AxiomTeeVerifier.sol:43-47`), so no separate post-deploy registration tx is required.
4. Writes `docs/deployments/aristotle-<DEPLOY_DATE>.json` with the deployed addresses + an ISO-8601 timestamp.
5. Prints a summary to stdout.

### 3. Verify on-chain

```bash
cd ~/og/apps/contracts
npx hardhat verify --network mainnet 0x<verifier>   0x<tee_signer>  604800
npx hardhat verify --network mainnet 0x<nft_impl>
npx hardhat verify --network mainnet 0x<nft_proxy> \
  "Axiom Agent NFT" "AXM-A" "ipfs://axiom-storage" 0x<verifier> 0x<oracle_admin>
npx hardhat verify --network mainnet 0x<vault>      0x<nft_proxy>  0x<oracle_admin>
npx hardhat verify --network mainnet 0x<processor>  0x<nft_proxy>  0x<oracle_admin> 100 0x<oracle_admin>
```

### 4. Post-deploy on-chain registrations

All signer / role / treasury wiring is done at construction time — there is
**no separate post-deploy transaction** required for the standard roles. The
following registrations can be added later if the operator needs to expand
the on-chain footprint:

| Action | Contract / function | Caller | Notes |
|--------|---------------------|--------|-------|
| Rotate the TEE signer pubkey | `AxiomTeeVerifier.registerSigner(newSigner)` | Deployer (or contract owner after `Ownable.transferOwnership`) | Emits `SignerRegistered(old, new)`. Update the `apps/oracle` keypair in lockstep. |
| Grant `MINTER_ROLE` to a separate minter | `AxiomAgentNFT.grantRole(MINTER_ROLE, addr)` | `DEFAULT_ADMIN_ROLE` (initially the deployer) | Required if minting is delegated to a frontend/backend service. |
| Grant `OPERATOR_ROLE` to the backend | `AxiomAgentNFT.grantRole(OPERATOR_ROLE, addr)` | `DEFAULT_ADMIN_ROLE` | Required for the orchestration engine to call `update(...)` on agent data. |
| Transfer NFT ownership to a multisig | `AxiomAgentNFT.transferOwnership(addr)` (via UUPS `OwnableUpgradeable`) | Current owner (deployer) | Strongly recommended before any real user funds are at risk. |
| Transfer vault ownership | `AxiomStrategyVault.transferOwnership(addr)` (via `Ownable`) | Current owner (deployer) | Same. |
| Transfer payment-processor ownership + treasury | `AxiomPaymentProcessor.transferOwnership(addr)` and `setTreasury(addr)` | Current owner | Same. |

To prevent replay of pre-mainnet proofs, the verifier rejects any proof
with a `nonce` older than `block.timestamp - maxProofAgeSeconds` (7 days)
in `BaseVerifier._checkAndMarkProof`. The set of used proofs is bounded
by `proofTimestamps`; call `cleanExpiredProofs` periodically if the
operator wants to reclaim storage.

## Rollback plan

The 0G Chain has no built-in transaction reversal. Rollback options, in
order of preference:

1. **No-op rollback (recommended for signer/key compromises).** The NFT
   uses a UUPS proxy; ownership can be transferred to a multisig, the
   TEE signer can be rotated via `AxiomTeeVerifier.registerSigner`, and
   `MINTER_ROLE` can be revoked from a compromised minter. The vault
   and payment processor are non-upgradeable by design (frozen, value-bearing),
   so a bug in either requires a migration to a new deployment rather than
   an in-place fix.
2. **Pause path.** `AxiomAgentNFT` inherits `PausableUpgradeable`. The
   `DEFAULT_ADMIN_ROLE` can call `pause()` to freeze minting, transfers,
   and clones. The vault and payment processor are *not* pausable in
   the current implementation — this is an intentional design choice
   (matching the reference) that limits the blast radius of a UI-level
   bug, at the cost of an in-place emergency stop.
3. **Migration path (for unrecoverable bugs).** Deploy a new
   `AxiomStrategyVault` / `AxiomPaymentProcessor` and point the frontend
   at the new addresses. Existing user balances in the old vault are
   recoverable via a `migrateBalances(newVault)` admin function — the
   exact signature of this escape hatch must be reviewed and added if
   not already present before mainnet deploy.
4. **Full circuit breaker (last resort).** If a critical bug is found
   in the verifier, the operator can:
   - Call `AxiomAgentNFT.pause()` to freeze the NFT.
   - Call `AxiomTeeVerifier.registerSigner(0x000…dead)` to invalidate
     every future transfer-validity proof (the verifier will revert
     on signature recovery with `AxiomInvalidSigner()`).
   This effectively bricks the marketplace but no funds are lost.

## Verification (post-broadcast)

```bash
# Name + symbol on the proxy:
cast call 0x<nft_proxy> "name()(string)"  --rpc-url https://evmrpc.0g.ai
cast call 0x<nft_proxy> "symbol()(string)" --rpc-url https://evmrpc.0g.ai

# Verifier wiring:
cast call 0x<nft_proxy> "verifier()(address)" --rpc-url https://evmrpc.0g.ai
cast call 0x<verifier>  "registeredSigner()(address)" --rpc-url https://evmrpc.0g.ai
cast call 0x<verifier>  "maxProofAgeSeconds()(uint256)" --rpc-url https://evmrpc.0g.ai
```

Expected outputs match the values used at deploy time (name = "Axiom Agent NFT",
symbol = "AXM-A", `maxProofAgeSeconds` = 604800).

## References

- Foundry `forge script` / `--broadcast` / `--slow`:
  <https://book.getfoundry.sh/forge/deploying-and-running>
- 0G Aristotle mainnet overview (RPC, chain id, storage indexer):
  <https://docs.0g.ai/developer-hub/mainnet/mainnet-overview>
- 0G AI context (Flow contract address table, EIP-155 chain ids):
  <https://docs.0g.ai/ai-context>
- ERC-7857 standard (the verifier ABI this contract conforms to):
  <https://eips.ethereum.org/EIPS/eip-7857>
- 0G Agent NFT reference repo (MIT-derived, on which `AxiomAgentNFT` and
  `AxiomTeeVerifier` are modelled):
  <https://github.com/0gfoundation/0g-agent-nft>
