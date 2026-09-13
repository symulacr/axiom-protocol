# Wave 3 — Lane A: ABI Regeneration, Deploy Wiring & Controlled V3 Redeploy to Galileo

- **Status:** COMPLETE (uncommitted, per brief)
- **Date:** 2026-08-31
- **Base:** git HEAD `add2fdadf` (w2 commit). Tree state at lane start: one pre-existing unrelated modification (`apps/contracts/src/interfaces/IERC7857.sol` — a doc-comment wording tweak left by a prior lane; untouched by this lane, byte-identical before/after deploy).
- **Untouched (as required):** `apps/contracts/src/mocks/AxiomMockUSDC.sol` source (deployment reused, not redeployed); `packages/config/src/abis/multicall3.ts` (hand const, unmodified); `packages/config/src/abis/erc20.ts`, `index.ts` (unmodified).

---

## 1. ABI regeneration (`packages/config/src/abis/`)

### Procedure found (and how it was reconciled)

The repo pipeline is `apps/contracts/scripts/generate-abis.sh` (invoked by `pnpm build` via `forge build && bash scripts/generate-abis.sh`). It reads `forge inspect <Contract> abi --json` and writes human-readable `as const` TS files. **It did not generate the two Wave-2 contracts** (`AxiomDelegationRegistry.ts`→`delegationRegistry.ts`, `AxiomStateView.ts`→`stateView.ts` were hand-maintained), so this lane:

1. Added both contracts to the generator's `CONTRACTS` + `CONST_NAMES` maps (`DELEGATION_REGISTRY_ABI`, `STATE_VIEW_ABI` — same const names as the hand files, so `abis/index.ts` consumers are unaffected).
2. Reconciled generated vs hand-maintained: **zero semantic drift** — the hand files were accurate. Differences are purely the generator's named-parameter style (`function installDelegation((uint256 agentTokenId, address delegate, …) d, bytes ownerSig)` vs the hand `installDelegation((uint256,address,…),bytes)`). Function selectors, event signatures and error signatures are identical (names in tuples do not affect encoding).
3. Preserved hand-maintained fragments that the generator would have deleted: created `agentNft.legacy.ts` and `vault.legacy.ts` using the script's existing `.legacy.ts` append mechanism, carrying `ITRANSFER_FROM_ABI` (frontend `useTransfer`), `VAULT_ABI_LEGACY`, `STRATEGY_OF_CURRENT`, `STRATEGY_OF_LEGACY` (chat-runtime orchestrator + backend orchestrator) verbatim from HEAD.

### ABI diffs (V2 → V3)

| Contract | Added | Changed |
| --- | --- | --- |
| **agentNft.ts** | `MAX_I_DATA_BYTES() view returns (uint256)`, `error DataSizeExceeded(uint256 provided, uint256 max)` | `Updated` event signature changed (W1: `oldValue` field dropped — `Updated(string,uint256)`→`Updated(string)` shape per wave-1 record; surfaced automatically from recompiled source) |
| **paymentProcessor.ts** | `payForAgentWithPermit2(uint256,uint256,address,((address token, uint256 amount) permitted, uint256 nonce, uint256 deadline),bytes)`, `computeRatioMax() view`, `setComputeRatioMax(uint256)`, `PERMIT2() view`, `event ComputeRatioMaxUpdated(uint256,uint256)`, `error ComputeRatioExceeded(uint256,uint256)`, `error InvalidPermitAmount(uint256,uint256)`, `error InvalidPermitToken()`, `error PermitExpired(uint256,uint256)` | `_paySplitReceived` internal → correctly absent from external ABI |
| **teeVerifier.ts** | `error UnauthorizedVerifierCaller(address caller, address nft)`, `error SignerAllowlistFull()` | `ProofUsed` event already present from W1 compile; now regenerated from current source |
| **delegationRegistry.ts** | now pipeline-generated | formatting only (named tuple params); selectors unchanged |
| **stateView.ts** | now pipeline-generated | ordering/naming only; selectors unchanged |
| **vault.ts** | — | unchanged (W2 touched nothing in vault) |
| **mockUsdc.ts** | — | unchanged (untouchable source; drift gate clean) |

