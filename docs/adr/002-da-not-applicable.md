# ADR 002: Data Availability — Not Applicable; 0G Storage Suffices

Status: Accepted (wave 11, ledger L6-DA1)
Date: 2026-08-27

## Decision

Do NOT integrate 0G Data Availability (0G DA / disperser / da-client) into the
Axiom Protocol stack. 0G Storage (@0gfoundation/0g-storage-ts-sdk → InMemoryStorage /
ZeroGStorage) is the sole data-availability layer for the artifacts we persist.

## Reasons

- Repo-wide grep shows zero usage: no `disperser` or `da-client` references anywhere
  in apps/, packages/, or scripts/ — DA was never wired, deliberately.
- What we publish (agent data hashes, chat transcripts, oracle proof payloads) is
  small and needs durable retrieval + Ethereum-consensus finality, which 0G Storage
  already provides. DA's per-entry entries model adds cost and complexity for
  data we do not need to be ephemeral.
- 0G Storage entries are already anchored on-chain via data-hash events (and
  `withProof=true` downloads carry storage-level attestation), giving the
  verifiability DA would otherwise be asked for.

## Correction (2026-08-31 audit)

Two rationale statements above were inaccurate and are superseded: 0G finality is
**0G Consensus inheriting Ethereum staking security**, not "Ethereum-consensus
finality"; and 0G DA has no "per-entry entries model" for ephemeral data. The
**decision itself is upheld** — DA would additionally require self-hosted
encoder/retriever infrastructure with no TS disperser SDK, and it is built on top
of 0G Storage, which we already use with on-chain anchoring. Reopen only if a
feature needs high-volume ephemeral publication at DA scale (see Consequences).

## Consequences

- Any future feature needing high-volume ephemeral data publication (e.g. large
  blob batching) should reopen this ADR rather than shoehorning into Storage.
- The DA integration docs (docs.0g.ai da-integration) remain intentionally unused;
  do not add a disperser client without revisiting this decision.
