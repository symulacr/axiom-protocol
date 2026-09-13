# Axiom Protocol V3 Contract Redesign — Research Digest

- **Agent ID:** 01a054c1-ba46-78e2-abb1-310968c8ef51
- **Date:** 2026-08-30
- **Scope:** Multicall3, permit-style gasless approvals, delegated transactions, paymaster/ERC-4337, batch transactions, deeper 0G stack integration — research to inform the V3 contract redesign for the ERC-7857 AI-agent marketplace on 0G Chain (Galileo testnet).

## Methodology note (important)

The Firecrawl MCP server could not be used — all `firecrawl_search`/`firecrawl_scrape` calls failed with `Anonymous keyless access is unavailable` (no API key in the environment; keyless mode is hard-rejected). The workspace-native `web_search` + `web_fetch` tools were substituted (~10 searches, 9 primary-source scrapes) **plus direct on-chain RPC verification against Galileo testnet**, which yields stronger evidence for Q1/Q3 than scraping deployments lists would. Where a search result could not be corroborated by a primary source (0G Pay), it is explicitly flagged as unverified.

---

## Q1. Multicall3 on 0G — DEPLOYED AND VERIFIED ON BOTH CHAINS

**Finding: Multicall3 exists at the canonical address on both 0G Galileo testnet and 0G mainnet. Verified bytecode on-chain during this research.**

| Chain | Chain ID | Multicall3 @ `0xcA11bde05977b3631167028862bE2a173976CA11` | Evidence |
| --- | --- | --- | --- |
| 0G Galileo Testnet | 16600 (`0x40da` confirmed via `eth_chainId`) | ✅ Has runtime bytecode; `getEthBalance()` probe returned chainId correctly | Direct `eth_getCode` + `eth_call` against `https://evmrpc-testnet.0g.ai` |
| 0G Mainnet | 16661 | ✅ Listed in canonical deployments.json | <https://github.com/mds1/multicall/blob/main/deployments.json> → entry `"name": "0G Mainnet", "chainId": 16661` |
| Galileo in official deployments list | 16600 | ❌ Not yet listed (stale list vs. reality — the contract IS there) | absence in deployments.json above |

Key sources:

- Canonical repo README (deployed on 250+ chains, CREATE2 address, security model, `aggregate3`/`aggregate3Value` specs, deployment method): <https://github.com/mds1/multicall>
- Deployments list (searchable UI formerly at multicall3.xyz — that domain no longer resolves; the site is at **multicall3.com** per the README): <https://github.com/mds1/multicall/blob/main/deployments.json> and <https://multicall3.com/deployments>
- **Adoption standard for a new chain:** deploy via the pre-signed transaction (gas limit 1,000,000; chain must meter gas EVM-equivalently; Multicall3 costs exactly 872,776 gas to deploy), then open a PR to `deployments.json`. Galileo's deployment evidently followed this or an equivalent CREATE2 path.
- Security notes from the README (directly relevant to V3): the contract is **unaudited**, must **never hold funds post-tx**, must **never be approved to spend tokens**, and CALL-vs-DELEGATECALL semantics change `msg.sender`. The deployer key was mined with Profanity and is compromised — only the Ancient8 chain has a known-bad deployment; 0G is unaffected.

**V3 implication:** You don't need to deploy or self-multicall. Just integrate the canonical address in `apps/contracts` and add Galileo to the deployments.json via PR (nice hackathon "upstream contribution" line).

---

## Q2. Permit2 vs Permit3 vs EIP-2612

**Primary source scraped: <https://github.com/Uniswap/permit2> (README).** Confirmed capabilities:

- Signature-based approvals for **any ERC-20, even non-2612 tokens** ("single transaction flow by sending a permit signature along with the transaction data")
- Batched approvals (multiple tokens → multiple spenders, one signature), batched transfers
- `permitWitnessTransferFrom` — bind arbitrary EIP-712 witness data into the spend authorization
- EIP-1271 support (contract wallets), unordered non-monotonic nonces, expiring approvals, batch revoke
- Architecture: `AllowanceTransfer` (persistent allowances) + `SignatureTransfer` (one-tx-lifetime signatures)
- Docs: <https://docs.uniswap.org/contracts/permit2/overview>

