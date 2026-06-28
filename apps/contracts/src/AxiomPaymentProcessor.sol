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
    event ProtocolTreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event ProtocolFeeBpsUpdated(uint256 oldBps, uint256 newBps);
    event PaymentTokenUpdated(address indexed oldToken, address indexed newToken);

    uint256 public constant BPS_DENOMINATOR = 10_000;

    /// @custom:storage-location erc7201:agent.storage.AxiomPaymentProcessor
    struct PaymentProcessorStorage {
        address protocolTreasury;
        IERC20 paymentToken; // ERC-20 stable (USDC.e / USDG); non-immutable for migration
        uint256 protocolFeeBps; // default protocol cut on every payForAgent
        mapping(uint256 => uint256) agentRoyaltyBps; // optional override per agent
        mapping(uint256 => bool) agentRoyaltyBpsSet; // whether royalty was explicitly set
        mapping(address => uint256) agentEarnings; // creator earnings (pull)
    }

    // keccak256(abi.encode(uint256(keccak256("agent.storage.AxiomPaymentProcessor")) - 1)) & ~bytes32(uint256(0xff))
    // Canonical ERC-7201 formula (OZ v5).
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
        $.protocolFeeBps = protocolFeeBps_;
        $.paymentToken = IERC20(paymentTokenAddr);
    }

    function setProtocolTreasury(
        address newTreasury
    ) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        address old = _getStorage().protocolTreasury;
        _getStorage().protocolTreasury = newTreasury;
        emit ProtocolTreasuryUpdated(old, newTreasury);
    }

    function setProtocolFeeBps(
        uint256 newBps
    ) external onlyOwner {
        if (newBps > BPS_DENOMINATOR) revert InvalidBps();
        uint256 old = _getStorage().protocolFeeBps;
        _getStorage().protocolFeeBps = newBps;
        emit ProtocolFeeBpsUpdated(old, newBps);
    }

    /// @notice Rotate the payment ERC-20 (e.g. migrate from USDC.e to USDG). Only callable by owner.
    /// @dev    The new token must be a real IERC20 implementation. No balance migration: the
    ///         owner is expected to first drain the old token (sweep earnings via a migration
    ///         payout to creators) before calling this. New payments go to the new token.
    function setPaymentToken(
        address newPaymentToken
    ) external onlyOwner {
        if (newPaymentToken == address(0)) revert ZeroAddress();
        IERC20 old = _getStorage().paymentToken;
        _getStorage().paymentToken = IERC20(newPaymentToken);
        emit PaymentTokenUpdated(address(old), newPaymentToken);
    }

    function setRoyaltyBps(
        uint256 agentTokenId,
        uint256 newBps
    ) external onlyAgentCreator(agentTokenId) {
        _setRoyaltyBps(agentTokenId, newBps);
    }

    /// @notice Set royalty override as the NFT owner (bypasses creator check).
    /// @dev    Intended for frontend-directed calls where the NFT owner submits
    ///         the tx directly (e.g. via wagmi). The `onlyAgentCreator` modifier
    ///         fails when the backend deployer wallet is the tx signer, so this
    ///         alternate entry point checks `ownerOf` instead.
    function setRoyaltyBpsPermitted(
        uint256 agentTokenId,
        uint256 newBps
    ) external {
        if (IAxiomAgentNFT(AXIOM_NFT).ownerOf(agentTokenId) != msg.sender) revert NotCreator();
        _setRoyaltyBps(agentTokenId, newBps);
    }

    function _setRoyaltyBps(
        uint256 agentTokenId,
        uint256 newBps
    ) internal {
        if (newBps > BPS_DENOMINATOR) revert InvalidBps();
        PaymentProcessorStorage storage $ = _getStorage();
        $.agentRoyaltyBps[agentTokenId] = newBps;
        $.agentRoyaltyBpsSet[agentTokenId] = true;
        emit RoyaltySet(agentTokenId, newBps);
    }

    function protocolTreasury() external view returns (address) {
        return _getStorage().protocolTreasury;
    }

    function protocolFeeBps() external view returns (uint256) {
        return _getStorage().protocolFeeBps;
    }

    function paymentToken() external view returns (address) {
        return address(_getStorage().paymentToken);
    }

    function royaltyBpsOf(
        uint256 agentTokenId
    ) external view returns (uint256) {
        return _getStorage().agentRoyaltyBps[agentTokenId];
    }

    function royaltyBpsSet(
        uint256 agentTokenId
    ) external view returns (bool) {
        return _getStorage().agentRoyaltyBpsSet[agentTokenId];
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
    ///         CEI ordering: state is updated (creator credited) BEFORE the external token call.
    ///         The external call uses OpenZeppelin SafeERC20, which reverts with a custom error
    ///         on failure. See: https://docs.openzeppelin.com/contracts/5.x/api/token/erc20#SafeERC20
    function payForAgent(
        uint256 agentTokenId,
        uint256 amount
    ) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        PaymentProcessorStorage storage $ = _getStorage();
        IERC20 token = $.paymentToken;

        // Per-agent override, else default protocol fee
        address creator = IAxiomAgentNFT(AXIOM_NFT).creatorOf(agentTokenId);
        if (creator == address(0)) revert AgentCreatorNotRegistered();
        uint256 creatorCut;
        uint256 protocolCut;
        if (!$.agentRoyaltyBpsSet[agentTokenId]) {
            protocolCut = (amount * $.protocolFeeBps) / BPS_DENOMINATOR;
            creatorCut = amount - protocolCut;
        } else {
            creatorCut = (amount * $.agentRoyaltyBps[agentTokenId]) / BPS_DENOMINATOR;
            protocolCut = amount - creatorCut;
        }

        // CEI: state update first (credit creator's withdrawable balance)
        if (creatorCut > 0) {
            $.agentEarnings[creator] += creatorCut;
        }

        // Single transferFrom is cheaper than splitting. SafeERC20 reverts on failure.
        // See: https://docs.openzeppelin.com/contracts/5.x/api/token/erc20#SafeERC20-safeTransferFrom-address-address-uint256-
        token.safeTransferFrom(msg.sender, address(this), amount);

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
        _getStorage().paymentToken.safeTransferFrom(msg.sender, provider, amount);
        emit ComputeProviderPaid(provider, amount);
    }

    /// @notice Creator withdraws accumulated earnings in the configured payment token.
    /// @dev    No native ETH is held or moved by this contract. The payment token is the
    ///         only settlement asset. The creator must have `agentEarnings[msg.sender] > 0`.
    ///         SafeERC20.safeTransfer handles both standard and non-conforming ERC-20 tokens.
    function withdrawAgentEarnings() external nonReentrant {
        PaymentProcessorStorage storage $ = _getStorage();
        uint256 amount = $.agentEarnings[msg.sender];
        if (amount == 0) revert NoEarnings();
        // CEI: zero out the balance BEFORE the external call so a re-entrant callback cannot
        // double-spend the same earnings.
        $.agentEarnings[msg.sender] = 0;
        emit EarningsWithdrawn(msg.sender, amount);
        $.paymentToken.safeTransfer(msg.sender, amount);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
