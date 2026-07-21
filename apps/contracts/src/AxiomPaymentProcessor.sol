// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IAxiomAgentNFT} from "./interfaces/IAxiomAgentNFT.sol";

/// @title AxiomPaymentProcessor
/// @notice Routes payments to agent creators, compute providers, and the protocol treasury.
/// @dev Pay-for-agent pulls a configurable ERC-20 stable (USDC.e / USDG) from the payer and
///      credits the creator's withdrawable balance. The creator pulls funds via
///      `withdrawAgentEarnings()`. Standalone, non-upgradeable.
contract AxiomPaymentProcessor is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error ZeroAmount();
    error NoEarnings();
    error NotCreator();
    error InvalidBps();
    error AgentCreatorNotRegistered();
    error MigrationBlocked();
    error TransferAmountMismatch(uint256 expected, uint256 received);
    error NoPendingProposal();
    error TimelockNotExpired();

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

    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant TREASURY_TIMELOCK_DELAY = 1 days;

    /// @custom:storage-location erc7201:agent.storage.AxiomPaymentProcessor
    struct PaymentProcessorStorage {
        address protocolTreasury;
        address paymentToken;
        uint16 protocolFeeBps;
        address pendingProtocolTreasury;
        uint48 pendingTreasuryEffectiveAt;
        uint256 totalOutstandingEarnings;
        mapping(uint256 => uint256) agentRoyaltyStored; // sentinel: 0 = unset, else bps + 1
        mapping(address => uint256) agentEarnings;
    }

    // ERC-7201 storage location (OZ v5): keccak256(abi.encode(keccak256("agent.storage.AxiomPaymentProcessor") - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant STORAGE_LOCATION = 0xb6e9ac8ab7d5307044651d01576943b58a3563d54e8f2be64d1601b1a6cebc00;

    function _getStorage() private pure returns (PaymentProcessorStorage storage $) {
        assembly {
            $.slot := STORAGE_LOCATION
        }
    }

    IAxiomAgentNFT public immutable AXIOM_NFT;

    modifier onlyAgentCreator(
        uint256 agentTokenId
    ) {
        address creator = IAxiomAgentNFT(AXIOM_NFT).creatorOf(agentTokenId);
        if (creator != msg.sender) revert NotCreator();
        _;
    }

    constructor(
        address nftAddr,
        address paymentTokenAddr,
        address treasuryAddr,
        uint256 protocolFeeBps_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (nftAddr == address(0)) revert ZeroAddress();
        if (paymentTokenAddr == address(0)) revert ZeroAddress();
        if (treasuryAddr == address(0)) revert ZeroAddress();
        if (protocolFeeBps_ > BPS_DENOMINATOR) revert InvalidBps();
        AXIOM_NFT = IAxiomAgentNFT(nftAddr);
        PaymentProcessorStorage storage $ = _getStorage();
        $.protocolTreasury = treasuryAddr;
        $.protocolFeeBps = uint16(protocolFeeBps_);
        $.paymentToken = paymentTokenAddr;
    }

    function proposeProtocolTreasury(
        address newTreasury
    ) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        PaymentProcessorStorage storage $ = _getStorage();
        $.pendingProtocolTreasury = newTreasury;
        uint256 effectiveAt = block.timestamp + TREASURY_TIMELOCK_DELAY;
        require(effectiveAt <= type(uint48).max, "treasury effectiveAt overflows uint48");
        $.pendingTreasuryEffectiveAt = uint48(effectiveAt);
        emit ProtocolTreasuryProposed(newTreasury, effectiveAt);
    }

    function executeProtocolTreasury() external onlyOwner {
        PaymentProcessorStorage storage $ = _getStorage();
        address pending = $.pendingProtocolTreasury;
        if (pending == address(0)) revert NoPendingProposal();
        if (block.timestamp < $.pendingTreasuryEffectiveAt) revert TimelockNotExpired();
        address old = $.protocolTreasury;
        $.protocolTreasury = pending;
        $.pendingProtocolTreasury = address(0);
        $.pendingTreasuryEffectiveAt = 0;
        emit ProtocolTreasuryUpdated(old, pending);
    }

    function cancelProtocolTreasuryProposal() external onlyOwner {
        PaymentProcessorStorage storage $ = _getStorage();
        address pending = $.pendingProtocolTreasury;
        if (pending == address(0)) revert NoPendingProposal();
        $.pendingProtocolTreasury = address(0);
        $.pendingTreasuryEffectiveAt = 0;
        emit ProtocolTreasuryProposalCancelled(pending);
    }

    function setProtocolFeeBps(
        uint256 newBps
    ) external onlyOwner {
        if (newBps > BPS_DENOMINATOR) revert InvalidBps();
        require(newBps <= type(uint16).max, "fee bps overflows uint16");
        PaymentProcessorStorage storage $ = _getStorage();
        uint256 old = $.protocolFeeBps;
        $.protocolFeeBps = uint16(newBps);
        emit ProtocolFeeBpsUpdated(old, newBps);
    }

    /// @notice Rotate the payment ERC-20 (e.g. migrate from USDC.e to USDG). Only callable by owner.
    /// @dev    Blocked while outstanding creator earnings exist or the contract still holds the
    ///         old token. Drain earnings and sweep the old balance before migrating.
    function setPaymentToken(
        address newPaymentToken
    ) external onlyOwner {
        if (newPaymentToken == address(0)) revert ZeroAddress();
        PaymentProcessorStorage storage $ = _getStorage();
        if ($.totalOutstandingEarnings > 0) revert MigrationBlocked();
        address oldToken = $.paymentToken;
        if (IERC20(oldToken).balanceOf(address(this)) > 0) revert MigrationBlocked();
        $.paymentToken = newPaymentToken;
        emit PaymentTokenUpdated(oldToken, newPaymentToken);
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
        if (newBps > BPS_DENOMINATOR) revert InvalidBps();
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
        return _getStorage().pendingProtocolTreasury;
    }

    function pendingTreasuryEffectiveAt() external view returns (uint256) {
        return _getStorage().pendingTreasuryEffectiveAt;
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
        uint256 stored = _getStorage().agentRoyaltyStored[agentTokenId];
        return stored == 0 ? 0 : stored - 1;
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

    /// @notice Pay for an agent's service. Splits `amount` of `paymentToken` to the creator
    ///         (royalty, credited to their withdrawable balance) and to the protocol treasury
    ///         (protocolCut, forwarded immediately to the treasury address).
    /// @dev    The payer must approve this contract for `amount` of `paymentToken` before calling.
    ///         Splits are computed on the actual tokens received (fee-on-transfer tokens revert).
    function payForAgent(
        uint256 agentTokenId,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        PaymentProcessorStorage storage $ = _getStorage();
        IERC20 token = IERC20($.paymentToken);

        address creator = IAxiomAgentNFT(AXIOM_NFT).creatorOf(agentTokenId);
        if (creator == address(0)) revert AgentCreatorNotRegistered();

        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = token.balanceOf(address(this)) - balanceBefore;
        if (received != amount) revert TransferAmountMismatch(amount, received);

        (uint256 royaltyBps, bool royaltyIsSet) = _effectiveRoyaltyBps($, agentTokenId);
        uint256 creatorCut;
        uint256 protocolCut;
        if (!royaltyIsSet) {
            protocolCut = (received * $.protocolFeeBps) / BPS_DENOMINATOR;
            creatorCut = received - protocolCut;
        } else {
            creatorCut = (received * royaltyBps) / BPS_DENOMINATOR;
            protocolCut = received - creatorCut;
            uint256 minProtocolCut = (received * $.protocolFeeBps) / BPS_DENOMINATOR;
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

        emit PaymentProcessed(agentTokenId, msg.sender, creator, amount, creatorCut, protocolCut);
    }

    /// @dev    The protocol operator approves this contract to spend `amount` of `paymentToken`,
    ///         then calls this function. The full `amount` is forwarded to `provider`.
    function payComputeProvider(
        address provider,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        if (provider == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        IERC20(_getStorage().paymentToken).safeTransferFrom(msg.sender, provider, amount);
        emit ComputeProviderPaid(provider, amount);
    }

    /// @notice Creator withdraws accumulated earnings in the configured payment token.
    function withdrawAgentEarnings() external nonReentrant {
        PaymentProcessorStorage storage $ = _getStorage();
        uint256 amount = $.agentEarnings[msg.sender];
        if (amount == 0) revert NoEarnings();
        $.agentEarnings[msg.sender] = 0;
        $.totalOutstandingEarnings -= amount;
        emit EarningsWithdrawn(msg.sender, amount);
        IERC20($.paymentToken).safeTransfer(msg.sender, amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
