// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC7857DataVerifier} from "../interfaces/IERC7857DataVerifier.sol";

/// @title BaseVerifier — abstract ERC-7857 verifier base with replay protection + expiry (copied verbatim from 0G reference, MIT)
abstract contract BaseVerifier is IERC7857DataVerifier {
    error ProofAlreadyUsed(bytes32 proofHash);

    struct ProofRecord {
        bool used;
        uint256 timestamp;
    }
    mapping(bytes32 => ProofRecord) internal proofs;

    function _checkAndMarkProof(
        bytes32 proofNonce
    ) internal {
        ProofRecord storage rec = proofs[proofNonce];
        if (rec.used) revert ProofAlreadyUsed(proofNonce);
        rec.used = true;
        rec.timestamp = block.timestamp;
    }

    function _getMaxProofAge() internal view virtual returns (uint256);

    /// @notice Reclaim storage from proofs that have exceeded their max age
    function cleanExpiredProofs(
        bytes32[] calldata proofNonces
    ) external {
        uint256 maxAge = _getMaxProofAge();
        for (uint256 i = 0; i < proofNonces.length; i++) {
            bytes32 nonce = proofNonces[i];
            ProofRecord storage rec = proofs[nonce];
            if (rec.used && block.timestamp > rec.timestamp + maxAge) {
                delete proofs[nonce];
            }
        }
    }

    uint256[50] private __gap;
}
