# Wave 5 (plan) — `AxiomGasTank.sol` (Galileo 16602): protocol-seeded 0.01 0G gas grants + meta-relay, plus ERC-2771 retrofit

- **Type:** implementation plan (planning wave — no source edits made by this document)
- **Date:** 2026-08-31
- **Scope:** (a) new **non-upgradeable** `AxiomGasTank.sol` with a protocol-seeded **0.01 0G default grant per user**, lazily granted inside `relay()`, refill grants when fully depleted; (b) ERC-2771 (trusted-forwarder) retrofit of the two UUPS contracts (`AxiomPaymentProcessor`, `AxiomAgentNFT`) so `msg.sender` resolves to the signed user when relaid through the GasTank.
- **Evidence base (all read this session):** `apps/contracts/src/AxiomPaymentProcessor.sol`, `src/AxiomAgentNFT.sol`, `src/AxiomStrategyVault.sol`, `src/AxiomDelegationRegistry.sol`, `script/UpgradeProcessorStatefold.s.sol`, `scripts/generate-abis.sh`, `lib/openzeppelin-contracts-upgradeable/contracts/metatx/ERC2771ContextUpgradeable.sol` (vendored OZ 5.0.2 — remappings.txt shadows node_modules), `docs/v3-proposals/waves/w4-statefold.md`, `w1-a-payment-cap-fixes.md`, `docs/adr/004-contract-rewrite-plan.md`, `docs/deployments/galileo-v3-2026-08-31.json`.

---

## 1. State design

### 1.1 Contract posture

Non-upgradeable, plain constructor, `Ownable(admin)` — the exact governance shape of `AxiomDelegationRegistry` (`src/AxiomDelegationRegistry.sol:27` inherits `Ownable`, `:89-93` constructor takes `(IAxiomAgentNFT _nft, address _owner)` and holds no funds; GasTank follows the same pattern minus the NFT). Rationale: ADR-004 §1.3/§5 established "non-upgradeable = the trust model" for funds-holding contracts (`AxiomStrategyVault`); the GasTank holds the protocol reserve plus per-user tank balances, so it gets the same posture. No `initialize`, no `_disableInitializers` needed (not Initializable at all).

### 1.2 State variables

```solidity
// immutables (baked at construction, no SLOAD, cannot drift — mirrors
// AxiomDelegationRegistry.domainSeparator, src/AxiomDelegationRegistry.sol:71-99)
bytes32 public immutable domainSeparator;   // EIP-712, name "AxiomGasTank", version "1"
bytes32 public immutable initialSelectorsRoot; // mirror only; live root is storage (admin-rotatable)

// storage (constructor-initialized, admin-tunable)
address[] — none; mappings only:

mapping(address => uint256)  public tank;        // user → prepaid native wei (deposit() top-ups + grants)
mapping(address => uint256)  public grantsUsed;  // user → number of 0.01 grants consumed
mapping(address => mapping(uint256 => bool)) public usedNonces; // single-use relay nonces (mirror DelegationRegistry :78)
mapping(address => uint128)  public dailySpent;  // per-user rolling-window spend, wei reimbursed (Vault pattern)
mapping(address => uint64)   public resetDay;    // window id = block.timestamp / 1 days (Vault pattern)

uint256 public gasReserve;          // protocol-funded pool (admin depositReserve)
uint256 public totalTankBalances;   // accounting invariant: gasReserve + totalTankBalances ≤ address(this).balance
uint256 public gasGrant = 0.01 ether;   // GAS_GRANT — admin-tunable, setter reverts on 0
uint256 public grantsCap = 3;           // default 3 grants/address — admin-tunable, setter reverts on 0
uint256 public maxGasPerOp;             // per-op gas-unit ceiling — setter reverts on 0 (NON-ZERO floor)
uint256 public dailyUserCap;            // per-user per-window reimbursement ceiling (wei) — setter reverts on 0
bytes32 public selectorsRoot;           // (target,selector) Merkle root — REQUIRED non-zero, fail-closed
```

Design decisions and their citations:

- **`gasGrant` / `grantsCap` / `maxGasPerOp` / `dailyUserCap` are storage, not constants or immutables** — the brief makes GAS_GRANT, grantsCap and MAX_GAS_PER_OP "admin-tunable", and a daily cap needs the same treatment. Initial values are set in the constructor; setters are `onlyOwner` with **hard zero-reverts**.
- **MAX_GAS_PER_OP must have a NON-ZERO floor — cite the maxPayCap=0 lesson.** `AxiomPaymentProcessor.setMaxPayCap` (`src/AxiomPaymentProcessor.sol:219-227`) accepts `0` and the enforcement sites treat `0` as "cap disabled" (`_payTransferFrom`, `:359`: `if ($.maxPayCap != 0 && amount > $.maxPayCap) revert …`; same idiom in `_enforcePayCap`, `:432-436`). W1-A §3.3/F-3 documents that 0-disables is a footgun kept only for deployed-bytecode compatibility, treated as an "admin-only emergency setting" with monitoring expectations. The GasTank is a **new** contract with no deployed-bytecode constraint, so it takes the strictly safer choice: `setMaxGasPerOp(0)` **reverts `ZeroCap()`** — a per-op ceiling that can never be silently disabled on a contract that pays native out of a pooled reserve. Same floor on `setGasGrant`, `setGrantsCap`, `setDailyUserCap` (a 0 grant or 0 grants cap would silently disable the product feature; a 0 daily cap would disable the window).
- **Per-user daily window reuses the Vault day-window pattern with exact line citations.** `AxiomStrategyVault` packs `uint128 dailyLimit; uint128 dailySpent; uint64 resetDay;` in its `Vault` struct (`src/AxiomStrategyVault.sol:49-56`) and resets/checks in `execute`:
  - `:217` — `uint64 today = uint64(block.timestamp / 1 days);`
  - `:220-222` — `if (today != v.resetDay) { v.dailySpent = 0; v.resetDay = today; }`
  - `:226` — `if (uint256(v.dailySpent) + uint256(spend) > uint256(v.dailyLimit)) revert DailyLimitExceeded();`
  - `:234` — `v.dailySpent += spend;` (debit after the check).

  The GasTank reproduces this shape as **flat per-user mappings** (`dailySpent`/`resetDay` above) with the identical idiom, generalized exactly the way `AxiomDelegationRegistry` already generalized it for per-delegation `windowSeconds` (`src/AxiomDelegationRegistry.sol:74-78` `WindowState {uint128 spent; uint64 windowId;}` + `:176-185` reset/check/debit). GasTank keeps the Vault's fixed **1-day window** (spec: "per-user daily window reusing the Vault pattern") rather than the registry's tunable window. The window is debited with **reimbursed wei** (not gas units) so it composes with the reimbursement math.
  - Known Vault residual deliberately NOT reproduced: `setStrategy` resets `dailySpent = 0` on every call (`src/AxiomStrategyVault.sol:130-131`), making the limit refreshable-at-will (documented residual, `AxiomStrategyVault.sol:23-25`). The GasTank has no user-callable setter that touches `dailySpent`/`resetDay` — the window only rolls on day boundary. (A user waiting for midnight is inherent to any daily window and is bounded by grantsCap.)
