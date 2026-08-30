// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IAxiomAgentNFT} from "./interfaces/IAxiomAgentNFT.sol";
import {TimelockManager} from "./libraries/TimelockManager.sol";
using TimelockManager for TimelockManager.State;

/// @title AxiomPaymentProcessor — routes payments to creators, compute providers, and the protocol treasury; payers approve an ERC-20 stable, creators pull via `withdrawAgentEarnings()`. UUPS-upgradeable.
contract AxiomPaymentProcessor is Initializable, AccessControlUpgradeable, PausableUpgradeable, ReentrancyGuard, UUPSUpgradeable {
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
        uint256[47] __gap;
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
        if (creator != msg.sender) revert NotCreator();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
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
        emit ProtocolTreasuryProposed(newTreasury, block.timestamp + 1 days);
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
        return $.treasuryTimelock.proposedAt + 1 days;
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
    function _payTransferFrom(address payer, address to, uint256 amount) internal {
        PaymentProcessorStorage storage $ = _getStorage();
        if ($.maxPayCap != 0 && amount > $.maxPayCap) revert PayAmountExceedsCap(amount, $.maxPayCap);
        if (amount == 0) revert ZeroAmount();
        IERC20($.paymentToken).safeTransferFrom(payer, to, amount);
    }

    /// @dev Single split implementation (V2 dedup): pulls `amount` of the payment token from
    ///      `payer`, splits it creator-vs-treasury, credits the creator's cut as withdrawable
    ///      earnings, forwards the protocol cut, emits PaymentProcessed. Splits use actual
    ///      received tokens, so fee-on-transfer tokens revert. Callers must hold nonReentrant
    ///      + whenNotPaused; the MAX_PAY cap is enforced here so every pay lane inherits it.
    function _paySplit(
        address payer,
        uint256 agentTokenId,
        uint256 amount
    ) internal returns (uint256 creatorCut, uint256 protocolCut) {
        PaymentProcessorStorage storage $ = _getStorage();

        IERC20 token = IERC20($.paymentToken);

        address creator = $.axiomNft.creatorOf(agentTokenId);
        if (creator == address(0)) revert AgentCreatorNotRegistered();

        uint256 balanceBefore = token.balanceOf(address(this));
        _payTransferFrom(payer, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - balanceBefore;
        if (received != amount) revert TransferAmountMismatch(amount, received);

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
            token.safeTransfer($.protocolTreasury, protocolCut);
        }

        emit PaymentProcessed(agentTokenId, payer, creator, amount, creatorCut, protocolCut);
    }

    /// @notice Split `amount` between creator (royalty credited to withdrawable balance) and treasury (forwarded immediately); approve first; splits use actual received tokens, so fee-on-transfer tokens revert.
    function payForAgent(
        uint256 agentTokenId,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        _paySplit(msg.sender, agentTokenId, amount);
    }

    /// @dev Operator approves this contract to spend `amount`, then the full amount is forwarded to `provider`.
    function payComputeProvider(
        address provider,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        if (provider == address(0)) revert ZeroAddress();
        _payTransferFrom(msg.sender, provider, amount);
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
        _paySplit(msg.sender, agentTokenId, agentAmount);

        _payTransferFrom(msg.sender, provider, computeAmount);
        emit ComputeProviderPaid(provider, computeAmount);
    }

    /// @notice Creator pulls accumulated earnings in the configured payment token (not native).
    function withdrawAgentEarnings() external nonReentrant {
        PaymentProcessorStorage storage $ = _getStorage();
        uint256 amount = $.agentEarnings[msg.sender];
        if (amount == 0) revert NoEarnings();
        $.agentEarnings[msg.sender] = 0;
        $.totalOutstandingEarnings -= amount;
        emit EarningsWithdrawn(msg.sender, amount);
        IERC20($.paymentToken).safeTransfer(msg.sender, amount);
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
    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}
}
