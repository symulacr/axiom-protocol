# UUPS Contract Upgrade

## Metadata

- **Category**: chain
- **SDK**: `ethers` ^6.13.0, `@openzeppelin/contracts-upgradeable` v5
- **Activation Triggers**: "UUPS", "upgrade contract", "upgradeTo", "upgradeToAndCall",
  "implementation slot", "ERC-1967", "_authorizeUpgrade", "redeploy"

## Purpose

Upgrade a UUPS-proxy-deployed contract on 0G Chain without changing its address or
storage layout. UUPS (EIP-1822 / EIP-1967) puts the upgrade logic in the implementation
contract, gated by an `_authorizeUpgrade` access-control check, and stores the
implementation address in the ERC-1967 storage slot.

The 0G Axiom stack uses UUPS for `AxiomAgentNFT` and `AxiomTeeVerifier`. A mis-executed
upgrade is unrecoverable (a wrong implementation slot selection = permanent brick), so
this skill pins the always/never rules tightly.

## Prerequisites

- Node.js >= 18
- `ethers` v6 with the proxy admin signer (typically the deployer EOA or a multisig)
- The proxy address (NOT the implementation address)
- The new implementation contract, compiled with the SAME `evmVersion: "cancun"`
- `.env` with `PROXY_ADDRESS`, `NEW_IMPL_ADDRESS`, `PRIVATE_KEY`, `RPC_URL`

## Quick Workflow

1. Verify the proxy's `ERC-1967` slot points to the expected current implementation
   (`eth_getStorageAt(proxy, ERC1967_IMPL_SLOT)`)
2. Verify the new implementation's `upgradeTo` selector resolves to a non-zero address
   (sanity check that the bytecode compiled)
3. Encode the `_authorizeUpgrade` access-control data (typically none — the function
   takes only the `newImplementation` address)
4. Submit `proxy.upgradeToAndCall(newImpl, "0x")` (empty calldata for the no-init case)
5. `await tx.wait()` and re-verify the ERC-1967 slot points to the new implementation
6. Run the live-forked regression suite (`forge test --match-path …`) to prove the
   storage layout is preserved

## Core Rules

### ALWAYS

- Verify the ERC-1967 storage slot BEFORE and AFTER the upgrade. A wrong slot
  = wrong contract = silent storage corruption.
- Compile the new implementation with `evmVersion: "cancun"` — see
  `chain/deploy-contract` for the canonical Hardhat / Foundry configs.
- Use `upgradeToAndCall(newImpl, "0x")` with empty calldata unless you also need to
  re-initialize storage. Re-initializing a UUPS proxy that was already initialized
  reverts — the `initializer` modifier protects you.
- Run the live-forked test suite against the upgraded proxy before declaring the
  upgrade "complete". Foundry's `--fork-url <evmrpc-testnet-turbo.0g.ai>` is the
  canonical way to exercise the proxy against the live Galileo state.
- Preserve the storage layout: append-only struct fields, never reorder, never
  change the type of an existing field. OZ's `StorageSlotUpgradeable` and
  `@custom:storage-location` are your friends.

### NEVER

- Modify the proxy contract. UUPS proxy is intentionally minimal; the upgrade logic
  lives in the implementation.
- Re-initialize a proxy that is already initialized. The `initializer` modifier
  reverts; if you need to set state, write a `reinitializer(N)` function (where `N`
  is one higher than the current version).
- Skip the access-control check on `_authorizeUpgrade`. The default OZ implementation
  restricts to the contract's `owner()`; a missing check is an immediate rug-pull
  surface.
- Use `transparent` proxy + UUPS implementation together — pick ONE upgrade pattern.
  Mixing them creates two implementation slots and one of them will always be stale.
- Submit the upgrade against a contract that has NOT been deployed yet — the
  constructor of the new implementation must have run (via `forge create` or
  `hardhat deploy`).

## Code Examples

