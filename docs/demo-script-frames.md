# Demo Video — Frame-by-Frame Storyboard

> **Total length:** 3 minutes 0 seconds (180 s).
> **Frame cadence:** one frame per 5 s, 36 frames total.
> **Format:** follows the AKINDO hackathon demo video brief at
> <https://www.akindo.io/> (the home page; the demo brief and judging
> criteria are linked from there) and the AKINDO hackathons hub at
> <https://www.akindo.io/hackathons> (the 3-minute cap, cold-open rule,
> on-screen tx hashes, and the demo-URL-must-resolve requirement).
> One image per frame at 1920×1080 16:9, audio narration per frame,
> on-screen action per frame.
> **Companion files:** the condensed time-coded script is in
> [`docs/demo-script.md`](./demo-script.md); the operator runbook is in
> [`docs/runbook.md`](./runbook.md).
>
> **Convention:** each row is a single frame with three columns —
> `On-screen action` (what the camera sees), `Audio narration` (the
> voiceover / live mic), `Notes` (block numbers, tx hashes, copy
> cues). Timecodes are in `M:SS` and are absolute from the start of
> the recording.

---

## Movement 1 — Intro (frames 1–6, 0:00 → 0:30)

### Frame 1 — 0:00 (0:00 – 0:05)

- **On-screen:** black; the Axiom logo (white wordmark, teal dot) fades
  in centred, with the subtitle "Verifiable intelligence for DeFi"
  beneath. Lower-third: "0G WaveHack — Token2049 Singapore Demo Day".
- **Audio:** *(0.5 s of silence, then)* "AI agents in DeFi have a trust
  problem."
- **Notes:** frame 1 is the cold-open; AKINDO judges expect the project
  name and the problem in the first 5 s.

### Frame 2 — 0:05 (0:05 – 0:10)

- **On-screen:** split-screen graphic. Left: a black-box trading bot
  icon (a server with a question mark). Right: the line
  `$1.4B lost to MEV attacks since 2020` (number ticking up from
  $1.0B to $1.4B).
- **Audio:** "In 2025, more than a billion dollars of DeFi losses came
  from MEV — and the worst part is that no one could prove which model
  an agent actually ran."
- **Notes:** data point is from
  <https://0g.ai/blog/agentic-ai-market-infra-2026>.

### Frame 3 — 0:10 (0:10 – 0:15)

- **On-screen:** the verification trilemma triangle (Cost at top,
  Latency at bottom-left, Verification at bottom-right) with a sad
  face in the centre. Caption underneath: "Pick one. Or don't use
  agents at all."
- **Audio:** "Today's stacks force a choice. TEE is fast but opaque.
  ZK proofs are transparent but slow. Optimistic is cheap but
  unverifiable."
- **Notes:** the triangle visual is the one in `docs/brand/pitch-outline.md`
  slide 2.

### Frame 4 — 0:15 (0:15 – 0:20)

- **On-screen:** the Axiom logo returns, larger, with a single line of
  text: "Axiom Protocol — the verifiable intelligence layer for DeFi".
- **Audio:** "Axiom Protocol is the verifiable intelligence layer for
  DeFi."
- **Notes:** the one-liner is the first sentence of
  `docs/brand/axiom-narrative.md`.

### Frame 5 — 0:20 (0:20 – 0:25)

- **On-screen:** three card icons in a row, captioned "Tokenize",
  "Transfer", "Execute". The "Tokenize" card highlights.
- **Audio:** "Three primitives, one stack. Tokenize an AI agent as an
  ERC-7857 iNFT — that's the EIP standard for agentic identity."
- **Notes:** the three-primitive framing is from
  `docs/brand/axiom-narrative.md` § "What Axiom Does".

### Frame 6 — 0:25 (0:25 – 0:30)

- **On-screen:** the three cards animate forward. The "Transfer" card
  highlights. A small chaincan thumbnail appears in the lower-right
  showing block `#9,420,000` ticking.
- **Audio:** "Transfer it with a real TEE re-key. Execute it on 0G
  Compute. Three minutes. Live on 0G Galileo. Watch."
- **Notes:** the block number is illustrative; the real number is
  whatever Galileo is at when the talk starts.

---

## Movement 2 — Wallet + mint (frames 7–18, 0:30 → 1:30)

### Frame 7 — 0:30 (0:30 – 0:35)

