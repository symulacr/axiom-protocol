# Axiom Protocol v1.0.0 — Release Notes

> **Tag:** `v1.0.0`
> **Date:** 2026-11-15
> **Buildathon:** 0G WaveHack (Aug 14 – Nov 15, 2026; six waves; $50,000
> grant pool; run by 0G Labs and AKINDO). Demo Day at Token2049 Singapore,
> early November 2026.
> **Submission portal:** <https://app.akindo.io/wave-hacks/Z4MlX4vreI72ol6pd>
> **Live demo:** `https://beta.axiom-protocol.xyz`
> **Recording:** `https://beta.axiom-protocol.xyz/demo/axiom-demo-3min.mp4`
> **Full security report:** [`docs/security/report-v0.md`](./security/report-v0.md)
> **Operator runbook:** [`docs/runbook.md`](./runbook.md)

This is the **1.0.0** release. The protocol is live on 0G Galileo
testnet; the Aristotle mainnet deploy is staged behind the
`DeployAristotle.s.sol` script and gated on the post-Wave-4 audit
remediations listed below.

---

## What's shipping in v1.0.0

### Smart contracts (4 deployed, 1 critical security fix landed)

The four contracts below are live on 0G Galileo testnet (chainId
16602, RPC `https://evmrpc-testnet.0g.ai`, explorer
`https://chainscan-galileo.0g.ai`). Addresses are pinned in
[`docs/deployments/galileo-2026-06-14.md`](./deployments/galileo-2026-06-14.md).

| Contract                | Address                                        | Bytes | LoC | UUPS? | Role-gated? |
|-------------------------|------------------------------------------------|------:|----:|------:|-------------|
| `AxiomTeeVerifier`      | `0xE0D0F346Aa5dF8Ae86D46138Aa64950Ba5383Bb2`  | ~3 KB | 130 | n/a   | `registerSigner` (now `onlyOwner`, see F-01 fix below) |
| `AxiomAgentNFT` (impl)  | `0x00F476D8B3B56Af52a4c9dca14c4e1da3f145D55`  | ~20 KB | 196 | yes (see F-02 fix below) | `AccessControl` + `Pausable` |
| `AxiomAgentNFT` (proxy) | `0x61D0390577A6c3a37d91B307C5fCbb77A8A883E2`  | ~0.1 KB | n/a | inherits | inherits |
| `AxiomStrategyVault`    | `0x0b7226087e06A759015903590f0945F6673E70ea`  | ~3 KB | 180 | no    | `Ownable` + `Pausable` + `ReentrancyGuard` |
| `AxiomPaymentProcessor` | `0xEf1bA81ba3A9c37a3A6efF46BB2B029d4068fd8D`  | ~3 KB | 176 | no    | `Ownable` + `Pausable` + `ReentrancyGuard` |

ERC-7857 interface compliance is the canonical shape from
<https://eips.ethereum.org/EIPS/eip-7857> and the 0G Labs reference
implementation at <https://github.com/0gfoundation/0g-agent-nft>.
`AxiomAgentNFT` composes `AccessControlUpgradeable +
ReentrancyGuardUpgradeable + PausableUpgradeable +
ERC7857CloneableUpgradeable + ERC7857AuthorizeUpgradeable +
ERC7857IDataStorageUpgradeable + UUPSUpgradeable` (the
`UUPSUpgradeable` was added in the F-02 fix). All storage slots are
ERC-7201-derived and namespaced per the OpenZeppelin v5.x upgradeable
guide at <https://docs.openzeppelin.com/contracts/5.x/upgradeable>.

### Three security fixes landed for v1.0.0

The full STRIDE-classified audit is in
[`docs/security/report-v0.md`](./security/report-v0.md) (15 findings:
**1 Critical, 5 High, 4 Medium, 5 Low**). The three findings below
were the pre-mainnet blockers and are fixed in v1.0.0:

- **F-01 — `AxiomTeeVerifier.registerSigner` was callable by anyone
  (CRITICAL).** The function doc-comment promised `onlyOwner`, but
  the implementation had no modifier — any EOA on the chain could
  overwrite the registered TEE signer and forge `OwnershipProof`s
  for every iNFT in the collection. **Fix:** `AxiomTeeVerifier` now
  inherits `Ownable` and the function is gated by `onlyOwner`; a
  regression test (`test_registerSigner_revertNotOwner`) is
  committed in `apps/contracts/test/AxiomTeeVerifier.t.sol`. The
  deployer ownership is queued for transfer to a 2-of-3 Safe before
  the MW18 mainnet cutover, per the OZ `Ownable2Step` pattern at
  <https://docs.openzeppelin.com/contracts/5.x/access-control#ownership-ownable2step>.
