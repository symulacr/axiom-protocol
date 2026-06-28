# Product

## Register

split

Default register is `product` (dashboard, agent management, vault controls). Override to `brand` per-task for landing pages, campaigns, or pitch materials.

## Users

**DeFi traders** who want a real agent, not a chatbot. They fund a vault, set a strategy, and the agent runs within a TEE on 0G Compute. They care about verifiability, cost, and control. Context: managing active positions, reviewing agent performance, moving capital.

**Agent creators** who want liquidity. They mint trading agents as iNFTs, set strategy Merkle roots, and list them for sale. They care about provenance, marketplace reach, and intellectual property protection. Context: packaging an agent for sale, auditing its on-chain history.

**DeFi protocols** building agentic vaults. They plug `AxiomStrategyVault` in as the execution layer. They care about integration simplicity, daily limits, and CEI-safe execution. Context: evaluating the SDK, wiring contracts, monitoring agent behavior.

## Product Purpose

Axiom Protocol is the verifiable intelligence layer for DeFi. It lets AI agents be tokenized as ERC-7857 iNFTs, transferred with cryptographic re-encryption via a TEE oracle, and executed with on-chain proof of correct model invocation.

The product exists because DeFi agents currently operate in a trust vacuum. A trading bot can silently divert to a different model, its strategy can be exfiltrated, and there is no cryptographic proof of what the agent actually did. Axiom closes this gap by binding every agent lifecycle event (mint, transfer, execution) to cryptographic proof verified on 0G Chain.

Success looks like: traders choosing Axiom agents over black-box bots because the proof is on-chain, and creators choosing Axiom as their agent marketplace because re-encryption makes transfers secure.

## Brand Personality

**Warm, authoritative, crafted.**

Voice: direct, technical, confident without swagger. Speaks like an engineer who builds things that work, not a marketer who describes things that might. No hype, no hand-holding, no "empowering" anyone. The code speaks; the UI clarifies.

Tone: serious about the technology, human about the interaction. Bronze warmth in a dark field. Every element feels considered, not assembled from a kit.

Three-word personality: **precise, sovereign, crafted.**

## Anti-references

**No crypto-bro aesthetics.** No neon gradients, rocket emojis, "wen moon" energy, meme-coin vibes, or generative-art PFPs as decoration. Axiom is infrastructure, not a casino.

**No generic SaaS.** No cream/sand/beige backgrounds, no rounded-32px cards, no stock illustrations of diverse teams collaborating, no "empower your workflow" copy, no identical card grids with icon-heading-text. Axiom is a tool, not a template.

**No maximalist DeFi.** No TVL dashboards with 47 numbers competing for attention, no governance-speak, no protocol-politics sidebar, no "total value locked" as a hero metric. Axiom shows what matters for the agent you're looking at, not the entire protocol's nervous system.

## Design Principles

**Verify, don't trust.** Every surface shows proof. When an agent executed a strategy, show the on-chain tx. When a transfer happened, show the EIP-712 proof bundle. Cryptographic truth over marketing claims. If the user can't verify it, the UI shouldn't claim it.

**Craft over decoration.** Every pixel earns its place. No ornament, no flourish that doesn't carry information. Spacing creates rhythm, not emptiness. Color signals state, not aesthetics. If removing an element doesn't reduce understanding, remove it.

**Sovereign by default.** The user owns the agent, the data, the keys. The UI never obscures ownership, never hides the wallet connection, never pretends the user isn't in control. Actions that affect ownership (transfer, authorize, revoke) are explicit, gated, and reversible where possible.

## Accessibility & Inclusion

WCAG AA compliance target. 4.5:1 contrast for body text, 3:1 for large text and UI controls.

Reduced motion support is required. Every animation needs a `@media (prefers-reduced-motion: reduce)` alternative. Already partially implemented in `index.css`.

Keyboard navigation for all interactive elements. Focus-visible rings already in place. Screen reader support for dynamic content (agent status changes, transaction confirmations, error states).

Color is never the only signal. Semantic states (success, danger, warning) always pair color with text or icon.
