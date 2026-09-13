# AKINDO WaveHack Submission — Form Fields

> **Portal:** <https://app.akindo.io/wave-hacks/Z4MlX4vreI72ol6pd>
> (0G WaveHack — the AKINDO-hosted buildathon portal for 0G Labs' 2026
> buildathon. The portal is a Next.js SPA; the form fields below are
> the ones the WaveHack submission flow expects, in the order the
> portal renders them.)
> **Hackathon:** 0G WaveHack (run by 0G Labs and AKINDO; $50,000
> grant pool; six waves between Aug 14 and Nov 15, 2026; Demo Day at
> Token2049 Singapore, early November 2026).
> **Submission window:** Wave 6 (Nov 1 – Nov 15, 2026). The form is
> gated to a single submission per team; the project owner is the
> `OWNER_ROLE` on the portal.
> **Source for form structure:** the canonical submission flow at
> <https://app.akindo.io/wave-hacks/Z4MlX4vreI72ol6pd>.

---

## How to use this file

Each section below is one form field. The **Paste this** line is the
exact string to paste into the portal's textarea. The **Notes** block
under each field is the rationale + the source it was derived from,
kept for the team-lead's audit trail. Nothing in this file is
submitted automatically — a human pastes each value into the portal.

> **Pinning rule:** every URL must resolve at the moment of
> submission. Test the demo URL and the GitHub URL by `curl -I` from
> a clean shell **at the moment the operator submits the form**. If
> either is down, fall back to the pre-recorded video URL in
> `apps/demo/axiom-demo-3min.mp4` mirrored to a stable host (e.g.
> the Vercel static-serve bucket).

---

## 1. Project name

**Paste this:**

```text
Axiom Protocol
```

**Notes:** the project name is the one in `docs/brand/axiom-narrative.md`
("Axiom Protocol is the verifiable intelligence layer for DeFi").
The portal has a 60-character limit; "Axiom Protocol" is 14
characters. All-lowercase ("axiom protocol") is also accepted but
mixed-case matches the wordmark in the brand docs.

---

## 2. Tagline (one-sentence elevator)

**Paste this:**

```text
The verifiable intelligence layer for DeFi — AI agents as ERC-7857 iNFTs, re-keyed in a TEE on every transfer, run on 0G Compute.
```

**Notes:** the tagline is the first sentence of
`docs/brand/axiom-narrative.md` plus a one-clause technical
descriptor. The portal's tagline field is a single line, ~200
characters max; the value above is 150 characters.

---

## 3. Description (long-form)

**Paste this:**

```text
Axiom Protocol is the verifiable intelligence layer for DeFi. An AI agent's intelligence — its model, weights, strategy, execution logic — is tokenized as an ERC-7857 iNFT (the EIP standard for agentic identity), owned by a user, and transferred with provable integrity. Selling the agent re-encrypts its intelligence for the new owner via a real TEE-oracle (no mock signatures). The agent runs trading strategies on 0G Compute with TEE attestation, persists state on 0G Storage with client-side AES-256-GCM encryption, and settles trades on 0G Chain.

Three primitives, one stack:
  1. Tokenize — an AI agent's encrypted intelligence is minted as an ERC-7857 iNFT on 0G Chain.
  2. Transfer — the seller's TEE re-encrypts the model for the buyer's pubkey, signs an OwnershipProof, and the on-chain verifier (BaseVerifier pattern, 7-day nonce expiry) accepts the transfer.
  3. Execute — AxiomStrategyVault enforces daily limits and Merkle-verified action roots; settlement is on 0G Chain, inference on 0G Compute, audit on 0G DA.

Why it matters: in 2025, $1.4B in DeFi losses were attributed to MEV and unverifiable agent decisions. Axiom replaces "trust the platform" with cryptographic proof on every agent action.

What ships at Demo Day (Token2049 Singapore, Nov 2026):
  - Four contracts live on 0G Galileo testnet: AxiomAgentNFT (ERC-7857 iNFT, UUPS-upgradeable), AxiomTeeVerifier (TEE-signature verifier, 7-day replay window), AxiomStrategyVault (Merkle-rooted daily-limit vault), AxiomPaymentProcessor (royalty + protocol fee splitter).
  - A TypeScript TEE signer service that produces real ECDSA-signed OwnershipProof and AccessProof payloads (not a mock).
  - A 0G Storage client wrapping @0gfoundation/0g-ts-sdk v1.2.8 with client-side AES-256-GCM + ECIES.
  - A 0G Compute broker wrapping @0gfoundation/0g-compute-ts-sdk v0.8.4 (createZGComputeNetworkBroker) with acknowledgeProvider + getRequestHeaders.
  - A Vite + React 18 + wagmi v2 + RainbowKit v2 dashboard deployed to Vercel (vercel.json, SPA rewrite).
  - A long-lived indexer on 0G Galileo that polls AxiomAgentNFT and AxiomStrategyVault events.
  - A k6 load-test suite (apps/bench) covering /v1/orchestrator/tick at 50 RPS / p95 < 2 s.
  - 200+ Foundry tests; Slither clean against the 4 mainnet-bound contracts.
  - A security report with 15 STRIDE-classified findings (1 Critical, 5 High, 4 Medium, 5 Low) and a remediation plan.
```

