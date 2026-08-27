// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {IERC7857} from "./IERC7857.sol";
import {TransferValidityProof} from "./IERC7857DataVerifier.sol";

/// @title IERC7857Cloneable — extension to clone a token with the same metadata
/// @dev No production producer of iClone/iCloneFrom calldata; roadmap decision pending (ledger M11).
interface IERC7857Cloneable is IERC7857 {
    event Cloned(uint256 indexed tokenId, uint256 indexed newTokenId, address from, address to);

    /// @notice Clone a token into a new id with the same metadata; one TransferValidityProof per data entry
    function iCloneFrom(
        address _from,
        address _to,
        uint256 _tokenId,
        TransferValidityProof[] calldata _proofs
    ) external returns (uint256 newTokenId);

    /// @notice Clone a token (3-arg form per EIP-7857); one TransferValidityProof per data entry
    function iClone(
        address _to,
        uint256 _tokenId,
        TransferValidityProof[] calldata _proofs
    ) external returns (uint256 newTokenId);
}