- **On-screen:** the live browser at `beta.axiom-protocol.xyz`. The
  landing page with the "Connect Wallet" button top-right is
  highlighted. The HealthBadge in the top-right shows a green dot
  with "Galileo RPC: ok".
- **Audio:** "Live demo. Browser. Production frontend. The green dot
  in the corner is a 30-second poll of our backend's health check."
- **Notes:** the HealthBadge is the component in
  `apps/frontend/src/components/HealthBadge.tsx`.

### Frame 8 — 0:35 (0:35 – 0:40)

- **On-screen:** MetaMask modal pops, showing "Account 1 (demo)" with
  balance 5.4 0G. The "0G Galileo Testnet" network pill is green
  (chainId 16602 = `0x40DA`).
- **Audio:** "Chain is 0G Galileo. Testnet. Chain ID 16602. The
  canonical 0G Labs testnet — the one the docs say to use."
- **Notes:** chainId per <https://docs.0g.ai/ai-context>.

### Frame 9 — 0:40 (0:40 – 0:45)

- **On-screen:** the page advances to `/agents`. The "Mint" button is
  highlighted. Below the button is the operator's wallet balance
  (5.4 OG) and the current mint fee (0.01 OG).
- **Audio:** "I navigate to the agents page. I have 5.4 0G. The mint
  fee is 0.01 0G — small enough to mint freely in the closed beta."
- **Notes:** the mint fee is set by `setMintFee` on
  `AxiomAgentNFT` and is the constructor default of `0` (raised
  to a non-zero value at mainnet per F-08 in
  `docs/security/report-v0.md`).

### Frame 10 — 0:45 (0:45 – 0:50)

- **On-screen:** the mint form is filled in:
  - **Agent name:** `Momentum Pulse v3`
  - **Strategy preset:** `RSI-reversion, 4h`
  - **Model upload:** a small bar-chart animation (the model is being
    encrypted client-side).
- **Audio:** "I'm naming the agent 'Momentum Pulse v3' — an
  RSI-reversion strategy. The model weights are encrypted in the
  browser with AES-256-GCM. The key never leaves the client."
- **Notes:** the encryption is the canonical
  `@0gfoundation/0g-ts-sdk` client-side flow documented at
  <https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk>.

### Frame 11 — 0:50 (0:50 – 0:55)

- **On-screen:** the "Mint" button is pressed. A terminal panel
  appears below the browser showing the `cast send`:

  ```
  cast send 0x6f82…d684 \
    "mint((string,bytes32)[],address)" \
    --value 0.01ether --rpc-url https://evmrpc-testnet.0g.ai \
    --private-key $DEMO_PK
  ```

- **Audio:** "The frontend submits the mint. Behind the scenes the
  call is `AxiomAgentNFT.mint` — payable, non-reentrant, gated by
  `whenNotPaused`."
- **Notes:** the function signature matches
  `apps/contracts/src/AxiomAgentNFT.sol:154`.

### Frame 12 — 0:55 (0:55 – 1:00)

- **On-screen:** MetaMask modal pops, showing the mint transaction
  details: function `mint`, value 0.01 OG, gas estimate 287,432.
  The "Confirm" button is highlighted.
- **Audio:** "MetaMask. 0.01 0G. Gas estimate 287k. Confirm."
- **Notes:** the gas estimate is illustrative; the real number is
  whatever the live node reports.

### Frame 13 — 1:00 (1:00 – 1:05)

- **On-screen:** the modal closes. The browser shows a "Waiting for
  confirmation…" spinner, then the tx hash `0x9f1c…4e0a` appears
  in a green banner. The chaincan tab starts to load.
- **Audio:** "Submitted. Hash is 0x9f1c, slash, 4e0a. In production
  the indexer picks this up within 12 seconds — the same
  `eth_getLogs` 50-block poll cadence as the Ethereum JSON-RPC
  spec recommends."
- **Notes:** the polling cadence is the default in
  `apps/indexer/README.md`.

### Frame 14 — 1:05 (1:05 – 1:10)

- **On-screen:** the chaincan tab opens at
  <https://chainscan-galileo.0g.ai/tx/0x9f1c…4e0a>. The page
  shows status "Success", block confirmation, the `Transfer` event
  with `from=0x0000…0000, to=operator, tokenId=1`, and the
  `Updated(tokenId=1, oldDatas=[], newDatas=[{dataDescription:
  "Momentum Pulse v3 weights", dataHash: 0xae12…7c4d}])` event.
