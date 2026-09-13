# W7-B — Permit2 live-signature investigation (raw evidence)

Date: 2026-09-01. Fork: `anvil --fork-url https://evmrpc-testnet.0g.ai --chain-id 16602`
(forge 1.5.1-stable; anvil pinned chainid 16602 to keep cached-domain logic deterministic).

## Evidence files

- `w7-b-evidence/0g-permit2-code.hex` — runtime code of `0x0000…78BA3` fetched twice from
  the live RPC (cast + raw curl, byte-identical) and once through the anvil fork (also
  byte-identical). 9152 bytes, keccak `0xff0c864f…e160f123d`.
- `w7-b-evidence/local-code.hex` — runtime code of upstream Permit2 (Uniswap/permit2 @
  `cc56ad0f`, solc 0.8.17, via-ir, 1M runs, `bytecode_hash = none`) built and deployed at
  chainid 16602 in the fork. Also 9152 bytes.

## Byte-diff of the two runtime codes

Exactly one 32-byte word differs (bytes 6983..7014):

| | value |
| --- | --- |
| 0G deployed | `0x86d3dbd7fd9fa71c4e5ba8100b8e4cae08d31d183f0cfa52e63260ec6d782ecf` |
| local build | `0xb7a32c345eed1df59a77f8e9459e6ee98068124fd4e6501453113e95a44be1b7` |

That word is the `_CACHED_DOMAIN_SEPARATOR` immutable, baked into code at deploy time.
Recomputing it manually confirms both are the same formula, different inputs:

- local (deployed at `0x5aAdFB…D70e3`): keccak(typehash ‖ keccak("Permit2") ‖ 16602 ‖
  0x5aAdFB43eF8dAF45DD80F4676345b7676f1D70e3) = `0xb7a32c34…`
- 0G (deployed at the canonical `0x0000…78BA3`): same formula with that address =
  `0x86d3dbd7…782ecf` — i.e. the deployed contract's cached separator is exactly the
  expected canonical Permit2 domain on 16602.

=> The 0G deployment IS upstream Permit2 built by the repo's own foundry settings. Not a
variant, not a different version. Every other byte (including all typehash constants and
the signature-verification code) matches.

## Fork test results (forge tests vendored in /tmp/proto-w7b/permit2)

All tests run against the DEPLOYED code in the fork, chainid 16602, signer key 0xA11CE,
sig = 65-byte (r, s, v=27) from `vm.sign`, digest built from the domain
`keccak(typehash, keccak("Permit2"), 16602, 0x0000…78BA3)`:

1. `test_fresh_upstream_single_permit` (fresh upstream Permit2, permitTransferFrom) — PASS
2. `test_deployed_single_permit` (deployed code, same call) — PASS
3. `test_deployed_witness_stub_permit` (deployed code, witness stub typehash) — PASS
4. `test_deployed_eip2098_compact_sig` — PASS
5. `test_deployed_v01_sig` (v encoded as 0/1) — PASS
6. `W7BDeployedProbe::test_probe` — allowance `permit` (0x927da105) against deployed code:
   `allowance_permit_ok: true`; `permitTransferFrom` (0x30f28b7a) against deployed code:
   `sigtransfer_permit_ok: true`
7. `W7BWitnessLive::test_witness_live_path` — exact AxiomPaymentProcessor witness digest
   (stub ++ "AgentPayment witness)TokenPermissions(address token,uint256 amount)AgentPayment(uint256 agentTokenId,uint256 amount)"),
   spender = test contract, against deployed code: SUCCESS (no InvalidSigner)
8. `W7BBatchReplay::test_batch_variants` — the exact P2Variant.s.sol batch digests
   (variant A with suffix, variant B without), spender = V3 processor proxy
   `0xe6956f663103c6E1e5077c3256c453b95924112a`, nonce 0, deadline 1788220629, against
   deployed code: BOTH SUCCESS (sig verification passed and the nonce burned, letting the
   transfer leg run; "success" here means the full call returned, transfer of a codeless
   token included — no InvalidSigner at any point).

## Conclusion from evidence

- The deployed bytecode is upstream Permit2 (single-word diff = cached domain separator,
  which is CORRECT for the canonical address on chainid 16602).
- The deployed code accepts (r, s, v) 65-byte sigs of EIP-712 digests built from the
  documented domain, for single, witness, and batch permits, signed by `vm.sign`.
- Therefore hypothesis (a) 2098-layout mismatch: false (both layouts accepted).
  Hypothesis (c) stale cached separator: false (cached word = correct canonical domain).
  Hypothesis (b) precompile quirk: false — the same ecrecover precompile is exercised by
  the fork's verifier and it recovers correctly.
- The live `InvalidSigner (0x815e1d64)` must come from a digst-input divergence in the
  production call, not from Permit2's code or sig encoding. Prime suspects:
  1. `spender` in the signed message ≠ `msg.sender` seen by Permit2 (e.g. signature
     produced with spender = signer EOA but the permit redeemed through the processor so
     Permit2 sees the processor as spender, or an ERC-2771 forwarder in the call path).
  2. Nonce reuse: the P2Variant digests sign nonce 0 with deadline 1788220629; the batch
     replay above BURNED nonce 0 for that owner on the local fork only, but on the live
     chain earlier partially-successful attempts may have burned word-0 bits.
  3. permit struct fields (permitted token/amount, nonce, deadline) not byte-identical to
     what was signed (e.g. deadline seconds/ms mixup, amount units).
