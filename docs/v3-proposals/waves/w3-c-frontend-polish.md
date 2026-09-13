# Wave 3 Lane C — Frontend Polish (Permit2 pay flow, paymentSnapshot pre-flight, Delegation card)

- **Agent:** W3-C (Executor)
- **Date:** 2026-08-31
- **Base:** git HEAD `add2fdadf` (W2 commit). Tree state at lane start: clean except `apps/contracts/src/interfaces/IERC7857.sol` (one comment-line tweak, owned by the concurrent deploy lane — left untouched).
- **Status:** implemented, FE suite green (140/140), typecheck clean, production build passes; changes left **uncommitted**.
- **Untouched (per constraints):** `packages/config/src/abis/*` (except zero edits — abis already exported by W2), all `.env` files, no deployments.

---

## 1. Permit2 FE flow (data: which signature, which write)

### Lane selection (migration-safe gate)

`usePayment().payForAgentWithPermit2(tokenId, amount)` in `apps/frontend/src/hooks/usePayment.ts`:

1. Read the wallet's live ERC-20 allowance to the PaymentProcessor (`hasSufficientAllowance`).
2. **allowance >= amount → lane `"approval"`**: the pre-existing `priceAndApprove` + `payForAgent` path runs — no wallet signature is requested. This is the deliberate fallback: users who already approved are not re-migrated, so a Permit2 rollout can never break the proven path (no double migration).
3. **allowance < amount → lane `"permit2"`**: build typed data → wallet `signTypedData` → one contract write. No approve transaction ever happens on this lane; the signature IS the authorization.

### Signature (lane `"permit2"`) — `apps/frontend/src/lib/permit2.ts`

wagmi `signTypedDataAsync` over:

| Component | Value |
| --- | --- |
| **Domain** | `{ name: "Permit2", chainId, verifyingContract: 0x000000000022D473030F116dDEE9F6B43aC78BA3 }` — NO version field (Permit2 `EIP712.sol` has none) |
| **Primary type** | `PermitWitnessTransferFrom` |
| **Types** | `PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline,AgentPayment witness)`, `TokenPermissions(address token,uint256 amount)`, `AgentPayment(uint256 agentTokenId,uint256 amount)` — field order is load-bearing and matches PermitHash.sol's stub-concat hashing |
| **Message** | `permitted{token=paymentToken, amount=amountWei}`, `spender=<PaymentProcessor>` (Permit2 binds msg.sender — never a relayer), `nonce=<crypto-random uint256>`, `deadline=<now+30min>`, `witness{agentTokenId, amount=amountWei}` |

The witness variant is used because the Processor's `payForAgentWithPermit2` calls `permitWitnessTransferFrom` with `AgentPaymentWitness{agentTokenId, amount}` (verified by reading `AxiomPaymentProcessor.sol`); a plain `permitTransferFrom` signature would revert. No `owner` field inside the signed struct (canonical Permit2 keeps it a call parameter; Permit2 reverts unless the signature recovers to it).

### Write (lane `"permit2"`)

```text
writeContract → AxiomPaymentProcessor.payForAgentWithPermit2(
  agentTokenId, amountWei, owner=<connected wallet>,
  permit: ((token, amount), nonce, deadline),   // ISignatureTransfer.PermitTransferFrom
  signature                                      // 65-byte EIP-712 sig from the wallet
)
```

### ⚠️ CROSS-LANE BUG FOUND AND PINNED (blocks live Permit2 redemption)

