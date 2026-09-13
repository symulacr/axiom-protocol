# Axiom Protocol — Narrative

> **An axiom is a self-evident truth that requires no proof — a starting point for reasoning.**
> Axiom Protocol is the self-evident foundation for trustworthy AI in DeFi: verifiable intelligence, owned by the user, provably executed.

## The Problem

In 2025, the agentic AI market hit **$7.3B**, yet only **23% of enterprises scale** AI agents to production (source: [0G Labs research, Jan 2026](https://0g.ai/blog/agentic-ai-market-infra-2026)). Three bottlenecks block the other 77%:

1. **Inference cost crisis** — 60–80% of operating expenses for AI-first companies go to inference. A $29/month customer generating $44/month in inference costs is a loss, not a business.
2. **Verification gap** — when an AI agent executes a trade, how do you prove it ran the model you paid for, not an imposter? Current systems offer TEE speed, ZKML transparency, or optimistic latency — pick one.
3. **Governance vacuum** — 74% of organizations have no real AI governance strategy. Trust in autonomous systems dropped from 43% to 27% as pilots hit production.

The DeFi subset of this problem is sharper. A trading agent that loses user funds due to reward-hacking or model drift is a liability. A market-making agent with no on-chain proof of its model is unverifiable. A portfolio agent that can't transfer its intelligence to a new owner when sold is just a database row.

## What Axiom Does

Axiom Protocol is the **verifiable intelligence layer for DeFi**. It is the on-chain infrastructure that lets an AI agent's *intelligence* — its model, weights, strategy, execution logic — be tokenized as an NFT, owned by a user, transferred with provable integrity, and run with cryptographic proof of correct execution.

**Three primitives, one stack:**

| Primitive | What it does | 0G component |
| ----------- | ------------- | --------------- |
| **Tokenize** | An AI agent's encrypted intelligence is minted as an ERC-7857 iNFT (Agentic ID) | `AxiomAgentNFT` on 0G Chain |
| **Transfer** | Selling the agent re-encrypts its intelligence for the new owner via a real TEE-oracle | `AxiomTeeVerifier` + TypeScript oracle service |
| **Execute** | The agent runs trading strategies on 0G Compute with TEE attestation, persists data to 0G Storage, settles trades on 0G Chain | `AxiomStrategyVault` + 0G Compute + 0G Storage + 0G DA |

## The Trust Triangle

```text
            VERIFICATION
                 ▲
                ╱ ╲
               ╱   ╲
              ╱     ╲
             ╱       ╲
            ╱    ▲    ╲
           ╱    │     ╲
    COST  ╱─────┼─────╲  LATENCY
          ╲     │     ╱
           ╲    │    ╱
            ╲   │   ╱
             ╲  │  ╱
              ╲ │ ╱
               ▼│▼
```

Axiom doesn't pretend to break the verification trilemma. It picks the right tool for the right job:

- **TEE** (sub-second) for latency-critical trading agents
- **ZKML** (cryptographic) for transparency-sensitive compliance agents
- **Optimistic + DA** (50 Gbps on 0G) for audit trails that need to be there later

The same agent NFT can plug into any of these — the verifier is a single address on the NFT contract, swappable via `updateVerifier` if your verification model changes.

## Who It's For

**Traders who want a real agent, not a chatbot.** Fund the vault, set a strategy Merkle root, and the agent runs within a TEE on 0G Compute. Every trade is settled on 0G Chain. Every model invocation is signed by the TEE. You can verify the agent is the one you paid for.

**Agent creators who want liquidity.** Mint your trading agent as an iNFT. Buyers can audit the strategy on-chain. The ERC-721 marketplace primitives (transfer, clone, authorize) all work with re-encrypted intelligence — your model never leaves the TEE.

**DeFi protocols building agentic vaults.** Plug `AxiomStrategyVault` in as the execution layer. Daily limits, Merkle-verified action roots, CEI-safe execution. The agent proposes, the vault disposes.

## What Makes It Different

> ⚠️ **Current implementation uses a software signer (Node.js + secp256k1).**
> Hardware TEE attestation (Intel TDX / AMD SEV) is planned for production.
> The cryptographic proofs are real — the hardware root-of-trust is simulated.

- **No mock oracles.** The TEE signer service is a real cryptographic process: secp256k1 keypair, registered on-chain, signs every `OwnershipProof.proof`. The on-chain check is real; the off-chain hardware root-of-trust is the only simulated step, and it swaps to a real Intel TDX/AMD SEV node in production by registering a new signer pubkey.
- **Real ERC-7857, not a sketch.** The `AxiomAgentNFT` contract composes the canonical extensions from the [0G Labs reference](https://github.com/0gfoundation/0g-agent-nft): `ERC7857CloneableUpgradeable` + `ERC7857AuthorizeUpgradeable` + `ERC7857IDataStorageUpgradeable`. The verifier follows the canonical `BaseVerifier` pattern with nonce-based replay protection and a 7-day proof expiry. The transfer flow is the canonical `iTransferFrom` with two proofs (AccessProof from receiver, OwnershipProof from oracle).
- **Full pipeline on 0G.** Storage (encrypted, client-side AES-256-GCM), Compute (TEE-attested broker), DA (50 Gbps, 32 MB blob cap), Chain (11,000 TPS per shard, sub-second finality). No external infra in the critical path.
- **No vendor lock-in.** Because the verifier is a single address, the verification model can be swapped (TEE → ZKML → optimistic) without redeploying the NFT. Because storage is content-addressed, the agent's intelligence lives forever. Because the chain is EVM-equivalent, every existing Ethereum tool works.

## The Roadmap (0G WaveHack Buildathon)

Axiom is built across 20 micro-waves inside the 0G WaveHack buildathon (Aug 14 – Nov 15, 2026, $50K grant pool):

- **Pre-buildathon** (now → Aug 13): monorepo, Foundry workspaces, brand docs
- **Wave 1** (Aug 14–30): ERC-7857 contracts, AxiomAgentNFT + Verifier, deploy to Galileo testnet
- **Wave 2** (Sep 1–15): TEE signer service, storage + compute SDKs, 9-step E2E CLI
- **Wave 3** (Sep–Sep 20): Frontend dashboard, mainnet preparation
- **Wave 4** (Oct 1–15): DA indexer, security report, mainnet deploy
- **Wave 5** (Oct 16–31): Closed beta, performance baselines
- **Wave 6** (Nov 1–15): Open beta, Token2049 Singapore Demo Day

## Call to Action

If you're a trader tired of black-box bots, an agent creator tired of centralized marketplaces, or a DeFi protocol ready to add an execution layer that actually proves what it ran — Axiom is for you.

**Try it:** [build.0g.ai/sdks](https://build.0g.ai/sdks) for the underlying primitives. [docs.0g.ai/ai-context](https://docs.0g.ai/ai-context) for the full stack. The Axiom Protocol buildathon submission goes live at Demo Day.

---

*Sources: 0G Labs research (<https://0g.ai/blog/agentic-ai-market-infra-2026>, <https://0g.ai/blog/tapp-tee-security-deep-dive>), EIP-7857 (<https://eips.ethereum.org/EIPS/eip-7857>), 0G Labs ERC-7857 reference (<https://github.com/0gfoundation/0g-agent-nft>), 0G AI Coding Context (<https://docs.0g.ai/ai-context>).*
