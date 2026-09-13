# Proposal 2 of 5 — Technical Depth & 0G Integration (Axiom Protocol, 0G Bridge Buildathon / AKINDO)

Perspective: proof of real engineering and real 0G usage for a technical judge. Every claim below traces to a commit, an ADR, a wave report, or a passing test suite.

---

## Declared build goals

Build the full on-chain layer for owning and running AI agents on 0G: tokenize an agent's intelligence as an ERC-7857 iNFT, transfer it with TEE-verified re-encryption, settle everything on 0G Chain, persist agent state and key custody on 0G Storage, run inference through the 0G Compute router, and remove gas friction with agent-owned gasless infrastructure. All six contracts ship with upgrade-safe storage, timelocked administration, and a test suite that gates every wave.

## Product Category

AI Agents × DeFi Infrastructure on 0G (primary); Agentic Payments & Gas Abstraction (secondary).

## Updates in this Wave

Count: 2,110 characters (under the 3,000 limit).

```text
Six contracts now make up the suite: AxiomAgentNFT (ERC-7857 iNFT, UUPS), AxiomPaymentProcessor (splits, swap pool, LP shares, lending), AxiomStrategyVault (non-upgradeable fund custody), AxiomTeeVerifier (two-leg EIP-712 proof scheme), AxiomDelegationRegistry (scoped delegations), AxiomGasTank (gasless relay). All UUPS state sits in ERC-7201 namespaced structs; every wave appended vars at the gap tail and proved the layout with forge inspect before/after diffs, so upgrades never move a slot. Governance timelocks went from 1 day to 20 minutes to the live 10-minute delay, keeping the propose/execute/cancel pattern for signer rotation, treasury, and upgrades.

0G integration is structural, not decorative. 0G Storage holds chat transcripts and DEK custody blobs, anchored via data-hash events (ADR-002 documents why 0G DA was deliberately not added). 0G Compute is the inference router for agents, with TEE attestation on every model access. 0G Chain settles payments, delegation, gas relays, and swap/lend. The GasTank was built natively for 0G: relayers execute signed ops and get reimbursed from the user's own tank, with the 20-byte ERC-2771 sender suffix appended so the retrofitted NFT and Processor attribute actions to the signed user.

The security campaign caught real bugs. The B4 finding: GasTank hashed its calldata struct with abi.encode(TYPEHASH, req), which ABI-encodes dynamic bytes in place instead of hashStruct-ing them, so every wallet-signed relay reverted InvalidUserSignature. The fix hashes keccak256(req.data) canonically; a permanent drift-guard test pins the digest against inline canonical EIP-712, and a two-leg redeploy script moved the tank with all funds provably unreachable from the old one. Permit2 integration was fork-verified byte-for-byte against the deployment at 0x0000...78BA3 on 0G: one differing word out of 9,152 bytes, the cached domain separator, computed correct for chainId 16602. The deployment script enforces mainnet gates: non-zero pay cap required, real swap pair token required, gas grants off unless explicitly opted in, and reserve asserted at zero.
```

## 4th Wave Milestone

The contract architecture reached its final shape with full test coverage and live deployment on 0G Galileo (chainId 16602):

- AxiomGasTank (373 LOC, non-upgradeable, Ownable + Pausable + ReentrancyGuard + EIP712): per-user prepaid tanks, protocol-seeded 0.01 OG lazy grants capped at 3 per address, sequential per-user nonces, measured-gas reimbursement clamped by min(measured × gasprice, maxGasCost, maxGasPerOp × gasprice), a solvency invariant (gasReserve + totalTankBalance ≤ contract balance) fuzz-verified over 257 runs, and spend-only grant wei that withdrawTank can never pull.
- ERC-2771 retrofit on both AxiomAgentNFT and AxiomPaymentProcessor: 11 msg.sender sites converted to _msgSender(), storage-backed admin-gated trustedForwarder (the vendored OZ 5.0.2 ERC2771Context has an immutable forwarder and no init hook, so the field was appended at each namespace gap tail), solc 0.8.28+ diamond overrides added, and a test proving Permit2 lanes are deliberately NOT relayable because Permit2 binds spender to raw msg.sender.
- DeFi rails inside the Processor: constant-product swap pool with fee-on-input (Uniswap V2 getAmountOut math, hand-computed test assertions), sqrt-based LP shares, tracked reserves kept separate from creator earnings with a swapSolvency() invariant asserted after every pool op, and lending v1 where collateral = agent earnings + LP value priced at pool ratio, bounded by LTV factor and the MAX_PAY cap. 26 new swap/lend tests.
- DelegationRegistry: owner-signed EIP-712 install with per-token single-use nonces, live ownerOf check at install (a sale invalidates pre-signed delegations), per-tx and windowed spend caps, mandatory Merkle root of (target, selector) leaves, hard expiry, zero-float execution (registry balance invariantly 0 post-execute). 31 tests.
- Timelock delay reduced to 10 minutes live on-chain (commit ca1fbb3), NFT ERC-2771 upgrade executed through it, forwarder wired.
- Test evidence, all verified this session: forge 343 passed / 0 failed / 9 skipped across 23 suites (26 swap/lend + 19 GasTank tests included), backend 249/0, chat-runtime 100/0, config 62/0, frontend 153/0.