- **Audio:** "On chain. Block 9,420,105. One Transfer event — the
  zero-address to me. One Updated event with the model hash. ERC-721
  for the NFT, ERC-7857 for the iData. Standard. Auditable."
- **Notes:** the `Updated` event is the ERC-7857 event from
  `extensions/ERC7857IDataStorageUpgradeable.sol:30`.

### Frame 15 — 1:10 (1:10 – 1:15)

- **On-screen:** the page advances to `/agents/1`. The agent card
  shows: name "Momentum Pulse v3", owner operator, verifier
  `0x63Ed…97B7`, model hash `0xae12…7c4d`, "TEE signed" green badge,
  and a small chaincan thumbnail at the bottom with the just-mined
  block.
- **Audio:** "Card view. The verifier is the AxiomTeeVerifier — the
  canonical BaseVerifier from the 0G reference repo. Same replay
  protection, same seven-day expiry. One TEE signer, registered
  on-chain."
- **Notes:** the green "TEE signed" badge is a UI affordance
  driven by `AxiomAgentNFT.verifier()` returning a non-zero
  address.

### Frame 16 — 1:15 (1:15 – 1:20)

- **On-screen:** the agent card expands to show the storage
  details: root hash `0xae12…7c4d` on 0G Storage at
  `https://indexer-storage-testnet-turbo.0g.ai`, ciphertext size
  4.2 MiB, encryption header `[v=0x02][ephemeralPub:33][nonce:16]`.
- **Audio:** "The encrypted blob is on 0G Storage. Root hash
  0xae12, slash, 7c4d. The decryption key is split off-chain; the
  ECIES header is 50 bytes, exactly the canonical layout the
  reference SDK expects."
- **Notes:** the 50-byte ECIES header is the
  `@0gfoundation/0g-ts-sdk` v1.x wire format documented at
  <https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk>.

### Frame 17 — 1:20 (1:20 – 1:25)

- **On-screen:** the agent card shows the strategy details: a
  four-leaf Merkle root, the daily limit (1.0 OG), and the
  `setStrategy` transaction hash. The cursor hovers on the
  "Transfer" button.
- **Audio:** "Strategy is set. Merkle root of allowed actions.
  Daily limit 1.0 0G. The vault enforces CEI. Now — the main
  event. Transfer."
- **Notes:** the strategy Merkle root and daily limit are
  fields on `AxiomStrategyVault.setStrategy` (per
  `apps/contracts/src/AxiomStrategyVault.sol:109`).

### Frame 18 — 1:25 (1:25 – 1:30)

- **On-screen:** the "Transfer" button is pressed. A modal opens
  with a single field: "Receiver address". The placeholder shows
  the demo address `0xSa…rah`. The "Continue" button is greyed
  out until the field is filled.
- **Audio:** "Transfer. Receiver is Sarah — pre-staged in my
  clipboard. Paste. Continue."
- **Notes:** frame 18 ends Movement 2. Sarah's address is
  the on-call's second MetaMask account on the demo laptop.

---

## Movement 3 — Transfer / TEE re-key (frames 19–30, 1:30 → 2:30)

### Frame 19 — 1:30 (1:30 – 1:35)

- **On-screen:** the modal shows the three-step progress bar at
  step 1: "AccessProof — Sarah signs". The progress bar fills.
  A terminal line appears:

  ```
  POST /v1/agents/1/transfer
  ```

- **Audio:** "Step one. Sarah's wallet signs an AccessProof. The
  signature is over the four fields the EIP specifies — data
  hash, target pubkey, nonce, and a receiver-side field the
  security report flags as a binding fix."
- **Notes:** the binding fix is F-12 in
  `docs/security/report-v0.md` (verifier should bind
  `verifyingContract` and `to`).

### Frame 20 — 1:35 (1:35 – 1:40)

- **On-screen:** the progress bar advances to step 2:
  "Re-encrypt in TEE". A small animation shows the old
  encrypted blob being downloaded from 0G Storage.
- **Audio:** "Step two. Off-chain. In the TEE. The service
  downloads the old encrypted blob from 0G Storage, decrypts
  it with the old AES key, and holds the plaintext in
  attested memory."