Raw JSON ABIs in `packages/config/abi/*.json` also regenerated for all 7 contracts.

## 2. Deploy wiring (`apps/contracts/script/Deploy.s.sol`)

Extended the V2 `Deploy.s.sol` (per ADR-004 §3 "extend Deploy.s.sol pattern — full fresh deploy, not RedeployVaultProcessor"):

- After Processor: deploys **AxiomDelegationRegistry** (non-upgradeable, `constructor(IAxiomAgentNFT nft, address owner)` — owner = oracleAdmin, the shared-funding strategy used in V2) and **AxiomStateView** (`constructor(nft, processor, vault)` — deployed last, after all three wires exist).
- **In-script wiring assertions** (`require` after `stopBroadcast`, mirroring RedeployVaultProcessor.s.sol's assert style): `nft.verifier()`, `vault.nft()`, `processor.AXIOM_NFT()`, `processor.paymentToken()`, `registry.nft()`, `registry.owner()`, `stateView.nft()/processor()/vault()` — the script reverts if any wire is misaddressed.
- Console output extended with both new addresses. `PAYMENT_TOKEN_ADDR` env var contract unchanged (MockUSDC deployment stays out of Deploy.s.sol — it was deployed once historically and is reused; its source is untouched).

## 3. V3 redeploy to Galileo (chainId 16602)

Deploy executed `2026-08-31` from the repo-funded `DEPLOYER_PK` (deployer `0xaf7c581b1C1C250aA69ac1F19f8014C0636c4d20`, pre-balance 0.396 OG, post-deploy ~0.328 OG) with `ORACLE_ADMIN_PK` derived from `AXIOM_TEE_SIGNER_PK` (V2's shared-funding record: oracleAdmin == TEE signer EOA `0x0553f58a0209Fb8DcE201fCD9406Be56da890D73`; `ORACLE_ADMIN_PK` itself is absent from env — vestigial per V2 record).

Command: `forge script script/Deploy.s.sol --rpc-url https://evmrpc-testnet.0g.ai --chain-id 16602 --broadcast --priority-gas-price 3000000000 --legacy --slow`

### Addresses table (V3)

| Contract | Impl / Deployed | Proxy (if any) |
| --- | --- | --- |
| AxiomTeeVerifier | `0xd34c8b3a72f36026e5b4f9c7d468c72894171609` | `0x4938F10B12051CE8DCd70E3F7555E71adb432545` |
| AxiomAgentNFT | `0x0e0a9214506154cb35035c73f6c6a1b711210ba8` | `0xe32f87C6F8070C89a82D51BDd3fab578C0d7be6f` |
| AxiomStrategyVault | `0xbaef770df579844a6e81f86c53834a8310c7cd6e` | `0xe8B3B31E5CE0436cCfD19a47351943CcB7703722` |
| AxiomPaymentProcessor | `0xfa2b7e4aca36ba3029eb0d6ddb2d8f7860ddaf78` | `0xe6956f663103c6E1e5077c3256c453b95924112a` |
| AxiomDelegationRegistry | `0xeA411cC163CAab2678E3E40dF3C1622EB28CCD58` (no proxy) | — |
| AxiomStateView | `0xf96a1fC4380B751B09452deFd945fBCd96Effdd1` (no proxy) | — |
| AxiomMockUSDC (reused) | `0x354CA53bAB51C0666964fa050628d8351f8A7d19` | — |
| Permit2 (canonical) | `0x000000000022D473030F116dDEE9F6B43aC78BA3` | — |

### Deploy transaction hashes

| Tx | Hash |
| --- | --- |
| Verifier impl | `0x90715a0e0c7d8ff401e438a995c9e687dbaf77f0fa49a464dec83e3cf238899a` |
| Verifier proxy | `0xc64a24c6ad0c47e099f2d27df7ead2bc035af31646a285b84044b63b7d6b5937` |
| NFT impl | `0x5c5ff9f3af33fd87696cc1f42b4f2c1f35d32119986cc286610a0a5eab744783` |
| NFT proxy | `0xcb593145fcfb1a29900e0f9f6ca90a4fc44b140b85ee842a9ab9c318394ed9e1` |
| Vault impl | `0x3e32626132e1e99ffdbfcc7dbadb6a8de67aa5fda5352883abee622724f58a28` |
| Vault proxy | `0xcb5c1df602d9bb2310c7a5415a6ab36a4518d7670a97dbf99f221e7ab59b9a68` |
| Processor impl | `0x652adfc56d0d1bcee2b296368de3c2e4c3e7896a62adbd9dd2dfc5291932cbdf` |
| Processor proxy | `0x8683a9a2571b43246a95bef63baacf090197d9ba22efdd0c7b8f270132cd0a65` |
| DelegationRegistry | `0x3e7dc218e6807a6cde663cde3f1e688308ad5ed8b954fbbdfb281cf08b7df0c7` |
| StateView | `0x6443cbc2bb2d4c77fd27db49da6e60e5bf1a47a40134f0669de84f54a58ae25c` |

## 4. On-chain wiring assertions (cast, post-deploy)

All 17 reads executed against the live V3 suite; every wire resolves to the intended address:

```text
1  nft.verifier()              = 0x4938F10B12051CE8DCd70E3F7555E71adb432545   ✓ new verifier
2  proc.AXIOM_NFT()            = 0xe32f87C6F8070C89a82D51BDd3fab578C0d7be6f   ✓ new NFT
3  proc.paymentToken()         = 0x354CA53bAB51C0666964fa050628d8351f8A7d19   ✓ MockUSDC (reused)
4  vault.nft()                 = 0xe32f87C6F8070C89a82D51BDd3fab578C0d7be6f   ✓ new NFT
5  registry.nft()              = 0xe32f87C6F8070C89a82D51BDd3fab578C0d7be6f   ✓ new NFT
6  registry.owner()            = 0x0553f58a0209Fb8DcE201fCD9406Be56da890D73   ✓ oracleAdmin
7  registry.domainSeparator()  = 0xb5ba71d7a0aa544c7efb330445d607cacd28b76017e6f44340f2cb9c04486e5a ✓ non-zero
8  stateView.nft()             = 0xe32f87C6F8070C89a82D51BDd3fab578C0d7be6f   ✓
9  stateView.processor()       = 0xe6956f663103c6E1e5077c3256c453b95924112a   ✓
10 stateView.vault()           = 0xe8B3B31E5CE0436cCfD19a47351943CcB7703722   ✓
11 verifier.owner()            = 0xaf7c581b1C1C250aA69ac1F19f8014C0636c4d20   ✓ AXIOM_DEPLOYER_ADDRESS (registerSigner gate)
12 verifier.signerCount()      = 1                                            ✓ TEE signer bootstrapped in initialize
13 nft DEFAULT_ADMIN(0x0553…)  = true
14 nft MINTER_ROLE(0x0553…)    = true
15 nft.mintFee()               = 0
16 stateView.pendingPayCap()   = 0  (uncapped default)
17 stateView.computeRatioMax() = 0  (unlimited default)
```

## 5. Smoke flow evidence (fresh mint + tiny pay)

1. **Fund test wallet**: deployer → oracleAdmin/TEE EOA `0x0553…0D73` 0.05 OG — tx `0x9e57e1feebbc1772f7182f4b2cf1c81ee9b270e29b7cb68d69a948687de1949f`.
2. **Mint agent** (`mintWithRole`, TEE signer holds MINTER_ROLE; creator = minter): token **0** minted to `0x0553…0D73` — tx `0x9865f6401f67b34926f56349c7e998bda0cb8423dfa27d14bf8c6e2ffc6bcbbd`, block 52,276,279. Note: this NFT's tokenId counter starts at **0** (ERC7857Cloneable `_incrementTokenId` returns pre-increment id) — probed via ownerOf; tokenId 1 does not exist.
   - Post-mint asserts: `ownerOf(0) = 0x0553…0D73` ✓; `creatorOf(0) = 0x0553…0D73` ✓; `stateView.royaltyRecipientOf(0) = 0x0553…0D73` ✓ (**does not revert on the fresh mint** — the ADR §3 assert item); `effectiveRoyaltyBpsOf(0) = (0, false, 100)`; `vaultHealthOf(0) = (0, 0x0, 0, 0, 0, 0, false)`.
3. **Fund token**: `mockUSDC.mint(0x0553…, 1_000_000)` (1 axmUSDC) — tx `0xb93b643fbbf6ee612b3664f87884a786b551c7e0095888b22bd6ca12014714b2`.
4. **Approve**: `mockUSDC.approve(processor, 1_000_000)` — tx `0x03bc57c8f1a49a2e17482a98d36e8f6740732f091ae3c057e7cbcb26eae42c21`.
5. **Pay**: `processor.payForAgent(0, 1_000_000)` — tx `0xbf0c71f12b2a8f76b80e5911509bcb35ac6f3a01b80e6575e29aa58ff39afb84`. Status 1. Events: USDC Transfer payer→processor (1,000,000), processor→payer (10,000 = 1% protocol fee returned to treasury==payer), `PaymentProcessed(tokenId=0, creator=0x0553…, payer=0x0553…, amount=1e6, creatorAmount=990000)`.
6. **Post-pay asserts**: `processor.agentEarningsOf(0x0553…) = 990_000` ✓; `stateView.agentEarningsOf(0x0553…) = 990_000` ✓ (StateView mirrors write-path); `stateView.paymentSnapshot(0x0553…, 0) = (cap=0, ratioMax=0, agentBalance=990000, payerAllowance=0, token=MockUSDC)` ✓.

Total smoke cost: 1 axmUSDC (6-decimals testnet token) + ~0.03 OG gas.

## 6. Deployment artifact & env cutover

- **New deployment record**: `docs/deployments/galileo-v3-2026-08-31.json` (follows the `galileo-v2-2026-08-28.json` schema; `supersedes` field set; **`v2Addresses` block retains all four V2 proxies + impls for rollback**).
- **`packages/config/deployed.json`**: rewritten for V3 (chain 16602) with a `v2Addresses` rollback block. (This file is record-only — `apps/frontend/src/abi/addresses.ts` confirms no code reads it.)
- **Env files cut over (8 address vars, values only)**: root `.env` + `.env.example` (`AXIOM_*_ADDRESS` ×4 + `VITE_*_ADDRESS` ×4) and `apps/frontend/.env` + `.env.local` (`VITE_*` ×4). No backend code change needed (backend reads the same `AXIOM_*` vars via `env-schema.ts`).
- **New var**: `AXIOM_DELEGATION_REGISTRY_ADDRESS=0xeA411cC163CAab2678E3E40dF3C1622EB28CCD58` added to root `.env`/`.env.example` — the concurrent W2-B lane already shipped `resolveAddressOptional("delegationRegistry", …)` in `packages/config/src/addresses.ts` and optional indexer watching in `apps/backend/src/indexer/events.ts`, expecting exactly this env var from "the deploy lane".
- Grepped the whole repo for the four old V2 addresses after cutover: only remaining occurrence is the intentional `v2Addresses` rollback record in `deployed.json`.

## 7. Tests (fresh runs, final)

| Suite | Command | Result |
| --- | --- | --- |
| Contracts | `forge test` (apps/contracts) | **295 passed, 0 failed, 9 skipped** (304 total, 20 suites) |
| Config | `bun test` (packages/config) | **53 pass, 0 fail** (baseline 53 held — ABI changes are non-breaking) |
| Backend | `bun test` (apps/backend) | **181 pass, 0 fail** (41 files) |

`forge build` clean (warnings only, all in vendored `lib/` OZ or pre-existing test warnings; none in this lane's files). No debug code left behind (grepped touched files for `TODO|HACK|FIXME|debugger|console.log`).

## 8. Files changed (this lane)

| File | Change |
| --- | --- |
| `apps/contracts/script/Deploy.s.sol` | + DelegationRegistry & StateView deploys, +IAxiomAgentNFT import, 9 in-script wiring requires, console logs |
| `apps/contracts/scripts/generate-abis.sh` | + AxiomDelegationRegistry, AxiomStateView to contract/const maps |
| `packages/config/src/abis/{agentNft,paymentProcessor,teeVerifier,vault,delegationRegistry,stateView}.ts` | regenerated |
| `packages/config/src/abis/agentNft.legacy.ts` **(new)**, `packages/config/src/abis/vault.legacy.ts` **(new)** | hand-fragment preservation via `.legacy.ts` append pipeline |
| `packages/config/abi/*.json` (7 files) | raw ABI JSON regen |
| `docs/deployments/galileo-v3-2026-08-31.json` **(new)** | V3 deployment record w/ `v2Addresses` |
| `packages/config/deployed.json` | V3 addresses + `v2Addresses` rollback block |
| `.env`, `.env.example` | 4 `AXIOM_*` + 4 `VITE_*` vars → V3; + `AXIOM_DELEGATION_REGISTRY_ADDRESS` |
| `apps/frontend/.env`, `apps/frontend/.env.local` | 4 `VITE_*` vars → V3 |

Concurrent-lane files observed in the shared tree (not mine, left alone): `apps/backend/src/indexer/events.ts`, `packages/config/src/addresses.ts`, `apps/contracts/src/interfaces/IERC7857.sol` (comment tweak).

## 9. Rollback reference (V2 addresses)

All four V2 proxies remain live on Galileo and are recorded in both `docs/deployments/galileo-v3-2026-08-31.json` and `packages/config/deployed.json` under `v2Addresses`:

- NFT `0xdBB2e63807a13272789B716692fbe0d09E010097` · Vault `0x4607D749a7b8BBD2593742F8432410231C805c57` · Verifier `0x72a381226E09b9AAe15D9309A656d7e5DD2bFbb2` · Processor `0x7490D693364A31E0513bcef8E346397cc4BA9E9c` (full record incl. impls: `docs/deployments/galileo-v2-2026-08-28.json`).

Rollback = revert the 8 env vars to the v2 values and restart backend/indexer; no on-chain action needed (V2 contracts were not modified, paused, or drained).

## 10. Risks

1. **Testnet data loss (accepted per ADR §4)**: V2 tokenIds/earnings/strategies do not migrate; the V3 NFT counter starts at 0. Any V2 agent metadata must be re-minted on V3.
2. **Oracle proof domain cutover**: EIP-712 `verifyingContract` now binds to the new verifier address — all in-flight oracle proofs against V2 are invalid; oracle service must point `AXIOM_TEE_VERIFIER_ADDRESS` at `0x4938F1…2545` before processing transfers (ADR §4 quiet-period rule).
3. **Indexer restart required**: backend indexer must be restarted to resolve the new addresses (env cut over); old-contract events remain in the event store and will surface mixed with new-contract events until FE address-scoping filters them (L1-C3, pre-existing known issue).
4. **tokenId counter starts at 0, not 1** (ERC7857Cloneable pre-increment) — a V3 behavioral note for any consumer assuming 1-based ids; smoke used tokenId 0 accordingly.
5. **`AXIOM_STATE_VIEW_ADDRESS` intentionally not introduced**: no backend/FE consumer exists yet; StateView address is discoverable from the deployment JSON. Introducing the env var belongs to the lane that wires the first consumer.
6. **Deployer key reuse (hot wallet)**: DEFAULT_ADMIN/MINTER sit with the TEE signer EOA and verifier ownership with the deployer EOA, same posture as V2 — multisig/timelock migration remains future work per ADR §2.1.
7. **Permit2 lane live but unexercised on-chain in this wave**: `payForAgentWithPermit2` is deployed and unit-tested (W2-A, 14 tests), but the live smoke used the approval lane; one operator run of the fork-gated Permit2 test (`FOUNDRY_LIVE_FORK=1 PERMIT2_FUNDED_KEY=…`) is still the W2-A follow-up (W2-A residual risk #4).
