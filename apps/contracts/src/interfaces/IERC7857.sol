// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC721} from "@openzeppelin/contracts/interfaces/IERC721.sol";
import {IERC7857DataVerifier, TransferValidityProof} from "./IERC7857DataVerifier.sol";
import {IERC7857Metadata} from "./IERC7857Metadata.sol";

/// @title IERC7857 — re-implementation of the ERC-7857 standard interface (EIP created 2025-01-02; status Final)
/// @dev Re-implemented (not copied) from the GPL-3.0 reference IERC7857.sol so this stays MIT-licensed.
interface IERC7857 is IERC721, IERC7857Metadata {
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

    /// @notice Transfer with re-encrypted metadata (ERC-7857); one TransferValidityProof per IntelligentData entry
    function iTransferFrom(
        address _from,
        address _to,
        uint256 _tokenId,
        TransferValidityProof[] calldata _proofs
    ) external;

    /// @notice Transfer a token with validity proofs (3-arg form per EIP-7857)
    function iTransfer(
        address _to,
        uint256 _tokenId,
        TransferValidityProof[] calldata _proofs
    ) external;

    /// @notice Delegate access-proof signing to an assistant authorized to sign AccessProofs for msg.sender
    function delegateAccess(
        address _assistant
    ) external;

    /// @notice Returns the user's access assistant; address(0) if none is set
    function getDelegateAccess(
        address _user
    ) external view returns (address);
}
