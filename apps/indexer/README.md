# `@axiom/indexer`

A long-running on-chain event indexer for the Axiom Protocol. It polls 0G
Galileo testnet for events emitted by `AxiomAgentNFT` (ERC-1967 proxy) and
`AxiomStrategyVault`, decodes them, and prints them to **stdout** as one
JSON object per line.

> **Starter scope.** This package is the polling + decoding layer. Submitting
> decoded events to 0G DA is the responsibility of the orchestration layer
> in `apps/backend/src/orchestrator/index.ts` (MW17). See
> `docs/deployments/galileo-2026-06-14.md` for the live contract addresses.

## What it watches

| Contract            | Address                                      | Events (topic-0)                                                                       |
|---------------------|----------------------------------------------|----------------------------------------------------------------------------------------|
| `AxiomAgentNFT`     | `0xf12F158a20c36a351b056FD60b3a7377ce4F1e09` | `Transfer`, `Updated`, `Authorization`, `AuthorizationRevoked`, `VerifierUpdated`, `CreatorSet`, `MintFeeUpdated`, `StorageInfoUpdated`, `PublishedSealedKey`, `DelegateAccess` |
| `AxiomStrategyVault`| `0xb7F89e50D5A3039Da7d39528436B820371572874` | `Deposited`, `Withdrawn`, `StrategySet`, `Executed`, `RegistryUpdated`                 |

Event signatures live in [`src/events.ts`](./src/events.ts) and are kept
byte-for-byte identical to the Solidity source (see the top-of-file
comments for canonical sources — `eips.ethereum.org/EIPS/eip-721`, the
`0gfoundation/0g-agent-nft` reference, and the contracts in
`apps/contracts/src/`).

> **Naming note.** The build brief referred to `DataUpdated` and
> `UsageAuthorized`; the actual contract emits `Updated` and
> `Authorization`. We track the real names; matching against the
> Solidity `keccak256` topic is the only thing that matters on-chain.

## Run

```bash
cd apps/indexer
pnpm install
pnpm dev          # tsx — no build step
# or
pnpm build && pnpm start   # tsc emit + node dist/index.js
```

## Configure

Environment variables (all optional; defaults match 0G Galileo testnet):

| Var            | Default                                | Notes                                          |
|----------------|----------------------------------------|------------------------------------------------|
| `OG_RPC_URL`   | `https://evmrpc-testnet.0g.ai`         | HTTP JSON-RPC endpoint.                        |
| `OG_CHAIN_ID`  | `16602`                                | 0G Galileo testnet (`0x40DA`).                 |
| `OG_LOG_LEVEL` | (unused — see stderr banner)           | Reserved for follow-up structured-log wiring.  |

`apps/indexer/.env` (gitignored) is the recommended place to override
these locally. The root `~/og/.env` is also picked up because the repo's
deploy scripts source from there.

## Output

Each event is one JSON line on **stdout**. Example:

```json
{
  "kind": "Transfer",
  "blockNumber": 942105,
  "txHash": "0x9f1c...",
  "logIndex": 3,
  "from": "0x0000000000000000000000000000000000000000",
  "to":   "0x437371db1fbd534bd01bd3f4e66dfa1675952f91",
  "tokenId": "1"
}
```

`bigint` values are stringified (per the JSON spec). Status / lifecycle
lines go to **stderr** so the stdout stream stays a clean NDJSON feed
that downstream consumers (jq, vector, log brokers) can parse.

## Architecture

```
+--------------------+      eth_getLogs (50 blocks / 12s)
| 0G Galileo (16602) | ----------------------------------+
|  - AxiomAgentNFT   |                                    |
|  - AxiomStrategyVault|                                  v
+--------------------+                          +-----------------+
                                                |  apps/indexer   |
                                                |  (this package) |
                                                |                 |
                                                |  decodeEventLog |
                                                |       v         |
                                                |  stdoutSink     |
                                                |  (NDJSON)       |
                                                +--------+--------+
                                                         |
                                       (follow-up)       v
                                                +-----------------+
                                                | apps/backend    |
                                                | orchestrator/   |
                                                | index.ts        |
                                                | -> 0G DA Client |
                                                +-----------------+
```

## Canonical sources

- 0G Galileo testnet config:
  <https://docs.0g.ai/ai-context>
- 0G DA integration (gRPC port 51001, max blob 32 505 852 B):
  <https://docs.0g.ai/developer-hub/building-on-0g/da-integration>
- ERC-721 `Transfer` event signature:
  <https://eips.ethereum.org/EIPS/eip-721>
- ERC-7857 reference (event shapes, oracle flow):
  <https://eips.ethereum.org/EIPS/eip-7857> and
  <https://github.com/0gfoundation/0g-agent-nft>
- ethers v6 `JsonRpcProvider` / `getLogs`:
  <https://docs.ethers.org/v6/api/providers/>
- viem `decodeEventLog` / `parseAbiItem`:
  <https://viem.sh/docs/abi/decodeEventLog.html>

## Next steps

- **MW17**: implement event-to-DA submission via the orchestrator. The
  expected interface is a queue (NATS or Redis Streams) the orchestrator
  subscribes to; this indexer publishes; the orchestrator batches and
  calls `Disperser.DisperseBlob` over gRPC. Blob size cap is 31 744 KiB
  per blob (≈31 MB).
- **MW18+**: persist `nextBlock` to `apps/indexer/data/checkpoint.json`
  and resume on restart; add `viem.watchEvent` WebSocket mode for
  lower latency when 0G exposes a public WSS endpoint.
