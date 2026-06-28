// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IERC7857DataVerifier.sol";

/// @title BaseVerifier
/// @notice Abstract base for ERC-7857 verifiers with replay protection + expiry
/// @dev Copied verbatim from https://github.com/0gfoundation/0g-agent-nft (MIT)
abstract contract BaseVerifier is IERC7857DataVerifier {
    error ProofAlreadyUsed(bytes32 proofHash);
    mapping(bytes32 => bool) internal usedProofs;

    mapping(bytes32 => uint256) internal proofTimestamps;

    function _checkAndMarkProof(
        bytes32 proofNonce
    ) internal {
        if (usedProofs[proofNonce]) revert ProofAlreadyUsed(proofNonce);
        usedProofs[proofNonce] = true;
        proofTimestamps[proofNonce] = block.timestamp;
    }

    function _getMaxProofAge() internal view virtual returns (uint256);

    /// @notice Reclaim storage from expired proofs
    function cleanExpiredProofs(
        bytes32[] calldata proofNonces
    ) external {
        uint256 maxAge = _getMaxProofAge();
        for (uint256 i = 0; i < proofNonces.length; i++) {
            bytes32 nonce = proofNonces[i];
            if (usedProofs[nonce] && block.timestamp > proofTimestamps[nonce] + maxAge) {
                delete usedProofs[nonce];
                delete proofTimestamps[nonce];
            }
        }
    }

    uint256[50] private __gap;
}
