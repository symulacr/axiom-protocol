// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC721} from "@openzeppelin/contracts/interfaces/IERC721.sol";
import {IERC7857DataVerifier, TransferValidityProof} from "./IERC7857DataVerifier.sol";
import {IERC7857Metadata, IntelligentData} from "./IERC7857Metadata.sol";

/// @title IERC7857
/// @notice Re-implementation of the ERC-7857 standard interface (FINAL, 2025-01-02)
/// @dev Authors: sparkmiw, zenghbo, Wilbert957, michaelomg
/// @dev Source: https://eips.ethereum.org/EIPS/eip-7857
/// @dev This file is re-implemented from the canonical EIP and the 0G Labs reference
///      (https://github.com/0gfoundation/0g-agent-nft). It is NOT copied from the
///      reference's IERC7857.sol (which is GPL-3.0). Re-implementation is licensed MIT.
interface IERC7857 is IERC721, IERC7857Metadata {
    /// @notice Thrown when the assistant address is invalid (e.g. zero address)
    /// @param _assistant The invalid assistant address
    error ERC7857InvalidAssistant(address _assistant);
    error ERC7857EmptyProof();
    error ERC7857ProofCountMismatch();
    error ERC7857DataHashMismatch();
    error ERC7857AccessAssistantMismatch();
    error ERC7857WantedReceiverMismatch();
    error ERC7857TargetPubkeyMismatch();

    event PublishedSealedKey(address indexed to, uint256 indexed tokenId, bytes[] sealedKeys);
    event DelegateAccess(address indexed user, address indexed assistant);

    function verifier() external view returns (IERC7857DataVerifier);

    /// @notice Transfer a token with re-encrypted metadata (ERC-7857 transfer)
    /// @param _proofs One TransferValidityProof per IntelligentData entry on the token
    function iTransferFrom(
        address _from,
        address _to,
        uint256 _tokenId,
        TransferValidityProof[] calldata _proofs
    ) external;

    /// @notice Transfer a token with validity proofs (3-arg form per EIP-7857)
    /// @param _proofs Array of transfer validity proofs
    function iTransfer(
        address _to,
        uint256 _tokenId,
        TransferValidityProof[] calldata _proofs
    ) external;

    /// @notice Delegate access-proof signing to an assistant address
    /// @param _assistant Address authorized to sign AccessProofs on behalf of msg.sender
    function delegateAccess(
        address _assistant
    ) external;

    /// @notice assistant for user; address(0) if none
    function getDelegateAccess(
        address _user
    ) external view returns (address);
}
