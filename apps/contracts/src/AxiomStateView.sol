// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAxiomAgentNFT} from "./interfaces/IAxiomAgentNFT.sol";
import {IERC7857Metadata, IntelligentData} from "@0g-agent-nft/interfaces/IERC7857Metadata.sol";
import {AxiomPaymentProcessor} from "./AxiomPaymentProcessor.sol";
import {AxiomStrategyVault} from "./AxiomStrategyVault.sol";

/// @title AxiomStateView — non-upgradeable read facade over the deployed Axiom suite (docs/v3-proposals/03 §1b).
/// @dev Stateless: every address is immutable, set once in the constructor. No storage, no upgrade
///      key, no funds ever held (reverts on native transfers) and nothing to approve. If any
///      underlying contract is re-pointed (V3 redeploy), this facade is replaced, not upgraded —
///      consumers must resolve its address per chain via `packages/config/src/multicall3.ts`-style
///      evidence, never hardcode it.
/// @notice Return conventions (documented, mirrored off-chain by packages/config):
///         - `royaltyRecipientOf`: `nft.creatorOf` is mint-frozen (never updated on iTransfer),
///           and returns address(0) for nonexistent/unregistered tokens — callers MUST treat zero
///           as "no royalty recipient" (Processor reverts AgentCreatorNotRegistered on the write
///           path; this view surfaces the same fact as zero instead of reverting).
///         - `effectiveRoyaltyBpsOf`/`vaultHealthOf`/`paymentSnapshot` mirror the write-path
///           logic of Processor/Vault 1:1 (see per-function notes); drift is a bug, keep in sync.
contract AxiomStateView {
    error ZeroAddress();
    error NoValue();

    uint256 public constant BPS_DENOMINATOR = 10_000;

    IAxiomAgentNFT public immutable nft;
    AxiomPaymentProcessor public immutable processor;
    AxiomStrategyVault public immutable vault;

    constructor(
        address nftAddr,
        address processorAddr,
        address vaultAddr
    ) {
        if (nftAddr == address(0) || processorAddr == address(0) || vaultAddr == address(0)) {
            revert ZeroAddress();
        }
        nft = IAxiomAgentNFT(nftAddr);
        processor = AxiomPaymentProcessor(processorAddr);
        vault = AxiomStrategyVault(payable(vaultAddr));
    }

    /// Reject native transfers — pure read facade, must never hold funds.
    receive() external payable {
        revert NoValue();
    }

    /// @notice Royalty recipient for `tokenId` = the NFT's mint-frozen creator.
    /// @return recipient creator address, or address(0) when the token has no registered creator
    ///         (nonexistent token / role-minted without creator). Zero is a VALID outcome here —
    ///         callers treat it as "no royalty recipient"; see contract natspec.
    function royaltyRecipientOf(
        uint256 tokenId
    ) external view returns (address recipient) {
        return nft.creatorOf(tokenId);
    }

    /// @notice View mirror of Processor's `_effectiveRoyaltyBps` + `royaltyBpsOf` clamp.
    /// @dev Replicates `stored == 0 → (0,false)`, `royaltyBps = stored - 1`,
    ///      `min(royaltyBps, BPS_DENOMINATOR - protocolFeeBps)`. Keep in sync with
    ///      AxiomPaymentProcessor._effectiveRoyaltyBps — drift is a bug.
    function effectiveRoyaltyBpsOf(
        uint256 tokenId
    ) external view returns (uint256 royaltyBps, bool isSet, uint256 protocolFeeBps) {
        uint256 stored = processor.royaltyBpsOf(tokenId);
        bool set = processor.royaltyBpsSet(tokenId);
        // Processor's stored == 0 sentinel maps to royaltyBpsOf() → 0 / royaltyBpsSet → false.
        // The maxRoyalty clamp is already applied inside royaltyBpsOf (same expression:
        // min(stored - 1, BPS_DENOMINATOR - protocolFeeBps)), so the returned bps is the
        // effective one; re-clamping here is a no-op kept for documentation.
        uint256 maxRoyalty = BPS_DENOMINATOR - processor.protocolFeeBps();
        if (stored > maxRoyalty) {
            stored = maxRoyalty;
        }
        return (stored, set, processor.protocolFeeBps());
    }

    // ─── Processor passthroughs (single-call surface for backend/FE/indexer) ───

    function agentEarningsOf(
        address creator
    ) external view returns (uint256) {
        return processor.agentEarningsOf(creator);
    }

    function pendingPayCap() external view returns (uint256) {
        return processor.maxPayCap();
    }

    function computeRatioMax() external view returns (uint256) {
        return processor.computeRatioMax();
    }

    /// @notice Vault health for `tokenId`, mirroring `AxiomStrategyVault.execute`'s view of state.
    /// @return balance tracked native balance (vault.balanceOf)
    /// @return strategyRoot current Merkle root (bytes32(0) = no strategy set)
    /// @return dailyLimit per-UTC-day spend cap
    /// @return dailySpent spend attributed to `resetDay`
    /// @return resetDay UTC day the spend counter is valid for
    /// @return validUntilDay last valid UTC day inclusive (0 sentinel = no expiry)
    /// @return expired true when the strategy is past its window — same predicate as
    ///         execute()'s `validUntilDay != 0 && today > validUntilDay` (StrategyExpired).
    ///         NOTE (Vault residual 1): strategyRoot/dailyLimit survive iTransfer — the buyer
    ///         inherits the seller's strategy; consumers should prompt setStrategy post-purchase.
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
        // strategyOf returns (root, uint256 dailyLimit, uint256 dailySpent, resetDay, validUntilDay)
        // — narrower/narrower widening is implicit per-element, balance is fetched via balanceOf.
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

    /// @notice Payload attestation: `keccak256(payload)` equals the on-chain commitment.
    /// @dev Reads `nft.intelligentDatasOf(tokenId)` (ERC-7857 iDatas; each IntelligentData is
    ///      {string dataDescription, bytes32 dataHash}) and compares against
    ///      `datas[dataIndex].dataHash`. dataIndex bounds: the NFT getter reverts on a
    ///      nonexistent token (ERC721NonexistentToken); an out-of-range dataIndex reverts here.
    ///      An empty payload hash only matches an agent whose dataHash was stored as
    ///      bytes32(0) — a stored zero hash can never verify any payload (keccak256 ≠ 0); never
    ///      read a zero dataHash as "verified".
    function verifyPayloadOf(
        uint256 tokenId,
        uint256 dataIndex,
        bytes calldata payload
    ) external view returns (bool) {
        IntelligentData[] memory datas = IERC7857Metadata(address(nft)).intelligentDatasOf(tokenId);
        return keccak256(payload) == datas[dataIndex].dataHash;
    }

    /// @notice One-call pre-flight for the FE pay flow — every fact `payForAgent` checks.
    /// @return maxPayCap MAX_PAY cap (0 = unlimited)
    /// @return computeRatioMax agentAmount→computeAmount ratio bound (0 = unlimited)
    /// @return agentBalance caller's token balance
    /// @return payerAllowance caller's ERC-20 allowance to the Processor
    /// @return paymentToken ERC-20 settlement token
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
        maxPayCap = processor.maxPayCap();
        computeRatioMax = processor.computeRatioMax();
        paymentToken = processor.paymentToken();
        IERC20 token = IERC20(paymentToken);
        agentBalance = token.balanceOf(payer);
        payerAllowance = token.allowance(payer, address(processor));
    }
}