## 5th Wave

- Mainnet (Aristotle, chainId 16661) readiness: DeployAristotle.s.sol deploys and wires all seven contract instances (six plus proxies) in one run, with pre-broadcast gates (non-zero AXIOM_MAX_PAY_CAP required because 0 disables the cap, real swap pair token required with no mock fallback, gas grants opt-in via AXIOM_ALLOW_GRANTS=1) and a post-broadcast assertion wall that re-reads every wire on-chain. The oracle-admin wiring leg runs under a second broadcast because simulation proved the deployer key cannot perform admin wiring on mainnet.
- Permit2 fork forensics: the live InvalidSigner on batch permits was narrowed by byte-comparing deployed runtime code against a local upstream build, eliminating sig-encoding and domain-separator hypotheses and isolating the cause to digest-input divergence in the production call path.
- Canonical EIP-712 digest fix (B4) deployed and verified on-chain: live forwardRequestDigest for a probe request matched the independently computed canonical digest exactly, wallet signing now works, and the redeploy script asserted digest parity after broadcast.
- Sponsored DeFi chat tools: swap_tokens and borrow exposed as agent-executable chat tools behind a DeFi calldata gate (commit 00d71e4), so an agent can route its own swaps through the pool it earns from.
- Operator runway: reserve funding decision, env cutover to the new tank address, and the grants economics decision documented as an explicit checklist rather than silent defaults.

## What is genuinely novel

1. Agent-owned gasless infrastructure. The gas abstraction is not a sponsored relay; agents pay their own gas from their own tank. A delegation lets an agent's key execute whitelisted calls under per-tx and windowed caps, funded by a GasTank the user prefills, with the protocol optionally seeding a bounded 0.01 OG starter grant (spend-only, capped at 3, economically dead on mainnet until the owner funds the reserve). Relayers are reimbursed from measured gas with three independent clamps, so a relayer never eats a loss and a user never pays more than their signed maxGasCost.
2. DeFi rails inside the payment processor. The same contract that splits creator royalties also runs the swap pool and lending, with tracked reserves that structurally separate pool solvency from creator earnings. An agent's earnings become borrowable collateral (plus LP value), all under the MAX_PAY cap.
3. Proof-first deployment. Every storage change carries a forge inspect byte-diff, every wire carries an on-chain read-back assert, the Aristotle script reverts before any broadcast on unsafe config, and the Permit2 deployment on 0G was verified at the bytecode level rather than trusted at the address level.

## Ranked product-category combos

1. **AI Agent Infrastructure on 0G** (agent ERC-7857 NFT + GasTank gasless ops + DelegationRegistry + 0G Storage/Compute). Strongest fit: every 0G component is load-bearing, and the agent-pays-its-own-gas model is the differentiator no other submission will have.
2. **DeFi Agents / Agentic Payments** (Processor swap/LP/lend + Permit2 settlement + royalty splits + sponsored chat tools). Strong demo surface: agents swap and borrow against their own earnings, with 26 dedicated tests and a solvency invariant.
3. **Gas Abstraction / Account-Abstraction Tooling** (GasTank + ERC-2771 retrofit + canonical EIP-712 relay digests + ERC-1271 dual-path signing). Technically deepest single-primitive story, best told as the sub-narrative of combo 1 rather than standalone, since it lacks a consumer-facing product face on its own.