- **F-02 — `AxiomAgentNFT` was deployed behind an ERC-1967 proxy
  but had no upgrade mechanism (HIGH — design drift).** The
  implementation declared `_disableInitializers()` and used
  ERC-7201 storage, but did not inherit `UUPSUpgradeable`, so the
  proxy was effectively non-upgradeable in practice. **Fix:** added
  `import {UUPSUpgradeable} from
  "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";`
  to the inheritance list and overrode
  `_authorizeUpgrade(address) internal override onlyRole(ADMIN_ROLE)
  {}` so future bug-fixes, verifier rotations, and fee adjustments
  can ship without a contract migration. Storage layout verified to
  not collide with the existing ERC-7201 slot
  `0x4aa80aaafbe0e5fe3fe1aa97f3c1f8c65d61f96ef1aab2b448154f4e07594600`
  (OZ's `UUPSUpgradeable` uses ERC-1967 storage only — see the OZ
  v5.x upgradeable guide cited above).
- **F-10 — `AxiomPaymentProcessor.payForAgent` and
  `withdrawAgentEarnings` did not move tokens on-chain
  (HIGH — ship-blocker).** The functions emitted events but
  performed no `transferFrom` / `safeTransferFrom`; the original
  `withdrawAgentEarnings` then attempted to pay out native ETH,
  which would revert for every creator with a non-zero balance.
  **Fix:** new `payForAgentWithToken(agentTokenId, token, amount)`
  function performs `IERC20(token).safeTransferFrom(msg.sender,
  address(this), amount)` and a new `withdrawAgentEarningsToken(token)`
  function performs `safeTransfer(creator, balance)`. The
  event-only `payForAgent` is preserved (gated on `whenNotPaused`)
  for the closed-beta UX where USDC settlement is off-chain. The
  0G Payment Layer reference at <https://docs.0g.ai/ai-context> (the
  `Compute Ledger` contract) is the canonical place to pull funds
  into a contract; the wired extension composes with that path.

> The full remediation checklist (with the post-mainnet hardening
> backlog: F-03 / F-04 / F-06 / F-07 / F-08 / F-09 / F-11 through
> F-15) is in `docs/security/report-v0.md` § 4. Each fix is paired
> with a `forge test` regression and a `slither` re-run.

### Frontend (Vite + React 18 + wagmi v2 + RainbowKit v2)

- `apps/frontend` — Vite + React 18 + TypeScript SPA. Routes
  `/`, `/agents`, `/agents/:id`, `/vault/:id`, `/market`, `/history`,
  `/settings`. wagmi v2 config registers 0G Galileo (chainId 16602)
  and 0G Aristotle (chainId 16661) as `defineChain`-defined custom
  chains from `viem/chains` per
  <https://wagmi.sh/react/guides/chain-properties>. RainbowKit v2
  with the SSR-safe `getDefaultConfig` pattern. All blockchain reads
  and writes go through wagmi hooks in the browser; the long-lived
  Node backend (broker, oracle, WebSocket) lives on Fly.io, NOT
  Vercel.
- `apps/frontend/vercel.json` — Vercel project configuration per
  <https://vercel.com/docs/project-configuration/vercel-json>:
  `framework: "vite"`, `outputDirectory: "dist"`, `regions: ["iad1"]`
  (US-East, co-located with the Galileo RPC), SPA rewrite
  `[{ "source": "/(.*)", "destination": "/index.html" }]`, and
  immutable `Cache-Control` on `/assets/*`.
- `apps/frontend/src/components/HealthBadge.tsx` — 30-second poll of
  the backend's `/v1/health`; renders a green/red dot next to the
  ConnectButton. Uses `AbortController` + interval cleanup per
  MDN's [`fetch` API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch).
- `apps/frontend/.env.vercel.example` — the `VITE_API_URL`,
  `VITE_WC_PROJECT_ID`, `VITE_CHAIN_ID` template for the Vercel
  dashboard. The `VITE_` prefix is required per the Vite env-var
  convention; `NEXT_PUBLIC_` does not apply (Next.js only).
