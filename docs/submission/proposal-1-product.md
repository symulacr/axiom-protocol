# Proposal 1 — Product & User Story (AKINDO 0G Bridge Buildathon)

> Agent 1 of 5, perspective: product and user story. Everything below is framed
> around what a user gets. Evidence comes from the wave implementation reports
> (`docs/v3-proposals/waves/`), the deployment records
> (`docs/deployments/galileo-v3-2026-08-31.json`), and the git history.
> GitHub: <https://github.com/symulacr/axiom-protocol> · Live app: <https://beta.axiom-protocol.xyz>

---

## Declared build goals (previous waves)

- **W1 — Payment security.** Close the MAX_PAY cap bypass on all three pay lanes with one
  capped pull primitive, bound the compute-leg ratio so creators cannot be starved by
  1-wei agent splits, harden the TEE verifier (NFT-caller gate, `ProofUsed`), and cap
  iData payload sizes.
- **W2 — Signature-based settlement.** Add Permit2 witness settlement
  (`payForAgentWithPermit2`) so users pay agents in one signature instead of approve+pay,
  add a DelegationRegistry for agent delegates, and a StateView facade with Multicall3
  batch reads.
- **W3 — Ship V3 to testnet.** Fresh Galileo deploy of the full V3 suite with in-script
  wiring assertions, then re-point backend, frontend, and ABIs at the new addresses.
- **W4 — Shrink the contract surface.** Fold StateView's read views into the
  PaymentProcessor (6 to 5 contracts), prove the storage layout safe, and upgrade the
  proxy in place on live testnet.
- **W5 — Gasless users.** Build AxiomGasTank with lazy 0.01 OG gas grants, an off-chain
  relayer (EIP-712 ForwardRequests, simulation, rate gates, dead-lettering), a chat
  sponsor lane, and frontend tank UI, so a user with zero ETH can still act.
- **W6 — Make it DeFi.** Put a constant-product swap pool, LP shares, and collateralized
  lending inside the PaymentProcessor (no new contracts), plus an axmWETH mock, a
  1,000-axmUSDC first-relay faucet, and a Pyth price endpoint.

---

## Product Category

AI Agents, DeFi, Consumer Apps

---

## Updates in this Wave

Axiom Protocol turns AI trading strategies into ERC-7857 iNFTs on 0G, and this wave made
the whole thing usable without gas. GitHub: <https://github.com/symulacr/axiom-protocol>,
live app: <https://beta.axiom-protocol.xyz>.

Gasless experience. AxiomGasTank (0xF19245876Cd6Cb115810D459B00e94130591CAaa, 0G Galileo
16602) is the ERC-2771 trusted forwarder for the AgentNFT and PaymentProcessor. New users
claim a 0.01 OG gas grant (3 per address) and a first-relay faucet drip of 1,000 axmUSDC.
A backend relayer recovers the EIP-712 signer, simulates the call, enforces rate and cost
caps (6 ops/min/user, 0.001 OG), queues, and broadcasts. The chat tools withdraw,
pay_for_agent, swap_tokens, and borrow run through this sponsor lane, so a user with zero
ETH can pay an agent, swap, or borrow by typing a sentence.

Canonical digest fix. Our own browser E2E caught the live tank rejecting every wallet
signature (InvalidUserSignature 0xe3fb657c): abi.encode(TYPEHASH, req) ABI-encodes the
dynamic data member in place instead of hashing it as EIP-712 requires. We fixed
forwardRequestDigest and _verifySig, added a permanent drift-guard test, redeployed, and
verified digest parity live (view == canonical).

Live E2E proof on Galileo: faucet claims 1,000 axmUSDC, the user claims the 0.01 OG grant,
a relayed payForAgent executes gas-free through the tank, and the creator's royalty split
is credited on-chain. Contract set: AgentNFT 0xe32f87C6F8070C89a82D51BDd3fab578C0d7be6f,
Processor 0xe6956f663103c6E1e5077c3256c453b95924112a, Vault
0xe8B3B31E5CE0436cCfD19a47351943CcB7703722, axmWETH
0x62e5ead40c2105d44a705e87f370776bd12bf6ec, canonical Permit2
0x000000000022D473030F116dDEE9F6B43aC78BA3.