- **`selectorsRoot` is storage (admin-rotatable), fail-closed.** See §2.4 for the decision.
- **`receive()` reverts `UseDeposit()`** — mirror `AxiomStrategyVault.receive` (`src/AxiomStrategyVault.sol:87-89`) so all native enters through explicit accounting paths (`depositReserve` / `deposit`).
- **`recoverExcess()` (onlyOwner)** mirrors `AxiomStrategyVault.recoverExcessNative` (`src/AxiomStrategyVault.sol:253-259`): pays out `address(this).balance - gasReserve - totalTankBalances` so stray native is recoverable without touching tracked funds.

### 1.3 Invariants (test-enforced)

1. `gasReserve + totalTankBalances <= address(this).balance` always (equality except transiently inside `relay` between the target call and reimbursement).
2. `grantsUsed[u] <= grantsCap` and a grant is minted only when `tank[u] + gasGrant <= maxGasPerOp * gasprice` cannot be guaranteed pre-hoc — instead: a lazy grant only fires when `tank[u] < maxGasCost` of the op being relayed, and `gasReserve >= gasGrant`.
3. `selectorsRoot != 0` always (constructor + setter both enforce; `relay` re-checks — double lock mirroring `AxiomDelegationRegistry:111` fail-fast + `:166` defense-in-depth).
4. `usedNonces` flips only after all validation passes, so a reverted relay never burns a nonce (mirror `AxiomDelegationRegistry:134-136`).

---

## 2. Core functions

### 2.1 Funding surface

```solidity
function depositReserve() external payable onlyOwner;           // admin tops up the pool; gasReserve += msg.value
function deposit() external payable;                            // user tops up OWN tank; tank[msg.sender] += msg.value
function withdrawTank(uint256 amount) external nonReentrant;    // user pulls own tank balance (CEI, TransferFailed guard — mirror Vault.withdraw, src/AxiomStrategyVault.sol:97-113)
function refill() external;                                     // self-serve grant claim (see 2.3)
```

`deposit()` semantics decision: it funds the **caller's own tank** (user-prepaid gas). Funding someone else's tank is deliberately unsupported (no `depositFor`) — it adds a griefing/attestation surface for zero product need; the protocol path for third-party funding is the reserve.

### 2.2 `relay()` — the core

```solidity
struct ForwardRequest {
    address user;
    address target;
    bytes   data;
    uint256 maxGasCost;   // user's committed wei ceiling for this op
    uint256 nonce;        // single-use, per-user
    uint256 deadline;     // timestamp floor
}

bytes32 private constant FORWARD_REQUEST_TYPEHASH = keccak256(
    "ForwardRequest(address user,address target,bytes data,uint256 maxGasCost,uint256 nonce,uint256 deadline)"
);

function relay(ForwardRequest calldata req, bytes calldata userSig, bytes32[] calldata merkleProof) external nonReentrant;
```

Execution order (all atomic; CEI: all state precedes every external call):

