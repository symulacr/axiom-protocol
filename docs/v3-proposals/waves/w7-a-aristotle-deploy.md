# Wave 7-A: Aristotle deployment script extended to the full W6 surface

Deliverable of Axiom Protocol V3 Wave 7, lane A. The Aristotle (0G mainnet, chainId 16661)
deployment script now deploys and wires the complete W6 contract surface in a single run,
with mainnet-safe env gating. No new contracts were introduced and nothing was broadcast.

## What was extended

All changes are in `apps/contracts/script/DeployAristotle.s.sol` (the file is in a
gitignored path per repo config at `.gitignore:353`, so it does not appear in
`git status`; the edit is on disk and uncommitted, as required).

Kept from the existing script: chain guard (16661, or 16602 with `AXIOM_LEGACY=1`),
three-key separation check, 0.1 OG deployer balance floor, Verifier/NFT/Vault/Processor
proxy deployments with `PAYMENT_TOKEN_ADDR`, post-broadcast address dump.

Added:

1. `AxiomDelegationRegistry(nft, oracleAdmin)` — non-upgradeable, same shape as
   `Deploy.s.sol:73-75`.
2. `AxiomGasTank(oracleAdmin, maxGasPerOp)` — non-upgradeable, `maxGasPerOp`
   env-tunable, default 300000 gas units. The swap/LP/lend surface comes free because
   the current `AxiomPaymentProcessor` implementation (deployed fresh as the proxy
   target) already carries it.
3. Wiring, split into two broadcast legs. The deployer leg deploys; a second leg signed
   by `AXIOM_ORACLE_ADMIN_PK` performs all admin-gated wiring, because on mainnet the
   key-separation rule makes `oracleAdmin` a different address from the deployer, and
   ADMIN_ROLE on the NFT/Processor proxies plus GasTank ownership belong to
   `oracleAdmin`. This was caught by simulation: the single-broadcast version reverts
   `AccessControlUnauthorizedAccount` for the deployer. Wired calls:
   - `nft.setTrustedForwarder(gasTank)`
   - `processor.setTrustedForwarder(gasTank)`
   - `processor.setAxiomVault(vault)`
   - `processor.setSwapPairToken(AXIOM_SWAP_PAIR_TOKEN)`
   - `processor.setSwapFeeBps(...)` (default 30)
   - `processor.setBorrowFactorBps(...)` (default 5000)
   - `gasTank.setGasGrant` / `setGrantsCap` only when non-default values are configured
4. Post-broadcast assertions for every wire (mirrors the `Deploy.s.sol` ADR-004 §3
   pattern), including forwarder trust on both proxies, swap params, cap values,
   GasTank owner/maxGasPerOp/grant settings, and `gasTank.reserve() == 0`.
5. Deployment artifact `docs/deployments/aristotle-v3-<AXIOM_DEPLOY_DATE>.json`
   following the `galileo-v3-2026-08-31.json` schema, plus `gasTank`,
   `forwarderWiring`, `swap`, and `caps` blocks.
6. NatSpec note that `AXIOM_LEGACY=1` keeps Galileo compatibility (retained and
   expanded in the run comment block).
7. No mocks on mainnet. The swap pair token is a required env; the script reverts
   before any broadcast if it is missing. `script/DeployMockWETH.s.sol` stays
   Galileo-only (it already reverts off chain 16602) and is not referenced by the
   Aristotle script.

## Env vars

