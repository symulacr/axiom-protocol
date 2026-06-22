# Token2049 Demo Day — Operator Runbook

> **Audience:** the on-call engineer + the demo operator for the 0G WaveHack
> Demo Day at Token2049 Singapore (Nov 2026). Read this top-to-bottom at T-60min.
>
> **Scope:** how to bring the Axiom Protocol stack to a clean live demo against
> 0G Galileo testnet, how to talk through the 3-minute script, who to call when
> something breaks, and how to roll back if a smart-contract bug or oracle key
> compromise surfaces during the talk.
>
> **Submission flow:** <https://app.akindo.io/wave-hacks/Z4MlX4vreI72ol6pd>
> (0G WaveHack — AKINDO-hosted buildathon portal; this is where the
> pre-recorded video, live demo URL, and team contact are pinned before judging).
>
> **Network under test:** 0G Galileo testnet (chainId 16602,
> `https://evmrpc-testnet.0g.ai`). Live contract addresses are pinned in
> [`docs/deployments/galileo-2026-06-14.md`](./deployments/galileo-2026-06-14.md)
> and the in-room E2E reproduces the 9-step sequence in
> `apps/backend/src/cli/run-e2e.ts`.

---

## 1. Pre-demo checklist (T-60 min)

Run every box below, in order. The on-call is responsible for *closing the
loop*: if a check fails, fix the root cause, do not skip the check.

### 1.1 Local services

- [ ] **Oracle up** — `curl http://127.0.0.1:8787/health` returns
  `{"ok":true,"signer":"0x4373…2F91"}`. If not: `cd apps/oracle && pnpm dev`.
  The signer address MUST match the value in `docs/deployments/galileo-2026-06-14.md`
  under "TEE Signer"; a mismatch means the verifier will reject every proof.
