# Wave 8: B4 fix — canonical EIP-712 digest on AxiomGasTank

Date: 2026-09-01 · Network: 0G Galileo testnet (chainId 16602) · Status: deployed + verified on-chain

## Root cause

The deployed GasTank (`0xE986B04Cf266E06D7097452af471D7b0e306898d`, W5-B build) computed the
relay digest with:

```solidity
_hashTypedDataV4(keccak256(abi.encode(FORWARD_REQUEST_TYPEHASH, req)));
```

`req` is a calldata struct whose `data` member is dynamic (`bytes`). Solidity's struct
expansion inside `abi.encode` ABI-encodes dynamic members **in place** (offset word, length
word, tail bytes) — that is ABI-encoding, not EIP-712 hashStruct. Canonical hashStruct
requires dynamic members to be hashed first (`keccak256(data)` occupying one 32-byte word),
exactly how Permit2's `PermitHash.hashWithWitness` expands `PermitBatchTransferFrom`.
Consequence: every wallet signing canonical typed data (`eth_signTypedData_v4`, the FE path in
`packages/config/src/eip712.ts` + `transport-browser.ts`) produced a digest the contract did
not expect → `InvalidUserSignature (0xe3fb657c)` on every wallet-signed relay.

Pre-fix divergence (W7-C evidence, confirmed locally by the probe before the fix): live view
digest `0x1f99abc5…` ≠ canonical `0xc54973dd…` for the same request.

## Fix

`apps/contracts/src/AxiomGasTank.sol` — both `forwardRequestDigest(req)` (view) and
`_verifySig` now expand the struct members explicitly with the dynamic member hashed:

```solidity
keccak256(abi.encode(
    FORWARD_REQUEST_TYPEHASH,
    req.user, req.target, keccak256(req.data),
    req.maxGasCost, req.nonce, req.deadline
))
```

NatSpec added on the view documenting the canonical-EIP-712 decision and why
`abi.encode(TYPEHASH, req)` must never come back. The alternative form (keeping
`abi.encode(tp, req)`) was probed and rejected: Solidity does NOT keccak dynamic members in
calldata-struct expansion, so that form can never match wallets.

## Probe evidence

`apps/contracts/test/DigestProbe.t.sol` (temporary, deleted after the fix landed) asserted
five things: (a) signature from a test key over the contract digest recovers the user,
(b) contract digest == inline canonical hashStruct + domain wrap, (c) the pre-fix
`abi.encode(tp, req)` form differs from canonical. Results:

- Before the fix: `FAIL — contract digest must be canonical: 0x1f99abc5… ≠ 0xc54973dd…`
- After the fix: `PASS`, both digests `0xc54973dd…`; the in-place form differs (control held).

The drift-guard now lives permanently as `test_forwardRequestDigest_matchesCanonicalEip712`
in `test/AxiomGasTank.t.sol` (T17): recomputes the canonical digest inline (typehash, domain
separator, wrap) and asserts the view matches. Any regression to the non-canonical form fails
this test loudly.

## Tests updated

- `apps/contracts/test/AxiomGasTank.t.sol` — signing helpers already derive the digest from
  `forwardRequestDigest(req)`, so all 19 tests pass unchanged on the canonical form; added
  the T17 drift-guard test (+1 = 19 total, was 18… see counts below).
- `apps/contracts/script/E2EFinal.s.sol` — now computes the canonical digest INLINE (the
  wallet-equivalent path) instead of trusting the view, and `require`s inline == view before
  signing so drift between the two can never silently split the E2E.

## FE/BE verification (no changes needed — they were already canonical)

- `packages/config` `bun test src/eip712.test.ts` → 6 pass, 0 fail.
- `apps/frontend` `bun test src/lib/permit2.test.ts` → 8 pass, 0 fail (Permit2 digest-parity
  tests included).
- Full forge suite: **344 passed, 0 failed, 9 skipped (353 total)** across 24 suites,
  including `AxiomGasTankTest` (19), `AxiomGasTank2771Integration` (6), `GasBenchmark` (19).

## ABI + dist

- `apps/contracts/scripts/generate-abis.sh` re-run: `packages/config/src/abis/gasTank.ts`
  regenerated. ABI selectors are UNCHANGED (`forwardRequestDigest` signature is identical;
  only the digest preimage changed), so no consumer code changes were needed. Unrelated
  `paymentProcessor.ts` churn from the regen was reverted.
- `packages/config` `bun run build` → clean (dist rebuilt).

## Redeploy (script/RedeployGasTank.s.sol — new)

Two-leg broadcast, explicit keys, nothing printed:

1. `DEPLOYER_PK` leg: `new AxiomGasTank(deployer, 300000)` → `depositReserve{0.02 OG}` →
   `transferOwnership(admin)`.
