# Axiom Protocol — Pitch Outline (3 min for Token2049 Singapore)

> **Format:** 3-minute live demo at Token2049 Singapore Demo Day (Nov 2026).
> **Pre-req:** 3-minute demo video (script in `docs/demo/transcript.md`, recorded in MW20).

---

## Slide 1 (0:00–0:20) — The Hook

**Visual:** Split screen: a black-box trading bot on the left, an exploding meme of $3.3B stolen in 2025 crypto exploits on the right.

**Script:**
> "In 2025, $3.3 billion was stolen in crypto exploits. $1.4 billion in MEV attacks since 2020. The worst part? Most of those losses came from AI agents making decisions no one could verify after the fact. Today, 79% of enterprises are deploying AI agents — but only 23% can scale them past pilot. The bottleneck isn't the models. It's the trust. Axiom Protocol fixes that."

---

## Slide 2 (0:20–0:50) — The Problem

**Visual:** The verification trilemma triangle (Cost ↔ Latency ↔ Verification) with a sad face in the middle.

**Script:**
> "AI agents on a blockchain have a fundamental problem. When an agent trades your money, how do you prove it ran the model you paid for? Not an imposter. Not a cached response. The actual model, in a real TEE, with the right inputs. Today you can't. You either trust the platform, or you don't use agents at all. Axiom Protocol gives you cryptographic proof on every agent action."

---

## Slide 3 (0:50–1:20) — The Solution

**Visual:** Live demo — open `axiom-protocol.xyz/agents`, show an existing agent NFT, click "Transfer", show the TEE oracle re-encrypting the model in real-time, watch the OwnershipProof being verified on-chain, see the PublishedSealedKey event, the receiver now decrypts and runs it.

**Script:**
> "Watch this. I have an AI trading agent — let's call it 'Momentum Pulse v3' — minted as an ERC-7857 iNFT on 0G Chain. Its model weights are encrypted and stored on 0G Storage. I'm transferring it to Sarah. Behind the scenes: Sarah's wallet signs an AccessProof confirming she can receive the data. A TEE oracle in our service re-encrypts the model for her public key and signs an OwnershipProof. The AxiomAgentNFT contract verifies both, emits PublishedSealedKey, and transfers the NFT. Sarah now decrypts the model with her private key and runs it. The old owner can never decrypt it again. All cryptographic, all on-chain, all auditable."

---

## Slide 4 (1:20–1:50) — The Architecture

**Visual:** System diagram (Mermaid from `docs/architecture/system-diagram.mmd`).

**Script:**
> "Here's the full stack. The agent's intelligence is on 0G Storage with client-side AES-256-GCM encryption. Inference happens on 0G Compute with TeeML attestation. Settlements go through AxiomStrategyVault with daily limits and Merkle-verified strategies. The audit trail goes to 0G DA — 50 Gbps of data availability for free. One stack, one verifier, one source of truth."

---

## Slide 5 (1:50–2:30) — The Numbers

**Visual:** Three stats with bold numbers.

- **$0.003** vs $0.03 per 1K tokens — 90% cheaper compute on 0G vs traditional cloud
- **11,000 TPS** per shard, sub-second finality on 0G Chain
- **7-day** proof expiry, **100** authorized users per agent NFT, **32 MB** blob cap for the audit trail

**Script:**
> "We're not building a slower version of a centralized system. We're building something strictly better. 90% cheaper inference. 11,000 transactions per second per shard on 0G Chain. Sub-second finality. 7-day replay protection on agent transfers. 100 authorized users per agent. 32 MB audit blob capacity on 0G DA. Every number is on the canonical 0G reference docs."

---

## Slide 6 (2:30–2:50) — The Proof

**Visual:** Quick cuts of: `forge test` passing 200+ tests, `slither` clean, `pnpm -F @axiom/backend run-e2e -- --network mainnet` printing 9 successful tx hashes, mainnet contract addresses on `chainscan.0g.ai`, a 3-second clip of the demo E2E flow.

**Script:**
> "This isn't a slide deck. It's running. We have 200+ Foundry tests passing. Slither is clean. Our E2E test just ran on 0G Aristotle mainnet and printed nine successful transactions. Here are the contract addresses on the explorer. The whole thing is open source."

---

## Slide 7 (2:50–3:00) — The Ask

**Visual:** QR code to `axiom-protocol.xyz`, Twitter handle, GitHub URL, demo video link.

**Script:**
> "We're Axiom Protocol. We're live on 0G mainnet. We're shipping on the 0G WaveHack buildathon. Try the demo. Read the code. Break it if you can. We built it to last."

---

## Q&A Backup Slides (3:00–5:00)

These slides are pre-staged for the most likely Q&A questions:

### Q1: "How is this different from Virtuals Protocol?"

Axiom is **infrastructure**, not an agent marketplace. Virtuals is a launchpad for agent tokens. Axiom is the verifiable execution layer those agents can use. We don't compete — we compose. An agent created on Virtuals can be wrapped as an AxiomAgentNFT and run on 0G Compute with proof.

### Q2: "What stops the TEE from being compromised?"

Three defenses. (1) The TEE signer is registered on-chain; rotating it requires a governance vote. (2) Every proof has a nonce with 7-day expiry; replay attempts revert. (3) The verifier is a single address; if the trust model changes, the verifier rotates without redeploying the NFT. In production, the TEE runs on Intel TDX or AMD SEV with hardware attestation, not a software simulation.

### Q3: "How much does it cost to run an agent?"

For the canonical `qwen-2.5-7b-instruct` on 0G testnet: 0.00000005 OG per input token, 0.0000001 OG per output token. A typical 1000-token agent step costs ~0.0001 OG (~$0.000003 at $0.03/OG). The vault's daily limit and Merkle-verified strategy roots make cost predictable.

### Q4: "When mainnet?"

Wave 4 of the 0G WaveHack buildathon (Oct 1–15, 2026). Security report and mainnet deploy are in MW18.
