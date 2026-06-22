# Axiom Protocol — 0G Aristotle Mainnet Deployment

**Deployed:** PENDING (this is a placeholder; the `YYYY-MM-DD` part of the filename will be replaced with the actual broadcast date when the deploy script `script/DeployAristotle.s.sol` runs)
**Network:** 0G Aristotle Mainnet (chainId 16661)
**RPC:** https://evmrpc.0g.ai
**Explorer:** https://chainscan.0g.ai
**Storage indexer:** https://indexer-storage-turbo.0g.ai
**Mainnet Flow:** `0x62D4144dB0F0a6fBBaeb6296c785C71B3D57C526`

Sources: <https://docs.0g.ai/developer-hub/mainnet/mainnet-overview>, <https://docs.0g.ai/ai-context>

> **Status:** The deploy script (`apps/contracts/script/DeployAristotle.s.sol`)
> parses cleanly and the network guard works (see `README-aristotle.md` for the
> procedure). The four contract addresses below are populated when the live
> `forge script ... --broadcast` run completes; this file is the hand-mirror of
> `docs/deployments/aristotle-<DEPLOY_DATE>.json` which the script writes
> automatically.

## Contract Addresses (PENDING)

| Contract | Address | Etherscan |
|----------|---------|-----------|
| **AxiomTeeVerifier** | PENDING | PENDING |
| **AxiomAgentNFT (proxy)** | PENDING | PENDING |
| **AxiomAgentNFT (impl)** | PENDING | PENDING |
| **AxiomStrategyVault** | PENDING | PENDING |
| **AxiomPaymentProcessor** | PENDING | PENDING |

To fill this in after a live broadcast: copy the `contracts.*` fields from
`docs/deployments/aristotle-<DEPLOY_DATE>.json` into the rows above, and
prefix the address with the chainscan link `https://chainscan.0g.ai/address/<addr>`.

## Roles (PENDING — to be filled in after live deploy)

| Role | Address | PK file |
|------|---------|---------|
| **TEE Signer** (registered in `AxiomTeeVerifier` at construction time) | PENDING | `wallets/tee-signer.json` |
| **Oracle Admin** (DEFAULT_ADMIN_ROLE + ADMIN_ROLE + OPERATOR_ROLE + MINTER_ROLE on NFT, Ownable on Vault, Ownable + treasury on PaymentProcessor) | PENDING | `wallets/oracle-admin.json` |
| **Vault Owner** | PENDING | (same as Oracle Admin) |
| **Payment Processor Owner + Treasury** | PENDING | (same as Oracle Admin) |
| **Deployer** (the EOA that paid gas; no on-chain role after deploy) | PENDING | `wallets/deployer.json` (one-time use, can be discarded after the addresses are pinned) |

> Per `README-aristotle.md`, the post-deploy hand-off is to transfer
> ownership of all three contracts to a multisig (e.g. Safe) before any real
> user funds are at risk. The addresses above are the deploy-time owners;
> post-transfer the multisig address becomes the on-chain owner.

## Verified On-Chain (to be filled in after live deploy)

PENDING — after broadcast, run:

```bash
cast call <nft_proxy>    "name()(string)"            --rpc-url https://evmrpc.0g.ai
cast call <nft_proxy>    "symbol()(string)"          --rpc-url https://evmrpc.0g.ai
cast call <nft_proxy>    "verifier()(address)"       --rpc-url https://evmrpc.0g.ai
cast call <verifier>     "registeredSigner()(address)" --rpc-url https://evmrpc.0g.ai
cast call <verifier>     "maxProofAgeSeconds()(uint256)" --rpc-url https://evmrpc.0g.ai
```

Expected outputs (from `script/DeployAristotle.s.sol:31-34` and `AxiomTeeVerifier.sol:43-47`):
- `name() = "Axiom Agent NFT"`
- `symbol() = "AXM-A"`
- `verifier() = <verifier address>`
- `registeredSigner() = <tee signer address>`
- `maxProofAgeSeconds() = 604800` (7 days)

## Contract Sizes (PENDING — to be filled in after live deploy)

| Contract | Runtime bytecode (hex) | ~KB |
|----------|------------------------|-----|
| AxiomTeeVerifier | PENDING | PENDING |
| AxiomAgentNFT (impl) | PENDING | PENDING |
| ERC1967Proxy (NFT) | PENDING | PENDING |
| AxiomStrategyVault | PENDING | PENDING |
| AxiomPaymentProcessor | PENDING | PENDING |

To compute: `cast code <addr> --rpc-url https://evmrpc.0g.ai | wc -c` then
`cast code <addr> --rpc-url https://evmrpc.0g.ai > contracts/<name>.bin` and
`xxd -p -c 32 contracts/<name>.bin | wc -l` for the ~KB estimate.

## Deployment TX (broadcast log)

`apps/contracts/broadcast/DeployAristotle.s.sol/16661/run-latest.json` will
contain the full trace (4 transactions: verifier, NFT impl, proxy init, vault,
processor — 5 if you count the NFT impl + proxy separately). All
transactions are included in chain at the addresses above.

The `script/DeployAristotle.s.sol` script ALSO writes a JSON manifest to
`docs/deployments/aristotle-<DEPLOY_DATE>.json` with the same addresses
plus a unix-time stamp and a `deployedAt` ISO-8601 string.

## Next Steps (after live deploy)

- **MW18 follow-up**: Publish `SUBMISSION.md` with the pinned mainnet addresses and Etherscan links.
- **MW19 closed beta**: Front the NFT with a `whitelist-merkle-root` (to be added) so the closed-beta minting is gated to 20 testers from the 0G Discord.
- **MW20 demo day**: Record the 3-minute demo (mint → encrypt → fund → compute → transfer) against the addresses pinned in this file.

## Rollback

See `apps/contracts/README-aristotle.md` § Rollback plan. Summary:
- No-op rollback for key compromises: rotate `TEE_SIGNER` via `AxiomTeeVerifier.registerSigner`, revoke `MINTER_ROLE`, transfer ownership to a multisig.
- Pause path: `AxiomAgentNFT.pause()` (the `DEFAULT_ADMIN_ROLE` only) freezes mint/transfer/clone. The vault and payment processor are non-pausable by design.
- Last-resort circuit breaker: `registerSigner(0x000…dead)` invalidates every future transfer-validity proof (the verifier reverts on `AxiomInvalidSigner()`).
