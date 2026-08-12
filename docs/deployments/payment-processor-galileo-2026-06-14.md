# AxiomPaymentProcessor — Live Redeploy on 0G Galileo (2026-06-14)

**Deployed:** *attempted* 2026-06-14 (broadcast failed: operator wallet drained)
**Network:** 0G Galileo Testnet (chainId 16602)
**RPC:** https://evmrpc-testnet.0g.ai
**Explorer:** https://chainscan-galileo.0g.ai
**Operator wallet:** `0x437371dB1FBD534Bd01BD3f4E66DfA1675952F91` (PK in `wallets/deployer.json`)

## Status: BUG-PAY-FIX-01 PENDING — operator wallet needs refuel

The Wave 13C/13E observation that `cast code 0xEf1bA81ba3A9c37a3A6efF46BB2B029d4068fd8D`
returns `0x` on Galileo is **confirmed**: this redeploy log records an attempted broadcast
that also failed, this time because the operator wallet is drained.

## Pre-flight (on-chain)

| Address | Expected | `cast code` | Length |
|---|---|---|---|
| `0xEf1bA81...` (pre-recorded docs target) | AxiomPaymentProcessor | `0x` | 0 bytes (empty) |
| `0x61D039...` (AxiomAgentNFT proxy) | runtime | `0x60806040527f3608...` | > 24 bytes ✓ |
| `0x437371...` (operator EOA) | empty | `0x` | 0 bytes ✓ (EOA) |

Operator balance: **0.00002703 OG** (`27,028,770,624,870` wei) — *drained* per Wave 13C.

## Script written

`apps/contracts/script/DeployPaymentProcessor.s.sol` (Foundry script, 197 lines).

What it does, in order:

1. **Network guard** — reverts unless `block.chainid == 16602`.
2. **Pre-flight** — `TARGET_ADDRESS.code.length == 0` check. If 0xEf1bA81... already has
   code from a previous successful run, exit early.
3. **Deploy mock payment token** — `AxiomMockUSDC` (real OZ ERC-20) via plain CREATE.
   Necessary because the AxiomPaymentProcessor constructor reverts on
   `paymentTokenAddr == address(0)`, and 0G Galileo has no live bridged USDC.e / USDG.
4. **Compute CREATE2 predicted address** — using `vm.computeCreate2Address(salt, keccak256(initCode), deployer)`
   with:
   - `salt = keccak256("AxiomPaymentProcessor.galileo.2026-06-14")` = `0x56cb89aa...e21`
   - `initCode = abi.encodePacked(type(AxiomPaymentProcessor).creationCode, abi.encode(nft, paymentToken, operator, 100, operator))`
   - `initCodeHash = 0x32f67a01...f66`
   - `deployer = 0x437371...` (operator EOA)
5. **Log predicted vs target** — never asserts a hard equality (single-salt CREATE2 has
   `1/2^160` chance of hitting a pre-recorded address; brute force is not viable in
   script context). Logs the predicted address either way.
6. **Plain-CREATE fallback** — `new AxiomPaymentProcessor(nft, paymentToken, operator, 100, operator)`.
   This is the address that actually ends up live.
7. **Sanity-check the live bytecode** — read back `AXIOM_NFT()` and `paymentToken()` from
   the freshly-deployed contract to confirm the constructor wired the arguments correctly.

## Pre-computed parameters (canonical, do not change between runs)

| Field | Value | Source |
|---|---|---|
| `TARGET_ADDRESS` (docs) | `0xEf1bA81ba3A9c37a3A6efF46BB2B029d4068fd8D` | `docs/deployments/galileo-2026-06-14.md:16` |
| `NFT_PROXY` | `0x61D0390577A6c3a37d91B307C5fCbb77A8A883E2` | `docs/deployments/galileo-2026-06-14.md:13` |
| `OPERATOR` (broadcaster + treasury + owner) | `0x437371dB1FBD534Bd01BD3f4E66DfA1675952F91` | `wallets/ADDRESSES.md` |
| `SALT` (CREATE2) | `keccak256("AxiomPaymentProcessor.galileo.2026-06-14")` = `0x56cb89aa54546daa5957710e8a916a1f5ff3b3df79febca5cd94193a0f659e21` | script line ~123 |
| `initCodeHash` (with current paymentToken placeholder) | `0x32f67a018edd6f5adbef9cc9d901d416ae98a669076fa5eb2b1924731a1fdf66` | computed by `forge script` dry-run |
| `CREATE2_PREDICTED` | `0x65Bb43F614Fe68fe43a971CbBc378098365Feb9F` | **MISMATCH** with `TARGET_ADDRESS` (as expected) |

## CREATE2 vs Target — why they don't match (analysis)

The 0G docs claim `0xEf1bA81...` is the live AxiomPaymentProcessor address. Wave 13C
discovered it has no on-chain code. The history from
`apps/contracts/broadcast/Deploy.s.sol/16602/run-latest.json` shows the original
`Deploy.s.sol` run attempted a CREATE at nonce 0x8 with the **predicted address
`0xef1ba81ba3a9c37a3a6eff46bb2b029d4068fd8d`**, but the transaction never mined
(`hash: null`, listed under `pending`, status missing). Two explanations are
consistent with the evidence:

1. **The deploy was broadcast but never reached the mempool** (operator out of gas
   at nonce 0x8 of an earlier run; tx was a "pending" stub that never got mined).
   In that case the address was the *plain-CREATE* predicted address for the operator
   at that earlier nonce — i.e. it was never a CREATE2 deployment.
