# 0G Storage Indexer Queries

## Metadata

- **Category**: storage
- **SDK**: `@0gfoundation/0g-ts-sdk` ^1.2.8, `ethers` ^6.13.0
- **Activation Triggers**: "indexer URL", "chain id", "Galileo storage", "Aristotle storage", "pick storage network", "flow contract"

## Purpose

Look up the canonical 0G Storage indexer URL and the on-chain `Flow` contract address for a
given EIP-155 `chainId`, without re-deriving them from a brittle RPC-URL substring heuristic.

The `chainId → { indexer, flow }` table is the network selector: the orchestrator and the
storage client both need to know which indexer to talk to and which `Flow` contract to
submit a `submitBlob` / `KvClient` transaction against. Picking the wrong one causes silent
failures (`submissions succeed on the wrong chain, lookups 404, fees are mis-billed).

## Prerequisites

- Node.js >= 18
- `ethers` v6 installed
- `.env` with the canonical chain id (`OG_CHAIN_ID` or hardcoded `16602` for Galileo,
  `16661` for Aristotle)
- `@0gfoundation/0g-ts-sdk` (uses `Indexer` and `getFlowContract`)

## Quick Workflow

1. Read the EIP-155 `chainId` from the connected `JsonRpcProvider`
2. Look up the entry in a hard-coded `Record<number, OGNetwork>` table
3. Return the canonical `storageRpc` and `flowContract` addresses
4. Construct `new Indexer(network.storageRpc)` for reads
5. Use `getFlowContract(network.flowContract)` for Flow interactions

## Core Rules

### ALWAYS

- Use the explicit `chainId → OGNetwork` lookup, never `rpc.includes("storage")` substring
  matching. The `includes` heuristic breaks when the indexer URL is a CNAME or has a
  non-storage subdomain.
- Verify `chainId` against the table BEFORE constructing the `Indexer`. Throw
  `Error("Unsupported chainId: …")` for unknown values.
- Use the Galileo indexer for `chainId === 16602` and the Aristotle indexer for
  `chainId === 16661`. Do not mix them up.
- Treat the `flowContract` as a checksummed `0x${string}` — never use it as a lowercase
  string when calling `getFlowContract`.
- Read the table from a single source-of-truth module (e.g. `apps/backend/src/storage/chain-id.ts`).
  Do not duplicate the constants in each call site.

### NEVER

- Re-derive the indexer URL from `RPC_URL` by string-replacing or substring-matching.
- Submit a Flow transaction to a contract address picked from environment variables
  without first validating it is the canonical entry for the connected chain.
- Hardcode Galileo or Aristotle addresses directly in call sites — always go through the
  table.
- Use a non-canonical indexer URL (e.g. a devnet or a third-party gateway) when the
  on-chain Flow contract is the canonical one — the indexer URL and the Flow contract
  are a pair.

## Code Examples

### The Chain-Id Lookup Table

```typescript
/**
 * The canonical 0G network entry for a given EIP-155 chainId.
 *
 * Sources:
 *  - https://docs.0g.ai/ai-context
 *  - https://docs.0g.ai/developer-hub/mainnet/mainnet-overview
 */
export interface OGNetwork {
  readonly name: "galileo" | "aristotle";
  readonly chainId: number;
  readonly storageRpc: string;
  readonly flowContract: `0x${string}`;
}

export const OG_NETWORKS = {
  16602: {
    name: "galileo",
    chainId: 16602,
    storageRpc: "https://indexer-storage-testnet-turbo.0g.ai",
    flowContract: "0x22E03a6A89B950F1c82ec5e74F8eCa321a105296",
  },
  16661: {
    name: "aristotle",
    chainId: 16661,
    storageRpc: "https://indexer-storage-turbo.0g.ai",
    flowContract: "0x62D4144dB0F0a6fBBaeb6296c785C71B3D57C526",
  },
} as const satisfies Record<number, OGNetwork>;

export function pickOGNetwork(chainId: number): OGNetwork | null {
  return (OG_NETWORKS as Record<number, OGNetwork>)[chainId] ?? null;
}
```

### Wire an Indexer and a Flow Contract from a Connected Chain

```typescript
import { Indexer, getFlowContract } from "@0gfoundation/0g-ts-sdk";
import { ethers } from "ethers";

async function buildStorageContext(rpcUrl: string) {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);

  const og = pickOGNetwork(chainId);
  if (og === null) throw new Error(`Unsupported chainId: ${chainId}`);

  const indexer = new Indexer(og.storageRpc);
  const flow = getFlowContract(og.flowContract);

  return { chainId, name: og.name, indexer, flow };
}
```

## Anti-Patterns

```typescript
// BAD: substring-matching the RPC URL to pick the indexer
const indexer = new Indexer(rpcUrl.includes("storage") ? galileoRpc : aristotleRpc);
// Breaks on CNAMEs, custom subdomains, or future Galileo mirrors.

// BAD: hardcoded addresses in a call site
const flow = getFlowContract("0x22E03a6A89B950F1c82ec5e74F8eCa321a105296");
// Will silently submit to Galileo even when the connected chain is Aristotle.

// BAD: switching on environment variable instead of chainId
const flow = process.env.IS_TESTNET === "true" ? galileoFlow : aristotleFlow;
// env vars and the connected chain can disagree (e.g. a redeploy script run with
// the wrong env).
```

## Common Errors & Fixes

| Error                        | Cause                                    | Fix                                                              |
| ---------------------------- | ---------------------------------------- | ---------------------------------------------------------------- |
| `Unsupported chainId: X`     | Connected to a non-0G chain              | Verify `RPC_URL`; only `16602` (Galileo) and `16661` (Aristotle) |
| Flow tx reverts with `0x05`  | Wrong `flowContract` for the connected chain | Pick from the table; never hardcode                            |
| Indexer 404 on `getFileInfo` | Wrong indexer URL                        | Use the `storageRpc` from the chainId entry                      |
| `submissions` succeed but file is unfindable | Submitted to Galileo Flow while connected to Aristotle | The flow contract and the indexer URL are a pair — verify both come from the same `pickOGNetwork(chainId)` |

## Related Skills

- [Upload File](../upload-file/SKILL.md) — uses the indexer for `indexer.upload(...)`
- [Download File](../download-file/SKILL.md) — uses the indexer for `indexer.download(...)`
- [Merkle Verification](../merkle-verification/SKILL.md) — uses the same indexer
- [Chain ID Picker](../../chain/chain-id-picker/SKILL.md) — the upstream client-side
  chain-id selector pattern this skill descends from

## References

- [0G AI Context (canonical chainIds + indexer URLs + Flow addresses)](https://docs.0g.ai/ai-context)
- [0G Mainnet Overview (Aristotle indexer URL)](https://docs.0g.ai/developer-hub/mainnet/mainnet-overview)
- [0G Storage SDK](https://docs.0g.ai/developer-hub/building-on-0g/storage/sdk)
- [Storage Patterns](../../../patterns/STORAGE.md)
- [Network Config](../../../patterns/NETWORK_CONFIG.md)