| Env var | Required | Default | Notes |
| --- | --- | --- | --- |
| `AXIOM_DEPLOYER_PK` | yes | — | deployer broadcast key (existing convention) |
| `AXIOM_TEE_SIGNER_PK` | yes | — | TEE signer key, must differ from deployer/admin |
| `AXIOM_ORACLE_ADMIN_PK` | yes | — | admin key; also signs the wiring broadcast |
| `AXIOM_RELAYER_ADDRESS` | yes | — | relayer address; must differ from deployer |
| `AXIOM_DEPLOYER_ADDRESS` | yes | — | verifier owner (OZ Ownable gate) |
| `AXIOM_DEPLOY_DATE` | yes | — | artifact filename suffix (`aristotle-v3-<date>.json`) |
| `PAYMENT_TOKEN_ADDR` | yes | — | swap token A / payment token (USDC-like on mainnet) |
| `AXIOM_SWAP_PAIR_TOKEN` | yes | none | real mainnet WETH-like token; required, reverts if unset, reverts if equal to `PAYMENT_TOKEN_ADDR` |
| `AXIOM_MAX_PAY_CAP` | yes | none | per-pay cap in wei; `0` rejected (0 disables the cap, emergency-only per Processor docs) |
| `AXIOM_MAX_GAS_PER_OP` | no | `300000` | GasTank per-op gas-unit ceiling (constructor requires non-zero) |
| `AXIOM_SWAP_FEE_BPS` | no | `30` | swap fee, max 1000 enforced on-chain |
| `AXIOM_BORROW_FACTOR_BPS` | no | `5000` | borrow LTV, max 8000 enforced on-chain |
| `AXIOM_ALLOW_GRANTS` | no | unset | must be `1` to configure grant envs at all |
| `AXIOM_GAS_GRANT` | only with `AXIOM_ALLOW_GRANTS=1` | `0.01 ether` | per-grant size; `0` rejected with the gate |
| `AXIOM_GRANTS_CAP` | only with `AXIOM_ALLOW_GRANTS=1` | `3` | grants per address; `0` rejected with the gate |
| `AXIOM_LEGACY` | no | unset | `1` permits Galileo (16602) for dry-runs |

## Mainnet safety gates (all fire before any broadcast)

1. **Swap pair token required.** `AXIOM_SWAP_PAIR_TOKEN` missing, zero, or equal to
   `PAYMENT_TOKEN_ADDR` reverts pre-broadcast. No mock fallback exists on mainnet.
2. **Pay cap required and non-zero.** `AXIOM_MAX_PAY_CAP` missing or `0` reverts
   pre-broadcast; `0` would disable the per-pay cap entirely.
3. **Grants opt-in.** Setting `AXIOM_GAS_GRANT` or `AXIOM_GRANTS_CAP` without
   `AXIOM_ALLOW_GRANTS=1` reverts with: "testnet growth lever must be explicitly
   enabled on mainnet". With `AXIOM_ALLOW_GRANTS=1`, zero values revert because the
   GasTank's own `setGasGrant`/`setGrantsCap` revert `ZeroAmount` at 0. Grants also
   stay economically dead at deploy either way: the script never calls
   `depositReserve`, and the on-chain assert `gasTank.reserve() == 0` enforces it, so
   `_lazyGrant`/`grantCredit` revert `ReserveExhausted` until the owner explicitly
   funds the reserve post-deploy.
4. **Relayer separation.** `AXIOM_RELAYER_ADDRESS == deployer` reverts pre-broadcast.
5. **Key separation.** Existing deployer/TEE/admin distinctness checks retained.
6. **Wiring authority.** Admin wiring runs under the oracle-admin broadcast; the
   simulation proves the deployer cannot perform it (see evidence below).
7. **Post-broadcast assertion wall.** Every wire and parameter is re-read on-chain and
   `require`d; a mismatch reverts the whole script run.

## Dry-run evidence

`forge build` (Foundry 1.5.1, solc 0.8.36, via_ir on, profile default): clean, exit 0,
"Compiler run successful with warnings" (pre-existing warnings in vendored OZ and
src contracts only; none reference `DeployAristotle.s.sol`).

Fork simulation was not possible against the live Galileo RPC: `evmrpc-testnet.0g.ai`
prunes state and anvil fork attempts fail with "missing trie node" at both latest and
pinned blocks. Instead the script was exercised against plain local anvil started with
`--chain-id 16602`, which the script accepts under `AXIOM_LEGACY=1`. Throwaway env:
anvil default accounts, `AXIOM_DEPLOY_DATE=2099-01-01`, Galileo `axmUSDC` address as
`PAYMENT_TOKEN_ADDR` stand-in, a placeholder pair token. Run without `--broadcast`, so
transactions were simulated and not persisted.

Negative cases (all revert before any deploy/broadcast):