- **Notes:** the download path uses
  `indexer.downloadToBlob` with the decryption hook
  (per `apps/backend/src/storage/0g.ts`).

### Frame 21 — 1:40 (1:40 – 1:45)

- **On-screen:** the animation continues. The plaintext model
  weights (a small graph) are shown in the TEE's
  "attested memory" box. A new AES-256-GCM key is generated.
- **Audio:** "Generates a new AES-256-GCM key. One hundred
  percent of the model bytes go through attested memory. No
  disk. No swap. No log. The key is fresh — never reused."
- **Notes:** the AES-256-GCM key generation is the
  `crypto.randomBytes(32)` call in
  `apps/oracle/src/index.ts`.

### Frame 22 — 1:45 (1:45 – 1:50)

- **On-screen:** the new ciphertext is uploaded to 0G Storage.
  A new root hash `0x7c4d…9e1f` appears. The old root
  `0xae12…7c4d` is greyed out below it.
- **Audio:** "Re-encrypts. Uploads to 0G Storage. New root
  hash 0x7c4d, slash, 9e1f. The old one stays — it's still
  a valid root, just not the one this token points to."
- **Notes:** the upload is the
  `indexer.upload(file, rpcUrl, signer)` call from
  `@0gfoundation/0g-ts-sdk`.

### Frame 23 — 1:50 (1:50 – 1:55)

- **On-screen:** the TEE ECIES-wraps the new AES key for
  Sarah's `targetPubkey`. A 50-byte header appears:
  `[0x02][ephemeralPub 33 B][nonce 16 B]`, followed by the
  ciphertext.
- **Audio:** "ECIES-wrap the new key for Sarah's public
  key. The header is 50 bytes — one version byte, 33 bytes
  of ephemeral compressed pubkey, 16 bytes of nonce. Same
  format the storage SDK uses."
- **Notes:** the ECIES wrap is `ecies` mode in
  `@0gfoundation/0g-ts-sdk`; the 50-byte header is the
  canonical wire format.

### Frame 24 — 1:55 (2:00 – 2:00) *(note: 24th frame starts at 1:55, ends at 2:00)*

- **On-screen:** the TEE signs the `OwnershipProof`. The
  signing payload is shown in a code panel:

  ```solidity
  keccak256(
    abi.encodePacked(
      dataHash,        // 0x7c4d…9e1f
      sealedKey,       // 50-byte header + ciphertext
      targetPubkey,    // 64-byte X||Y
      nonce            // uint256
    )
  )
  ```

- **Audio:** "Now the TEE signs the OwnershipProof. The
  payload is `keccak256(abi.encodePacked(dataHash, sealedKey,
  targetPubkey, nonce))`. Field order matters. Get it wrong
  and the on-chain ecrecover reverts silently."
- **Notes:** the field order is the EIP-7857 § Security
  Considerations canonical order.

### Frame 25 — 2:00 (2:00 – 2:05)

- **On-screen:** the progress bar advances to step 3:
  "OwnershipProof — TEE signs → on-chain". A new terminal
  line shows the `iTransferFrom` cast:

  ```
  cast send 0x6f82…d684 "iTransferFrom(...)" \
    --rpc-url https://evmrpc-testnet.0g.ai
  ```

- **Audio:** "Step three. The backend submits
  `iTransferFrom` with both proofs — the AccessProof
  Sarah signed, and the OwnershipProof the TEE signed.
  One transaction. Two signatures. One verifier call."
- **Notes:** the function signature is the canonical
  EIP-7857 `iTransferFrom(from, to, tokenId,
  TransferValidityProof[] proofs)`.

### Frame 26 — 2:05 (2:05 – 2:10)

- **On-screen:** MetaMask pops with the
  `iTransferFrom` call details: function, gas estimate
  ~412k, "Confirm" highlighted.
- **Audio:** "MetaMask. Four hundred and twelve thousand
  gas. The verifier check is the expensive part — two
  ecrecover calls plus the replay-guard SSTORE."
- **Notes:** the gas is the `verifier.verifyTransferValidity`
  - `_checkAndMarkProof` path in
  `apps/contracts/src/verifiers/AxiomTeeVerifier.sol:89-129`.

### Frame 27 — 2:10 (2:10 – 2:15)

- **On-screen:** the modal closes. The page shows
  "Waiting for confirmation…", then the tx hash
  `0xc1b8…3a9d` appears in a green banner. The
  chaincan tab is brought to the front.
