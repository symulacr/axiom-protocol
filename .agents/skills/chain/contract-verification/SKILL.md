# Smart Contract Verification

## Metadata

- **Category**: chain
- **SDK**: `ethers` ^6.13.0, Foundry / Hardhat
- **Activation Triggers**: "verify contract", "block explorer", "chainscan", "source
  code", "verify on Galileo", "verify on Aristotle"

## Purpose

Publish the Solidity source code of a deployed contract to the 0G Chain block explorer
so users can read it on-chain, audit the deployed bytecode against the source, and
interact with it through a trusted UI.

There are two verification paths in the 0G stack:

1. **Foundry** — `forge verify-contract` (single-shot, no plugin needed)
2. **Hardhat** — `hardhat verify --network 0g-testnet` (uses the `@nomicfoundation/hardhat-verify` plugin)

Both go through the 0G ChainScan API (Galileo: `https://chainscan-galileo.0g.ai/api`,
Aristotle: `https://chainscan.0g.ai/api`). Mis-verified source = the explorer shows
"unverified" or — worse — mismatched source, which destroys user trust.

## Prerequisites

- Node.js >= 18 (Hardhat path) OR Foundry `>=0.2.0` (Foundry path)
- A deployed contract address (not the proxy address — the IMPLEMENTATION address for
  UUPS proxies)
- The exact `solc` version + `evmVersion` used to compile the deployed bytecode
- The exact constructor arguments, ABI-encoded (for non-default constructors)
- An Etherscan-compatible API key (the 0G ChainScan accepts a placeholder for the
  Galileo testnet; mainnet Aristotle requires a registered key)

## Quick Workflow

1. Determine the implementation address (for UUPS proxies, call
   `proxy.implementation()` first)
2. Pick the verification path (Foundry or Hardhat) based on which tool compiled the
   contract
3. Compile locally with the SAME `solc` version and `evmVersion` used at deploy time
4. Submit the verification request with the exact constructor args
5. Wait for the explorer to ingest (usually 5-30 seconds for Galileo, 30-120 seconds
   for Aristotle)
6. Confirm the explorer page now shows "Contract Source Code Verified"

## Core Rules

### ALWAYS

- Verify the **implementation** address, NOT the proxy. The proxy's bytecode is the
  27-byte `ERC1967Proxy` runtime — verifying that produces a useless "verified" page.
- Use the same `solc` version (down to the patch) and `evmVersion` ("cancun" for 0G
  Chain) as the deploy. A 0.8.24 vs 0.8.25 mismatch is enough to fail verification.
- For non-default constructors, ABI-encode the constructor args ONCE and reuse that
  exact encoding for both `forge verify-contract` and the explorer. The encoding is
  positional and case-sensitive.
- Pass the `--chain-id` flag (Foundry) or `--network` flag (Hardhat) — DO NOT rely on
  the RPC URL alone; the explorer endpoint is derived from the chain id, not the RPC.
- Pin the `evmVersion: "cancun"` in your Foundry / Hardhat config — see
  `chain/deploy-contract`.

### NEVER

- Verify a proxy. The proxy's bytecode is the OZ ERC1967Proxy runtime; the
  meaningful contract is the implementation behind it.
- Re-compile with optimizer settings different from the deploy. A 200-vs-999 run
  mismatch produces a different bytecode and verification will fail.
- Use `--optimize` in `forge verify-contract` if the deploy was not optimized (and
  vice versa). The optimizer runs + the `via-ir` flag must match.
- Submit constructor args that include the deployer's address in the wrong slot — the
  ABI-encoding is positional.
- Hardcode the API key in the script — load from `.env` via `ETHERSCAN_API_KEY`
  (Hardhat) or `--api-key $ETHERSCAN_API_KEY` (Foundry).

## Code Examples

### Foundry: `forge verify-contract`

```bash
# Verify a UUPS implementation on Galileo testnet
forge verify-contract \
  --rpc-url https://evmrpc-testnet-turbo.0g.ai \
  --chain-id 16602 \
  --verifier-url https://chainscan-galileo.0g.ai/api \
  0xIMPL_ADDRESS \
  src/AxiomAgentNFT.sol:AxiomAgentNFT \
  --constructor-args $(cast abi-encode "constructor(address)" 0xTEE_VERIFIER) \
  --compiler-version 0.8.24 \
  --evm-version cancun \
  --optimizer \
  --optimizer-runs 200
```

### Foundry: With API Key from `.env`

```bash
forge verify-contract \
  --chain-id 16661 \
  --verifier-url https://chainscan.0g.ai/api \
  0xIMPL_ADDRESS \
  src/AxiomAgentNFT.sol:AxiomAgentNFT \
  --api-key $ETHERSCAN_API_KEY
```

### Hardhat: `hardhat verify`

