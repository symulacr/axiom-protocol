# Axiom Protocol — Documentation Index

Welcome to the Axiom Protocol documentation directory. This folder contains the architectural specifications, threat models, deployment logs, and presentation assets for the verifiable DeFi intelligence layer.

---

## 📂 Directory Structure

Below is a map of the documentation files categorized by feature area.

### 📌 Living documents (tracked in git)

* [current-state.md](current-state.md) — Code-truth snapshot: architecture, networks, auth model, what works today.
* [oracle-api.md](oracle-api.md) — In-process TEE Signer API (ownership + access proofs, rekey).
* [env-vars.md](env-vars.md) — Comprehensive guide to environment variable configurations for all monorepo apps.
* [deployments/](deployments/) — On-chain deployment records (JSON + notes). Current: `galileo-merged-2026-08-13.json`.
* [assets/](assets/) — Banner + logo images used by the root README.

### 🏛️ Architecture & System Design (local, historical)

* [architecture/sequence-diagram.md](architecture/sequence-diagram.md) — E2E lifecycle (Mint, Execute, Transfer) across the User, Frontend, Backend, TEE Oracle, and 0G Chain.
* [architecture/on-chain-patterns.md](architecture/on-chain-patterns.md) — Implementation details of the ERC-7857 iNFT and the `AxiomStrategyVault`.

### 🛡️ Security (local, historical)

* [security/report-v0.md](security/report-v0.md) — Threat model and STRIDE-classified security findings.

### 🎨 Brand & Economics (local, historical)

* [brand/axiom-narrative.md](brand/axiom-narrative.md) — Core value proposition, problem space, and target audience.
* [brand/tokenomics-v0.md](brand/tokenomics-v0.md) — Economic flows, deflationary sinks, and distribution models for the AXM utility token.

### 🎤 Demos & Presentations (local, historical)

* [brand/pitch-outline.md](brand/pitch-outline.md) — The 3-minute presentation pitch deck outline for Token2049 Singapore Demo Day.
* [demo-script.md](demo-script.md) — Action-by-action presentation script with real contract execution calls.
* [demo-script-frames.md](demo-script-frames.md) — Frame-by-frame storyboard matching the demo narration to UI changes.
* [submit-akindo.md](submit-akindo.md) — Form field mapping and metadata for the AKINDO WaveHack buildathon portal.

### 📖 API reference

The backend HTTP surface is specified by the generated OpenAPI spec at
[`apps/backend/docs/openapi.json`](../apps/backend/docs/openapi.json) (regenerate via
`apps/backend/scripts/generate-openapi.mjs`); a live route listing is available at
`GET /v1/routes` when the server is up. The oracle surface is documented in
[oracle-api.md](oracle-api.md).

---

> [!NOTE]
> The living documents above (plus `deployments/` and `assets/`) are **tracked in git** via
> selective rules in the root `.gitignore`. Historical scratch docs (architecture/, brand/,
> refactor/, revamp/, review/, research/, security/, demo scripts) are intentionally kept
> local-only to keep the repository footprint light.
