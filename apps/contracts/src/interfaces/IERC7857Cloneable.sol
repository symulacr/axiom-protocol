// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {IERC7857} from "./IERC7857.sol";
import {TransferValidityProof} from "./IERC7857DataVerifier.sol";
import {IERC7857DataVerifier} from "./IERC7857DataVerifier.sol";

/// @title IERC7857Cloneable
/// @notice Extension to ERC-7857 that allows cloning a token with the same metadata
interface IERC7857Cloneable is IERC7857 {
    /// @notice Emitted when a token is cloned
    event Cloned(uint256 indexed tokenId, uint256 indexed newTokenId, address from, address to);

    /// @notice Clone a token (create a new token with the same metadata)
    /// @param _from Current owner
    /// @param _to New owner
    /// @param _tokenId Token to clone
    /// @param _proofs One TransferValidityProof per IntelligentData entry
    /// @return newTokenId The new token's ID
    function iCloneFrom(
        address _from,
        address _to,
        uint256 _tokenId,
        TransferValidityProof[] calldata _proofs
    ) external returns (uint256 newTokenId);

    /// @notice Clone a token (3-arg form per EIP-7857)
    /// @param _to The receiver of the cloned token
    /// @param _tokenId The source token to clone from
    /// @param _proofs Array of transfer validity proofs
    /// @return newTokenId The token identifier of the cloned token
    function iClone(address _to, uint256 _tokenId, TransferValidityProof[] calldata _proofs) external returns (uint256 newTokenId);
}