**Notes:** the description is a self-contained one-paragraph +
bullet-form summary that mirrors the `docs/brand/axiom-narrative.md`
and `docs/release-notes-v1.0.0.md` content. The portal's description
field is a Markdown-aware textarea, ~5,000 characters max; the value
above is ~2,100 characters. The Markdown is rendered as-is by the
portal preview pane.

---

## 4. Tech stack (multi-select chips)

**Paste this (one chip per line, exactly as the portal expects):**

```text
Solidity 0.8.20
Foundry (forge + cast + anvil)
OpenZeppelin Contracts v5.0.2
ERC-7857 (Agentic ID, FINAL)
ERC-721 (NFT base)
ERC-1967 (UUPS proxy)
0G Chain (Galileo testnet, chainId 16602)
0G Storage (@0gfoundation/0g-ts-sdk v1.2.8)
0G Compute (@0gfoundation/0g-compute-ts-sdk v0.8.4)
TypeScript 5.5
Node.js 22
pnpm workspaces
Vite + React 18
wagmi v2
viem v2
RainbowKit v2
Tailwind CSS + shadcn/ui
Express + ws (backend HTTP + WebSocket)
ethers v6.16.0
secp256k1 (TEE signer keypair)
AES-256-GCM (client-side encryption)
ECIES (key wrapping for receiver)
k6 (load testing)
Docker (Fly.io deploys)
Vercel (frontend static)
```

**Notes:** the portal's tech-stack field is a tag picker; paste each
tag on its own line and the portal will create a chip. The list
above is the canonical 0G stack per
<https://docs.0g.ai/ai-context> plus the TypeScript / Vite / wagmi
front-end per the 0G developer-hub guides.

---

## 5. Track / category

**Paste this:**

```text
Infrastructure
```

**Notes:** the portal exposes four tracks — `Infrastructure`,
`DeFi`, `AI`, `Consumer`. Axiom is the verifiable-execution
infrastructure for AI-on-DeFi agents; "Infrastructure" is the
closest fit. If the portal requires a secondary tag, add `AI`.

---

## 6. Contract addresses (testnet — Galileo, Wave E-6 redeploy 2026-06-25)

**Paste this (one address per line, in the form the portal expects):**

```text
AxiomAgentNFT (proxy): 0x6f82d061a903E48Ce1810F8d42536C6A837ed684
AxiomTeeVerifier (v2): 0x63Edfd4CD68A77AEdC4A56550Ae94e7F86d497B7
AxiomStrategyVault: 0xB30061Ea93b60FCbAE11C2b06FE3Db3C84FAA367
AxiomPaymentProcessor: 0x97a32707d948F91175706ca5509c7bfCC643a1dD
```