A numeric digest-parity probe (viem `hashTypedData` vs Permit2's `PermitHash.sol` recipe, byte-exact, all intermediates verified equal) shows the Processor's current

```text
WITNESS_TYPE_STRING = "AgentPayment witness)TokenPermissions(address token,uint256 amount)"
```

can **never** verify a wallet signature: EIP-712 wallets (MetaMask/viem/ethers — same encoder family as Uniswap's permit2-sdk) ALWAYS append referenced struct definitions to the encodeType, i.e. they sign against

```text
"AgentPayment witness)AgentPayment(uint256 agentTokenId,uint256 amount)TokenPermissions(address token,uint256 amount)"
```

The W2-A fork test passes only because its Solidity signer replicates the same omitted-definition string instead of a wallet encoder. **Fix (one line, contract lane):** change `WITNESS_TYPE_STRING` to include the `AgentPayment(uint256 agentTokenId,uint256 amount)` definition before the TokenPermissions tail. The FE side is correct as-is; this parity is pinned by two regression tests in `src/lib/permit2.test.ts` ("Permit2 on-chain digest parity") so the FE suite fails if either side drifts.

---

## 2. paymentSnapshot pre-flight integration

- New hook `apps/frontend/src/hooks/usePaymentSnapshot.ts`: reads `AxiomStateView.paymentSnapshot(payer, tokenId=0)` (the `tokenId` arg is reserved-but-unused by the facade) through **one** `aggregateReads` Multicall3 round-trip, returning `{ maxPayCap, computeRatioMax, agentBalance, payerAllowance, paymentToken }`.
- Wired into AgentPage's payments tab as a pre-flight fact row (Payment cap · Processor allowance · Your token balance, formatted with the live W2-C decimals). `maxPayCap=0` renders as the unlimited sentinel.
- Env-gated: `getAxiomStateViewAddress()` returns `undefined` until `VITE_STATE_VIEW_ADDRESS` is set; the hook then no-ops (no RPC) and the panel simply omits the snapshot row. W2-C's `usePaymentTokenOnchain` (decimals+allowance) stays in place as the always-available fallback — the snapshot augments, not replaces, it until the facade is deployed.
- `packages/config/src/addresses.ts` gained `stateView` (and the deploy lane's mid-flight `delegationRegistry` entry was preserved; both are in `OPTIONAL_ADDRESS_NAMES` via `resolveAddressOptional`, which that lane added while this lane worked — adopted, not duplicated).

## 3. Agent Delegation card scope (owner-only, minimal but functional)

On AgentPage (payments tab), rendered only when the connected wallet equals the live `ownerOf(tokenId)`:

- **Active-delegation display**: `useAgentDelegation(tokenId)` reads `getDelegation` + `isDelegationActive` in ONE Multicall3 batch → delegate, per-tx cap, window cap/length, expiry. (Registry's read API is `getDelegation`/`isDelegationActive` — there is no `activeDelegationOf`; verified against the contract.)
- **Install**: form (delegate address, per-tx cap, window cap+length set together, expiry days, allowed `contract:selector` targets) → `buildAgentDelegation` (`src/lib/delegation.ts`) validates with on-chain-parity rules (zero root forbidden, window fields paired, future expiry, positive caps), builds the (target,selector) Merkle root with the registry's `keccak256(abi.encode(target,selector))` leaf encoding, then owner signs EIP-712 `AgentDelegation` over domain `{name:"AxiomDelegationRegistry", version:"1", chainId, verifyingContract}` (byte-matches the registry constructor), then one write `installDelegation(struct, ownerSig)`.
- **Revoke**: one write `revokeDelegation(agentTokenId)`; disabled unless a live delegation exists.
- **Disabled state**: when the registry address is not yet configured, the card renders a "not configured yet" notice and hides the form (no broken writes). French/German locales inherit the English strings via their existing `...english.agentDetail` spread.

## 4. Tests + build (fresh runs)

| Check | Command | Result |
| --- | --- | --- |
| FE full suite | `bun run test` (apps/frontend) | **140 passed, 0 failed** (baseline 111 + 29 new) |
| — permit2 typed-data builder + digest parity | `src/lib/permit2.test.ts` | 8 pass (domain shape, typehash = contract constant `0x276d0fdb…`, no-owner-field, witness binds pay amount, nonce uniqueness, wallet↔Permit2 digest parity + the as-deployed mismatch pin) |
| — delegation form validation + Merkle | `src/lib/delegation.test.ts` | 13 pass (typehash parity, leaf/root math, all invalid-input rejections) |
| — snapshot / delegation hooks | `*.guard.test.ts` | 4 + 4 pass (one-multicall shape, tuple order, env gating) |
| Typecheck | `bun run typecheck` | clean |
| Production build | `bun run build` | `tsc` clean + `built 96 files to dist/ in 0.67s` |
| Lint | `bun run lint` | 0 errors (4 pre-existing warnings in untouched files) |

Debug-code sweep: no `console.log`/`TODO`/`HACK`/`FIXME`/`debugger` in any touched file.

## 5. Files changed (all uncommitted)

**New:**

- `apps/frontend/src/lib/permit2.ts` — Permit2 domain/types/builder + random nonce
- `apps/frontend/src/lib/permit2.test.ts` — 8 tests incl. digest-parity pins
- `apps/frontend/src/lib/delegation.ts` — registry typed data, leaf/root, form validation
- `apps/frontend/src/lib/delegation.test.ts` — 13 tests
- `apps/frontend/src/hooks/usePaymentSnapshot.ts` (+ `.guard.test.ts`)
- `apps/frontend/src/hooks/useAgentDelegation.ts` (+ `.guard.test.ts`)

**Modified:**

- `apps/frontend/src/hooks/usePayment.ts` — `payForAgentWithPermit2`, `hasSufficientAllowance`, lane types
- `apps/frontend/src/pages/AgentPage.tsx` — Permit2 pay panel + snapshot facts, owner-only delegation card
- `apps/frontend/src/abi/addresses.ts` — env entries + non-throwing accessors for the two new addresses
- `apps/frontend/src/lib/copy.ts` — Copy type + English strings (fr/de inherit)
- `apps/frontend/package.json` — 4 new test files registered in the `test` script
- `packages/config/src/addresses.ts` — added `stateView` name (+optional list); deploy lane's concurrent `delegationRegistry` addition preserved

## 6. Address-gated until the deploy lane lands

| Feature | Blocked on | Behavior today |
| --- | --- | --- |
| paymentSnapshot fact row | `VITE_STATE_VIEW_ADDRESS` | row hidden; W2 decimals/allowance fallbacks active |
| Delegation card (install/revoke/active display) | `VITE_DELEGATION_REGISTRY_ADDRESS` | "not configured yet" notice; no writes possible |
| Permit2 lane **redemption on-chain** | contract fix: `WITNESS_TYPE_STRING` must include `AgentPayment(uint256 agentTokenId,uint256 amount)` (see §1) | FE builds/signs correctly; on-chain recovery would fail against the current string, so the allowance-gate keeps users on the approval lane in the meantime |
| Permit2 lane **enabled at all** | `payForAgentWithPermit2` present in the deployed processor ABI/env | it is already in `packages/config/abis/paymentProcessor.ts`, so the flow activates as soon as the redeployed processor address flows in |

No suppressions, no TODOs, no ABI or `.env` edits, no deployments. Concurrent-lane files (backend, contracts, abis regen) were never touched; the shared-tree files this lane did touch (`packages/config/src/addresses.ts`) were re-read before every edit to absorb the deploy lane's mid-flight changes.
