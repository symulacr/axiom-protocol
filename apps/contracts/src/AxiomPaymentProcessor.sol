// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ContextUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ERC2771ContextUpgradeable} from "@openzeppelin/contracts-upgradeable/metatx/ERC2771ContextUpgradeable.sol";
import {IAxiomAgentNFT} from "./interfaces/IAxiomAgentNFT.sol";
import {AxiomStrategyVault} from "./AxiomStrategyVault.sol";
import {ISignatureTransfer} from "./permit2/ISignatureTransfer.sol";
import {IERC7857Metadata, IntelligentData} from "@0g-agent-nft/interfaces/IERC7857Metadata.sol";
import {TimelockManager} from "./libraries/TimelockManager.sol";
using TimelockManager for TimelockManager.State;

/// @title AxiomPaymentProcessor — routes payments to creators, compute providers, and the protocol treasury; payers approve an ERC-20 stable, creators pull via `withdrawAgentEarnings()`. UUPS-upgradeable.
contract AxiomPaymentProcessor is
    Initializable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuard,
    UUPSUpgradeable,
    ERC2771ContextUpgradeable
{
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error ZeroAmount();
    error NoEarnings();
    error NotCreator();
    error InvalidBps();
    error AgentCreatorNotRegistered();
    error MigrationBlocked();
    error PayAmountExceedsCap(uint256 amount, uint256 cap);
    error TransferAmountMismatch(uint256 expected, uint256 received);
    error NoPendingProposal();
    error ComputeRatioExceeded(uint256 computeAmount, uint256 maxCompute);
    error InvalidPermitToken();
    error InvalidPermitAmount(uint256 permitted, uint256 requested);
    error PermitExpired(uint256 deadline, uint256 timestamp);
    error VaultNotConfigured();

    event PaymentProcessed(
        uint256 indexed agentTokenId,
        address indexed payer,
        address indexed creator,
        uint256 amount,
        uint256 creatorCut,
        uint256 protocolCut
    );
    event ComputeProviderPaid(address indexed provider, uint256 amount);
    event EarningsWithdrawn(address indexed creator, uint256 amount);
    event RoyaltySet(uint256 indexed agentTokenId, uint256 bps);
    event ProtocolTreasuryProposed(address indexed proposedTreasury, uint256 effectiveAt);
    event ProtocolTreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event ProtocolTreasuryProposalCancelled(address indexed pendingTreasury);
    event ProtocolFeeBpsUpdated(uint256 oldBps, uint256 newBps);
    event PaymentTokenUpdated(address indexed oldToken, address indexed newToken);
    event MaxPayCapUpdated(uint256 oldCap, uint256 newCap);
    event ComputeRatioMaxUpdated(uint256 oldRatioMax, uint256 newRatioMax);
    event VaultAddressUpdated(address indexed oldVault, address indexed newVault);
    event TrustedForwarderUpdated(address indexed oldForwarder, address indexed newForwarder);

    /// @dev Canonical Permit2 deployment (Uniswap CREATE2 address, identical on every supported chain;
    ///      verified on Galileo testnet — docs/v3-proposals/04-web-research-digest.md Q2). Constant, not
    ///      storage: chain-invariant, saves an SLOAD per permit pay, and cannot drift via initialize();
    ///      if a chain ever lacks it there, the contract must be redeployed there anyway.
    address public constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    /// @dev EIP-712 type definition stub Permit2 hashes against for witness permits (PermitHash.sol,
    ///      `hashWithWitness`): typeHash = keccak256(stub ++ witnessTypeString). The witness string
    ///      must make stub++witness equal the wallet's full type concatenation — outer struct with
    ///      `AgentPayment witness)`, then TokenPermissions def, then AgentPayment def (field-order
    ///      referenced-type order: permitted→TokenPermissions, witness→AgentPayment). Verified
    ///      byte-parity with apps/frontend/src/lib/permit2.ts types and the MockPermit2 stub.
    string private constant WITNESS_TYPE_STRING =
        "AgentPayment witness)TokenPermissions(address token,uint256 amount)AgentPayment(uint256 agentTokenId,uint256 amount)";

    /// @dev Witness payload signed into every Permit2 payment: pins the paying agent and the
    ///      amount. (Permit2's hash additionally binds spender = msg.sender and the single-use
    ///      unordered nonce, so no extra salt is needed.)
    struct AgentPaymentWitness {
        uint256 agentTokenId;
        uint256 amount;
    }

    /// @notice keccak256("AgentPayment(uint256 agentTokenId,uint256 amount)") = 0x276d0fdb…
    bytes32 private constant AGENT_PAYMENT_WITNESS_TYPEHASH =
        0x276d0fdb23abe75e231455932314e625fc515aa5a37c6e73a306d719c2184e7e;

    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @dev Governance model matches AxiomAgentNFT: DEFAULT_ADMIN_ROLE governs upgrades,
    ///      ADMIN_ROLE governs parameter ops (pause, fee, token, cap, treasury timelock).
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    /// @custom:storage-location erc7201:agent.storage.AxiomPaymentProcessor
    struct PaymentProcessorStorage {
        address protocolTreasury;
        address paymentToken;
        uint16 protocolFeeBps;
        uint256 totalOutstandingEarnings;
        mapping(uint256 => uint256) agentRoyaltyStored; // sentinel: 0 = unset, otherwise stores bps + 1 to disambiguate
        mapping(address => uint256) agentEarnings;
        IAxiomAgentNFT axiomNft;
        TimelockManager.State treasuryTimelock;
        // V2: appended in place of a former __gap slot (layout-delta rule: new vars append
        // at the gap tail; total struct footprint stays byte-identical for upgrade-in-place).
        uint256 maxPayCap;
        // V3 (W1-A): appended at the gap tail per the V2 layout-delta rule (AxiomAgentNFT.sol
        // append discipline) — gap shrunk 48→47; upgrade-in-place safe: pre-V3 impls never read
        // this slot, so its zero default (0 = unlimited ratio) is inert until the admin sets it.
        uint256 computeRatioMax;
        // W2-A note: the Permit2 lane adds NO storage vars (PERMIT2 is a chain-invariant constant,
        // see below) — the layout was unchanged vs Wave 1.
        // V3 W4 (5-contract statefold): the standalone AxiomStateView read facade is folded into
        // this Processor — `axiomVault` is appended at the gap tail per the V2 layout-delta rule
        // (gap shrunk 47→46; upgrade-in-place safe: pre-W4 impls never read this slot, so its
        // zero default is inert until the admin wires it via setAxiomVault).
        AxiomStrategyVault axiomVault;
        // V3 W5 (ERC-2771 retrofit): appended at the gap tail per the V2 layout-delta rule
        // (gap shrunk 46→45; upgrade-in-place safe: pre-W5 impls never read this slot, so its
        // zero default = "no forwarder trusted" is inert until the admin wires the GasTank via
        // setTrustedForwarder). The OZ base's immutable _trustedForwarder is left unset —
        // trustedForwarder() below is overridden to read this storage field instead.
        address trustedForwarder;
        uint256[45] __gap;
    }

    bytes32 private constant STORAGE_LOCATION = 0xb6e9ac8ab7d5307044651d01576943b58a3563d54e8f2be64d1601b1a6cebc00;

    function _getStorage() private pure returns (PaymentProcessorStorage storage $) {
        assembly {
            $.slot := STORAGE_LOCATION
        }
    }

    modifier onlyAgentCreator(
        uint256 agentTokenId
    ) {
        PaymentProcessorStorage storage $ = _getStorage();
        address creator = $.axiomNft.creatorOf(agentTokenId);
        if (creator != _msgSender()) revert NotCreator();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() ERC2771ContextUpgradeable(address(0)) {
        _disableInitializers();
    }

    function initialize(
        address nftAddr,
        address paymentTokenAddr,
        address treasuryAddr,
        uint256 protocolFeeBps_,
        address initialOwner
    ) external initializer {
        if (nftAddr == address(0)) revert ZeroAddress();
        if (paymentTokenAddr == address(0)) revert ZeroAddress();
        if (treasuryAddr == address(0)) revert ZeroAddress();
        if (protocolFeeBps_ > BPS_DENOMINATOR) revert InvalidBps();
        __AccessControl_init();
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
        _grantRole(ADMIN_ROLE, initialOwner);
        PaymentProcessorStorage storage $ = _getStorage();
        $.axiomNft = IAxiomAgentNFT(nftAddr);
        $.protocolTreasury = treasuryAddr;
        $.protocolFeeBps = uint16(protocolFeeBps_);
        $.paymentToken = paymentTokenAddr;
    }

    function proposeProtocolTreasury(
        address newTreasury
    ) external onlyRole(ADMIN_ROLE) {
        if (newTreasury == address(0)) revert ZeroAddress();
        PaymentProcessorStorage storage $ = _getStorage();
        $.treasuryTimelock.propose(newTreasury);
        emit ProtocolTreasuryProposed(newTreasury, block.timestamp + TimelockManager.DELAY);
    }

    function executeProtocolTreasury() external onlyRole(ADMIN_ROLE) {
        PaymentProcessorStorage storage $ = _getStorage();
        address old = $.protocolTreasury;
        $.protocolTreasury = $.treasuryTimelock.execute();
        emit ProtocolTreasuryUpdated(old, $.protocolTreasury);
    }

    function cancelProtocolTreasuryProposal() external onlyRole(ADMIN_ROLE) {
        PaymentProcessorStorage storage $ = _getStorage();
        address pending = $.treasuryTimelock.proposed;
        if (pending == address(0)) revert NoPendingProposal();
        $.treasuryTimelock.cancel();
        emit ProtocolTreasuryProposalCancelled(pending);
    }

    function setProtocolFeeBps(
        uint256 newBps
    ) external onlyRole(ADMIN_ROLE) {
        if (newBps >= BPS_DENOMINATOR) revert InvalidBps();
        require(newBps <= type(uint16).max, "fee bps overflows uint16");
        PaymentProcessorStorage storage $ = _getStorage();
        uint256 old = $.protocolFeeBps;
        $.protocolFeeBps = uint16(newBps);
        emit ProtocolFeeBpsUpdated(old, newBps);
    }

    /// @notice Rotate the payment ERC-20; blocked while outstanding earnings exist or the old token balance remains — drain both before migrating.
    function setPaymentToken(
        address newPaymentToken
    ) external onlyRole(ADMIN_ROLE) {
        if (newPaymentToken == address(0)) revert ZeroAddress();
        PaymentProcessorStorage storage $ = _getStorage();
        if ($.totalOutstandingEarnings > 0) revert MigrationBlocked();
        address oldToken = $.paymentToken;
        if (IERC20(oldToken).balanceOf(address(this)) > 0) revert MigrationBlocked();
        $.paymentToken = newPaymentToken;
        emit PaymentTokenUpdated(oldToken, newPaymentToken);
    }

    /// @notice Chain-invariant per-pay upper bound enforced on both pay lanes (M8: the off-chain cap becomes an on-chain invariant). 0 disables the cap.
    /// @dev    0 = cap disabled entirely — V3 policy treats this as an admin-only emergency
    ///         setting, not an operating mode: it must only be used transiently (e.g. during an
    ///         incident), with off-chain monitoring expected to alert on `MaxPayCapUpdated(_, 0)`.
    function setMaxPayCap(
        uint256 newCap
    ) external onlyRole(ADMIN_ROLE) {
        PaymentProcessorStorage storage $ = _getStorage();
        uint256 old = $.maxPayCap;
        $.maxPayCap = newCap;
        emit MaxPayCapUpdated(old, newCap);
    }

    function maxPayCap() external view returns (uint256) {
        return _getStorage().maxPayCap;
    }

    /// @notice Max `computeAmount` as a multiple of `agentAmount` in `payForAgentAndCompute`.
    ///         Caps how far the compute leg can starve the creator royalty split. 0 = unlimited.
    /// @dev    Keep in sync with the off-chain ratio mirror used by the pay confirmation flow.
    function computeRatioMax() external view returns (uint256) {
        return _getStorage().computeRatioMax;
    }

    /// @notice Set the agentAmount→computeAmount ratio bound (0 = unlimited). The bound is
    ///         additive headroom: `computeAmount ≤ computeRatioMax * agentAmount`, so agent pays
    ///         remain unaffected; only the compute leg's weight relative to the agent leg is bounded.
    function setComputeRatioMax(
        uint256 newRatioMax
    ) external onlyRole(ADMIN_ROLE) {
        PaymentProcessorStorage storage $ = _getStorage();
        uint256 old = $.computeRatioMax;
        $.computeRatioMax = newRatioMax;
        emit ComputeRatioMaxUpdated(old, newRatioMax);
    }

    /// @notice Wire the strategy vault this Processor reads for the statefold views (V3 W4).
    ///         Zero address is a valid un-wire (vaultHealthOf reverts VaultNotConfigured until
    ///         a vault is set again); the zero-check lives on the read side, not here.
    function setAxiomVault(
        address newVault
    ) external onlyRole(ADMIN_ROLE) {
        PaymentProcessorStorage storage $ = _getStorage();
        address old = address($.axiomVault);
        $.axiomVault = AxiomStrategyVault(payable(newVault));
        emit VaultAddressUpdated(old, newVault);
    }

    function axiomVault() external view returns (address) {
        return address(_getStorage().axiomVault);
    }

    // ─── ERC-2771 trusted forwarder (V3 W5) ───
    // The vendored OZ 5.0.2 base bakes the forwarder as an immutable; these storage-backed
    // overrides replace it so the admin can wire/un-wire the GasTank post-upgrade. A zero
    // forwarder is a valid un-wire (isTrustedForwarder guards zero), matching setAxiomVault.

    /// @notice Wire the ERC-2771 forwarder whose relayed calldata resolves to the signed user.
    function setTrustedForwarder(
        address newForwarder
    ) external onlyRole(ADMIN_ROLE) {
        PaymentProcessorStorage storage $ = _getStorage();
        address old = $.trustedForwarder;
        $.trustedForwarder = newForwarder;
        emit TrustedForwarderUpdated(old, newForwarder);
    }

    function trustedForwarder() public view override returns (address) {
        return _getStorage().trustedForwarder;
    }

    function isTrustedForwarder(
        address forwarder
    ) public view override returns (bool) {
        return forwarder != address(0) && forwarder == _getStorage().trustedForwarder;
    }

    /// @dev Explicit diamond overrides: ContextUpgradeable reaches this contract both directly
    ///      (via AccessControlUpgradeable) and via ERC2771ContextUpgradeable, so solc requires
    ///      the derived contract to disambiguate. Delegating to the ERC-2771 variant wires every
    ///      inherited _msgSender() call site (pay lanes, role checks) through forwarder resolution.
    function _msgSender() internal view override(ContextUpgradeable, ERC2771ContextUpgradeable) returns (address) {
        return ERC2771ContextUpgradeable._msgSender();
    }

    function _msgData() internal view override(ContextUpgradeable, ERC2771ContextUpgradeable) returns (bytes calldata) {
        return ERC2771ContextUpgradeable._msgData();
    }

    function _contextSuffixLength()
        internal
        view
        override(ContextUpgradeable, ERC2771ContextUpgradeable)
        returns (uint256)
    {
        return ERC2771ContextUpgradeable._contextSuffixLength();
    }

    function setRoyaltyBps(
        uint256 agentTokenId,
        uint256 newBps
    ) external onlyAgentCreator(agentTokenId) {
        _setRoyaltyBps(agentTokenId, newBps);
    }

    function _setRoyaltyBps(
        uint256 agentTokenId,
        uint256 newBps
    ) internal {
        if (newBps >= BPS_DENOMINATOR) revert InvalidBps();
        PaymentProcessorStorage storage $ = _getStorage();
        uint256 maxRoyalty = BPS_DENOMINATOR - $.protocolFeeBps;
        if (newBps > maxRoyalty) revert InvalidBps();
        $.agentRoyaltyStored[agentTokenId] = newBps + 1;
        emit RoyaltySet(agentTokenId, newBps);
    }

    function _effectiveRoyaltyBps(
        PaymentProcessorStorage storage $,
        uint256 agentTokenId
    ) internal view returns (uint256 royaltyBps, bool isSet) {
        uint256 stored = $.agentRoyaltyStored[agentTokenId];
        if (stored == 0) {
            return (0, false);
        }
        royaltyBps = stored - 1;
        uint256 maxRoyalty = BPS_DENOMINATOR - $.protocolFeeBps;
        if (royaltyBps > maxRoyalty) {
            royaltyBps = maxRoyalty;
        }
        isSet = true;
    }

    function protocolTreasury() external view returns (address) {
        return _getStorage().protocolTreasury;
    }

    function pendingProtocolTreasury() external view returns (address) {
        return _getStorage().treasuryTimelock.proposed;
    }

    function pendingTreasuryEffectiveAt() external view returns (uint256) {
        PaymentProcessorStorage storage $ = _getStorage();
        if ($.treasuryTimelock.proposed == address(0)) return 0;
        return $.treasuryTimelock.proposedAt + TimelockManager.DELAY;
    }

    function protocolFeeBps() external view returns (uint256) {
        return _getStorage().protocolFeeBps;
    }

    function paymentToken() external view returns (address) {
        return _getStorage().paymentToken;
    }

    function totalOutstandingEarnings() external view returns (uint256) {
        return _getStorage().totalOutstandingEarnings;
    }

    function royaltyBpsOf(
        uint256 agentTokenId
    ) external view returns (uint256) {
        PaymentProcessorStorage storage $ = _getStorage();
        uint256 stored = $.agentRoyaltyStored[agentTokenId];
        if (stored == 0) return 0;
        uint256 royaltyBps = stored - 1;
        uint256 maxRoyalty = BPS_DENOMINATOR - $.protocolFeeBps;
        return royaltyBps > maxRoyalty ? maxRoyalty : royaltyBps;
    }

    function royaltyBpsSet(
        uint256 agentTokenId
    ) external view returns (bool) {
        return _getStorage().agentRoyaltyStored[agentTokenId] != 0;
    }

    function agentEarningsOf(
        address creator
    ) external view returns (uint256) {
        return _getStorage().agentEarnings[creator];
    }

    /// @dev Single capped token-pull primitive (V3 W1-A): enforces the MAX_PAY cap (0 disables
    ///      it, see setMaxPayCap) plus the zero-amount guard on EVERY pay lane, so no caller can
    ///      bypass the cap by routing through the compute legs. Callers handle the zero-address
    ///      checks (revert context differs per lane).
    function _payTransferFrom(
        address payer,
        address to,
        uint256 amount
    ) internal {
        PaymentProcessorStorage storage $ = _getStorage();
        if ($.maxPayCap != 0 && amount > $.maxPayCap) revert PayAmountExceedsCap(amount, $.maxPayCap);
        if (amount == 0) revert ZeroAmount();
        IERC20($.paymentToken).safeTransferFrom(payer, to, amount);
    }

    /// @dev Single split implementation (V2 dedup): pulls `amount` of the payment token from
    ///      `payer` and hands off to _paySplitReceived. Callers must hold nonReentrant +
    ///      whenNotPaused; the MAX_PAY cap is enforced inside _payTransferFrom so every pay
    ///      lane that pulls tokens inherits it.
    function _paySplit(
        address payer,
        uint256 agentTokenId,
        uint256 amount
    ) internal returns (uint256 creatorCut, uint256 protocolCut) {
        IERC20 token = IERC20(_getStorage().paymentToken);

        uint256 balanceBefore = token.balanceOf(address(this));
        _payTransferFrom(payer, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - balanceBefore;
        if (received != amount) revert TransferAmountMismatch(amount, received);

        (creatorCut, protocolCut) = _paySplitReceived(payer, agentTokenId, received);
    }

    /// @dev Split of tokens ALREADY held by this contract (W2-A factoring): resolves the creator,
    ///      splits `amount` creator-vs-treasury, credits the creator's cut as withdrawable earnings,
    ///      forwards the protocol cut, emits PaymentProcessed. Used by both pay lanes — the
    ///      Permit2 lane calls it after permit2.permitWitnessTransferFrom has delivered the tokens.
    ///      Callers must hold nonReentrant + whenNotPaused and pre-validate the amount (> 0).
    function _paySplitReceived(
        address payer,
        uint256 agentTokenId,
        uint256 amount
    ) internal returns (uint256 creatorCut, uint256 protocolCut) {
        PaymentProcessorStorage storage $ = _getStorage();

        address creator = $.axiomNft.creatorOf(agentTokenId);
        if (creator == address(0)) revert AgentCreatorNotRegistered();

        uint256 received = amount;
        (uint256 royaltyBps, bool royaltyIsSet) = _effectiveRoyaltyBps($, agentTokenId);
        uint256 feeBps = $.protocolFeeBps;
        if (!royaltyIsSet) {
            protocolCut = (received * feeBps) / BPS_DENOMINATOR;
            creatorCut = received - protocolCut;
        } else {
            creatorCut = (received * royaltyBps) / BPS_DENOMINATOR;
            protocolCut = received - creatorCut;
            uint256 minProtocolCut = (received * feeBps) / BPS_DENOMINATOR;
            if (protocolCut < minProtocolCut) {
                protocolCut = minProtocolCut;
                creatorCut = received - protocolCut;
            }
        }

        if (creatorCut > 0) {
            $.agentEarnings[creator] += creatorCut;
            $.totalOutstandingEarnings += creatorCut;
        }

        if (protocolCut > 0) {
            IERC20($.paymentToken).safeTransfer($.protocolTreasury, protocolCut);
        }

        emit PaymentProcessed(agentTokenId, payer, creator, amount, creatorCut, protocolCut);
    }

    /// @notice Cap + zero-guard shared by the Permit2 lane (W2-A). Kept OUT of _paySplitReceived:
    ///         the permit lane enforces the cap BEFORE the transfer moves any tokens, mirroring
    ///         how _payTransferFrom front-runs the pull on the approval lane.
    function _enforcePayCap(
        uint256 amount
    ) internal view {
        PaymentProcessorStorage storage $ = _getStorage();
        if ($.maxPayCap != 0 && amount > $.maxPayCap) revert PayAmountExceedsCap(amount, $.maxPayCap);
        if (amount == 0) revert ZeroAmount();
    }

    /// @notice Pay for an agent with a Permit2 signature (gasless-style approval): the payer signs
    ///         one EIP-712 Permit2 message over a transfer to this contract; this tx pulls the
    ///         payment from `owner` and runs the same creator/treasury split as payForAgent. The
    ///         owner must have approved the canonical Permit2 contract for the payment token
    ///         (one-time, any amount).
    ///         NOT ERC-2771-relayable: Permit2 binds the spender to the raw msg.sender inside its
    ///         hash, so relaying this through the GasTank would make the GasTank the spender and
    ///         the permit would not verify against the signed user. Call this directly.
    ///         Replay protection is Permit2's unordered nonce bitmap — consumed inside Permit2, so
    ///         this contract deliberately keeps no nonce state of its own.
    /// @dev    The witness binds (agentTokenId, amount) so a captured signature cannot be
    ///         redirected to another agent or amount, and `spender` binds msg.sender inside
    ///         Permit2's hash. The MAX_PAY cap applies on this lane too.
    /// @param owner Token owner whose signature authorizes the transfer; Permit2 reverts unless
    ///              the signature recovers to this address (canonical Permit2 keeps `owner` out of
    ///              the signed struct — it is a separate call parameter).
    function payForAgentWithPermit2(
        uint256 agentTokenId,
        uint256 amount,
        address owner,
        ISignatureTransfer.PermitTransferFrom calldata permit,
        bytes calldata signature
    ) external nonReentrant whenNotPaused {
        _enforcePayCap(amount);

        PaymentProcessorStorage storage $ = _getStorage();
        if (permit.permitted.token != $.paymentToken) revert InvalidPermitToken();
        if (permit.permitted.amount < amount) revert InvalidPermitAmount(permit.permitted.amount, amount);
        if (permit.deadline < block.timestamp) revert PermitExpired(permit.deadline, block.timestamp);

        bytes32 witness =
            keccak256(abi.encode(AGENT_PAYMENT_WITNESS_TYPEHASH, AgentPaymentWitness(agentTokenId, amount)));

        // Permit2 verifies the signature recovers to `owner` (revert otherwise), burns the

        // Permit2 verifies the signature recovers to `owner` (revert otherwise), burns the
        // unordered nonce, and transfers `amount` of the permitted token from the owner to us.
        ISignatureTransfer(PERMIT2)
            .permitWitnessTransferFrom(
                permit,
                ISignatureTransfer.SignatureTransferDetails({to: address(this), requestedAmount: amount}),
                owner,
                witness,
                WITNESS_TYPE_STRING,
                signature
            );

        _paySplitReceived(owner, agentTokenId, amount);
    }

    /// @notice Split `amount` between creator (royalty credited to withdrawable balance) and treasury (forwarded immediately); approve first; splits use actual received tokens, so fee-on-transfer tokens revert.
    function payForAgent(
        uint256 agentTokenId,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        _paySplit(_msgSender(), agentTokenId, amount);
    }

    /// @dev Operator approves this contract to spend `amount`, then the full amount is forwarded to `provider`.
    function payComputeProvider(
        address provider,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        if (provider == address(0)) revert ZeroAddress();
        _payTransferFrom(_msgSender(), provider, amount);
        emit ComputeProviderPaid(provider, amount);
    }

    /// @notice One-tx payForAgent + payComputeProvider: credits the creator's split of `agentAmount`
    ///         to withdrawable earnings and forwards `computeAmount` directly to `provider` (2 txs -> 1).
    /// @dev    The compute leg is ratio-bounded (`computeAmount <= computeRatioMax * agentAmount`,
    ///         0 = unlimited) so it cannot be used to starve the creator royalty split by paying
    ///         ~the whole invoice as "compute" to an arbitrary provider.
    function payForAgentAndCompute(
        uint256 agentTokenId,
        address provider,
        uint256 agentAmount,
        uint256 computeAmount
    ) external nonReentrant whenNotPaused {
        if (provider == address(0)) revert ZeroAddress();
        uint256 ratioMax = _getStorage().computeRatioMax;
        if (ratioMax != 0 && computeAmount > ratioMax * agentAmount) {
            revert ComputeRatioExceeded(computeAmount, ratioMax * agentAmount);
        }
        _paySplit(_msgSender(), agentTokenId, agentAmount);

        _payTransferFrom(_msgSender(), provider, computeAmount);
        emit ComputeProviderPaid(provider, computeAmount);
    }

    /// @notice Creator pulls accumulated earnings in the configured payment token (not native).
    function withdrawAgentEarnings() external nonReentrant {
        PaymentProcessorStorage storage $ = _getStorage();
        uint256 amount = $.agentEarnings[_msgSender()];
        if (amount == 0) revert NoEarnings();
        $.agentEarnings[_msgSender()] = 0;
        $.totalOutstandingEarnings -= amount;
        emit EarningsWithdrawn(_msgSender(), amount);
        IERC20($.paymentToken).safeTransfer(_msgSender(), amount);
    }

    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    function AXIOM_NFT() external view returns (IAxiomAgentNFT) {
        return _getStorage().axiomNft;
    }

    /// @dev UUPS gate: the EIP-1967 impl-slot rewrite is protected only by this check; DEFAULT_ADMIN_ROLE keeps governance in AccessControl.
    function _authorizeUpgrade(
        address
    ) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    // ─── Statefold views (V3 W4): the former AxiomStateView read facade, folded in ───
    // Logic is ported 1:1 from the deleted src/AxiomStateView.sol — drift vs the originals
    // is a bug; see docs/v3-proposals/waves/w4-statefold.md for the port table.

    /// @notice Royalty recipient for `tokenId` = the NFT's mint-frozen creator. Zero is a VALID
    ///         outcome ("no royalty recipient": nonexistent token / role-minted without creator) —
    ///         callers treat zero as unset; the write path reverts AgentCreatorNotRegistered here
    ///         instead, this view surfaces the same fact as address(0).
    function royaltyRecipientOf(
        uint256 tokenId
    ) external view returns (address recipient) {
        return _getStorage().axiomNft.creatorOf(tokenId);
    }

    /// @notice View mirror of `_effectiveRoyaltyBps` + `royaltyBpsOf`: reuses the internal clamp
    ///         (stored == 0 → (0,false); bps = min(stored − 1, BPS_DENOMINATOR − protocolFeeBps))
    ///         rather than duplicating it — clamp parity is structural, not by convention.
    function effectiveRoyaltyBpsOf(
        uint256 tokenId
    ) external view returns (uint256 royaltyBps, bool isSet, uint256 protocolFeeBps) {
        PaymentProcessorStorage storage $ = _getStorage();
        (royaltyBps, isSet) = _effectiveRoyaltyBps($, tokenId);
        return (royaltyBps, isSet, $.protocolFeeBps);
    }

    /// @notice Vault health for `tokenId`, mirroring `AxiomStrategyVault.execute`'s view of state.
    ///         `expired` is the exact StrategyExpired predicate
    ///         (`validUntilDay != 0 && today > validUntilDay`); 0 validUntilDay sentinel = no
    ///         expiry. NOTE (Vault residual 1): strategyRoot/dailyLimit survive iTransfer — the
    ///         buyer inherits the seller's strategy; consumers should prompt setStrategy
    ///         post-purchase.
    function vaultHealthOf(
        uint256 tokenId
    )
        external
        view
        returns (
            uint256 balance,
            bytes32 strategyRoot,
            uint128 dailyLimit,
            uint128 dailySpent,
            uint64 resetDay,
            uint64 validUntilDay,
            bool expired
        )
    {
        AxiomStrategyVault vault = _getStorage().axiomVault;
        if (address(vault) == address(0)) revert VaultNotConfigured();
        // strategyOf returns (root, uint256 dailyLimit, uint256 dailySpent, resetDay, validUntilDay);
        // uint256→uint128 widening is explicit here because tuple assignment has no implicit narrowing.
        bytes32 root;
        uint256 limitW;
        uint256 spentW;
        (root, limitW, spentW, resetDay, validUntilDay) = vault.strategyOf(tokenId);
        strategyRoot = root;
        dailyLimit = uint128(limitW);
        dailySpent = uint128(spentW);
        balance = vault.balanceOf(tokenId);
        uint64 today = uint64(block.timestamp / 1 days);
        expired = validUntilDay != 0 && today > validUntilDay;
    }

    /// @notice Payload attestation: `keccak256(payload)` equals the ERC-7857 iData commitment at
    ///         `dataIndex`. Nonexistent token reverts inside the NFT getter
    ///         (ERC721NonexistentToken); an out-of-range dataIndex reverts on array access. A
    ///         stored bytes32(0) dataHash can never verify any payload (keccak256 ≠ 0) — never
    ///         read a zero hash as "verified".
    function verifyPayloadOf(
        uint256 tokenId,
        uint256 dataIndex,
        bytes calldata payload
    ) external view returns (bool) {
        IntelligentData[] memory datas = IERC7857Metadata(address(_getStorage().axiomNft)).intelligentDatasOf(tokenId);
        return keccak256(payload) == datas[dataIndex].dataHash;
    }

    /// @notice One-call pre-flight for the FE pay flow — every fact `payForAgent` checks. All
    ///         reads are state this Processor already owns (no external facade hop).
    function paymentSnapshot(
        address payer,
        uint256 tokenId
    )
        external
        view
        returns (
            uint256 maxPayCap,
            uint256 computeRatioMax,
            uint256 agentBalance,
            uint256 payerAllowance,
            address paymentToken
        )
    {
        PaymentProcessorStorage storage $ = _getStorage();
        maxPayCap = $.maxPayCap;
        computeRatioMax = $.computeRatioMax;
        IERC20 token = IERC20($.paymentToken);
        agentBalance = token.balanceOf(payer);
        payerAllowance = token.allowance(payer, address(this));
        paymentToken = $.paymentToken;
    }
}