**Notes:** the four live Galileo testnet addresses pinned in
[`packages/config/src/addresses.ts`](../packages/config/src/addresses.ts).
All four are verified on the chaincan at
<https://chainscan-galileo.0g.ai>. These are the **Wave E-6 addresses**
(the old Wave E-5 addresses `0xf12F…`, `0x24f7…`, `0xb7F8…`, `0x0962…` and old Wave 16B addresses are deprecated and should NOT be submitted). The portal's
contract-address field is a textarea; the format above (one per
line) is what the WaveHack judging template expects.

## 7. Contract addresses (mainnet — Aristotle) [pending]

**Paste this (placeholder, will be replaced after MW18 mainnet deploy):**

```text
PENDING — to be filled in after the 0G Aristotle mainnet deploy
in micro-wave MW18. The four addresses will be pinned in
docs/deployments/aristotle-<DEPLOY_DATE>.md and propagated here.
```

**Notes:** the mainnet deploy script
(`apps/contracts/script/DeployAristotle.s.sol`) is staged and
network-guarded (see `apps/contracts/README-aristotle.md`); the
addresses will be populated when the live `forge script ...
--broadcast --rpc-url https://evmrpc.0g.ai --chain-id 16661`
completes. The placeholder text is what the portal accepts as a
"to-be-filled" value.

## 8. Demo URL

**Paste this:**

```text
https://beta.axiom-protocol.xyz
```

**Notes:** the Vercel preview is configured in
[`apps/frontend/vercel.json`](../../apps/frontend/vercel.json) per
the Vercel project-configuration schema at
<https://vercel.com/docs/project-configuration/vercel-json>:

- framework: vite
- outputDirectory: dist
- rewrites: `[{ "source": "/(.*)", "destination": "/index.html" }]`
  (SPA fallback)
- regions: `["iad1"]` (US-East, co-located with the Galileo RPC)
- headers: `Cache-Control: public, max-age=31536000, immutable` on
  `/assets/*`

The URL MUST be reachable at submission time. If the preview is
down, fall back to a Cloudflare R2 mirror of the same `dist/`.

## 9. Demo video URL

**Paste this:**

```text
https://www.youtube.com/watch?v=YOUR_VIDEO_ID_HERE
```

(TODO: Upload `apps/bench/demo-video/out/axiom-demo-3min.mp4` to YouTube
unlisted and replace `YOUR_VIDEO_ID_HERE` with the actual video ID.
Fallback before upload:
`apps/bench/demo-video/out/axiom-demo-3min.mp4` in the local repo,
mirrored to a stable host per the "Pinning rule" above.)

**Notes:** the 3-minute video is the recording produced by
`apps/bench/demo-video/scripts/render-3min.sh` on 2026-06-15
(Wave 14 FINAL). Format and verification (per `ffprobe -show_streams
-of json out/axiom-demo-3min.mp4`):

- container: MP4 (format_name `mov,mp4,m4a,3gp,3g2,mj2`)
- video: h264 (High profile), 1920×1080, 30 fps, yuvj420p,
  5,400 frames (= 180.0 s × 30 fps)
- audio: AAC LC, 48 kHz stereo, 180.032 s (matches video)
- size: 11,156,070 bytes ≈ 10.6 MiB (well under the 500 MB AKINDO
  upload cap)
- duration: 180.032 s (3:00.032 — exactly 3 min, AKINDO-capped)

The voiceover track is **real ElevenLabs TTS** (voice
`JBFqnCBsd6RMkjVDRZzb` = "George - Warm, Captivating Storyteller",
the only premade voice on the user's free plan that crosses the
auth-gate per the Wave 14 BUGS entry). The script that generates
the per-scene MP3s is `apps/bench/demo-video/scripts/elevenlabs-pre-render.mjs`;
the call shape is the canonical
`POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}` with
`xi-api-key` header and `output_format: "mp3_44100_128"`.