1. **Validate**: `block.timestamp <= req.deadline` else `DeadlinePassed`; `req.target != 0`; `req.data.length >= 4`; `selectorsRoot != 0` (defense-in-depth, mirror `AxiomDelegationRegistry:166`); `maxGasCost > 0`.
2. **Signature (EIP-712)**: structHash = `keccak256(abi.encode(FORWARD_REQUEST_TYPEHASH, req))`; digest = `keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash))`; `ECDSA.recover(digest, userSig) == req.user` else `InvalidSigner`. Domain is **cached-immutable in the constructor** exactly like `AxiomDelegationRegistry` (`src/AxiomDelegationRegistry.sol:73-99`: name `"AxiomDelegationRegistry"`, version `"1"`, chainId, verifyingContract) — here name = **`"AxiomGasTank"`**, version = **`"1"`** (matches the off-chain planner's assumption; see §7). EOA-only recovery (ERC-1271 deferred — same posture as the registry, which uses bare `ECDSA.recover`, `:132`).
3. **Burn nonce** — `usedNonces[req.user][req.nonce] = true` (after validation, mirror `AxiomDelegationRegistry:134-136`). Combined with the `usedNonces` view this gives the off-chain lane replay detection.
4. **Lazy grant** (see 2.3): if `tank[req.user] < req.maxGasCost` → grant if `grantsUsed[req.user] < grantsCap` and `gasReserve >= gasGrant`, else `TankExhausted()` / `ReserveDepleted()`.
5. **Allowlist check**: leaf = `keccak256(abi.encode(req.target, bytes4(req.data[:4])))` + `MerkleProof.verify(merkleProof, selectorsRoot, leaf)` else `SelectorNotAllowed` — **byte-identical leaf encoding to `AxiomDelegationRegistry.delegatedExecute`** (`src/AxiomDelegationRegistry.sol:187-189`: `bytes32 leaf = keccak256(abi.encode(target, bytes4(data[:4])));` then `MerkleProof.verify(...)`), so the relayer's existing tree tooling is reusable as-is.
6. **Measured execute**: `uint256 gasBefore = gasleft(); (bool ok, ) = req.target.call(req.data); uint256 measured = gasBefore - gasleft();`
7. **Reimburse (relayer never eats loss)**: `uint256 owed = min(measured * tx.gasprice, req.maxGasCost, maxGasPerOp * tx.gasprice)`; then `owed = min(owed, gasReserve)` (reserve clamp — the pool, not the relayer, absorbs shortfalls). Daily window check+debit runs here against `owed` (`DailyLimitExceeded` mirrors Vault `:226`). Then CEI: `tank[req.user] -= owed; gasReserve -= owed; dailySpent[req.user] += owed;` and pay: `(bool paid,) = msg.sender.call{value: owed}(""); if (!paid) revert ReimburseFailed();`
   - Note `tx.gasprice` (not `block.basefee` + tip): under `--legacy --gas-price 2 gwei` deploys and EIP-1559 relays alike, this reimburses what the relayer actually committed. The relayer's effective loss is `measured × effectiveGasPrice − owed` only when it bids **above** what the user signed for — its own acceptance decision, enforced by `req.maxGasCost`.
8. **Target-revert semantics**: `ok == false` does **NOT** revert `relay()`. Implementation is simply the low-level call in step 6 — the `(bool ok,)` form captures the child revert without bubbling it; the only code path that reverts after the target call is the relayer's own reimbursement leg (step 7), which is the "relayer never eats loss" guarantee made structural. `success` is reported via the event and, for composability, via the return value:
   `emit Relayed(req.nonce, req.user, req.target, ok);` and `relay(...) returns (bool)` — wait, spec fixes the event as `Relayed(relayerNonce, user, target, success)`. Adopt:

   ```solidity
   event Relayed(uint256 indexed nonce, address indexed user, address indexed target, bool success);
   error TankExhausted(); error ReserveDepleted(); error DeadlinePassed(); error InvalidSigner();
   error ZeroCap(); error ZeroAmount(); error UseDeposit(); error TransferFailed(); error ReimburseFailed();
   error SelectorNotAllowed(); error InvalidMerkleProof(); error DailyLimitExceeded();
   ```

   (`Relayed(uint256,address,address,bool)` — the `relayerNonce` in the cross-lane brief is the per-user `nonce`; the signed-name discrepancy is flagged in §7.)

Why "all atomic" holds: steps 3–4 flip nonce/grant state **before** the target call, so a reverting target rolls the grant back (the user is never charged a grant for a failed relay); the reimbursement is internal state + one call at the end. The only non-revert-on-failure external call is the target itself, by design.

### 2.3 Lazy grant + `refill()`

Shared internal:

```solidity
function _lazyGrant(address user) internal {
    if (grantsUsed[user] >= grantsCap) revert TankExhausted();
    if (gasReserve < gasGrant) revert ReserveDepleted();
    grantsUsed[user] += 1;
    tank[user] += gasGrant;
    gasReserve -= gasGrant;
}

function refill() external { _lazyGrant(msg.sender); }
```

- In `relay()` step 4 the grant fires **only when `tank[user] < req.maxGasCost`** — a user with a full tank never burns a grant; a user mid-grant-stream tops up just enough. After the grant, `tank >= gasGrant >= maxGasCost` is NOT guaranteed (maxGasCost can exceed one grant); if the tank still cannot cover `req.maxGasCost`, the op is rejected **after** the grant (revert — grant rolls back; documented behavior: a grant is only consumed when the relay actually proceeds; enforce `tank[req.user] >= req.maxGasCost` post-grant, else revert `TankExhausted()`). This keeps "grant consumption ⇔ relay execution" exactly atomic.
- **Refill grants when fully depleted**: `refill()` is permissionless for the user themselves (`msg.sender`), same cap accounting — the FE can surface a "claim your gas grant" button once `balanceOf(user) == 0 && grantsUsed(user) < grantsCap`. The relayer may also simply relay the next op (lazy grant re-fires inside `relay`) — `refill()` exists for the UX path and for the cross-lane assumption listed in §7.
- Sybil containment = `grantsCap` (default 3 ⇒ max 0.03 0G free gas per address) + `dailyUserCap` + `maxGasPerOp`. §8 grades the residual risk.

### 2.4 Target/selector allowlist — on-chain root vs relayer-only

The registry's Merkle selector-root pattern (`AxiomDelegationRegistry`: root field `:58`, install fail-fast `:110-111`, execute defense-in-depth `:166`, leaf encoding `:188`, verify `:189`) is mirrored as a **protocol-wide** (not per-request) root with a `setSelectorsRoot(bytes32)` owner setter that **reverts on zero**, and a constructor that **requires a non-zero initial root**.

**Decision: on-chain root, fail-closed — recommended.** Trade-off analysis:

| Option | Pros | Cons |
| --- | --- | --- |
| On-chain root (chosen) | Protocol guarantee independent of relayer honesty; a compromised/rogue relayer cannot drain user tanks or protocol grants into arbitrary calls; the ops-relay brief's require("mirror DelegationRegistry pattern") is satisfied structurally; proof cost ≈ 1 word/level of calldata | Admin must re-publish a tree (and call `setSelectorsRoot`) whenever the protocol adds a target — operational toil; relayer must carry proofs (calldata grows ~32 B/level, trivial vs the `data` payload) |
| Relayer-only enforcement | No admin tree management; smaller calldata | Trust inversion: the relayer becomes the only thing standing between users' prepaid gas (and the 0.01 grants) and arbitrary execution; contradicts the DelegationRegistry precedent where a zero root is treated as an exploit primitive (`:110-111` "a zero selector root would let the delegate execute against arbitrary contracts") |

Given the relay carries **lazy grants from a pooled reserve**, relayer-only enforcement would mean a single compromised off-chain component converts the grant pool into arbitrary-call budget. On-chain wins at negligible cost. Root rotation is a low-frequency admin op (same key discipline as everything else today).

### 2.5 Views (off-chain surface)

```solidity
function balanceOf(address user) external view returns (uint256);        // tank[user]
function grantsOf(address user) external view returns (uint256);         // grantsUsed[user]
function usedNonces(address user, uint256 nonce) external view returns (bool); // public mapping (mirror DelegationRegistry :78)
function dailyWindowOf(address user) external view returns (uint128 spent, uint64 resetDay, uint256 cap);
function reserve() external view returns (uint256); function capSettings() external view returns (uint256 grant, uint256 grantsCap_, uint256 maxGasPerOp_, uint256 dailyUserCap_);
```

(`balanceOf`/`grants`/`nonces` names match the cross-lane brief; `grants` is implemented as `grantsOf` — flag in §7.)

---

## 3. ERC-2771 retrofit of `AxiomPaymentProcessor` and `AxiomAgentNFT`

### 3.1 Exact `msg.sender` sites to retrofit (verified by read, with line numbers)

**AxiomPaymentProcessor.sol** (UUPS, ERC-7201 `0xb6e9ac…ebc00` at `:112`, gap `uint256[46]` at `:122`):

| # | Function | Site | Line(s) | Why it must resolve to the signed user |
| --- | --- | --- | --- | --- |
| P1 | `payForAgent(uint256,uint256)` | payer identity into `_paySplit(msg.sender, …)` | fn `:487-493`, `msg.sender` at `:492` | the paying agent must be the user, not the relayer EOA |
| P2 | `onlyAgentCreator` modifier (governs `setRoyaltyBps`, `:267-272`) | `if (creator != msg.sender) revert NotCreator()` | modifier `:132-139`, check at `:137` | only the token's creator may set royalty |
| P3 | `payForAgentAndCompute(uint256,address,uint256,uint256)` | payer into `_paySplit` and `_payTransferFrom` | fn `:510-525`, `msg.sender` at `:521` and `:523` | payer identity on the merged lane |
| P4 | `withdrawAgentEarnings()` | earnings read/clear/transfer | fn `:528-536`, `msg.sender` at `:530`, `:532`, `:534`, `:535` | the creator pulls their own balance — relaid withdrawal is the headline UX target |
| P5 (found in verification, add to scope) | `payComputeProvider(address,uint256)` | `_payTransferFrom(msg.sender, provider, amount)` | `:501` | payer identity on the direct compute lane |

**AxiomAgentNFT.sol** (UUPS, ERC-7201 `0xe982fe…4a900` at `:79`, gap `uint256[44]` at `:70`):

| # | Function | Site | Line(s) | Why |
| --- | --- | --- | --- | --- |
| N1 | `update(uint256,IntelligentData[])` | `require(_ownerOf(tokenId) == msg.sender, "Not owner")` | fn `:316-323`, check at `:320` | only the current owner updates iData |
| N2 | `mint(IntelligentData[],address)` (payable) + `_refundExcess` | overpayment refund goes to `msg.sender` | fn `:332-348` (`_refundExcess(fee)` at `:347`), refund call at `:393-398`, `msg.sender` at `:395` | a relaid mint must refund the user, not the relayer (and the fee is charged against `msg.value`, which the ERC-2771 forwarder forwards — OZ `ERC2771Forwarder` supports value) |

Non-sites verified and intentionally left alone: `mintWithRole` (`:350-365`) is MINTER_ROLE-gated (the backend relay already holds the role directly; relaying it through the forwarder would attribute the role check to the signed user and break — forwarder trust must NOT apply to role paths; see §8), and ERC-721 transfer paths are blocked by design (bare `_update` override `:118-122` routes to iTransfer).

### 3.2 Mechanism — what the vendored OZ 5.0.2 source actually does

Read of `lib/openzeppelin-contracts-upgradeable/contracts/metatx/ERC2771ContextUpgradeable.sol`:

- `:24` — `address private immutable _trustedForwarder;` with `@custom:oz-upgrades-unsafe-allow state-variable-immutable` at `:23`. **It adds NO namespaced storage slot, NO gap, NO storage at all** — immutables live in bytecode, not storage. There is **no `__ERC2771Context_init`**; initialization is constructor-only (`:30-36`).
- `_msgSender()` `:55-67` / `_msgData()` `:69-79` switch on `isTrustedForwarder(msg.sender) && calldataLength >= 20`, then slice the last 20 bytes of calldata (ERC-2771 suffix); `_contextSuffixLength()` `:84-86` pins 20.
- `isTrustedForwarder` `:47-49` and `trustedForwarder` `:41-43` are both `public view virtual` → **overridable**.

Consequences:

1. **Inheritance is upgrade-in-place-safe layout-wise.** Both contracts keep all Axiom state in ERC-7201 namespaces (`agent.storage.AxiomPaymentProcessor`, `agent.storage.AxiomAgentNFT`); adding `ERC2771ContextUpgradeable` to the is-list adds zero storage slots and one immutable. The `forge inspect --json` layout diff for both contracts must still be **byte-identical** (W1-A §3 discipline).
2. **The OZ immutable forwarder is incompatible with the "admin setTrustedForwarder" requirement** — it is baked at implementation-construction time and cannot change post-deploy. The retrofit therefore **overrides `trustedForwarder()`** to return a **storage-backed, admin-settable address** appended at each contract's gap tail:

   ```solidity
   // Processor: PaymentProcessorStorage gains `address trustedForwarder;` at the gap tail;
   //             __gap 46 → 45 (AxiomPaymentProcessor.sol:122). NFT: AxiomAgentNFTStorage gains the
   //             same field; __gap 44 → 43 (AxiomAgentNFT.sol:70). Both follow the append-at-gap-tail
   //             layout-delta rule used by W1-A (computeRatioMax, gap 48→47) and W4 (axiomVault, 47→46).
   function trustedForwarder() public view override returns (address) { return _getStorage().trustedForwarder; }
   function setTrustedForwarder(address f) external onlyRole(ADMIN_ROLE); // zero-check omitted? NO — zero = dead forwarder; allow zero to UNWIRE (valid off switch), matching setAxiomVault precedent (AxiomPaymentProcessor.sol:250-256) and monitor TrustedForwarderUpdated(_, 0)
   function isTrustedForwarder(address f) public view override returns (bool) { return f != address(0) && f == trustedForwarder(); }
   ```

   OZ's `_msgSender`/`_msgData` call the virtual `isTrustedForwarder`/`trustedForwarder`, so no further overrides are needed. Not calling the (unused) base constructor leaves `_trustedForwarder == 0`, which is inert because our overrides never read it.
   **Requirement satisfied: `isTrustedForwarder == GasTank only`** — the admin wires exactly the GasTank address; nothing else is ever trusted.

### 3.3 Upgrade-in-place vs fresh deploy — recommendation

**Recommendation: upgrade-in-place for BOTH contracts.**

- **Layout need is zero**: §3.2 proves the 2771 base adds no storage; the only storage delta is one gap-tail field each (46→45, 44→43) — the exact operation already performed twice safely on the Processor (W1-A gap 48→47; W4 `axiomVault` 47→46, `w4-statefold.md` §2) and once on the NFT (gap 48→44, `AxiomAgentNFT.sol:66-70`).
- **Fresh deploy of the NFT forfeits all tokenIds** — ADR-004 §4: "mainnet (Aristotle): MUST be upgrade-in-place or scripted migration, never fresh deploy"; testnet accepted the loss once in W3-A, and a second address churn would re-pay the full §4 cutover cost (env across five surfaces, indexer restart, domain-bound verifier proofs invalid against a new verifier address — `docs/adr/004-contract-rewrite-plan.md` §3.8) for **no benefit**.
- **UUPS machinery on both contracts supports it today**: Processor `_authorizeUpgrade` DEFAULT_ADMIN-gated (`AxiomPaymentProcessor.sol:549-552`); NFT upgrades via the 1-day timelock `proposeUpgrade`/`executeUpgrade` (`AxiomAgentNFT.sol:250-276`) — the script must use `proposeUpgrade` + `executeUpgrade` **two days apart** for the NFT, or the plan must schedule the NFT leg accordingly (see §5 sequencing).
- One subtlety to handle in the new implementations: `initialize` signatures are unchanged (no 2771 init exists to call); the only new state (`trustedForwarder`) defaults to `address(0)` = "no forwarder trusted" = behavior identical to today until the admin sets it. Safe-by-default upgrade.
- Role-check caveat: `AccessControlUpgradeable._checkRole` uses `_msgSender()` (vendored `AccessControlUpgradeable.sol:107`) — after the retrofit, a call routed through the trusted forwarder attributes roles to the **signed user**. That is correct for user ops and harmless for admin ops (admin never relays through the forwarder; GasTank holds no roles).

---

## 4. Storage posture of `AxiomGasTank` itself

- **Non-upgradeable, plain constructor** `constructor(address admin_, bytes32 selectorsRoot_, uint256 gasGrant_, uint256 grantsCap_, uint256 maxGasPerOp_, uint256 dailyUserCap_) Ownable(admin_)` — no Initializable, no proxy, no `_disableInitializers` (nothing to disable). Precedents: `AxiomDelegationRegistry` (non-upgradeable, funds-free, `impl == deployed address` in `galileo-v3-2026-08-31.json`), `AxiomStrategyVault` non-upgradability doctrine (ADR-004 §1.3, §5).
- **Constructor-vs-immutable choices**:
  - `immutable`: `domainSeparator` (chainId + verifyingContract are permanent for a non-upgradeable deployment — verbatim rationale from `AxiomDelegationRegistry.sol:73-75` comment), `FORWARD_REQUEST_TYPEHASH`, `BPS`-style constants (none needed).
  - **storage, not immutable**: everything admin-tunable (`gasGrant`, `grantsCap`, `maxGasPerOp`, `dailyUserCap`, `selectorsRoot`) — immutables cannot be tuned, and the brief mandates admin tunability; plus `tank`/`grantsUsed`/`usedNonces`/window mappings and the reserve accounting pair.
  - Constructor zero-guards: `admin_ == 0` revert; `selectorsRoot_ == 0` revert (fail-closed from block 1); `maxGasPerOp_ == 0 || dailyUserCap_ == 0 || gasGrant_ == 0 || grantsCap_ == 0` revert (non-zero floors — §1.2 lesson citation).
- Storage accounting is explicit (`gasReserve`, `totalTankBalances`) rather than deriving from `address(this).balance`, enabling the `recoverExcess()` invariant (§1.2) and clean tests.

---

## 5. Wiring / deploy

### 5.1 Script: `script/DeployGasTank.s.sol` (modeled on `UpgradeProcessorStatefold.s.sol`)

Template source: `script/UpgradeProcessorStatefold.s.sol` — chain assert `:24-28` (`GALILEO_CHAIN_ID = 16_602`, revert `WrongChain`), env keys `:32-35` (`vm.envUint("DEPLOYER_PK")`, `vm.envAddress(...)`), `vm.startBroadcast(deployerKey)` → deploy → wire → `vm.stopBroadcast`, post-check `require(...)`, `console2.log` evidence lines, invocation footer `:12-17` (`DEPLOYER_PK=… forge script … --rpc-url https://evmrpc-testnet.0g.ai --chain-id 16602 --legacy --gas-price 2000000000 --slow --broadcast`).

**Key discipline (w4-statefold.md §3, verbatim):** `DEPLOYER_PK` exported at run time from `../../.env` `TEE_SIGNER_PK` (= ORACLE_ADMIN = DEFAULT_ADMIN on the Processor proxy `0xe6956f663103c6E1e5077c3256c453b95924112a` and NFT ADMIN_ROLE); never printed. **NFT leg needs the 1-day timelock**: `proposeUpgrade(newImpl)` at T-0, `executeUpgrade()` at T+1d — script split into `ProposeNft2771.s.sol` + `DeployGasTank.s.sol` (which asserts `pendingUpgrade() == expectedImpl` before executing).

Sequence (order matters):

1. Deploy `AxiomGasTank(admin=ORACLE_ADMIN, selectorsRoot=<initial tree root>, gasGrant=0.01e18, grantsCap=3, maxGasPerOp=300_000, dailyUserCap=<ops-derived>)`.
2. Deploy new `AxiomPaymentProcessor` impl (2771-extended) → `upgradeToAndCall(proxy, "")` → `setTrustedForwarder(gasTank)`.
3. (T-0) `nft.proposeUpgrade(newNftImpl)`; (T+1d, second script) deploy impl if not yet → `executeUpgrade()` → `setTrustedForwarder(gasTank)`.
4. `gasTank.depositReserve(){value: X}` (admin; X from env `GAS_RESERVE_FUNDING`).
5. In-script wiring asserts: `processor.isTrustedForwarder(gasTank)`, `nft.isTrustedForwarder(gasTank)`, `gasTank.reserve() == X`, `gasTank.owner() == ORACLE_ADMIN`, `selectorsRoot() != 0`.

### 5.2 Deployment JSON

Extend `docs/deployments/galileo-v3-2026-08-31.json` (the W4 wave set the precedent of appending to the same file): add an `AxiomGasTank` entry under `contracts` (`"impl"` = `"proxy"` = deployed address, non-upgradeable, mirroring the `AxiomDelegationRegistry` entry shape `:34-38`), a `gasTankDeployment` block beside `statefoldUpgrade` (`:76-80`) carrying the new Processor/NFT impl hashes + `setTrustedForwarder` tx hashes + funding tx, and the new tx entries under `transactions` (`:60-70`). NFT `impl` field updated after `executeUpgrade`.

### 5.3 ABI regen

`scripts/generate-abis.sh` — three anchors:

- `CONST_NAMES[AxiomGasTank]=GAS_TANK_ABI` (map at `:22-29`),
- `AxiomGasTank` appended to the `CONTRACTS=(...)` array (`:31`),
- case mapping `AxiomGasTank) ts_name="gasTank" ;;` in the filename switch (`:126-131`).

Then `npm run build` (which runs the script per its header, `:5-6`), confirm `packages/config/src/abis/gasTank.ts` + updated `paymentProcessor.ts` / `agentNft.ts` (each gains `trustedForwarder`/`setTrustedForwarder`/`isTrustedForwarder` and — Processor only — nothing else), and `scripts/check-abi-drift.sh` passes. Consumer re-pointing (backend `addresses`/env, FE `src/abi/addresses.ts`, gasTank block) follows the w4 §4 rewiring list pattern — out of this wave's contract scope, listed for the cross-lane owner.

---

## 6. Microchange checklist + forge test plan

### 6.1 Numbered file-by-file edits (exact anchors)

1. **NEW `apps/contracts/src/AxiomGasTank.sol`** — full contract per §§1–2: imports `Ownable`, `Pausable`, `ReentrancyGuard` (non-upgradeable trio, mirror `AxiomDelegationRegistry.sol:5-9`), `ECDSA`, `MerkleProof`; errors/events/struct/typehash per §2.2; constructor per §4; `depositReserve`/`deposit`/`withdrawTank`/`refill`/`relay`/setters/views; `receive()` reverts `UseDeposit`; `recoverExcess()` mirrors `AxiomStrategyVault.sol:253-259`.
2. **`apps/contracts/src/AxiomPaymentProcessor.sol`**
   a. import `ERC2771ContextUpgradeable` (`@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol`) near `:10`;
   b. add to is-list `:20-25` (after `UUPSUpgradeable` — linearization: `Initializable, AccessControlUpgradeable, PausableUpgradeable, ReentrancyGuard, UUPSUpgradeable, ERC2771ContextUpgradeable`);
   c. `PaymentProcessorStorage`: append `address trustedForwarder;` after `axiomVault` (`:121`), `uint256[46] __gap` → `uint256[45]` (`:122`), with the W1-A/W4-style layout-delta comment;
   d. add `event TrustedForwarderUpdated(address indexed oldF, address indexed newF); error ZeroForwarderNotWired();` — hmm, no error needed; overrides + `setTrustedForwarder` (ADMIN_ROLE, zero allowed = un-wire, `isTrustedForwarder` guards zero) near the other setters (after `setAxiomVault`, `:250-265`);
   e. **no change** to `initialize` (`:148-163`), `constructor` (`:142-145`), or any of P1–P5's bodies — `_msgSender()` resolution is inherited and transparent.
3. **`apps/contracts/src/AxiomAgentNFT.sol`** — same 4-part change: import, is-list (after `ERC7857IDataStorageUpgradeable`, `:23-30`), gap-tail field + `uint256[44] __gap` → `uint256[43]` (`:70`), overrides + `setTrustedForwarder` (ADMIN_ROLE) near `setMintFee` (`:184-196`).
4. **NEW `apps/contracts/script/DeployGasTank.s.sol`** (+ `ProposeNft2771.s.sol` for the timelocked NFT leg) per §5.1.
5. **`apps/contracts/scripts/generate-abis.sh`** — the three anchors in §5.3.
6. **`docs/deployments/galileo-v3-2026-08-31.json`** — gasTank entries per §5.2.
7. **NEW `apps/contracts/test/AxiomGasTank.t.sol`** — harness: deploy GasTank + a `CallReceiverMock`-style target (foundry std `CallReceiver` or a minimal local mock that can revert / burn gas), admin = `makeAddr`, sign ForwardRequests with `vm.sign`.
8. **NEW `apps/contracts/test/Axiom2771Retrofit.t.sol`** — forwarder-suffix passthrough tests for Processor + NFT (forge template: append 20-byte sender suffix to calldata, prank `msg.sender = gasTank`, assert `payForAgent` debits the signed user's tokens, `withdrawAgentEarnings` pays the signed creator, `update` passes the owner check, mint refunds the signed sender).
9. **`apps/contracts/test/` storage-layout guards** — extend the existing ERC-7201 slot test pattern (W4's `StorageSlotTest`) with a namespace-slot assertion for the new field placement (or re-run `forge inspect --json` diff as W1-A §3 and record the empty diff in the wave report).
10. **Cross-lane (not this wave's edits, listed for owners):** `packages/config` (new `gasTank` ABI + `AddressName`/ENV_VAR `AXIOM_GAS_TANK_ADDRESS`), `apps/backend` (relayer service reads domain/nonces/balanceOf, env-schema), `apps/frontend` (`src/abi/addresses.ts` + grant/refill UI hook) — mirror the w4 §4 file list.

### 6.2 Forge test plan (`AxiomGasTank.t.sol` unless noted)

| # | Test | Asserts |
| --- | --- | --- |
| 1 | `test_relay_lazyGrant_firstRelay` | fresh user, tank 0, reserve funded → relay succeeds; `balanceOf == 0.01e18 − owed`; `grantsOf == 1`; `reserve` decreased by grant + owed; `Relayed(nonce,user,target,true)` |
| 2 | `test_relay_secondRelay_usesTank_noNewGrant` | second op ≤ remaining tank → `grantsOf` stays 1 |
| 3 | `test_relay_grantsCapExhaustion_revertsTankExhausted` | grantsCap=3: 3 grants consumed, 4th op needing a grant reverts `TankExhausted`; nonce NOT burned (retry with fresh sig + new nonce after `deposit()` succeeds) |
| 4 | `test_relay_nonceReplay_reverts` | same (user, nonce) twice → second reverts `NonceUsed`; view `usedNonces` true |
| 5 | `test_relay_deadline_reverts` | `deadline < block.timestamp` → `DeadlinePassed`; nonce not burned |
| 6 | `test_relay_reimbursementOnTargetRevert` | target reverts → relay **succeeds**, `Relayed(…, false)`, relayer paid `min(measured×gasprice, maxGasCost, cap×gasprice)`, tank debited, grant consumed (target-revert still burns user gas — documented semantics) |
| 7 | `test_reimburse_clampedToMaxGasCost_andMaxGasPerOp` | gas-guzzling target: owed ≤ maxGasCost and ≤ `maxGasPerOp×tx.gasprice`; relayer balance delta exact |
| 8 | `test_reimburse_clampedToReserve_relayerNeverEatsLoss` | reserve nearly empty → owed = reserve remainder; relayer paid in full for measured gas up to that bound |
| 9 | `test_dailyWindow_resetAndLimit` | warp +1 day → `dailySpent` resets (`dailyWindowOf`), over-`dailyUserCap` op reverts `DailyLimitExceeded` (mirror Vault `:217-226` semantics) |
| 10 | `test_setMaxGasPerOp_zeroReverts` (+ `setGasGrant(0)`, `setGrantsCap(0)`, `setDailyUserCap(0)`) | non-zero floor: `ZeroCap()`; setter role-gated |
| 11 | `test_selectorsRoot_failClosed` | constructor(root=0) reverts; `setSelectorsRoot(0)` reverts; wrong proof reverts `InvalidMerkleProof`; leaf encoding parity test vs registry's `keccak256(abi.encode(target, bytes4(data[:4])))` |
| 12 | `test_withdrawTank_and_deposit` | CEI ordering, `TransferFailed` path (payable-reverting recipient), `receive()` reverts `UseDeposit` |
| 13 | `test_recoverExcess_onlySurplus` | invariant `reserve + totalTankBalances ≤ balance`; only surplus withdrawable; non-owner reverts |
| 14 | `testFuzz_reimburse_minOfThree` | fuzz (measured, gasprice, maxGasCost, maxGasPerOp, reserve) → owed = min of the four bounds incl. reserve |
| 15 | 2771 suite (`Axiom2771Retrofit.t.sol`) | P1 `payForAgent` relaid debits signed payer; P2 `setRoyaltyBps` via forwarder passes only-creator check for signed creator and reverts for others; P3 merged lane; P4 `withdrawAgentEarnings` pays signed creator; P5 `payComputeProvider`; N1 `update` owner check passes; N2 mint refunds signed sender; `isTrustedForwarder(other) == false` → suffix NOT interpreted as sender (spoof-resistance: a non-forwarder appending 20 bytes does not impersonate) |
| 16 | layout guards | `forge inspect AxiomPaymentProcessor storageLayout --json` and NFT equivalent: diff vs pre-wave artifacts **empty**; ERC-7201 namespace slots unchanged (extend W4's `StorageSlotTest`) |

Full-suite gate: `forge test` green (baseline 292 pass / 9 skip per w4 §5), `forge build` via-IR clean, solc 0.8.36.

---

## 7. Cross-lane assumptions to confirm (off-chain relayer / chat / FE lane)

The off-chain relayer plan is **not yet in-repo** (repo-wide grep for gastank/relayer returned no docs) — these are the contract-side facts the off-chain lane must design against; each item is either confirmed here or corrected:

| # | Assumption | Status | Contract-side truth |
| --- | --- | --- | --- |
| 1 | `Relayed` event | **CONFIRMED, one rename** | `event Relayed(uint256 indexed nonce, address indexed user, address indexed target, bool success)` — the brief said `relayerNonce`; on-chain it is the **per-user single-use `nonce` from the signed ForwardRequest** (relayer has no separate nonce). If the off-chain lane needs a relayer-side correlation id, add it as an unindexed 5th param or keep it off-chain — flag back. Selector: `keccak256("Relayed(uint256,address,address,bool)")`. |
| 2 | `TankExhausted` error | **CONFIRMED** | `error TankExhausted();` (no args) — thrown when `grantsUsed ≥ grantsCap` at lazy-grant time; also `ReserveDepleted()` distinct error for empty pool (off-chain should distinguish: user-side fix = wait/top-up vs operator-side fix = fund reserve). |
| 3 | Views `balanceOf` / `grants` / `nonces` | **CONFIRMED with name notes** | `balanceOf(address) → uint256` (tank wei); grants exposed as **`grantsOf(address)`** (brief said `grants` — pick one; `grantsOf` matches the `xxxOf` convention of the statefold views); `nonces` exposed as public mapping **`usedNonces(address,uint256) → bool`** (consumption bitmap, mirror DelegationRegistry `:78`) — it is a *used-set*, not a counter; off-chain must track next-unused by scanning or its own counter (recommend an off-chain counter + pre-check via `usedNonces`). |
| 4 | `refill()` grant-claim function | **CONFIRMED** | `refill() external` — grants `gasGrant` to `msg.sender` when `grantsUsed < grantsCap` and reserve covers it; same `_lazyGrant` path as relay; `relay()` also lazy-grants, so `refill()` is a UX convenience (FE "claim gas grant" button), not a protocol requirement. |
| 5 | `GAS_GRANT = 0.01e18` | **CONFIRMED as default, admin-tunable** | `gasGrant` storage var, constructor default `0.01 ether`, owner-settable (`setGasGrant`, zero-revert). Off-chain must read the live value (add to `capSettings()` view), never hardcode. |
| 6 | EIP-712 domain `"AxiomGasTank"` / `"1"` | **CONFIRMED** | constructor caches `keccak256(abi.encode(EIP712Domain(typeHash), keccak256("AxiomGasTank"), keccak256("1"), block.chainid, address(this)))` — verbatim structural mirror of `AxiomDelegationRegistry.sol:92-99`. Signing payload: `ForwardRequest(address user,address target,bytes data,uint256 maxGasCost,uint256 nonce,uint256 deadline)` — field order above is canonical; FE/planner must serialize exactly this order. |
| 7 | (added) `Relayed` fires on **target failure too** | confirm off-chain indexing treats `success=false` as a normal terminal state, not an alert | §2.2 step 8. |
| 8 | (added) relayer economics | confirm off-chain accepts ops only when `maxGasCost ≥ expectedGas × gasprice` and pre-checks `balanceOf`, `grantsOf`, `dailyWindowOf`, `usedNonces` before submitting | reimbursement clamp §2.2 step 7; daily window is post-hoc (checked after measurement), so a relayer that skips the `dailyWindowOf` pre-check can eat one failed-reimbursement revert per user per window. |

---

## 8. Critique — severity-graded risks

| Sev | Risk | Analysis | Mitigation |
| --- | --- | --- | --- |
| **HIGH** | **Forwarder trust = auth takeover surface.** Once `isTrustedForwarder(gasTank)`, every `_msgSender()` on Processor/NFT resolves through GasTank-relayed calldata. A compromised relayer (the only account that can profitably call `relay`) can submit ops as **any** user with any signed payload it possesses — and, worse, `withdrawAgentEarnings` for any creator whose signature it can extract; the standing single-key posture (w4 §6.1: TEE_SIGNER = ORACLE_ADMIN = MINTER = processor admin) means relayer compromise ≈ protocol compromise. | Inherent to ERC-2771; bounded on-chain by the selector root + per-op caps, but earnings withdrawal is a pure value transfer to `msg.sender` — the *signature* is the only defense. | (a) Keep relayer key distinct from admin keys where possible; (b) on-chain monitoring: alert on Relayed volume/nounce velocity per user; (c) phase-2 (4337 bundlers/paymaster) removes the trusted-forwarder trust entirely — design `relay()` as transitional, keep its surface minimal (no admin ops ever through it). |
| **HIGH** | **Sybil economics of 0.01×3 grants.** Free value per fresh address = `grantsCap × gasGrant` = 0.03 0G. Farming is bounded per address but unbounded across addresses; on a cheap testnet the reserve can be drained by scripted address generation (each new address needs one relayed op to trigger the lazy grant, which itself costs the relayer gas — the relayer's acceptance policy is the real sybil filter, not the contract). | Contract-side caps (`grantsCap`, `dailyUserCap`, `maxGasPerOp`) bound per-address damage to 0.03; aggregate drain is a relayer-admission problem. | Keep `grantsCap=3` initially; relayer applies identity/rate heuristics; monitor `grantsUsed` distribution (view exists); if mainnet: consider gating grants on a signal (existing agent ownership / small deposit) — **product decision, not this contract**. |
| **MEDIUM** | **gasleft() griefing / malicious target.** `measured` includes whatever the target burns; a target colluding with a user can inflate `measured` up to the clamp ceiling (`maxGasCost`, `maxGasPerOp×gasprice`, `dailyUserCap`) to drain user tanks and the reserve faster. Relay's own pre-check gas is excluded (relayer-subsidized, small). | All three caps bound per-op loss exactly; the user authorized `maxGasCost` by signature. No unbounded path. | Caps + `selectorsRoot` (only allowlisted targets reachable); document that `maxGasCost` is a trust decision by the signer. |
| **MEDIUM** | **Reserve drain / accounting.** Lazy grants + reimbursements both debit `gasReserve`; a bug or front-run burst could overdraw. | Explicit `gasReserve`/`totalTankBalances` accounting + invariant test (#13) + `recoverExcess` only for surplus; `ReserveDepleted` fail-closed when empty; relayer never lends funds (clamp §2.2.7). | Keep `depositReserve` amounts sized to observed burn; alert on `reserve() < K × dailyBurn`. |
| **MEDIUM** | **Grant/op atomicity edge:** a lazy grant fires when `tank < maxGasCost` but one grant may not cover `maxGasCost`; op then reverts post-grant (rolled back). Not a loss, but off-chain must not loop-retry or it burns relayer gas. | Grant rolls back atomically with the revert (state precedes target call, revert undoes it). §2.3. | Off-chain pre-check `balanceOf + gasGrant×(grantsCap−grantsOf) ≥ maxGasCost` before submitting. |
| **LOW** | **Relayer front-run of grant+op:** no window exists — grant and op are one atomic tx; `refill()` is self-serve, so there is no grant tx to front-run. Only "withholding" (relayer drops a signed op) — liveness, not safety; deadline bounds signature reuse risk. | — | Deadline discipline off-chain (short deadlines), nonce single-use (#4). |
| **LOW** | **2771 retrofit regression:** suffix ambiguity (calldata ≥ 20 bytes check, OZ `:59`) — a non-forwarder's call with trailing bytes is NOT reinterpreted (`isTrustedForwarder` gate), verified by test #15's spoof case. `payable mint` through forwarder requires the forwarder to carry `msg.value` — OZ ERC2771Forwarder supports it; GasTank's own `relay()` does **not** forward value to targets (data-only), so NFT mint is not relaid through GasTank.relay — relaid mint must use a standard 2771 forwarder or direct tx. Flag to off-chain lane (assumption #9). | — | Scope: relaid *mint* deferred unless the off-chain lane confirms the need; `update`/`payForAgent*`/`withdrawAgentEarnings` are value-free and fully supported. |
| **INFO** | **4337 phase-2 path:** GasTank is a waypoint, not the destination. `ForwardRequest` is deliberately domain/struct-stable; once an AA paymaster lands, deprecate `relay()` (pause + drain via `withdrawTank`/`recoverExcess`), keep the tank deposits/grants surface if useful, retire forwarder trust by `setTrustedForwarder(0)` (valid un-wire). | — | Record the deprecation path in the deployment JSON note. |

---

## 9. References

- `apps/contracts/src/AxiomPaymentProcessor.sol:112,122` — ERC-7201 location + gap 46 (tail-append anchor)
- `apps/contracts/src/AxiomPaymentProcessor.sol:132-139,137` — `onlyAgentCreator` msg.sender site
- `apps/contracts/src/AxiomPaymentProcessor.sol:219-227,359,432-436` — maxPayCap 0-disables idiom (lesson cited for MAX_GAS_PER_OP non-zero floor)
- `apps/contracts/src/AxiomPaymentProcessor.sol:353-362` — `_payTransferFrom` (single-capped-pull precedent)
- `apps/contracts/src/AxiomPaymentProcessor.sol:487-493,492 / 510-525,521,523 / 528-536,530-535 / 501` — 2771 retrofit sites P1–P5
- `apps/contracts/src/AxiomAgentNFT.sol:70` — gap 44; `:316-323,320` update site; `:332-348,393-398,395` mint/refund site; `:250-276` NFT upgrade timelock
- `apps/contracts/src/AxiomStrategyVault.sol:49-56,130-131,217-226,234` — day-window pattern (reused verbatim); `:97-113` withdraw CEI; `:253-259` recoverExcess
- `apps/contracts/src/AxiomDelegationRegistry.sol:73-99` — cached EIP-712 domain; `:110-111,166` fail-closed root; `:187-189` leaf encoding; `:134-136` nonce-burn-after-validation
- `lib/openzeppelin-contracts-upgradeable/contracts/metatx/ERC2771ContextUpgradeable.sol:23-24,41-49,55-79,84-86` — immutable forwarder, no storage, virtual overrides
- `apps/contracts/script/UpgradeProcessorStatefold.s.sol:12-38` — deploy script template + key discipline
- `apps/contracts/scripts/generate-abis.sh:22-31,126-131` — ABI pipeline anchors
- `docs/v3-proposals/waves/w4-statefold.md` §2,§3,§6.1 — layout-diff discipline, on-chain upgrade evidence, single-key posture
- `docs/v3-proposals/waves/w1-a-payment-cap-fixes.md` §3.3 — maxPayCap=0 lesson
- `docs/adr/004-contract-rewrite-plan.md` §1.3,§4 — non-upgradeable doctrine, upgrade-in-place mandate
- `docs/deployments/galileo-v3-2026-08-31.json:34-38,76-80` — non-upgradeable JSON entry shape; statefold block to extend
