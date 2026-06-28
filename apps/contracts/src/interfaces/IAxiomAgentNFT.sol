// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IAxiomAgentNFT
/// @notice Minimal interface for the vault and payment processor to call into AxiomAgentNFT
interface IAxiomAgentNFT {
    function ownerOf(
        uint256 tokenId
    ) external view returns (address);
    function creatorOf(
        uint256 tokenId
    ) external view returns (address);
}
