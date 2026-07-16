# Waves 4–7 Report (combined landing)

## Wave 4 — Oracle/TEE
- Oracle bind default **0.0.0.0**
- Simulated TEE documented; sealed DEK path; health exposes pubkey
- Seen-hashes durable file (existing + tests)

## Wave 5 — Backend/Indexer
- WS token check timing-safe (`timingSafeTokenInList`)
- EventStore decrements `total` on eviction
- Indexer checkpoints at `head - REORG_SAFE_DEPTH`
- Sink throws on 4xx so checkpoint does not advance
- TEE verify optional fail-closed (`AXIOM_COMPUTE_TEE_FAIL_CLOSED`)

## Wave 6 — FE
- useTransfer dataHash alignment (C2)
- Structural FE test for proof dataHash

## Wave 7 — Validation
- See `FINAL-BEFORE-AFTER.md` and scratch logs under implementer dir
