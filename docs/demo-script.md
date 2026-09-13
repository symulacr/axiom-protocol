# Token2049 Demo — 3-Minute Live Script

> **Format:** 3-minute live demo at Token2049 Singapore Demo Day, Nov 2026.
> **One-liner:** mint an AI trading agent on 0G Chain, then transfer it to
> a new owner with the model re-encrypted for their pubkey in a real TEE
> — three movements, one screen, every step on-chain.
> **Video brief:** the format follows the AKINDO hackathon demo guidelines
> at <https://www.akindo.io/hackathons> (90-second cold-open rule, on-screen
> tx hashes, and the demo URL must resolve to the running app, not a
> marketing site).
> **Frame-by-frame storyboard:** see
> [`docs/demo-script-frames.md`](./demo-script-frames.md) for one row per
> 5 s of the timeline.
> **Operator runbook:** see [`docs/runbook.md`](./runbook.md) for the
> pre-demo checklist and rollback plan.

---

## Timing (must total 180 s exactly)

| Movement      | Range       | Length | Cumulative |
|---------------|-------------|-------:|-----------:|
| Intro (cold-open) | 0:00 – 0:30 | 30 s   | 0:30       |
| Wallet + mint    | 0:30 – 1:30 | 60 s   | 1:30       |
| Transfer (TEE re-key) | 1:30 – 2:30 | 60 s | 2:30      |
| Summary          | 2:30 – 3:00 | 30 s   | 3:00       |
| **Total**        | 0:00 – 3:00 | **180 s** | **3:00** |

> The whole script adds up to 180 s. The on-stage clock is visible to the
> operator in the top-right corner; the audience sees the chaincan
> explorer behind the operator's shoulder.

---

## Movement 1 — Intro (0:00 → 0:30, 30 s)

**On-screen:** the Axiom landing page on `beta.axiom-protocol.xyz`. Top-left
shows the Axiom logo. Top-right shows the live Galileo block number ticking
up via the `cast block-number` banner from
[`apps/frontend/src/components/HealthBadge.tsx`](../../apps/frontend/src/components/HealthBadge.tsx)
that polls `/v1/health` every 30 s.

**Action:** operator clicks "Connect Wallet" (RainbowKit, top-right).

**Script (speak):**
> "AI agents in DeFi have a trust problem. In 2025, $1.4 billion was lost
> to MEV because no one could prove what model an agent actually ran. Axiom
> Protocol is the verifiable intelligence layer for DeFi. It mints an AI
> agent as an ERC-7857 iNFT, runs it in a TEE on 0G Compute, and re-keys
> the model on every transfer. Three minutes. Live on 0G Galileo. Watch."