- `apps/frontend/vercel-deploy.md` — the deploy runbook: pre-reqs,
  env-var table, deploy commands, post-deploy verification curls
  (root, /agents, /market, /history, /settings, the bundle asset,
  /v1/health), rollback, and troubleshooting.

### Indexer (long-lived Node 22 process on Fly.io)

- `apps/indexer` — polls 0G Galileo for events on `AxiomAgentNFT`
  (proxy `0x61D0…83E2`) and `AxiomStrategyVault`
  (`0x0b72…70ea`) via `viem.watchEvent`. Decodes the ERC-721
  `Transfer`, the ERC-7857 `Updated` / `PublishedSealedKey` / etc.,
  and the vault's `Deposited` / `Withdrawn` / `StrategySet` /
  `Executed` events. Prints one NDJSON object per line to stdout;
  status / lifecycle lines go to stderr so downstream consumers
  (jq, vector, log brokers) can parse stdout cleanly.
- Watches the full event set on the live addresses per
  `apps/indexer/README.md`. Event signatures are byte-for-byte
  identical to the Solidity source, with cross-references to
  EIP-721 (<https://eips.ethereum.org/EIPS/eip-721>) and EIP-7857
  (<https://eips.ethereum.org/EIPS/eip-7857>).
- 0G DA integration is staged for MW17 (event-to-DA submission via
  the orchestrator + 0G DA Client gRPC sidecar per
  <https://docs.0g.ai/developer-hub/building-on-0g/da-integration>;
  gRPC port 51001, max blob 32 505 852 B, per-blob proto limit
  31 744 KiB per the DA example proto).

### Bench scripts (k6 load tests, run from `apps/bench`)

- `apps/bench/scripts/orchestrator-tick.js` — `POST
  /v1/orchestrator/tick` at 50 RPS, 200 VUs, 60 s; thresholds
  `http_req_failed<0.01` and `p(95)<2000` ms. Executor:
  `constant-arrival-rate` (the k6 open-model idiom for a fixed-RPS
  target — see
  <https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/constant-arrival-rate/>).
  The full v0 result table for this script is in
  [`docs/bench/orchestrator-tick-v0.md`](./bench/orchestrator-tick-v0.md).
- `apps/bench/scripts/health.js` — `GET /health` at 100 RPS, 100
  VUs, 30 s; thresholds `http_req_failed<0.01` and `p(95)<200` ms.
- `apps/bench/scripts/transfer.js` — `POST /v1/agents/0/transfer`
  at 10 RPS, 10 VUs, 30 s; thresholds `http_req_failed<0.05` and
  `p(95)<3000` ms.
- `apps/bench/README.md` — the k6 install matrix (Homebrew / apt
  / Docker stdin pipe), the three invocation forms (k6 binary,
  custom env, Docker without mount), and the typecheck helper. The
  k6 binary is intentionally **not** an npm dep; it's a native
  binary per the k6 install guide at
  <https://grafana.com/docs/k6/latest/set-up/install-k6/>.

### Security report

- [`docs/security/report-v0.md`](./security/report-v0.md) — the
  full audit. STRIDE-classified across every externally-callable
  function on all four contracts. 15 findings: 1 Critical
  (`registerSigner` — fixed F-01), 5 High (F-02 UUPS drift, F-03
  EIP-712 binding, F-04 MEV front-run, F-10 `payForAgent` no
  on-chain transfer, F-12 cross-contract replay), 4 Medium
  (F-05 / F-06 / F-07 / F-08), 5 Low (F-09 / F-11 / F-13 / F-14 /
  F-15). Each finding cites `file:line` and a canonical source
  (OpenZeppelin v5.x, EIP-721, EIP-712, EIP-7857, the 0G Labs
  reference, the 0G deploy guide, the Microsoft STRIDE threat
  model, the OWASP Smart Contract Top 10 2025, and the Carter-Perez
  Blockchain Smart Contract Auditor syllabus). The remediation
  checklist in § 4 is the v1.0.0 release gate.

---

## Micro-waves included in v1.0.0

The buildathon's six outer waves are split into 20 inner
micro-waves. The seven micro-waves below are the ones whose
deliverables ship in v1.0.0. The remaining 13 micro-waves (Waves
4–6 plus the closed/open beta) are tracked separately.

| # | Wave       | Deliverable                                                | Status |
|---|------------|------------------------------------------------------------|--------|
| 1 | MW2        | Foundry + Hardhat workspaces (`foundry.toml`, `remappings.txt`, OZ v5.0.2) | shipped |
| 2 | MW3        | Brand docs (`axiom-narrative.md`, `pitch-outline.md`, `tokenomics-v0.md`) + system diagram | shipped |
| 3 | MW4–MW5    | ERC-7857 interfaces + extensions + `AxiomAgentNFT` + `AxiomTeeVerifier` (with the F-01 and F-02 fixes) | shipped |
| 4 | MW6        | `AxiomStrategyVault` + `AxiomPaymentProcessor` (with the F-10 fix) | shipped |
| 5 | MW7        | Foundry test suite (200+ tests; `slither` clean against the F-01 / F-02 / F-10 fixes) | shipped |
| 6 | MW8        | Deploy to 0G Galileo testnet (4 contracts live, verified on chaincan) | shipped |
| 7 | MW19       | Performance baselines + closed beta (`apps/bench`, `docs/bench/orchestrator-tick-v0.md`, Vercel preview at `beta.axiom-protocol.xyz`) | shipped |

The full plan (20 micro-waves inside 6 buildathon waves) lives at
`local://axiom-protocol-buildathon-plan.md` in the build session.

---

## What's deferred to a v1.x release

- **F-03 / F-04 / F-12** — EIP-712 typed-data signing in
  `AxiomTeeVerifier` with `verifyingContract` and `to` binding. Same
  fix unblocks all three (cross-chain replay, MEV front-running, and
  cross-contract replay respectively). The off-chain oracle in
  `apps/oracle` will need to be updated to issue EIP-712 typed data;
  see the OpenZeppelin v5.x `EIP712` base contract at
  <https://docs.openzeppelin.com/contracts/5.x/api/utils#EIP712>.
- **F-05** — two-step signer rotation (a `registerSigner` →
  `acceptSigner` pattern similar to OZ `Ownable2Step`) plus a
  `TimelockController` with 24 h delay on the verifier admin for
  mainnet, per the OZ v5.x
  [`TimelockController`](https://docs.openzeppelin.com/contracts/5.x/api/governance#TimelockController)
  API.
- **F-06** — add `nonReentrant` to `iCloneFrom` and override
  `iTransferFrom` with `nonReentrant` on `AxiomAgentNFT` (the
  underlying `ERC7857Upgradeable` is meant to be reused, so the
  override is the cleanest place).
- **F-07** — add a `perTargetDailyLimit` and a `target` allowlist to
  `AxiomStrategyVault.execute`.
- **F-08 / F-09** — set a non-zero `mintFee` in `initialize` and cap
  `iDatas.length` to 32 (matches the EIP-7857 example limit).
- **F-11 / F-13 / F-15** — informational hardening (refactor
  `authorizedUsers` to a flat mapping; add a length cap to
  `cleanExpiredProofs`; add a NatSpec banner reminding maintainers
  to keep `nonReentrant` uniform).

---

## Verification

```bash
# 1. Compile and test
cd ~/og
pnpm i
pnpm -r run typecheck
pnpm -r run lint
cd apps/contracts && forge build && forge test -vv
cd apps/contracts && slither . --detect-insecure-structs \
  --detect-uninitialized-state --filter-medium-high

# 2. End-to-end (9 steps, 9 tx hashes, all on Galileo)
cd ~/og
pnpm -F @axiom/backend run-e2e -- --network galileo

# 3. Load test (k6 binary required)
cd ~/og
pnpm -F @axiom/bench bench:tick
pnpm -F @axiom/bench bench:health
pnpm -F @axiom/bench bench:transfer

# 4. Live deployment check
curl -I https://beta.axiom-protocol.xyz
curl -s https://beta.axiom-protocol.xyz/v1/health | jq
```

Expected: zero errors, `forge test` returns 0, the E2E prints 9
successful transaction hashes visible on
<https://chainscan-galileo.0g.ai>, the k6 summary shows
`http_req_failed: 0.00%`, the Vercel preview returns 200 OK, and
the backend health check returns `{ "ok": true }`.

---

## Credits

- 0G Labs for the WaveHack, the AKINDO portal, and the
  `0gfoundation/0g-ts-sdk` and `0g-compute-ts-sdk` reference SDKs.
- AKINDO for the submission flow and the Demo Day venue at
  Token2049 Singapore.
- The 0G Labs reference implementation
  <https://github.com/0gfoundation/0g-agent-nft> for the canonical
  ERC-7857 contract shapes (MIT; the GPL-3.0 `IERC7857.sol` was
  re-implemented from scratch under our own MIT header).
- OpenZeppelin for the v5.x contracts and upgradeable patterns
  (<https://docs.openzeppelin.com/contracts/5.x/>).
- EIP-7857 (Agentic ID, FINAL 2025-01-02) for the interface, the
  proof shapes, and the security-considerations guidance:
  <https://eips.ethereum.org/EIPS/eip-7857>.

---

## Sources

- AKINDO WaveHack submission portal (where this release's demo URL
  and team contact are pinned):
  <https://app.akindo.io/wave-hacks/Z4MlX4vreI72ol6pd>
- AKINDO hackathons hub (demo video format, judging criteria):
  <https://www.akindo.io/hackathons>
- 0G Labs AI Coding Context (chain IDs, contract addresses, RPC
  URLs, full stack reference):
  <https://docs.0g.ai/ai-context>
- 0G Storage SDK (`@0gfoundation/0g-ts-sdk` v1.2.8):
  <https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk>
- 0G Compute SDK (`@0gfoundation/0g-compute-ts-sdk` v0.8.4):
  <https://docs.0g.ai/developer-hub/building-on-0g/compute-network/overview>
- 0G DA integration (gRPC port 51001, max blob 32 505 852 B):
  <https://docs.0g.ai/developer-hub/building-on-0g/da-integration>
- 0G deploy guide (`evmVersion: "cancun"`, solc 0.8.20):
  <https://docs.0g.ai/developer-hub/building-on-0g/contracts-on-0g/deploy-contracts>
- 0G Labs ERC-7857 reference implementation:
  <https://github.com/0gfoundation/0g-agent-nft>
- EIP-7857 (Agentic ID, FINAL 2025-01-02):
  <https://eips.ethereum.org/EIPS/eip-7857>
- EIP-721 (Non-Fungible Token Standard):
  <https://eips.ethereum.org/EIPS/eip-721>
- EIP-712 (Typed structured data signing):
  <https://eips.ethereum.org/EIPS/eip-712>
- EIP-1967 (UUPS proxy pattern):
  <https://eips.ethereum.org/EIPS/eip-1967>
- OpenZeppelin Contracts v5.0.2 (UUPSUpgradeable, Ownable2Step,
  TimelockController, EIP712, ReentrancyGuard):
  <https://docs.openzeppelin.com/contracts/5.x/>
- Vercel project configuration (`vercel.json` schema, SPA rewrite,
  regions):
  <https://vercel.com/docs/project-configuration/vercel-json>
- Vite env-var convention (`VITE_` prefix):
  <https://vitejs.dev/guide/env-and-mode>
- k6 metrics reference (built-in metrics, types, summary output):
  <https://grafana.com/docs/k6/latest/using-k6/metrics>
- k6 `constant-arrival-rate` executor:
  <https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/constant-arrival-rate/>
- Microsoft STRIDE threat model:
  <https://learn.microsoft.com/en-us/security/engineering/threat-modeling-aiml>
- OWASP Smart Contract Top 10 (2025):
  <https://owasp.org/www-project-smart-contract-top-10/>
- Carter-Perez "Blockchain Smart Contract Auditor" syllabus:
  <https://github.com/CarterPerez-dev/Cybersecurity-Projects/blob/main/SYNOPSES/advanced/Blockchain.Smart.Contract.Auditor.md>
- Full STRIDE-classified audit (15 findings, the F-01 / F-02 / F-10
  fixes in § 4 of this release):
  [`docs/security/report-v0.md`](./security/report-v0.md)
- Live Galileo deployment (the 4 contract addresses, all on
  chaincan):
  [`docs/deployments/galileo-2026-06-14.md`](./deployments/galileo-2026-06-14.md)
- Operator runbook for Token2049 Demo Day:
  [`docs/runbook.md`](./runbook.md)
- 3-minute live demo script:
  [`docs/demo-script.md`](./demo-script.md)
- 3-minute demo storyboard (one frame per 5 s):
  [`docs/demo-script-frames.md`](./demo-script-frames.md)
- AKINDO submission form fields:
  [`docs/submit-akindo.md`](./submit-akindo.md)
- k6 baseline result for `POST /v1/orchestrator/tick`:
  [`docs/bench/orchestrator-tick-v0.md`](./bench/orchestrator-tick-v0.md)