```typescript
// hardhat.config.ts (excerpt)
const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: { evmVersion: "cancun", optimizer: { enabled: true, runs: 200 } },
  },
  etherscan: {
    apiKey: {
      "0g-testnet": process.env.ETHERSCAN_API_KEY_GALILEO ?? "PLACEHOLDER",
      "0g-mainnet": process.env.ETHERSCAN_API_KEY_ARISTOTLE!,
    },
    customChains: [
      {
        network: "0g-testnet",
        chainId: 16602,
        urls: {
          apiURL: "https://chainscan-galileo.0g.ai/api",
          browserURL: "https://chainscan-galileo.0g.ai",
        },
      },
      {
        network: "0g-mainnet",
        chainId: 16661,
        urls: {
          apiURL: "https://chainscan.0g.ai/api",
          browserURL: "https://chainscan.0g.ai",
        },
      },
    ],
  },
  networks: {
    "0g-testnet": { url: "https://evmrpc-testnet-turbo.0g.ai", chainId: 16602, accounts: [process.env.PRIVATE_KEY!] },
    "0g-mainnet": { url: "https://evmrpc.0g.ai", chainId: 16661, accounts: [process.env.PRIVATE_KEY!] },
  },
};
export default config;
```

```bash
# Verify an AxiomAgentNFT implementation on Galileo
npx hardhat verify --network 0g-testnet \
  0xIMPL_ADDRESS \
  0xTEE_VERIFIER_ADDRESS
```

### Resolve the Implementation from a UUPS Proxy First

```typescript
import { ethers } from "ethers";

async function resolveImpl(proxyAddress: string, rpc: string): Promise<string> {
  const provider = new ethers.JsonRpcProvider(rpc);
  const proxy = new ethers.Contract(
    proxyAddress,
    ["function implementation() view returns (address)"],
    provider,
  );
  return proxy.implementation();
}
```

## Anti-Patterns

```bash
# BAD: verifying the proxy address
forge verify-contract 0xPROXY_ADDRESS src/MyContract.sol:MyContract ...
# The proxy's bytecode is the 27-byte ERC1967Proxy runtime, not MyContract.

# BAD: mismatched solc patch version
# Deploy compiled with 0.8.24; verify with 0.8.25 → mismatch.

# BAD: missing the --evm-version flag in forge verify-contract
forge verify-contract 0xIMPL src/MyContract.sol:MyContract --compiler-version 0.8.24
# Default evmVersion is "paris"; the deploy was "cancun" → mismatch.

# BAD: ABI-encoding the constructor args inline in a way the explorer can't parse
# The explorer needs the SAME bytes the deploy submitted, no whitespace, 0x-prefixed.

# BAD: relying on the RPC URL to infer the chain
forge verify-contract --rpc-url https://evmrpc.0g.ai 0xIMPL src/MyContract.sol:MyContract
# The explorer endpoint is on the chain id (16661), not the RPC. Always pass --chain-id.
```

## Common Errors & Fixes

| Error                                  | Cause                                                       | Fix                                                                       |
| -------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| `Fail - Unable to verify`              | Constructor args don't match the deploy                     | Re-encode the args with `cast abi-encode` and retry                       |
| `Fail - Unknown evm version`           | `evmVersion` not "cancun"                                   | Set `evmVersion: "cancun"` in `foundry.toml` / `hardhat.config.ts`        |
| `Fail - Compiler version mismatch`    | Different `solc` patch between deploy and verify            | Re-deploy (or re-compile locally) with the exact version                  |
| `Fail - Optimizer settings mismatch`  | `optimizer-runs` differ                                     | Pass `--optimizer-runs 200` (or whatever the deploy used)                |
| `Fail - Bytecode mismatch`             | A library address was different at deploy time              | Re-verify with `--libraries "MyLib=0xLIB_ADDRESS"`                        |
| Explorer page shows "unverified"       | Verification API returned 200 but the explorer hasn't ingested yet | Wait 30 seconds and refresh; check the explorer's "Verified Contracts" tab |

## Related Skills

- [Deploy Contract](../deploy-contract/SKILL.md) — for the deploy pattern this skill
  follows up on
- [Interact Contract](../interact-contract/SKILL.md) — for reading the verified source's
  ABI
- [Contract Upgrade](../contract-upgrade/SKILL.md) — when you upgrade, you must
  re-verify the new implementation

## References

- [Foundry Book: forge verify-contract](https://book.getfoundry.sh/reference/forge/forge-verify-contract)
- [Hardhat: hardhat-verify](https://hardhat.org/hardhat-runner/plugins/nomicfoundation-hardhat-verify)
- [Etherscan-compatible API (Etherscan): verification standard](https://docs.etherscan.io/api-endpoints/contracts)
- [0G Chain Docs (Galileo + Aristotle)](https://docs.0g.ai/build-with-0g/0g-chain)
- [Chain Patterns](../../../patterns/CHAIN.md)