**Why it matters:** the first 30 s is the AKINDO cold-open
(<https://www.akindo.io/hackathons>): name the problem, name the solution,
say the word "live" out loud. No throat-clearing.

---

## Movement 2 — Wallet + mint (0:30 → 1:30, 60 s)

**On-screen:** MetaMask modal pops; operator picks "Account 1 (demo)" and
the chain is set to "0G Galileo Testnet" (chainId 16602, see
<https://docs.0g.ai/ai-context>). The page advances to `/agents` and the
operator's wallet balance (5.4 OG) is visible top-right.

**Action — 0:45:** operator types "Momentum Pulse v3" into the
"Agent name" field, picks a strategy preset ("RSI-reversion, 4h"), and
clicks **Mint**. A `cast send` appears in the terminal panel below the
browser:

```bash
cast send 0x6f82d061a903E48Ce1810F8d42536C6A837ed684 \
  "mint((string,bytes32)[],address)" \
  --value 0.01ether --rpc-url https://evmrpc-testnet.0g.ai \
  --private-key $DEMO_PK
```

**Action — 1:05:** MetaMask confirms; the tx hash
(`0x9f1c…4e0a`) is shown on the page and on the chaincan banner.
Operator clicks the hash; it opens
<https://chainscan-galileo.0g.ai/tx/0x9f1c…4e0a> in a new tab. The
`Transfer(0x0000…0000, operator, tokenId=1)` event is visible. Total
elapsed: 1:05.

**Action — 1:15:** operator opens the new agent's card on `/agents/1`.
The card shows: name, model hash, strategy root, owner, the verifier
address, and a green "TEE signed" badge. The TEE-signed badge is
populated by `AxiomAgentNFT.verifier()` (returns
`0x63Edfd4CD68A77AEdC4A56550Ae94e7F86d497B7`, see
[`packages/config/src/addresses.ts`](../packages/config/src/addresses.ts)).

**Script (speak):**
> "Connected. Chain is 0G Galileo, 16602. I'm minting 'Momentum Pulse v3'
> — an RSI-reversion trading agent — as an ERC-7857 iNFT. The model
> weights are encrypted client-side with AES-256-GCM and uploaded to 0G
> Storage. The hash is on-chain. One transfer event. One token. Owned by
> me. The verifier on the contract is the AxiomTeeVerifier — the
> canonical `BaseVerifier` from the 0G reference. Replay-protected.
> Seven-day expiry. Every signature is real secp256k1."

---

## Movement 3 — Transfer / TEE re-key (1:30 → 2:30, 60 s)

**On-screen:** operator clicks **Transfer** on the agent card. A modal
opens asking for the receiver address. Operator pastes Sarah's demo
address (`0xSa…rah`, pre-staged in the clipboard) and clicks **Continue**.

**Action — 1:40:** the UI shows a three-step progress bar:
`1. AccessProof (Sarah signs)  2. Re-encrypt in TEE  3. OwnershipProof
(TEE signs)`. Step 1 fires immediately; step 2 is a request from the
frontend to the backend at `POST /v1/agents/1/transfer`, which in turn
talks to the oracle at `POST http://127.0.0.1:8787/v1/transfer-validity`
(per `apps/oracle/src/index.ts`).

**Action — 1:50:** the TEE service re-encrypts: decrypts the old
encrypted blob from 0G Storage (root hash `0xae12…`), generates a new
AES-256-GCM key, re-encrypts the model, uploads to 0G Storage at a new
root hash `0x7c4d…`, and ECIES-encrypts the new key for Sarah's
`targetPubkey` (the receiver-signs step). The result is the canonical
`OwnershipProof`:

```solidity
struct OwnershipProof {
    OracleType  oracleType;       // = TEE
    bytes32     dataHash;         // = new 0x7c4d…
    bytes       sealedKey;        // ECIES blob, 50-byte header
    bytes       targetPubkey;     // = Sarah's 64-byte X||Y
    uint256     nonce;
    bytes       proof;            // = secp256k1_sign(keccak256(abi.encodePacked(dataHash, sealedKey, targetPubkey, nonce)))
}
```

The struct is the canonical shape from EIP-7857 § IERC7857DataVerifier
(<https://eips.ethereum.org/EIPS/eip-7857#data-verifier-interface>).

**Action — 2:00:** the backend submits the `iTransferFrom` call:

```bash
cast send 0x6f82d061a903E48Ce1810F8d42536C6A837ed684 \
  "iTransferFrom(address,address,uint256,(bytes32,bytes,uint256,bytes),(uint8,bytes32,bytes,bytes,uint256,bytes)[])" \
  --rpc-url https://evmrpc-testnet.0g.ai --private-key $DEMO_PK
```

**Action — 2:15:** MetaMask confirms. The page jumps to
`/agents/1` with the new owner "Sarah" and a new
`PublishedSealedKey` event visible on the chaincan banner
(`0xc1b8…`). Operator clicks the event; the chaincan page shows:

- `event PublishedSealedKey(uint256 indexed tokenId, bytes sealedKey, bytes32 dataHash)`
- followed by `Transfer(operator, sarah, 1)`.

**Script (speak):**
> "Now I transfer it to Sarah. Her wallet signs an AccessProof — that's
> step one. Step two happens off-chain in the TEE: it decrypts the model
> with the old key, generates a new AES-256-GCM key, re-encrypts, uploads
> to 0G Storage, and ECIES-wraps the new key for Sarah's public key. The
> TEE signs an OwnershipProof over `keccak256(dataHash, sealedKey,
> targetPubkey, nonce)` — exactly what the EIP-7857 verifier expects.
> Step three is the on-chain call. The contract recovers both
> signatures, checks replay, emits `PublishedSealedKey`, and transfers
> the NFT. The old owner can never decrypt it again. Sarah's private
> key, and Sarah's private key only, can decrypt the new sealed key.
> All on-chain, all auditable, all on the chaincan behind me."

---

## Movement 4 — Summary (2:30 → 3:00, 30 s)

**On-screen:** operator switches tabs to a four-card grid showing the four
contracts on Galileo, with the explorer links pinned:

| Contract                  | Address                                      | Link                                                                 |
|---------------------------|----------------------------------------------|----------------------------------------------------------------------|
| `AxiomAgentNFT` (proxy)   | `0x6f82d061a903E48Ce1810F8d42536C6A837ed684` | <https://chainscan-galileo.0g.ai/address/0x6f82d061a903E48Ce1810F8d42536C6A837ed684> |
| `AxiomTeeVerifier`        | `0x63Edfd4CD68A77AEdC4A56550Ae94e7F86d497B7` | <https://chainscan-galileo.0g.ai/address/0x63Edfd4CD68A77AEdC4A56550Ae94e7F86d497B7> |
| `AxiomStrategyVault`      | `0xB30061Ea93b60FCbAE11C2b06FE3Db3C84FAA367` | <https://chainscan-galileo.0g.ai/address/0xB30061Ea93b60FCbAE11C2b06FE3Db3C84FAA367> |
| `AxiomPaymentProcessor`   | `0x97a32707d948F91175706ca5509c7bfCC643a1dD` | <https://chainscan-galileo.0g.ai/address/0x97a32707d948F91175706ca5509c7bfCC643a1dD> |

The screen also shows the `forge test -vv` summary from the test suite
and the green "TEE signed" badge.

**Action — 2:40:** operator clicks through to the GitHub repo and the
AKINDO submission page.

**Script (speak):**
> "That's the whole stack. Four contracts on 0G Galileo. ERC-7857 with
> the canonical extensions from the 0G reference repo. A TEE signer that
> is a real cryptographic process, not a mock. Open source at the
> GitHub link on screen. Submitted to the 0G WaveHack on AKINDO. Try
> it: read the code, break it if you can. We built it to last."

**End:** at 3:00, fade to the QR code for `beta.axiom-protocol.xyz` and
the GitHub URL. The AKINDO submission card is on screen with the team
contact visible.

---

## Notes for the operator

- **No voiceover in the recorded video version** — submit the live audio
  per the AKINDO hackathon demo format (<https://www.akindo.io/hackathons>).
  The recording can be the same demo re-captured against the same
  addresses in a quiet room; no second script.
- **Time discipline:** the chaincan tab must be opened at 1:05 (mint)
  and 2:15 (transfer) for the on-stage numbers to land where the
  script says they do. If the chain is slow, the audience sees the
  real block time — do not narrate over the spinner.
- **The four explorer links in Movement 4 are mandatory** — judges
  click them. Pin them as browser bookmarks before the talk.
- **Backup:** the pre-recorded video file `apps/demo/axiom-demo-3min.mp4`
  is the Tier-4 fallback per [`docs/runbook.md`](./runbook.md) § 4.4.

---

## Sources

- AKINDO hackathons — demo video format, cold-open rule, judging clock:
  <https://www.akindo.io/hackathons>
- AKINDO WaveHack submission portal:
  <https://app.akindo.io/wave-hacks/Z4MlX4vreI72ol6pd>
- EIP-7857 (Agentic ID, FINAL 2025-01-02) — the `OwnershipProof` and
  `AccessProof` struct shapes, the `iTransferFrom` flow, the security
  considerations around binding the proof to a specific receiver:
  <https://eips.ethereum.org/EIPS/eip-7857>
- 0G Galileo testnet (chainId 16602 = `0x40DA`, RPC
  `https://evmrpc-testnet.0g.ai`, explorer
  `https://chainscan-galileo.0g.ai`):
  <https://docs.0g.ai/ai-context>
- 0G Compute (the broker / Router the demo's inference call would route
  through in production; the demo's on-screen `execute` step
  short-circuits the inference because the script is time-boxed):
  <https://docs.0g.ai/developer-hub/building-on-0g/compute-network/overview>
- 0G Labs ERC-7857 reference implementation (the source the
  `AxiomAgentNFT` and `AxiomTeeVerifier` follow):
  <https://github.com/0gfoundation/0g-agent-nft>
- OpenZeppelin Contracts v5.x — the `Pausable` and `AccessControl`
  patterns the pause path in the runbook exercises if a rollback is
  needed mid-talk:
  <https://docs.openzeppelin.com/contracts/5.x/>