2. `ORACLE_ADMIN_PK` leg: `processor.setTrustedForwarder(new)` + `nft.setTrustedForwarder(new)`.

Post-broadcast asserts: owner, maxGasPerOp, BOTH forwarders == new tank, reserve == funded
value, untracked balance == 0, old tank unwired from both consumers, and a live
digest-parity check (view == inline canonical) — `DIGEST PARITY OK (canonical EIP-712)`.

## New tank address

**`0xF19245876Cd6Cb115810D459B00e94130591CAaa`**

## Deploy tx hashes (Galileo, chainId 16602)

| # | Action | Tx |
| --- | -------- | ---- |
| 1 | Deploy AxiomGasTank (canonical) | `0xb5ae97acc8b61daf6d86084eba8f728f03e787599cc55823f4897304f76d1148` |
| 2 | depositReserve 0.02 OG | `0x3f4be328e40efedb41a76abf1bd1ee943ec04a8a08459a3f5261a1e54c472432` |
| 3 | transferOwnership → admin | `0xb41feb720cdfaaa8433d1bb03a9436120ae3e5ec1402524281a6f9c61c7d732e` |
| 4 | processor.setTrustedForwarder | `0xcf7bc505fef3c490614fed6b2d27be2d65e7fa90b4753d3ebc141002023b5a09` |
| 5 | nft.setTrustedForwarder | `0xdfa42bb7f81f4d753728c4798aee83a0fb652b7a103b36fab8df9b0ab09cfb01` |

## On-chain verification (all read back from RPC after broadcast)

- `new.owner()` = `0x0553f58a0209Fb8DcE201fCD9406Be56da890D73` (ORACLE_ADMIN / TEE signer address)
- `new.reserve()` = `20000000000000000` (0.02 OG); `new.balance()` = reserve exactly
- `new.maxGasPerOp()` = `300000`
- `processor.trustedForwarder()` = `0xF192…CAaa` ✔ (old tank fully unwired)
- `nft.trustedForwarder()` = `0xF192…CAaa` ✔ (old tank fully unwired)
- LIVE digest parity (independent cast computation, not the script's assert):
  request `(user=0x0553…, target=processor, data=0xdeadbeef, maxGasCost=5e14, nonce=42, deadline=1788290490)`
  → canonical `0xdeb017a6d469d14e5590124d826daf0c65d868360f49d5afc5db80f03991555e`
  = live `forwardRequestDigest` **exact match**. The wallet signing path now verifies.

## Operator notes — reserve and user-balance reset

- **Fresh reserve is 0.02 OG, not 0.1.** Neither key held 0.1 OG at deploy time (admin
  0.0504, deployer 0.0313). The old tank's 0.1 OG could NOT be migrated on-chain:
  `recoverReserve` only touches UNTRACKED surplus and reverts `ZeroAmount` (probed live,
  `0x1f2a2005`); the only tracked-exit path (`grantCredit` → `withdrawTank`) is closed
  because grant wei are spend-only (`withdrawable = tank − grantBalance = 0`,
  `InsufficientTankBalance` probed live, `0xf45df77a`); and `renounceOwnership` would strand
  the funds permanently, so it was NOT executed. If the 0.1 OG ever needs recovery it
  requires a new owner-deployed sweep helper holding that tank's owner key — flagged for a
  future wave, not silently dropped.
- **User state reset (testnet-only):** user tanks, grant balances, `grantsUsed` and `nonces`
  on `0xE986…98d` are abandoned. Relayer nonce pre-flight must read the NEW tank.
- **Env cutover required (parent/next wave):** `AXIOM_GAS_TANK_ADDRESS` (backend) and
  `VITE_GAS_TANK_ADDRESS` (root `.env` + `apps/frontend/.env` + `apps/frontend/.env.local`)
  must point at `0xF19245876Cd6Cb115810D459B00e94130591CAaa`. Backend was NOT restarted here
  per constraints; restart is the parent's call.
- The old tank `0xE986…98d` stays funded but untrusted (both consumers now reject it as a
  forwarder). No traffic can reach it.

## Files changed

| File | Change |
| ------ | -------- |
| `apps/contracts/src/AxiomGasTank.sol` | canonical digest in `forwardRequestDigest` + `_verifySig`, NatSpec |
| `apps/contracts/test/AxiomGasTank.t.sol` | +T17 `test_forwardRequestDigest_matchesCanonicalEip712` |
| `apps/contracts/script/E2EFinal.s.sol` | inline canonical digest + view-drift `require` |
| `apps/contracts/script/RedeployGasTank.s.sol` | new two-leg redeploy script |
| `packages/config/src/abis/gasTank.ts` | regenerated (header comment restored by hand) |
| `packages/config/dist/**` | rebuilt |
| `docs/deployments/broadcast` (apps/contracts/broadcast/RedeployGasTank.s.sol/) | run artifacts |

Changes left uncommitted per protocol.