| Case | Result |
| --- | --- |
| `AXIOM_SWAP_PAIR_TOKEN` unset | `vm.envAddress: environment variable "AXIOM_SWAP_PAIR_TOKEN" not found` after key checks, before broadcast |
| `AXIOM_MAX_PAY_CAP` unset | `vm.envUint: environment variable "AXIOM_MAX_PAY_CAP" not found` pre-broadcast |
| `AXIOM_MAX_PAY_CAP=0` | `AXIOM_MAX_PAY_CAP=0 disables the pay cap on mainnet; set a real cap` |
| `AXIOM_SWAP_PAIR_TOKEN == PAYMENT_TOKEN_ADDR` | `AXIOM_SWAP_PAIR_TOKEN == PAYMENT_TOKEN_ADDR; setSwapPairToken reverts InvalidSwapPair` |
| `AXIOM_GAS_GRANT` set, no `AXIOM_ALLOW_GRANTS` | `AXIOM_GAS_GRANT/AXIOM_GRANTS_CAP set without AXIOM_ALLOW_GRANTS=1: testnet growth lever must be explicitly enabled on mainnet` |
| `AXIOM_ALLOW_GRANTS=1`, `AXIOM_GRANTS_CAP=0` | `AXIOM_ALLOW_GRANTS=1 requires non-zero AXIOM_GAS_GRANT and AXIOM_GRANTS_CAP; the GasTank setters revert ZeroAmount at 0` |
| `AXIOM_RELAYER_ADDRESS == deployer` | `Relayer separation violation: AXIOM_RELAYER_ADDRESS == deployer` |

Positive case: with all required envs set, the full run completes, `Script ran
successfully.` Exit 0. The trace shows all seven contracts deployed, the oracle-admin
wiring leg succeeding, and every wiring `require` passing. The artifact
`docs/deployments/aristotle-v3-2099-01-01.json` was written and parsed as valid JSON
with the `gasTank` (`gasGrant`, `grantsCap`, `maxGasPerOp`, `reserve: 0`),
`forwarderWiring` (both proxies pointing at the GasTank), `swap`, and `caps` blocks.
The grants opt-in variant (`AXIOM_ALLOW_GRANTS=1 AXIOM_GAS_GRANT=5000000000000000
AXIOM_GRANTS_CAP=2`) also ran clean and wrote `gasGrant: 5000000000000000`,
`grantsCap: 2`. Test artifacts (anvil process, throwaway JSON, dry-run broadcast
folder) were deleted afterward; no broadcast directories were created by the runs.

## Remaining operator checklist (mainnet switch)

1. Acquire/confirm the three distinct keys plus the relayer key; fund the deployer
   (>= 0.1 OG floor, trivial cost on 0G).
2. Resolve the real mainnet payment token and the real WETH-like pair token; set
   `PAYMENT_TOKEN_ADDR` and `AXIOM_SWAP_PAIR_TOKEN`.
3. Decide the per-pay cap; set `AXIOM_MAX_PAY_CAP` (wei, non-zero).
4. Decide grants now or later. Recommended mainnet start: leave `AXIOM_ALLOW_GRANTS`
   unset; enable later via owner `setGrantsCap`/`setGasGrant` + `depositReserve` when
   the relayer economics are validated.
5. Run:
   `AXIOM_DEPLOYER_PK=... AXIOM_TEE_SIGNER_PK=... AXIOM_ORACLE_ADMIN_PK=...
   AXIOM_RELAYER_ADDRESS=... AXIOM_DEPLOYER_ADDRESS=... PAYMENT_TOKEN_ADDR=...
   AXIOM_SWAP_PAIR_TOKEN=... AXIOM_MAX_PAY_CAP=... AXIOM_DEPLOY_DATE=<date>
   forge script script/DeployAristotle.s.sol --rpc-url https://evmrpc.0g.ai
   --chain-id 16661 --broadcast --slow`
6. Verify `docs/deployments/aristotle-v3-<date>.json` against chainscan, then cut over
   backend/frontend env addresses (ADR 004 §3 ordering: env vars land with consumers).
7. Fund the relayer EOA; only after the grants decision, fund the GasTank reserve
   (`depositReserve`).
8. Smoke test one gasless relay end-to-end through the GasTank before opening traffic.