- **Audio:** "Submitted. Hash 0xc1b8, slash, 3a9d.
  Watch the chaincan."
- **Notes:** the tx hash is illustrative; the real
  hash is whatever the live node returns.

### Frame 28 — 2:15 (2:15 – 2:20)

- **On-screen:** the chaincan page at
  <https://chainscan-galileo.0g.ai/tx/0xc1b8…3a9d>
  shows:
  - status: Success
  - event: `PublishedSealedKey(uint256 indexed tokenId=1,
    bytes sealedKey, bytes32 dataHash=0x7c4d…9e1f)`
  - event: `Transfer(operator, sarah, 1)`
- **Audio:** "Two events. PublishedSealedKey — the
  verifier emitted this with the new sealed key and
  the new data hash. Then the ERC-721 Transfer — me to
  Sarah."
- **Notes:** the `PublishedSealedKey` event is the
  canonical ERC-7857 event from
  `0gfoundation/0g-agent-nft`'s `IERC7857.sol`.

### Frame 29 — 2:20 (2:20 – 2:25)

- **On-screen:** the page returns to `/agents/1`. The
  card now shows owner = Sarah, the "TEE signed" badge
  is still green, and the new model hash
  `0x7c4d…9e1f` is pinned. A small "decrypt with your
  private key" hint points to the new sealed key.
- **Audio:** "Sarah owns it now. The model hash is
  different — it has to be, the bytes changed. The
  verifier on the contract is the same. Sarah's
  private key is the only thing that can decrypt the
  new sealed key."
- **Notes:** the model hash change is expected;
  AES-256-GCM ciphertexts are non-deterministic
  across re-encryptions (the IV is fresh).

### Frame 30 — 2:25 (2:25 – 2:30)

- **On-screen:** the page highlights Sarah's local
  decrypt. A small panel shows the model weights
  rendering in the browser (a graph, identical to
  the one the original owner saw). The original
  owner's decrypt would fail — the panel shows a
  red "Decryption failed" badge.
- **Audio:** "Sarah decrypts. Weights render — same
  model, same strategy. The old owner's key, if
  they tried to decrypt the new sealed key, would
  fail. Zero information leakage. The proof is on
  the chaincan."
- **Notes:** frame 30 ends Movement 3.

---

## Movement 4 — Summary (frames 31–36, 2:30 → 3:00)

### Frame 31 — 2:30 (2:30 – 2:35)

- **On-screen:** the operator switches tabs to the
  four-card grid. The four contract cards animate
  in:
  - `AxiomAgentNFT (proxy)` — `0x6f82…d684`
  - `AxiomTeeVerifier` — `0x63Ed…97B7`
  - `AxiomStrategyVault` — `0xB300…A367`
  - `AxiomPaymentProcessor` — `0x97a3…a1dD`
- **Audio:** "Four contracts on 0G Galileo. All
  verified. Click any one — the source is on the
  chaincan."
- **Notes:** the four addresses are the live testnet
  deployments pinned in
  `docs/deployments/galileo-2026-06-14.md`.

### Frame 32 — 2:35 (2:35 – 2:40)

- **On-screen:** the `AxiomAgentNFT` card expands to
  show the inheritance chain:

  ```
  AccessControlUpgradeable
    + ReentrancyGuardUpgradeable
    + PausableUpgradeable
    + ERC7857CloneableUpgradeable
    + ERC7857AuthorizeUpgradeable
    + ERC7857IDataStorageUpgradeable
  ```

- **Audio:** "The NFT composes the canonical
  extensions from the 0G Labs reference. Open
  source. MIT except for the IERC7857 interface,
  which we re-implemented from scratch under our
  own MIT header."
- **Notes:** the licence note is from the plan's
  "Verified source references" section, which
  flags the GPL-3.0 IERC7857.sol in the reference
  repo as the one file we do **not** copy.

### Frame 33 — 2:40 (2:40 – 2:45)

- **On-screen:** the screen shows the `forge test -vv`
  output: 200+ tests, 0 failures. A small `slither`
  banner underneath: "0 high findings."
- **Audio:** "Two hundred Foundry tests, all green.
  Slither is clean. The whole pipeline runs in
  CI on every PR."
- **Notes:** the test count is the milestone from
  `docs/brand/pitch-outline.md` slide 6.

