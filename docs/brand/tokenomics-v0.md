# AXM Tokenomics v0

> **Status: Draft — to be locked in MW6 (open beta) after the initial security report and mainnet deploy.**

This document specifies the utility, distribution, and economic flows for the **AXM** native utility token of the Axiom Protocol. Numbers are placeholder; final calibration is driven by security report findings, mainnet TVL, and closed-beta metrics (MW5).

## 1. Token Utility

AXM has **four** primary utilities. Each one accrues demand from a different user role.

| # | Utility | Who uses it | Demand driver |
| --- | --------- | ------------- | --------------- |
| 1 | **Staking for agent access** | Vault funders | Stake AXM to access premium agent strategies without paying per-call in stablecoins |
| 2 | **Payment for compute + storage** | Agent runners | Agents pay 0G Compute and 0G Storage in AXM; a small fraction is burned |
| 3 | **Governance** | AXM holders | Vote on protocol parameters, fee structures, new feature proposals |
| 4 | **Creator royalties** | Agent creators | Earn AXM every time their agent is transferred or used |

## 2. Supply

```text
Total supply:        1,000,000,000 AXM (1B fixed cap)
Initial circulating: ~150,000,000 AXM (15%) at TGE
Emission:            None — fixed cap, no inflation
```

### Distribution

| Bucket | % | Amount (AXM) | Vesting |
| -------- | --- | -------------- | --------- |
| **Community + ecosystem** | 40% | 400M | 4-year linear, 1-year cliff |
| **Team** | 20% | 200M | 4-year linear, 1-year cliff |
| **Private investors** | 15% | 150M | 3-year linear, 6-month cliff |
| **Treasury (DAO-controlled)** | 15% | 150M | Unlocked at TGE, gated by governance |
| **Liquidity (DEX + CEX)** | 5% | 50M | Unlocked at TGE for initial liquidity |
| **Public sale (buildathon bonus)** | 5% | 50M | Distributed to AKINDO WaveHack winners + retro airdrops |

## 3. Deflationary Mechanisms

Two sinks remove AXM from circulation over time:

1. **Burn on agent execution** — 20% of every `AxiomPaymentProcessor.payForAgent` is burned.
2. **Buy-and-burn** — 30% of protocol revenue (from `AxiomPaymentProcessor.payComputeProvider` and vault execution fees) is used to buy AXM on the open market and burn it.

Targeted burn rate (modeled): 2–4% of circulating supply per year, ramping to 5–7% as agent volume grows.

## 4. Incentive Flow (Parallel Earning)

Four roles earn AXM for contributing to the protocol:

```text
   ┌──────────┐                ┌──────────────┐
   │ Creator  │ ─ royalty ──── │   Agent NFT  │
   │ (mints)  │                │   (ERC-7857) │
   └──────────┘                └──────┬───────┘
        │                             │ used by
        │                             ▼
   ┌──────────┐   stake    ┌──────────────────┐
   │ Staker  │ ─────────► │  Vault Funder    │
   │  (AXM)  │             │  (finds agents)  │
   └────┬─────┘             └────────┬─────────┘
        │ yields                      │ pays
        │ from fees                   │ for compute
        ▼                             ▼
   ┌──────────┐              ┌──────────────────┐
   │   LP    │               │  0G Compute /    │
   │  (DEX)  │               │  Storage burn    │
   └──────────┘               └──────────────────┘
```

### Per-role accrual

- **Agent Creator**: 70% of `setRoyaltyBps` on every secondary transfer + 10% of every `payForAgent` call routed to `creatorOf(tokenId)`.
- **Liquidity Provider**: Standard Uniswap V3 / Aerodrome fees on AXM/stable pairs.
- **Staker**: Share of `AxiomPaymentProcessor` fees proportional to staked AXM, paid in AXM.
- **User (data provider)**: Future-phase — earn AXM for providing high-quality training data or agent feedback (post-buildathon).

## 5. Governance

- **Snapshot + on-chain execution**: off-chain voting on Snapshot for gas-free signaling, on-chain execution via `AxiomGovernor` (OZ `Governor` + `GovernorCountingSimple`) for parameter changes.
- **Quorum**: 4% of circulating supply.
- **Voting delay**: 1 day. **Voting period**: 7 days. **Timelock**: 2 days.
- **What can be voted on**: fee percentages, burn rate, new verifier registrations, treasury allocations, oracle signer rotation policy.

## 6. Risks and Mitigations

| Risk | Mitigation |
| ------ | ------------ |
| Speculative token launch | 5% initial liquidity, no team tokens unlocked for 1 year |
| Burn rate too aggressive | Adaptive: governance can lower burn % if TVL drops |
| Staking dilution | Stakers receive fee share, not emissions |
| Agent creator rug-pulls | `AxiomAgentNFT` creator is set at mint, immutable |

## 7. Numbers That Need Validation (post-mainnet)

- [ ] **Optimal burn %** — depends on actual compute cost on 0G mainnet. Calibrate after 1 week of real usage data.
- [ ] **Stake-to-access ratio** — how much AXM is needed to access a "premium" agent. Initial guess: 1000 AXM minimum, scaled by agent TVL.
- [ ] **Royalty cap** — current spec is 70% of secondary sale. May be too high; consider 30% with a fee-on-transfer going to the protocol.

## 8. Sources

- 0G Compute costs: <https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/overview> (0.00000005 OG/0.0000001 OG per token for qwen-2.5-7b-instruct)
- 0G Storage costs: <https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk> (95% cheaper than AWS)
- 0G AI market data: <https://0g.ai/blog/agentic-ai-market-infra-2026> ($7.3B market, 40-46% CAGR)
- Reference: similar agent-token models — Virtuals Protocol, ai16z