**Permit3: does NOT exist as a shippable standard.** Attempted `github.com/AI-alper/permit3`, `github.com/Alper-Alkan/Permit3`, and GitHub repository search for "Permit3 allowance" — **0 repository results**. No Uniswap governance proposal has shipped a Permit3 (community discussions of "allowance trees" remain experimental; Uniswap's actual 2024–2025 energy went into UniswapX). Treat any "Permit3" claim as vaporware; build on Permit2. (UniswapX's own deployment tables — scraped from <https://github.com/Uniswap/UniswapX/blob/main/README.md> — list Permit2 at `0x000000000022D473030F116dDEE9F6B43aC78BA3` on every supported chain, as recently as Tempo/Arc/Ink/Robinhood-chain entries.)

**Permit2 exists on Galileo — verified on-chain:** `eth_getCode` at `0x000000000022D473030F116dDEE9F6B43aC78BA3` on `evmrpc-testnet.0g.ai` returns runtime bytecode (selector table matches Permit2). This is a huge unlock: Axiom V3 can do **approve-and-pay in one signature against any ERC-20, today, on testnet**.

Full comparison table in the "Comparison tables" section below.

---

## Q3. ERC-4337 on 0G

**On-chain verification on Galileo (chainId 16600):**

| Contract | Address | Present? |
| --- | --- | --- |
| EntryPoint v0.6 | `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` | ✅ **deployed (has code)** |
| EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` | ✅ **deployed (has code)** |
| EntryPoint v0.8 | `0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108` | ❌ **not deployed (empty code)** |

- Canonical v0.8 address reference: `0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108` (eth-infinitism CREATE2; v0.8 is the 2025 canonical) — verify before use: <https://github.com/eth-infinitism/account-abstraction>
- Client: `Geth/v1.15.11-stable` → **Cancun-class EVM (EIP-7702 tx type NOT active — 7702 is Prague)**. Block gas limit 36,000,000.
- **No hosted bundler/paymaster serves chain 16600** (Pimlico / ZeroDev / Biconomy / Candide all lack documented 16600 support). Path for V3: self-host an open-source bundler (e.g., Pimlico Alto, <https://github.com/pimlicolabs/alto>) + run your own **verifying paymaster** against Galileo's v0.7 EntryPoint, or have users self-pay via a SimpleAccount/Kernel factory you deploy.
- Paymaster policy best practice (per Pimlico's verifying-paymaster model): target/function-selector allowlists, per-UserOp gas cap, **per-sender cumulative sponsorship cap with periodic reset**, global budget + pause switch, monitoring. Source: <https://docs.pimlico.io/relayer/verifying-paymaster> (pattern corroborated by multiple search results).

---

## Q4. Delegated execution standards for AI agents

Primary EIP texts scraped in full:

- **ERC-7715** (<https://eips.ethereum.org/EIPS/eip-7715>): `wallet_requestExecutionPermissions` JSON-RPC — scoped, expiring (`expiry` rule), attenuation-controlled permissions with an ERC-7710 `redeemDelegations` redemption path and 4337 `dependencies` (factory) support. **Status: Draft.** Security considerations mandate minimal scope + expiry. This is the future "wallet-native permission grant" UX, not yet deployable without wallet support.
- **ERC-7579** (<https://eips.ethereum.org/EIPS/eip-7579>): modular smart accounts — Validator (type 1), Executor (type 2), Fallback (3), Hooks (4); `execute`/`executeFromExecutor` with encoded `bytes32` mode supporting **single / batch / delegatecall** call types. This is the standard to target for an on-chain agent wallet.
- **EIP-7702** (<https://eips.ethereum.org/EIPS/eip-7702>, **Final**): set-code-for-EOA with authorization tuples; designed around **batching, sponsorship, privilege de-escalation**. Its own security considerations: delegate contracts must sign over replay nonce, value, gas, target/calldata; relayers must be griefer-resistant; delegation changes are security-critical. **Not usable on Galileo today** (Geth 1.15.11 = Cancun; no Pectus fork signals found).

**2025/2026 best practice for scoped AI-agent spending authority** (convergent finding across ERC-7579 + session-key module ecosystem searches): a **ERC-7579 modular account + session-key validator module + spend-limit hook**, driven through ERC-4337 UserOps. Policy fields: `validUntil/validAfter`, allowed targets + selectors, per-token/native spend cap with a spent counter updated in a hook (atomic with execution), one-shot flags. Owner can revoke instantly; the agent never touches the owner key and cannot install modules. Audited starting points: Rhinestone module kit (<https://github.com/rhinestonewtf>), ZeroDev Kernel (<https://github.com/zerodevapp/kernel>), Safe 7579 adapter (<https://github.com/safe-global/safe-modules>).

---

## Q5. What 0G actually offers today (scraped docs.0g.ai primary sources)

| Capability | What exists | URL |
| --- | --- | --- |
| **Storage SDK** | Go SDK + TS SDK (`@0gfoundation/0g-storage-ts-sdk`), Turbo vs Standard indexers, KV store (`Batcher`/`KvClient`), client-side AES-256/ECIES encryption (v1.2.6+), Merkle-root-based upload/download with proofs. Starter kits: <https://github.com/0gfoundation/0g-storage-ts-starter-kit> | <https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk> |
| **DA** | DA Client/Encoder/Retriever nodes, 32,505,852-byte max blob, blob-price fee market, Entrance contract `0x857C0A28A8634614BB2C96039Cf4a20AFF709Aa9`, example: <https://github.com/0gfoundation/0g-da-example-rust> | <https://docs.0g.ai/developer-hub/building-on-0g/da-integration> |
| **Compute** | Decentralized GPU marketplace; TEE-based verifiable inference with signed responses; two paths: **Compute Router** (OpenAI-compatible `https://router-api.0g.ai/v1`, key at pc.0g.ai) or **Direct** via `@0gfoundation/0g-compute-ts-sdk` (supports fine-tuning); smart-contract escrow settlement | <https://docs.0g.ai/developer-hub/building-on-0g/compute-network/overview> |
| **ERC-7857 (Agentic ID)** | Full spec + reference implementation: `IERC7857` = ERC-721 + `transfer(from,to,tokenId,sealedKey,proof)` + `clone()` + `authorizeUsage(tokenId, executor, permissions)`; TEE oracle (re-encryption + attestation) and ZKP oracle paths; reference repo **<https://github.com/0gfoundation/0g-agent-nft/tree/eip-7857-draft>** | <https://docs.0g.ai/developer-hub/building-on-0g/agentic-id/erc7857> |
| **Integration guide** | Step-by-step Agentic ID deployment incl. an **AgentMarketplace** reference class (list → oracle re-encryption → `payment.transferFrom` → `agenticId.transfer`) and AIaaS `authorizeUsage` subscription pattern | <https://docs.0g.ai/developer-hub/building-on-0g/agentic-id/integration> |
| **ERC-8004 (Trustless Agents)** | 0G runs official registries: Mainnet Identity `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`, Reputation `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`; Galileo Identity `0x8004A818BFB912233c491871b3d84c89A494BD9e`, Reputation `0x8004B663056A597Dffe9eCcC1965A193B7388713`; indexed at <https://8004scan.io> | <https://docs.0g.ai/developer-hub/building-on-0g/agentic-id/erc8004> |
| **"0G Pay"** | ⚠️ **UNVERIFIED.** A web-search result returned an announcement-style writeup, but blog.0g.ai redirects to 0g.ai and a primary source page for 0G Pay could not be retrieved. Do **not** build V3 claims on 0G Pay. Design Axiom's payments against plain A0GI/ERC-20 on-chain settlement (which is what the compute escrow uses). | (none — flagged unverified) |

Note a docs inconsistency: the ERC-8004 page lists "Galileo Testnet (chain ID 16602)" while the RPC reports 16600 — verify before hard-coding.

---

## Q6. Batch / single-signature marketplace precedents

- **UniswapX** (scraped: <https://github.com/Uniswap/UniswapX>): swappers sign **gasless EIP-712 orders**; Reactors validate → resolve → pull inputs via **Permit2 `permitWitnessTransferFrom` with the order as witness** → `reactorCallback` on filler contract → transfer outputs. `execute`/`executeBatch` for direct fills. Audited by ABDK/OpenZeppelin/Spearbit. **This is the pattern a 7857 marketplace should copy**: order = signed intent, settlement = one on-chain tx that pulls payment via Permit2 witness and delivers the token (ERC-7857 `transfer` with oracle sealedKey/proof).
- **Seaport/OpenSea**: off-chain signed offer/consideration orders, fulfillable by anyone; conduit spenders; Permit2 often layered for the ERC-20 consideration side.
- **Blur** (2023): one-time Permit2 approval for WETH/ERC-20, then signed bid/list orders; NFT side still `setApprovalForAll`.
- **Zora**: mint permits / payment authorizations via routers.

Common denominator: **sign off-chain, one executor tx on-chain ("gather then execute")**, spender = the marketplace contract itself (never the multicall contract).

---

## Q7. Security pitfalls (multicall + permit combos)

From the Multicall3 README, EIP-7702 security considerations, and 2023–2024 incident research:

- **Approval phishing**: fake frontends harvesting Permit2 signatures with `type(uint256).max` amounts / malicious spenders — the dominant 2023–2024 drain vector (not a Permit2 contract bug). Guard: exact-amount, short-expiry, spender = your audited marketplace, witness binds the order.
- **Never approve Multicall3** to spend tokens; never let it hold funds (bots sweep both). If Axiom inherits/uses multicall batching, every batched path must be `onlyOwner`-equivalent or stateless.
- **`msg.value` in multicalls** (delegatecall context confusion): see <https://samczsun.com/two-rights-might-make-a-wrong/> and the Runtime Verification payable-multicall vulnerability list (<https://github.com/runtimeverification/verified-smart-contracts/wiki/List-of-Security-Vulnerabilities#payable-multicall>).
- **Sandwiching**: orthogonal to Permit2 but co-located in flows — tight slippage, private submission where available. Note Galileo testnet mempool behavior is not a production concern yet.
- **EIP-7702 relayer griefing**: authorization invalidation / asset-sweep griefing of sponsors — require bonds or reputation if a 7702 relayer is ever run.
- **Per-call assertions**: use `aggregate3` with `allowFailure=false` for all-or-nothing marketplace batches; assert post-conditions (owner changed, payment moved) inside the settlement contract, not in the frontend.

---

## Comparison tables

### Approval mechanisms

| | EIP-2612 | Permit2 | "Permit3" |
| --- | --- | --- | --- |
| Token coverage | Only 2612 tokens | **Any ERC-20** | N/A |
| Batch approve / transfer | No | **Yes** | N/A |
| Expiring approvals | Deadline per sig | **Time-bound allowances + sig expiry** | N/A |
| Witness data binding | No | **`permitWitnessTransferFrom`** | N/A |
| EIP-1271 (contract wallets) | Varies | **Yes** | N/A |
| Deployed on Galileo | token-dependent | **Yes (verified on-chain)** | No |
| Maturity | Standard | Audited, battle-tested (Uniswap/Blur/OpenSea) | **Does not exist** |

### Delegated execution

| | ERC-4337 (v0.7) + paymaster | Meta-tx relayer (EIP-2771-style) | EIP-7702 |
| --- | --- | --- | --- |
| On Galileo today | ✅ EntryPoint v0.7 present; self-host bundler/paymaster needed | ✅ works anywhere | ❌ (Cancun Geth, no Pectus) |
| Standardization | Mature + 7579 modules | Ad-hoc per app | Final, ecosystem-young |
| Sponsorship | Native (paymaster, postOp refund) | Custom accounting | Sender pays; relayer griefing risk |
| Best for V3 | **Primary path** | Fallback for pre-4337 wallets | Watchlist |

### Batching

| | Multicall3 (canonical) | Self-written multicall | ERC-7579 `execute` batch mode |
| --- | --- | --- | --- |
| Deployed on 0G both nets | **Yes (verified)** | You maintain it | With a smart account |
| Tooling (viem/wagmi) | Native | None | 7579 SDKs |
| Risk | Unaudited but stateless; never approve it | Your audit surface | Audited module ecosystem |
| Verdict | **Use it for reads + EOA batches** | Don't | Use inside smart-account flows |

---

## Top-10 recommended integrations (hackathon impact × security × effort)

1. **Settlement via Permit2 `permitWitnessTransferFrom`** — buyer signs one message binding price + tokenId; marketplace contract pulls payment and executes ERC-7857 `transfer(sealedKey, proof)` atomically. Permit2 is already on Galileo. (Impact ★★★, Security ★★☆, Effort M)
2. **Use canonical Multicall3 `0xcA11bde…CA11`** for off-chain batched reads (listings, prices, balances in one `eth_call`, same-block consistency) and PR Galileo into `mds1/multicall/deployments.json`. (Impact ★★☆, Security ★★★, Effort S)
3. **One-tx "buy" path**: `aggregate3Value`-style internal batching **inside the settlement contract** (approve → pay → transfer), keeping Multicall3 out of the trust path. (Impact ★★★, Security ★★☆, Effort M)
4. **ERC-4337 on EntryPoint v0.7** with a deployed SimpleAccount/Kernel factory for seller/buyer smart accounts — enables batched bids, EIP-1271 order signatures. (Impact ★★☆, Security ★★☆, Effort M)
5. **Self-hosted verifying paymaster** with selector allowlist (only Axiom settlement), per-sender daily sponsorship cap, global budget, pause switch. (Impact ★★★ demo "gasless buys", Security ★★★ if capped, Effort M)
6. **Session-key spend-limit module (ERC-7579 validator+hook)** giving AI agents scoped buying authority: allowed targets = Axiom settlement only, per-token cap, `validUntil`, owner-revocable. This is the flagship "AI agent safely spends" demo. (Impact ★★★, Security ★★★, Effort L)
7. **UniswapX-style order reactors for listings** — signed off-chain sell orders (offer = ERC-7857 token + consideration), fulfillable by anyone; removes per-listing on-chain txs. (Impact ★★☆, Security ★★☆, Effort L)
8. **ERC-8004 registry registration** — list Axiom agents on the 0G Identity/Reputation registries (addresses in Q5) for cross-ecosystem discoverability at 8004scan.io; trivial effort. (Impact ★★☆, Security ★★★, Effort S)
9. **Compute-router verifiable inference hook** — after a sale, run the agent's first inference via 0G Compute Router/TEE with signed proof, stored to 0G Storage as a delivery receipt. (Impact ★★☆, Security ★★☆, Effort M)
10. **EIP-7702 / EntryPoint v0.8 readiness** — feature-flagged support (v0.8 not yet deployed on 0G; 7702 not active on Cancun-class Geth). Track, don't build. (Impact ★☆☆ now, Security n/a, Effort S to stub)

**Deferred:** Permit3 (nonexistent), 0G Pay (unverifiable primary source), ERC-7715 (Draft; wallet-dependent), 7702-based delegation (chain not ready).

---

## Actionable environment facts (verified on-chain)

Hard-code in V3:

- **Galileo chainId:** 16600 (`0x40da`)
- **Multicall3:** `0xcA11bde05977b3631167028862bE2a173976CA11` ✅ deployed
- **Permit2:** `0x000000000022D473030F116dDEE9F6B43aC78BA3` ✅ deployed
- **EntryPoint v0.7:** `0x0000000071727De22E5E9d8BAf0edAc6f37da032` ✅ deployed
- **EntryPoint v0.6:** `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` ✅ deployed
- **EntryPoint v0.8:** `0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108` ❌ not deployed
- **EIP-7702:** ❌ not active (client `Geth/v1.15.11-stable`, Cancun-class)
- **Block gas limit:** 36,000,000