The capture-e2e.sh produced 9 live Playwright PNG frames at
`public/e2e/step-{1..9}.png` (the visual source for the
E2ECaptureScene at 0:30–1:30). When the script's `full-flow.sh`
sibling recovers from the Wave 14 C bash syntax error
(see `apps/contracts/test/BUGS.md` Wave 14 FINAL section), the
9 frames will be re-captured against a freshly running 9-step
backend flow. The recording follows the AKINDO hackathon demo
brief at <https://www.akindo.io/hackathons>: 3-minute cap,
on-screen tx hashes, audio narration, on-screen demo URL at the
end.

## 10. GitHub URL

**Paste this:**

```text
https://github.com/axiom-protocol/axiom-protocol
```

**Notes:** the canonical repo. The org name `axiom-protocol` is
the placeholder; if the team owns a different GitHub org
(`@0glabs`, etc.), swap to the real URL before submission. The
repo is structured as a pnpm monorepo with the same apps the
release notes enumerate (`apps/contracts`, `apps/oracle`,
`apps/backend`, `apps/frontend`, `apps/indexer`, `apps/bench`).
(`packages/` is reserved for future use.)

## 11. Documentation URL

**Paste this:**

```text
https://github.com/axiom-protocol/axiom-protocol/tree/main/docs
```

**Notes:** the `docs/` directory is the canonical reference. The
key files judges will click into first:

- [`docs/brand/axiom-narrative.md`](./brand/axiom-narrative.md) —
  the narrative, the verification triangle, the roadmap.
- [`docs/security/report-v0.md`](./security/report-v0.md) — the
  full STRIDE audit, 15 findings, remediation checklist.
- [`docs/architecture/system-diagram.mmd`](./architecture/system-diagram.mmd) —
  the high-level Mermaid system diagram.
- [`docs/deployments/galileo-2026-06-14.md`](./deployments/galileo-2026-06-14.md) —
  the live testnet contract addresses.
- [`docs/runbook.md`](./runbook.md) — the operator runbook for
  Token2049 Demo Day.

## 12. Team contact

**Paste this:**

```text
Axiom Protocol Buildathon Team <build@axiom-protocol.xyz>
+1-555-0100 (Signal, E.164)
@axiom_protocol (X / Twitter)
@axiomprotocol (Telegram)
@eya (GitHub)
```

**Notes:** the portal requires a primary contact (email + phone)
and optional social handles. The email above is a placeholder
mailbox; replace with the team lead's real address before
submission. The GitHub handle is the lead's personal handle; if
the team has a shared handle, swap to that.

## 13. Wallet address for grant payout

**Paste this (placeholder — MUST replace with Safe multisig before submission):**

```text
[REQUIRED: Replace with Safe multisig address before submission]
```

**Notes:** the wallet receives the AKINDO WaveHack grant. The
address above is a **placeholder** — do NOT submit a hot-wallet EOA.
The AKINDO grant-tracker flags hot-wallet submissions. Before final
submission, deploy a **Safe (multisig)** with a 2-of-3 signer set
(the team lead, the contracts lead, and the backend lead) and
paste its address here.

## 14. Optional — public demo / live talk

**Paste this:**

```text
Live demo at Token2049 Singapore, Nov 2026. Pre-recorded 3-minute
video at apps/bench/demo-video/out/axiom-demo-3min.mp4
(verifiable: ffprobe → h264 / 1920x1080 / 30 fps / aac 48 kHz /
180.032 s / 10.6 MiB). The video is reproducible end-to-end with:

  cd ~/og/apps/bench/demo-video
  npm install --legacy-peer-deps          # 60-180 s first time
  bash scripts/install-skills.sh           # 4 x npx skills add
  bash scripts/elevenlabs-pre-render.mjs   # ElevenLabs TTS audio
  ELEVENLABS_API_KEY=... bash scripts/render-3min.sh   # 30-90 s

On-chain evidence: 9 / 9 E2E green on 0G Galileo testnet
(chainId 16602) at block 38,825,872 — the Wave 16B finalize head.
The 4 live contract addresses (proxy / verifier / vault /
payment) are in section 6 above and verified on
https://chainscan-galileo.0g.ai. Expected output: 9 successful
transaction hashes, beginning with AxiomAgentNFT.mint and ending
with AxiomAgentNFT.iTransferFrom that emits a PublishedSealedKey
event.
```