DeFi chat tools. swap_tokens (single Permit2 permit, on-chain allowance read first,
requiresApproval envelope with ready approve calldata), add_liquidity (batch permit,
wallet lane by design), and borrow, guarded server-side by a DeFi calldata gate
(selector and token allowlists) before simulation.

Mainnet-switch readiness. The Aristotle (16661) deploy script deploys and wires the full
surface, GasTank, forwarder trust, swap pair, caps, with three-key separation, env
gating, and no mocks. We proved 0G's deployed Permit2 is byte-identical to upstream
(one cached-domain word).

Tests: forge 343/0, backend 249/0, chat 100/0, config 62/0, frontend 153/0.

(2,354 characters.)

---

## 4th Wave Milestone (proposed)

The form field is currently TBD. Proposed milestone:

**"One-command mainnet cutover, proven gasless on Aristotle."** Concretely: execute the
existing `DeployAristotle.s.sol` on chain 16661 (it already deploys and wires the full
surface: Verifier, NFT, Vault, Processor, DelegationRegistry, GasTank, forwarder trust,
swap pair, caps, with three-key separation and no mocks), fund the relayer EOA to at
least 0.5 OG (about 800 sponsored ops at the measured 0.0006 OG/op), re-point the hosted
backend and frontend at the mainnet addresses, and reproduce the exact E2E proof chain
from this wave on mainnet: faucet claim, 0.01 OG grant, relayed payForAgent, creator
credited. Exit criterion: a judge connects any wallet at the demo URL and completes a
gas-free agent payment on 0G mainnet without touching the terminal.

Why this milestone: everything blocking it is operational, not architectural. The script,
the digest fix, and the relayer are done and verified on Galileo; the remaining work is
funding, env cutover, and one recorded run.

---

## 5th Wave (previous wave: GasTank, relayer, gasless UX, swap/LP/lend)

The previous wave delivered two things at once: a gasless user journey and a DeFi engine
inside the existing contracts.

**Gasless.** `AxiomGasTank` (non-upgradeable, Ownable + Pausable + ReentrancyGuard,
EIP-712 domain "AxiomGasTank"/"1") holds a funded reserve, grants each new address a lazy
0.01 OG gas credit inside `relay()` itself (3 grants cap, daily window), tracks per-user
sequential nonces, and verifies ForwardRequest signatures with an ERC-1271 dual path so
contract wallets work. `AxiomPaymentProcessor` and `AxiomAgentNFT` were retrofitted with
ERC-2771 trusted-forwarder support via UUPS upgrades. Off-chain, the backend gained a
relayer: an in-memory FIFO queue with per-user inflight caps, a sponsor gate (recovered
signer keyed, token bucket, maxGasCost ceiling), eth_call simulation before queueing,
Relayed-log reconciliation, and dead-lettering. New endpoints: POST
`/v1/relayer/sponsor`, GET `/v1/relayer/tank/:address`, GET `/v1/relayer/status`. The
chat runtime got a sponsor lane (`withdraw`, `pay_for_agent` run gas-free; 402 tank
exhaustion names the remedies instead of failing silently) and a `gas_tank_status` read
tool that reports balance, grants left, and ops left from live chain reads. The frontend
got the GasTankCard (balance, grants bar, deposit, claim), a "sponsored" pill on tool
results, and a low-tank banner. Suites went from 468 to 526 passing that wave.

**DeFi.** The PaymentProcessor gained a constant-product swap pool with tracked reserves
(creator earnings never enter pool math), a solvency view asserted after every pool op,
LP shares, and lending (`borrow`/`repay` with an admin-set borrow factor). An axmWETH
mock and a 1,000-axmUSDC first-relay faucet made the pool usable on testnet, and a Pyth
price endpoint (`GET /v1/prices`, 30s cache, dual Hermes failover) feeds slippage floors.
Forge went 316 to 342 passing; no new contracts were introduced.

---

## Alternative product-category combos, ranked

1. **AI Agents, DeFi, Consumer Apps** (chosen: the user story is a consumer-grade chat
   console over an agent asset, with real DeFi rails underneath)
2. **AI Agents, DeFi, Developer Tooling** (leads with the ERC-7857 contracts and relayer
   as infrastructure other builders can adopt)
3. **AI Agents, Consumer Apps, Payments** (leads with the pay-an-agent royalty story and
   drops the trading-pool angle)