- [ ] **Backend up** — `curl http://127.0.0.1:3000/health` returns `200 OK`.
  If not: `cd apps/backend && pnpm dev`. Backend logs must show
  `broker.acknowledgeProvider(0xa48f…7836) ok` — the canonical qwen-2.5-7b-instruct
  provider on 0G Galileo (see
  <https://docs.0g.ai/developer-hub/building-on-0g/compute-network/overview>).
- [ ] **Indexer polling** — `ps aux | grep -E 'apps/indexer'` is running and
  `tail -F apps/indexer/data/checkpoint.json` is advancing the block number.
  If not: `cd apps/indexer && pnpm dev`. Indexer README is at
  [`apps/indexer/README.md`](../../apps/indexer/README.md).

### 1.2 Network and contracts

- [ ] **0G RPC reachable** — `cast block-number --rpc-url https://evmrpc-testnet.0g.ai`
  returns a non-zero integer. Latency under 400 ms (Galileo is US-East hosted;
  see <https://docs.0g.ai/ai-context>). If unreachable, fall back to the cached
  `--rpc-url https://indexer-storage-testnet-turbo.0g.ai` only for reads —
  writes will fail.
- [ ] **All 4 contracts verified on Galileo** — run
  `apps/contracts/script/verify-galileo.sh` (or manually inspect each address on
  <https://chainscan-galileo.0g.ai>):
  - `AxiomTeeVerifier` at `0xE0D0F346Aa5dF8Ae86D46138Aa64950Ba5383Bb2`
  - `AxiomAgentNFT (proxy)` at `0x61D0390577A6c3a37d91B307C5fCbb77A8A883E2`
  - `AxiomStrategyVault` at `0x0b7226087e06A759015903590f0945F6673E70ea`
  - `AxiomPaymentProcessor` at `0xEf1bA81ba3A9c37a3A6efF46BB2B029d4068fd8D`
  Each MUST show the source on the explorer and a non-empty runtime bytecode
  (`cast code <addr> --rpc-url … | wc -c` ≥ 100).
- [ ] **Verifier state correct** —
  `cast call 0xE0D0…3Bb2 "registeredSigner()(address)" --rpc-url …`
  returns `0x437371dB1FBD534Bd01BD3f4E66DfA1675952F91` (matches the
  `wallets/deployer.json` key on testnet; production mainnet uses a Safe).

### 1.3 Tests and end-to-end

- [ ] **All 4 forge tests pass** — `cd apps/contracts && forge test -vv` returns
  green for `AxiomAgentNFT.t.sol`, `AxiomTeeVerifier.t.sol`,
  `AxiomStrategyVault.t.sol`, `AxiomPaymentProcessor.t.sol`. Zero failures.
- [ ] **Backend unit tests pass** — `pnpm -r run test` (excluding `@axiom/bench`,
  which needs the k6 binary) returns 0.
- [ ] **9/9 E2E pass** — `cd apps/backend && pnpm run-e2e -- --network galileo`
  prints nine successful transaction hashes in the form
  `0x<66 hex chars>` and a final line `E2E OK: 9/9 steps`. Every hash MUST be
  visible on <https://chainscan-galileo.0g.ai> within 30 s of the run. The 9
  steps (per `apps/backend/src/cli/run-e2e.ts`):
  1. Generate the TEE signer keypair
  2. Build the `StrategySpec` Merkle root
  3. Encrypt the model with AES-256-GCM client-side
  4. `AxiomAgentNFT.mint` (paid)
  5. `AxiomStrategyVault.deposit` (native)
  6. `AxiomStrategyVault.setStrategy(root, dailyLimit)`
  7. `StrategyRunner.runOnce` (compute + `execute`)
  8. `AxiomAgentNFT.iTransferFrom` (with two real signatures)
  9. Print the on-chain explorer links for all of the above

### 1.4 Demo assets

- [ ] **Vercel preview reachable** — `curl -I https://beta.axiom-protocol.xyz`
  returns `200 OK`; the SPA rewrite rule from
  [`apps/frontend/vercel.json`](../../apps/frontend/vercel.json) sends every
  non-asset path to `/index.html` so React Router routes work on a hard
  refresh. See <https://vercel.com/docs/project-configuration/vercel-json>.
- [ ] **Demo wallet funded** — the operator's MetaMask on the demo laptop
  holds at least 5 OG on Galileo and is connected to
  `https://evmrpc-testnet.0g.ai` (chainId 16602 = `0x40DA`).
- [ ] **Demo script rehearsed** — [`docs/demo-script.md`](./demo-script.md)
  read through once aloud with the operator; timing per the
  [`docs/demo-script-frames.md`](./demo-script-frames.md) timeline; backup
  video file at `apps/demo/axiom-demo-3min.mp4` (recorded against the same
  addresses, playable offline if the network dies).
- [ ] **AKINDO submission form filled** — see
  [`docs/submit-akindo.md`](./submit-akindo.md). Demo URL and GitHub URL
  are pinned before the talk so judges can click through.

---

## 2. Live-demo script (the 3 minutes on stage)

> The complete frame-by-frame storyboard (one row per 5 s) lives in
> [`docs/demo-script-frames.md`](./demo-script-frames.md). The condensed
> time-coded script — what the operator *says* and *clicks* — is in
> [`docs/demo-script.md`](./demo-script.md). The format follows the
> AKINDO hackathon video brief at <https://www.akindo.io/hackathons>.

The on-stage flow has four movements that map to four on-screen regions:

| Time      | Movement     | Screen          | Key contract call                      | Visible on chain              |
|-----------|--------------|-----------------|----------------------------------------|-------------------------------|
| 0:00–0:30 | Hook         | Landing page    | `cast block-number` on Galileo         | explorer header               |
| 0:30–1:30 | Wallet+mint  | `/agents`       | `AxiomAgentNFT.mint` (paid)            | `Transfer(0x0, operator)`     |
| 1:30–2:30 | TEE re-key   | `/agents/:id`   | `AxiomAgentNFT.iTransferFrom`          | `PublishedSealedKey` event    |
| 2:30–3:00 | Summary      | `/` + chaincan  | `cast code <verifier>`                 | 4 contract cards              |

If the live network stalls during movements 2 or 3, fall back to the pre-recorded
video (button is on the operator's second laptop). Do **not** stop the timer;
the recording plays in real time over the live stage screen.

---

## 3. On-call contacts

> **Paging policy:** page once via Signal, then once via SMS. Do not call
> voice. If the on-call is the demo operator themselves, page the second
> on-call (Team Lead) directly.

| Role            | Person     | Signal     | Phone (E.164) | When to page                                |
|-----------------|------------|------------|---------------|---------------------------------------------|
| Demo operator   | TBA        | TBA        | TBA           | (you) — keep this column blank until names are assigned |
| Team Lead       | TBA        | TBA        | TBA           | any rollback decision; any contract pause  |
| Contracts lead  | TBA        | TBA        | TBA           | verifier/nft revert, failed forge test     |
| Backend lead    | TBA        | TBA        | TBA           | oracle health 5xx, broker disconnect       |
| 0G Discord mods | @0g_mods   | Discord    | n/a           | 0G Galileo RPC outage, Faucet dry           |
| AKINDO support  | @akindo_io | Discord `#hackathons` | n/a | submission portal 4xx/5xx, judging clock |

> **Escalation clock:** T+0 = the moment a check fails. The on-call has
> 2 min to acknowledge on Signal. If no ack in 2 min, page the Team Lead.
> If the Team Lead is also unresponsive in 2 min, the operator switches to
> the pre-recorded video and continues.

---

## 4. Rollback plan

> The reference for every path below is the 0G deploy guide
> (<https://docs.0g.ai/developer-hub/building-on-0g/contracts-on-0g/deploy-contracts>)
> and the security report at
> [`docs/security/report-v0.md`](./security/report-v0.md). The pre-mainnet
> blockers F-01 (`registerSigner` public — `AxiomTeeVerifier.sol:56-62`) and
> F-10 (`payForAgent` no on-chain token transfer) are tracked there; on
> testnet, neither blocks a live demo because testnet funds are valueless.

### 4.1 Tier 1 — service rollback (no chain impact)

**Trigger:** oracle, backend, or indexer crashes; no on-chain state affected.

- **Oracle:** `pkill -SIGTERM -f 'apps/oracle'`; restart with `cd apps/oracle && pnpm dev`.
  State file at `apps/oracle/data/state.json` is durable (debounced writes);
  no replay needed.
- **Backend:** `pkill -SIGTERM -f 'apps/backend'`; restart with `cd apps/backend && pnpm dev`.
  WebSocket clients reconnect on the next tick.
- **Indexer:** `pkill -SIGTERM -f 'apps/indexer'`; restart with `cd apps/indexer && pnpm dev`.
  Resume from the checkpointed `nextBlock` in `apps/indexer/data/checkpoint.json`.
- **Frontend:** `vercel rollback` from the Vercel dashboard (the previous
  deployment is one click away; see
  <https://vercel.com/docs/project-configuration/vercel-json>). No DNS
  changes, no Vercel Functions to drain.

### 4.2 Tier 2 — soft contract pause (chain impact: mints/transfers frozen)

**Trigger:** active exploit, griefing, or unknown revert that threatens user
funds. We have ~5 min to act before the audience notices.

- **Pause the NFT:** the on-call submits, from the operator-admin EOA
  (`wallets/oracle-admin.json` on testnet, the Safe on mainnet):
  ```bash
  cast send 0x61D0390577A6c3a37d91B307C5fCbb77A8A883E2 \
    "pause()" --rpc-url https://evmrpc-testnet.0g.ai --private-key $ADMIN_PK
  ```
  This freezes `mint`, `update`, `iTransferFrom`, and `iCloneFrom` via the
  `Pausable` modifier in `AxiomAgentNFT.sol`. Does NOT pause the vault or
  the payment processor (those are `Ownable`; pause needs a separate tx).
- **Pause the vault:** same shape, target `0x0b72…70ea` and call
  `pause()`. Freezes `deposit` and `setStrategy`; `withdraw` and `execute`
  stay open so users can exit.
- **Pause the payment processor:** same shape, target `0xEf1b…fd8D` and
  call `pause()`. Freezes `payForAgent` and `payComputeProvider`.
- **Announce:** type the pause into the AKINDO Discord `#hackathons`
  channel and the 0G Discord `#build-log` channel; pin the message; link
  the tx hash on <https://chainscan-galileo.0g.ai>.

### 4.3 Tier 3 — key compromise (rotates trust)

**Trigger:** oracle key or admin key leaked. Last-resort circuit breaker.

- **Rotate the TEE signer:** the operator submits
  `registerSigner(0x000000000000000000000000000000000000dEaD)` (or any
  other address). From the next block, every future `OwnershipProof` is
  rejected with `AxiomInvalidSigner()` (see `AxiomTeeVerifier.sol:60`).
  In-flight transfers revert; pending mints still pass. The old key is
  useless.
- **Renounce the verifier owner:** if the admin key itself is compromised,
  `renounceOwnership()` on the verifier burns the only path to `registerSigner`.
  The verifier is then permanently pinned to whatever signer was last
  registered. **This is irreversible** — do it only if the admin key is
  untrusted and a hardware migration is in flight.
- **Front-end revert:** Vercel rollback (Tier 1) to a known-good deployment;
  the UI now refuses to send transactions against the dead signer.

### 4.4 Tier 4 — full abandon (only if Galileo itself is compromised)

**Trigger:** 0G Galileo chain halts, RPC dies for the demo window, or the
contract addresses are re-orged out of existence.

- Switch the demo to the pre-recorded video file `apps/demo/axiom-demo-3min.mp4`.
- Continue the talk from the on-stage mic: talk through the 9-step E2E
  as if the screen were live, citing the explorer links from
  [`docs/deployments/galileo-2026-06-14.md`](./deployments/galileo-2026-06-14.md).
- Submit the demo URL field on AKINDO with a note:
  *"Live demo at Token2049 fell back to a pre-recorded run against the same
  contract addresses on 0G Galileo testnet (chainId 16602) due to an
  in-room network outage. Recording: `<url>`. Reproduce with
  `pnpm -F @axiom/backend run-e2e -- --network galileo`."*

---

## 5. Post-demo checklist (T+5 min)

- [ ] **Re-confirm 4 contracts still verified on Galileo** — same script as
  §1.2. A re-org during the talk is unlikely but cheap to detect.
- [ ] **Stop the oracle, backend, indexer** — `pkill -SIGTERM` on each
  process group. The Fly.io machines (production target) handle this on
  `SIGTERM` via the Express `server.close()` and the WS drain; on the
  demo laptop, plain `pkill` is fine.
- [ ] **Archive logs** — `cp -r apps/{oracle,backend,indexer}/data/logs/ ~/og/logs/demo-$(date +%Y%m%d)/`.
  Tar and ship to S3 (or a shared drive) so the postmortem has them.
- [ ] **Pin submission artefacts** — re-upload the video to the AKINDO
  submission form, paste the tx hashes from the live E2E into
  [`docs/submit-akindo.md`](./submit-akindo.md), submit.
- [ ] **Open a postmortem** — even if nothing broke. The template is in
  `docs/operations/postmortem-template.md` (MW20).

---

## 6. Sources

- AKINDO WaveHack submission portal (the page the demo URL and team contact
  are pinned into): <https://app.akindo.io/wave-hacks/Z4MlX4vreI72ol6pd>
- AKINDO hackathons hub (demo video format brief, judging criteria):
  <https://www.akindo.io/hackathons>
- 0G WaveHack overview and Wave-1 schedule (the buildathon whose Demo Day
  this runbook services): <https://docs.0g.ai/ai-context>
- 0G Compute overview (the `qwen-2.5-7b-instruct` provider
  `0xa48f01287233509FD694a22Bf840225062E67836` used by the demo):
  <https://docs.0g.ai/developer-hub/building-on-0g/compute-network/overview>
- 0G Chain / Galileo chainId and RPC URL (chainId 16602, `0x40DA`):
  <https://docs.0g.ai/ai-context>
- EIP-7857 (Agentic ID, FINAL 2025-01-02) — the standard the
  `AxiomAgentNFT` implements, the source of the `iTransferFrom` and
  `OwnershipProof` / `AccessProof` shapes the demo walks through:
  <https://eips.ethereum.org/EIPS/eip-7857>
- EIP-721 (the base NFT standard the demo's `Transfer` event is built on):
  <https://eips.ethereum.org/EIPS/eip-721>
- OpenZeppelin Contracts v5.x — the `Pausable`, `Ownable2Step`, and
  `ReentrancyGuard` patterns the rollback plan depends on:
  <https://docs.openzeppelin.com/contracts/5.x/>
- Vercel project configuration (`vercel.json` schema, SPA rewrite, regions):
  <https://vercel.com/docs/project-configuration/vercel-json>
- k6 metrics reference (the load-test the perf baselines agent runs against
  the same `POST /v1/orchestrator/tick` endpoint the demo hits):
  <https://grafana.com/docs/k6/latest/using-k6/metrics/>
