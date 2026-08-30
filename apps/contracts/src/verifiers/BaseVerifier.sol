// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC7857DataVerifier} from "../interfaces/IERC7857DataVerifier.sol";

/// @title BaseVerifier — abstract ERC-7857 verifier base with replay protection + expiry (copied verbatim from 0G reference, MIT)
abstract contract BaseVerifier is IERC7857DataVerifier {
    error ProofAlreadyUsed(bytes32 proofHash);

    /// @notice Emitted when a proof nonce is consumed (replay protection write).
    /// @dev The proof-cleanup keeper derives sweep candidates from these logs
    ///      (apps/backend/src/keepers/index.ts) instead of a static env list;
    ///      events cost nothing under the committed-proxy posture (ADR-004 §1.4).
    event ProofUsed(bytes32 indexed nonce, uint256 indexed timestamp);

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
        emit ProofUsed(proofNonce, block.timestamp);
    }

    function _getMaxProofAge() internal view virtual returns (uint256);

    /// @notice Reclaim storage from proofs that have exceeded their max age
    /// @dev No production caller; sole cleaner is the e2e indexer job (apps/backend/e2e/e2e/steps.ts).
    ///      Keeper decision (Chainlink / Gelato / status quo) pending — see docs/adr/003-proof-cleanup-keeper-options.md.
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