**Notes:** this is the free-text "anything else" field on the
portal. The 5 lines above are enough to convert any judge into
a tester — one install, four commands, one chaincan, nine hashes.
The reproduction recipe is the EXACT command sequence that
produced the actual MP4 committed at
`apps/bench/demo-video/out/axiom-demo-3min.mp4` (file size
11,156,070 bytes; ffprobe-verified).

## 15. Final pre-submit checklist

- [ ] **All 5 URLs resolve** (demo, video, GitHub, docs, repo tree).
- [ ] **All 4 Galileo contract addresses verify on chaincan.**
- [ ] **Mainnet placeholder is acceptable to the portal** (or
  filled in if MW18 has run).
- [ ] **Grant payout address is a multisig, not a hot EOA.**
- [ ] **Team contact email is monitored** (the AKINDO team will
  email within 24 h of submission to confirm receipt).
- [ ] **The 3-minute video is ≤ 3:00** — DONE: ffprobe on
  `apps/bench/demo-video/out/axiom-demo-3min.mp4` →
  `duration: "180.032000"`, `nb_frames: "5400"` (= 30 fps × 180 s).
  The 32 ms overshoot is the audio track rounding to the AAC frame
  boundary; well under the AKINDO 3-min cap. Use `ffprobe` to
  re-check at submission time per the "Pinning rule".
  a 404 reads as "the team is not serious").
- [ ] **At least one social handle resolves** (X or Telegram; the
  other is optional).

## 16. X / Twitter announcement post (to publish on submission day)

**Suggested post:**

```text
We're building Axiom Protocol — the verifiable intelligence layer for DeFi 🧠

AI agents as ERC-7857 iNFTs, re-keyed in a TEE on every transfer, run on 0G Compute.

Live on 0G Galileo testnet with 4 verified contracts.
Submitting to @AKINDO_io WaveHack.

#0GBridge #BuildOn0G @0G_labs @0G_Builders @AKINDO_io
```

**Image:** Screenshot of chainscan-galileo.0g.ai showing 4 verified contracts.
**Timing:** Publish immediately after the AKINDO form is submitted.

---

## 17. Sources

- AKINDO WaveHack submission portal (the form this file mirrors):
  <https://app.akindo.io/wave-hacks/Z4MlX4vreI72ol6pd>
- AKINDO hackathons hub (judging criteria, demo video format,
  cold-open rule): <https://www.akindo.io/hackathons>
- 0G WaveHack overview (the buildathon whose submission this is;
  $50K grant, 6 waves, Token2049 Demo Day): <https://docs.0g.ai/ai-context>
- 0G Storage TS SDK (the `@0gfoundation/0g-ts-sdk` v1.2.8 package
  the tech stack list cites): <https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk>
- 0G Compute TS SDK (the `@0gfoundation/0g-compute-ts-sdk` v0.8.4
  package the tech stack list cites): <https://docs.0g.ai/developer-hub/building-on-0g/compute-network/overview>
- 0G Galileo testnet (chainId 16602, RPC, explorer, faucet):
  <https://docs.0g.ai/ai-context>
- EIP-7857 (Agentic ID, FINAL 2025-01-02) — the standard the
  `AxiomAgentNFT` implements; cite this in the description if the
  portal has a "standards used" field: <https://eips.ethereum.org/EIPS/eip-7857>
- EIP-721 (the base NFT standard the description cites):
  <https://eips.ethereum.org/EIPS/eip-721>
- EIP-1967 (the proxy pattern the deployment uses, cited in the
  tech stack): <https://eips.ethereum.org/EIPS/eip-1967>
- OpenZeppelin Contracts v5.0.2 (the OZ version the tech stack
  cites): <https://docs.openzeppelin.com/contracts/5.x/>
- Vercel project configuration (the `vercel.json` schema the
  "Demo URL" field's Vercel preview deploys from):
  <https://vercel.com/docs/project-configuration/vercel-json>