### UUPS Implementation Template

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract MyContractV2 is Initializable, OwnableUpgradeable, UUPSUpgradeable {
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initializeV2() external reinitializer(2) {
        // set new state added in V2
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyOwner
    {}
}
```

### Upgrade via `forge create` + `cast send`

```bash
# 1. Deploy the new implementation (NOT a proxy)
forge create src/MyContractV2.sol:MyContractV2 \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY
# → deployed to: 0xNEW_IMPL

# 2. Verify the proxy's current implementation slot
cast call $PROXY_ADDRESS "implementation()(address)" --rpc-url $RPC_URL
# → 0xOLD_IMPL

# 3. Upgrade the proxy
cast send $PROXY_ADDRESS \
  "upgradeToAndCall(address,bytes)" \
  0xNEW_IMPL \
  "0x" \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY

# 4. Verify the slot flipped
cast call $PROXY_ADDRESS "implementation()(address)" --rpc-url $RPC_URL
# → 0xNEW_IMPL
```

### Upgrade via ethers v6 (Typed)

```typescript
import { ethers } from "ethers";

const proxy = new ethers.Contract(
  proxyAddress,
  ["function upgradeToAndCall(address,bytes) payable",
   "function implementation() view returns (address)"],
  wallet,
);

const before = await proxy.implementation();
console.log("Before:", before);

const tx = await proxy.upgradeToAndCall(newImplAddress, "0x");
await tx.wait();

const after = await proxy.implementation();
console.log("After:", after);
if (after.toLowerCase() !== newImplAddress.toLowerCase()) {
  throw new Error(`Upgrade failed: impl slot is ${after}, not ${newImplAddress}`);
}
```

### Live-Forked Regression After Upgrade

```bash
# Foundry: run the regression suite against the live Galileo state
forge test --match-path test/AxiomAgentNFT.t.sol \
  --fork-url https://evmrpc-testnet-turbo.0g.ai \
  -vv
```

## Anti-Patterns

```solidity
// BAD: missing access control on _authorizeUpgrade
function _authorizeUpgrade(address) internal override {} // anyone can upgrade!

// BAD: reordering storage slots
contract MyContractV2 is ... {
    uint256 newField;        // ← inserted at slot 0, breaks the layout
    uint256 existingField;   // now at slot 1
}
```

```bash
# BAD: skipping the post-upgrade slot check
cast send $PROXY "upgradeToAndCall(address,bytes)" 0xNEW_IMPL "0x" --rpc-url $RPC_URL
# Done! (no — verify the slot flipped AND run the regression suite)

# BAD: upgrading with calldata when re-initialization is NOT supported
cast send $PROXY "upgradeToAndCall(address,bytes)" 0xNEW_IMPL "0x..." --rpc-url $RPC_URL
# Reverts because the implementation is not a `reinitializer(N)` target

# BAD: compiling the new implementation with the wrong evmVersion
solc --evm-version paris MyContractV2.sol  # invalid opcode on 0G Chain
```

## Common Errors & Fixes

| Error                                                  | Cause                                                | Fix                                                                 |
| ------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------- |
| `ERC1967Upgrade: new implementation is not UUPS`       | The new implementation does not extend `UUPSUpgradeable` | Confirm the new impl inherits `UUPSUpgradeable`                    |
| `Ownable: caller is not the owner`                     | `upgradeTo` was sent from a non-owner account        | Send from the proxy owner (the EOA that originally deployed)       |
| Initializable: contract is already initialized         | Tried to re-init a proxy that already initialized    | Use `reinitializer(N)` instead of `initialize`                     |
| Storage layout mismatch — `X` reverted in test        | A new field was inserted in the middle of the struct | Move new fields to the end of the contract (append-only)           |
| `invalid opcode` on 0G Chain                           | Compiled with the wrong `evmVersion`                 | Set `evmVersion: "cancun"` in `hardhat.config.ts` / `foundry.toml`  |
| Slot did not flip after `upgradeTo`                    | The proxy is a transparent proxy, not UUPS           | Verify the proxy is `UUPSUpgradeable` (not `TransparentUpgradeable`) |

## Related Skills

- [Deploy Contract](../deploy-contract/SKILL.md) — for the initial deploy pattern
- [Interact Contract](../interact-contract/SKILL.md) — for the ethers v6 read/write
  patterns
- [iNFT Lifecycle](../i-nft-lifecycle/SKILL.md) — the production use case for UUPS in
  the Axiom stack

## References

- [EIP-1967: Proxy Storage Slots](https://eips.ethereum.org/EIPS/eip-1967)
- [EIP-1822: UUPS Proxy](https://eips.ethereum.org/EIPS/eip-1822)
- [OpenZeppelin v5: Upgrades Plug-in](https://docs.openzeppelin.com/upgrades-plugins/1.x/)
- [OpenZeppelin v5: UUPSUpgradeable](https://docs.openzeppelin.com/contracts/5.x/api/proxy#UUPSUpgradeable)
- [Foundry Book: forge create](https://book.getfoundry.sh/reference/forge/forge-create)
- [Chain Patterns](../../../patterns/CHAIN.md)
