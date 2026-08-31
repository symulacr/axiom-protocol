// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {IERC1271} from "@openzeppelin/contracts/interfaces/IERC1271.sol";

/// @title AxiomGasTank — protocol-seeded 0.01 0G gas grants + meta-relay for the Axiom protocol.
/// @notice Users prepay their own tank (`deposit`), get a lazily-granted 0.01 0G starter balance
///         (bounded by `grantsCap`), and have relayers execute signed ops on their behalf against
///         a Merkle allowlist of (target, selector) pairs. Relayers are reimbursed from the tank /
///         protocol reserve, never from their own pocket ("relayer never eats loss").
/// @dev Non-upgradeable, funds-holding: Ownable + Pausable + ReentrancyGuard, per ADR-004 §1.3
///      (same posture as AxiomStrategyVault). EIP-712 domain cached-immutable in the constructor,
///      verbatim structure of AxiomDelegationRegistry. Nonces are SEQUENTIAL per user (monotonic
///      counter, not a bitmap) so off-chain signers track the next nonce with a single read.
///      Accounting invariant: `gasReserve + totalTankBalance <= address(this).balance` always;
///      every tracked wei enters via `depositReserve`/`deposit` and every untracked wei is
///      owner-recoverable via `recoverReserve` (bounded by the tracked totals).
contract AxiomGasTank is Ownable, Pausable, ReentrancyGuard, EIP712 {
    // ─── Errors ───
    error ZeroAddress();
    error ZeroAmount();
    error ZeroGasCap();
    error DeadlineExpired();
    error InvalidUserSignature();
    error InvalidNonce();
    error TankExhausted();
    error ReserveExhausted();
    error DailyLimitExceeded();
    error InsufficientTankBalance();
    error TransferFailed();
    error RelayerRefundFailed();
    error UseDeposit();

    // ─── Events ───
    event Deposited(address indexed user, uint256 amount);
    event ReserveDeposited(address indexed funder, uint256 amount);
    event TankWithdrawn(address indexed user, address indexed to, uint256 amount);
    event GrantIssued(address indexed user, uint256 amount, uint256 grantsUsed);
    event Relayed(
        address indexed user,
        address indexed relayer,
        address indexed target,
        bool success,
        uint256 measured,
        uint256 reimburse,
        uint256 nonce
    );
    event GasGrantUpdated(uint256 oldGrant, uint256 newGrant);
    event GrantsCapUpdated(uint256 oldCap, uint256 newCap);
    event MaxGasPerOpUpdated(uint256 oldCap, uint256 newCap);
    event DailyLimitUpdated(uint256 oldLimit, uint256 newLimit);
    event ReserveRecovered(address indexed to, uint256 amount);

    // ─── Relay request (EIP-712 signed) ───
    struct ForwardRequest {
        address user;
        address target;
        bytes data;
        uint256 maxGasCost; // user's committed wei ceiling for this op
        uint256 nonce; // sequential, per-user
        uint256 deadline; // timestamp floor
    }

    bytes32 private constant FORWARD_REQUEST_TYPEHASH = keccak256(
        "ForwardRequest(address user,address target,bytes data,uint256 maxGasCost,uint256 nonce,uint256 deadline)"
    );

    /// @notice ERC-1271 magic value (EIP-1271 §isValidSignature success).
    bytes4 private constant ERC1271_VALID = 0x1626ba7e;

    // ─── State ───
    mapping(address user => uint256) public tank; // user → prepaid native wei (deposits + grants)
    mapping(address user => uint256) public grantBalance; // user → UNSPENT grant wei (spend-only, never withdrawable)
    mapping(address user => uint256) public grantsUsed; // user → 0.01-style grants consumed
    mapping(address user => uint256) public nonces; // user → next sequential relay nonce
    mapping(address user => uint256) public dailySpent; // per-user rolling-window reimbursed wei (Vault pattern)
    mapping(address user => uint64) public resetDay; // window id = block.timestamp / 1 days

    uint256 public gasReserve; // protocol-funded pool (depositReserve)
    uint256 public totalTankBalance; // accounting counter: gasReserve + totalTankBalance <= address(this).balance
    uint256 public gasGrant = 0.01 ether;
    uint256 public grantsCap = 3;
    uint256 public maxGasPerOp; // per-op gas-UNIT ceiling (wei bound = maxGasPerOp * tx.gasprice); non-zero floor
    uint256 public dailyLimit; // per-user per-window reimbursement ceiling in wei; 0 = disabled (documented asymmetry)

    // ─── Constructor ───
    /// @param admin_ governance (depositReserve, setters, recoverReserve); non-zero required.
    /// @param maxGasPerOp_ initial per-op gas-unit ceiling; zero reverts (never silently disabled —
    ///        W1-A maxPayCap=0 lesson: a pooled-funds contract must not have a disableable cap).
    constructor(
        address admin_,
        uint256 maxGasPerOp_
    ) Ownable(admin_) EIP712("AxiomGasTank", "1") {
        if (admin_ == address(0)) revert ZeroAddress();
        if (maxGasPerOp_ == 0) revert ZeroGasCap();
        maxGasPerOp = maxGasPerOp_;
    }

    // ─── Funding ───

    /// @notice Admin tops up the protocol grant/reimbursement pool.
    function depositReserve() external payable onlyOwner {
        if (msg.value == 0) revert ZeroAmount();
        gasReserve += msg.value;
        emit ReserveDeposited(msg.sender, msg.value);
    }

    /// @notice Top up the CALLER's own tank. Third-party funding is deliberately unsupported
    ///         (no depositFor) — the protocol path for that is the reserve.
    function deposit() external payable {
        if (msg.value == 0) revert ZeroAmount();
        tank[msg.sender] += msg.value;
        totalTankBalance += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    /// @notice Withdraw up to the caller's own tank balance. Grant funds are spend-only: the
    ///         grant amount is debited from the tank before user deposits on every spend, so
    ///         the withdrawable ceiling `totalTankBalance - (tank - grantsUsed * gasGrant)`
    ///         never lets grant wei leave via withdrawTank. CEI, nonReentrant.
    function withdrawTank(
        uint256 amount
    ) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        uint256 balance = tank[msg.sender];
        if (amount > balance) revert InsufficientTankBalance();
        // Grant wei are spend-only: only the deposit-backed share of the tank is withdrawable.
        uint256 withdrawable = balance - grantBalance[msg.sender];
        if (amount > withdrawable) revert InsufficientTankBalance();

        // CEI: accounting first, external transfer last.
        tank[msg.sender] = balance - amount;
        totalTankBalance -= amount;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit TankWithdrawn(msg.sender, msg.sender, amount);
    }

    // ─── Relay ───

    /// @notice Execute a user-signed op against the (target, selector) Merkle allowlist and
    ///         reimburse the relayer from the user's tank (or the protocol reserve via a lazy
    ///         grant when the tank runs dry).
    /// @dev Phases, all atomic (CEI: state precedes every external call; the only call whose
    ///      failure does not revert is the target itself, reported via `success`):
    ///      1. auth — deadline, target, data length, sig verification, nonce burn BEFORE the call;
    ///      2. lazy grant — fires only when tank < maxGasCost, bounded by grantsCap + reserve;
    ///      3. solvency — tank must cover maxGasCost post-grant, else TankExhausted (grant rolls back);
    ///      4. daily window — maxGasCost checked pre-execution, measured debit post-execution (Vault pattern);
    ///      5. measured call — gasleft() delta, target revert does NOT bubble (success=false);
    ///      6. reimbursement — min(measured*tx.gasprice, maxGasCost, maxGasPerOp*tx.gasprice),
    ///         debit-then-pay from tank/grant/reserve, relayer paid last.
    function relay(
        ForwardRequest calldata req,
        bytes calldata userSig
    ) external nonReentrant whenNotPaused returns (bool ok) {
        // ── Phase 1: auth. Validate everything, burn the nonce before the call. ──
        if (req.user == address(0) || req.target == address(0)) revert ZeroAddress();
        if (req.data.length < 4) revert ZeroAmount();
        if (req.maxGasCost == 0) revert ZeroAmount();
        if (block.timestamp > req.deadline) revert DeadlineExpired();
        _verifySig(req, userSig);

        uint256 nonce = req.nonce;
        if (nonce != nonces[req.user]) revert InvalidNonce();
        nonces[req.user] = nonce + 1; // burn before the call: replay-proof even mid-execution

        // ── Phase 2: lazy grant — only when the tank cannot cover the op. ──
        if (tank[req.user] < req.maxGasCost) _lazyGrant(req.user);

        // ── Phase 3: solvency. Grant rolls back atomically on revert (state precedes the call). ──
        if (tank[req.user] < req.maxGasCost) revert TankExhausted();

        // ── Phase 4: daily window — maxGasCost checked pre-execution, debit is post-measurement.
        //    dailyLimit == 0 disables the window (sentinel; asymmetry vs maxGasPerOp's zero-floor
        //    is deliberate: a silent per-op cap disable can drain the pooled reserve in one op,
        //    while a 0 daily limit only suspends rate-limiting on user-authorized spend). ──
        uint64 today = uint64(block.timestamp / 1 days);
        if (dailyLimit != 0) {
            if (resetDay[req.user] != today) {
                dailySpent[req.user] = 0;
                resetDay[req.user] = today;
            }
            if (uint256(dailySpent[req.user]) + req.maxGasCost > dailyLimit) revert DailyLimitExceeded();
        }

        // ── Phase 5: measured execute. Target revert does not bubble — `targetOk` reports it. ──
        // The 20-byte ERC-2771 sender suffix is appended so the retrofitted AxiomPaymentProcessor
        // / AxiomAgentNFT resolve _msgSender() to the signed user, not to this tank.
        uint256 gasBefore = gasleft();
        bool targetOk;
        (targetOk,) = req.target.call(abi.encodePacked(req.data, bytes20(req.user)));
        uint256 measured = gasBefore - gasleft();

        // ── Phase 6: reimbursement — relayer never eats loss, user never over-pays. ──
        uint256 gasPrice = tx.gasprice;
        uint256 reimburse = measured * gasPrice;
        uint256 weiCap = maxGasPerOp * gasPrice;
        if (reimburse > req.maxGasCost) reimburse = req.maxGasCost;
        if (reimburse > weiCap) reimburse = weiCap;

        // CEI debit-then-pay. Grants were reserve-funded ONCE at issuance (_lazyGrant), so the
        // spend only reallocates within the tank: grant-backed wei (spend-only) first, then the
        // deposit-backed remainder — the reserve is NOT touched again here.
        uint256 grantWei = grantBalance[req.user];
        if (grantWei > reimburse) grantWei = reimburse;
        grantBalance[req.user] -= grantWei;
        tank[req.user] -= reimburse;
        totalTankBalance -= reimburse;
        if (dailyLimit != 0) {
            dailySpent[req.user] += reimburse; // post-measurement debit (Vault :234 pattern)
        }

        (bool paid,) = payable(msg.sender).call{value: reimburse}("");
        if (!paid) revert RelayerRefundFailed();

        emit Relayed(req.user, msg.sender, req.target, targetOk, measured, reimburse, nonce);
        return targetOk; // composability: report target success on-chain
    }

    // ─── Grant claim ───

    /// @notice Self-serve grant claim (UX path — the relay lazy-grants anyway). Same cap accounting.
    function grantCredit() external whenNotPaused returns (uint256 credited) {
        uint256 balance = tank[msg.sender];
        if (balance >= gasGrant) revert TankExhausted();
        if (gasReserve < gasGrant) revert ReserveExhausted();
        uint256 used = grantsUsed[msg.sender];
        if (used >= grantsCap) revert TankExhausted();
        grantsUsed[msg.sender] = used + 1;
        tank[msg.sender] = balance + gasGrant;
        grantBalance[msg.sender] += gasGrant;
        gasReserve -= gasGrant;
        totalTankBalance += gasGrant;
        emit GrantIssued(msg.sender, gasGrant, used + 1);
        return gasGrant;
    }

    // ─── Admin setters ───

    /// @notice Per-grant size in wei. Non-zero floor: a zero grant would silently kill the product.
    function setGasGrant(
        uint256 newGrant
    ) external onlyOwner {
        if (newGrant == 0) revert ZeroAmount();
        emit GasGrantUpdated(gasGrant, newGrant);
        gasGrant = newGrant;
    }

    /// @notice Max grants per address. Non-zero floor: zero silently disables grants.
    function setGrantsCap(
        uint256 newCap
    ) external onlyOwner {
        if (newCap == 0) revert ZeroAmount();
        emit GrantsCapUpdated(grantsCap, newCap);
        grantsCap = newCap;
    }

    /// @notice Per-op gas-UNIT ceiling (wei bound = maxGasPerOp * tx.gasprice). Zero reverts —
    ///         mirrored from the W1-A maxPayCap=0 lesson; the cap can never be silently disabled
    ///         on a contract that pays native out of a pooled reserve.
    function setMaxGasPerOp(
        uint256 newCap
    ) external onlyOwner {
        if (newCap == 0) revert ZeroGasCap();
        emit MaxGasPerOpUpdated(maxGasPerOp, newCap);
        maxGasPerOp = newCap;
    }

    /// @notice Per-user daily reimbursement ceiling in wei. 0 DISABLES the window (sentinel) —
    ///         documented asymmetry vs setMaxGasPerOp's zero-floor: a disabled per-op cap lets one
    ///         op drain the pooled reserve, while a disabled daily limit only removes rate-limiting
    ///         on per-op-capped, user-signed spend. Monitor `DailyLimitUpdated(_, 0)`.
    function setDailyLimit(
        uint256 newLimit
    ) external onlyOwner {
        emit DailyLimitUpdated(dailyLimit, newLimit);
        dailyLimit = newLimit;
    }

    /// @notice Recover UNTRACKED native only (stray transfers / donations). The owner-bounded
    ///         withdrawable surplus keeps `gasReserve + totalTankBalance` untouchable (Vault
    ///         recoverExcessNative pattern, AxiomStrategyVault.sol:253-259).
    function recoverReserve(
        address payable to
    ) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        uint256 tracked = gasReserve + totalTankBalance;
        uint256 surplus = address(this).balance > tracked ? address(this).balance - tracked : 0;
        if (surplus == 0) revert ZeroAmount();
        (bool ok,) = to.call{value: surplus}("");
        if (!ok) revert TransferFailed();
        emit ReserveRecovered(to, surplus);
    }

    // ─── Views ───

    /// @notice Withdrawable-by-user tank balance (grant wei excluded — spend-only).
    function balanceOf(
        address user
    ) external view returns (uint256) {
        return tank[user];
    }

    /// @notice Daily-window snapshot for the off-chain relayer pre-flight (relayer must pre-check:
    ///         the window debit is post-measurement, so a skipped pre-check costs relayer gas).
    function dailyWindowOf(
        address user
    ) external view returns (uint256 spent, uint64 windowResetDay, uint256 limit) {
        return (dailySpent[user], resetDay[user], dailyLimit);
    }

    function reserve() external view returns (uint256) {
        return gasReserve;
    }

    /// @notice One-call cap pre-flight for relayers/off-chain planners.
    function capSettings() external view returns (uint256 grant, uint256 cap, uint256 perOp, uint256 daily) {
        return (gasGrant, grantsCap, maxGasPerOp, dailyLimit);
    }

    /// @notice EIP-712 digest a user signs to authorize `req` (off-chain signing parity aid).
    function forwardRequestDigest(
        ForwardRequest calldata req
    ) external view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(FORWARD_REQUEST_TYPEHASH, req)));
    }

    receive() external payable {
        revert UseDeposit(); // all native enters through explicit accounting paths
    }

    // ─── Internals ───

    /// @dev Lazy grant: 0.01-style top-up from the protocol reserve, bounded by grantsCap.
    ///      State changes here roll back atomically if the relay later reverts (grant consumed
    ///      only when the relay actually proceeds — grant/op atomicity).
    function _lazyGrant(
        address user
    ) internal {
        uint256 used = grantsUsed[user];
        if (used >= grantsCap) revert TankExhausted();
        if (gasReserve < gasGrant) revert ReserveExhausted();
        grantsUsed[user] = used + 1;
        tank[user] += gasGrant;
        grantBalance[user] += gasGrant;
        gasReserve -= gasGrant;
        totalTankBalance += gasGrant;
        emit GrantIssued(user, gasGrant, used + 1);
    }

    /// @dev Dual-path ERC-1271 signature check: EOA → ECDSA.recover; contract → the contract's
    ///      own isValidSignature (0x1626ba7e). A zero-size code falls back to EOA recovery.
    function _verifySig(
        ForwardRequest calldata req,
        bytes calldata userSig
    ) internal view {
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(FORWARD_REQUEST_TYPEHASH, req)));
        if (req.user.code.length > 0) {
            if (IERC1271(req.user).isValidSignature(digest, userSig) != ERC1271_VALID) {
                revert InvalidUserSignature();
            }
        } else {
            if (ECDSA.recover(digest, userSig) != req.user) revert InvalidUserSignature();
        }
    }
}