2. **The doc author hand-typed or copy-pasted a predicted address and the actual
   deploy never happened** (the wave 12 / wave 13 deploy was a no-op due to the
   PAYMENT_TOKEN_ADDR env var being unset, etc.).

Either way, the address is no longer reachable from a single fixed-salt CREATE2
without brute-forcing 2^160 salts. The pre-recorded `TARGET_ADDRESS` is preserved
in the doc for historical / indexer compatibility, but the **live deployment
will live at a plain-CREATE address** computed from the operator's current nonce.

## Live broadcast — pre-computed addresses (this attempt)

Computed with `cast compute-address 0x437371... --nonce N` against the operator's
current on-chain nonce `0x9c = 156` (`cast nonce 0x437371... --rpc-url ...` returns `156`).

| Nonce | Contract | Predicted address |
|---|---|---|
| 156 | AxiomMockUSDC (mock payment token) | `0x4AC34dc641A7f760FfdDb53b101509321752f817` |
| 157 | AxiomPaymentProcessor (plain CREATE fallback) | `0xa1A6431dbF03332755CD0A217A1F530b397f17a8` |

> **Note**: `0xa1A6431dbF03332755CD0A217A1F530b397f17a8` happens to be the same
> address the foundry **simulation** produced for AxiomMockUSDC (because the
> simulation also starts the broadcaster at nonce 0). The real on-chain deploys
> will go to the addresses above.

## Live broadcast attempt — exact error

The `forge script ... --broadcast --priority-gas-price 2000000000 --legacy --slow`
command returned the following RPC error (verbatim, from
`/home/eya/og/apps/contracts/broadcast/DeployPaymentProcessor.s.sol/16602/run-latest.json`):

```
Error: Failed to send transaction after 4 attempts
Err(server returned an error response: error code -32000: 
    insufficient funds for gas * price + value: 
      balance 27028770624870,        # 0.00002703 OG (operator)
      tx cost 2666116004665703,     # 0.00266612 OG
      overshot 2639087234040833)    # 0.00263896 OG
```

Estimated tx cost breakdown (from the same `forge script` run):
- `gas_estimate: 1923496` (two CREATEs: mock ERC-20 + PaymentProcessor)
- `gas_price: 4.000000007 gwei` (Galileo base fee + the 2 gwei priority we asked for)
- `total: 0.007693984013464472 ETH` (read as the simulation's amount, before priority
  bumping) — actual cost ~0.0027 OG once the priority-gas-price flag is respected.

**Fix**: refuel `0x437371...` from `https://faucet.0g.ai` (0.1 OG/day per address,
https://docs.0g.ai/ai-context), then re-run the exact command:

```bash
cd ~/og/apps/contracts
ORACLE_ADMIN_PK=$ORACLE_ADMIN_PK \
forge script script/DeployPaymentProcessor.s.sol --tc DeployPaymentProcessor \
     --rpc-url https://evmrpc-testnet.0g.ai --chain-id 16602 \
     --broadcast --priority-gas-price 2000000000 --legacy --slow
```

Post-deploy verification:

```bash
# 1. The pre-recorded docs address will STILL be empty (0xEf1bA81... is not
#    reachable via a single-salt CREATE2). Use the plain-CREATE fallback address
#    from the run output instead.
cast code 0xa1A6431dbF03332755CD0A217A1F530b397f17a8 --rpc-url https://evmrpc-testnet.0g.ai
# expected: non-zero bytecode starting with 0x60806040...

# 2. paymentToken() should return the mock USDC address
cast call 0xa1A6431dbF03332755CD0A217A1F530b397f17a8 \
     "paymentToken()(address)" --rpc-url https://evmrpc-testnet.0g.ai
# expected: 0x4AC34dc641A7f760FfdDb53b101509321752f817

# 3. AXIOM_NFT() should return the proxy
cast call 0xa1A6431dbF03332755CD0A217A1F530b397f17a8 \
     "AXIOM_NFT()(address)" --rpc-url https://evmrpc-testnet.0g.ai
# expected: 0x61D0390577A6c3a37d91B307C5fCbb77A8A883E2
```

## Acceptance checklist

| Step | Result |
|---|---|
| (a) Script syntax check (`forge build`) | ✅ Clean (lint warnings only, none in the new file) |
| (b) Predicted address computation | ✅ `0x65Bb43F6...` ≠ `0xEf1bA81...` (MISMATCH; documented) |
| (c) Live broadcast result | ⚠️ Attempted, failed: `insufficient funds ... overshot 2639087234040833` wei |
| (d) Post-deploy `cast code 0xEf1bA81...` | ✅ `0x` (empty — same as before; broadcast didn't go through) |
| BUG-PAY-13C-01 marked FIXED in BUGS.md | ⏳ Pending refuel; entry added with `STATUS: PENDING REFUND → BROADCAST` |
| Canonical source URL in script | ✅ Foundry CREATE2 guide: https://getfoundry.sh/guides/deterministic-deployments-using-create2 ; OZ ERC-20: https://docs.openzeppelin.com/contracts/5.x/api/token/erc20#ERC20 ; EIP-20: https://eips.ethereum.org/EIPS/eip-20 |

## Canonical sources cited in the deploy script

- Foundry CREATE2 deterministic deployments: https://getfoundry.sh/guides/deterministic-deployments-using-create2
- OpenZeppelin ERC-20: https://docs.openzeppelin.com/contracts/5.x/api/token/erc20#ERC20
- EIP-20 (ERC-20 standard): https://eips.ethereum.org/EIPS/eip-20
- 0G Galileo testnet reference: https://docs.0g.ai/ai-context
- 0G Chain: https://docs.0g.ai/developer-hub/mainnet/mainnet-overview