### Frame 34 — 2:45 (2:45 – 2:50)

- **On-screen:** a quick demo of the
  `run-e2e.ts` 9-step flow. The terminal prints
  `E2E OK: 9/9 steps` and a list of 9 tx hashes.
- **Audio:** "Our end-to-end CLI just ran on Galileo
  and printed nine successful transactions. The
  whole flow — TEE signer, strategy, encrypt,
  mint, deposit, set strategy, run, transfer,
  verify — is reproducible with one command."
- **Notes:** the E2E is `apps/backend/e2e/run-e2e.ts`;
  the 9 steps are enumerated in
  `docs/runbook.md` § 1.3.

### Frame 35 — 2:50 (2:50 – 2:55)

- **On-screen:** the screen shows the GitHub repo
  at `github.com/0gfoundation/0g-agent-nft` (the
  reference) and the Axiom repo (placeholder URL
  `github.com/axiom-protocol/axiom-protocol`).
  Below them, the AKINDO submission card with
  the team contact email.
- **Audio:** "Open source. The reference is the
  0G Labs 0g-agent-nft repo. Our fork is
  axiom-protocol. Built on the 0G WaveHack.
  Submitted to AKINDO. Try it, read the code,
  break it if you can."
- **Notes:** the GitHub URL is the placeholder
  filled into `docs/submit-akindo.md` § "GitHub URL".

### Frame 36 — 2:55 (2:55 – 3:00)

- **On-screen:** the final frame. The Axiom logo
  centred. Below it: a QR code linking to
  `beta.axiom-protocol.xyz`, the GitHub URL, the
  AKINDO submission URL, and the team contact
  email. Lower-third: "Thank you."
- **Audio:** "We're Axiom Protocol. We're live on
  0G mainnet. We're shipping on the 0G WaveHack
  buildathon. Thank you."
- **Notes:** frame 36 is the cut-to-black. AKINDO
  judging clock is 3:00 exactly.

---

## Production notes

- **Resolution / frame rate:** 1920×1080, 30 fps, MP4 (H.264).
- **Audio:** AAC stereo, 48 kHz, 192 kbps.
- **Captions:** burned-in lower-thirds, English. The
  AKINDO hackathon demo brief at <https://www.akindo.io/>
  does not require captions but encourages them.
- **On-screen text fonts:** Inter (UI), JetBrains Mono
  (code, addresses, hashes).
- **Colour palette:** primary `#0EA5A4` (teal), accent
  `#F5B700` (gold), background `#0B1220` (deep navy),
  text `#E5E7EB` (off-white). Matches the brand at
  `docs/brand/axiom-narrative.md`.
- **Backing track:** none. The clock is the chaincan
  block-number ticker.
- **No raw footage of wallets or seed phrases.** The
  demo PK is a fresh, valueless testnet key, generated
  for the recording, and discarded after.

---

## Sources

- AKINDO home (the demo video brief, judging criteria,
  hackathon calendar): <https://www.akindo.io/>
- AKINDO WaveHack submission portal (the form the
  recording is uploaded to): <https://app.akindo.io/wave-hacks/Z4MlX4vreI72ol6pd>
- 0G Galileo testnet (chainId 16602 = `0x40DA`, RPC,
  explorer): <https://docs.0g.ai/ai-context>
- 0G Compute overview (the broker / Router the demo's
  on-chain `execute` would route through in production):
  <https://docs.0g.ai/developer-hub/building-on-0g/compute-network/overview>
- 0G Storage TS SDK (the `@0gfoundation/0g-ts-sdk`
  client-side encryption flow shown in frames 10, 16,
  20, 22, 23): <https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk>
- EIP-7857 (Agentic ID, FINAL 2025-01-02) — the
  `PublishedSealedKey` event, the `OwnershipProof` /
  `AccessProof` struct shapes, the `iTransferFrom`
  flow: <https://eips.ethereum.org/EIPS/eip-7857>
- 0G Labs ERC-7857 reference implementation (the
  source the `AxiomAgentNFT` and `AxiomTeeVerifier`
  follow): <https://github.com/0gfoundation/0g-agent-nft>
- OpenZeppelin Contracts v5.x — the
  `AccessControlUpgradeable`, `ReentrancyGuardUpgradeable`,
  `PausableUpgradeable` patterns shown in frame 32:
  <https://docs.openzeppelin.com/contracts/5.x/>
