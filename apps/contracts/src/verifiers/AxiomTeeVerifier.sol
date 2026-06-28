// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./BaseVerifier.sol";

/// @title AxiomTeeVerifier
/// @notice TEE-based verifier for ERC-7857 transfer validity proofs
/// @dev Adapted from https://github.com/0gfoundation/0g-agent-nft (MIT) BaseVerifier pattern
/// @dev In production, the registered signer is the public key of an Intel TDX/AMD SEV TEE.
///      For the buildathon/devnet, it's a TypeScript TEE signer service (apps/oracle) holding
///      a secp256k1 keypair whose public key is registered via registerSigner().
/// @dev Access control on `registerSigner` is provided by OpenZeppelin's upgradeable Ownable.
///      The contract is currently deployed non-upgradeable (no proxy), but the upgrade-safe
///      variant is used so the same bytecode can be moved behind a proxy later without
///      rewriting the auth surface. References:
///        - https://docs.openzeppelin.com/contracts/5.x/access-control (Ownable)
///        - https://docs.openzeppelin.com/contracts/5.x/api/access#Ownable-_transferOwnership-address-
///        - https://docs.openzeppelin.com/contracts/5.x/api/access#OwnableUpgradeable
contract AxiomTeeVerifier is BaseVerifier, OwnableUpgradeable {
    error AxiomInvalidSigner();
    error AxiomInvalidOwnershipProof();
    error AxiomInvalidAccessProof();
    /// @dev Thrown when the accessProof and ownershipProof fields that must
    ///      be identical (dataHash, targetPubkey, nonce, validUntil) do not match.
    error ProofFieldMismatch();
    /// @dev Thrown when a proof's `validUntil` deadline is in the past
    ///      (i.e. `block.timestamp > validUntil`). The proof is expired
    ///      and can no longer be used.
    error AxiomProofExpired(uint256 validUntil, uint256 blockTimestamp);
    /// @dev Thrown when a proof's `validUntil` is too far in the future
    ///      (i.e. `validUntil - block.timestamp > maxProofAgeSeconds`).
    ///      This guards against a TEE signer minting arbitrarily long-lived
    ///      proofs and against overflow attacks where `validUntil` is
    ///      `type(uint256).max`.
    error AxiomValidUntilTooFar(uint256 validUntil, uint256 blockTimestamp, uint256 maxProofAgeSeconds);

    event SignerRegistered(address indexed oldSigner, address indexed newSigner);

    /// @dev Set once at deployment; immutable so the value is baked into the deployed bytecode
    ///      and is part of the contract's ABI as a queryable getter (auto-generated `maxProofAgeSeconds()`).
    ///      Reference: Solidity 0.8.20 — Immutable variables
    ///      https://docs.soliditylang.org/en/v0.8.20/contracts.html#immutable
    uint256 public immutable maxProofAgeSeconds;

    /// @custom:storage-location erc7201:agent.storage.AxiomTeeVerifier
    struct AxiomTeeVerifierStorage {
        address registeredSigner;
    }

    // keccak256(abi.encode(uint256(keccak256("agent.storage.AxiomTeeVerifier")) - 1)) & ~bytes32(uint256(0xff))
    // Canonical ERC-7201 formula (OZ v5).
    bytes32 private constant STORAGE_LOCATION = 0xcdd50b252b44b49759effa27dcfb9f7db71e867632e96be05c00db87cfc30900;

    function _getAxiomTeeVerifierStorage() private pure returns (AxiomTeeVerifierStorage storage $) {
        assembly {
            $.slot := STORAGE_LOCATION
        }
    }

    /// @dev Domain separator binds signatures to this contract instance and chain,
    ///      preventing cross-contract and cross-chain replay. Browser wallets sign
    ///      via signTypedData_v4, which produces raw ECDSA over the EIP-712 digest.
    ///      Reference: https://eips.ethereum.org/EIPS/eip-712
    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant OWNERSHIP_PROOF_TYPEHASH = keccak256(
        "OwnershipProof(bytes32 dataHash,bytes sealedKey,bytes targetPubkey,address to,address nft,uint256 nonce,uint256 validUntil)"
    );
    bytes32 private constant ACCESS_PROOF_TYPEHASH = keccak256(
        "AccessProof(bytes32 dataHash,bytes targetPubkey,address to,address nft,uint256 nonce,uint256 validUntil)"
    );

    /// @notice Deploy the verifier directly (non-proxied). The initial owner is wired into
    ///         OZ Ownable's ERC-7201 storage via the canonical `_transferOwnership` helper.
    /// @dev Use the constructor when the contract is deployed as a standalone (no proxy). The
    ///      signer is registered at construction so the first block of proofs can already be
    ///      verified. For the upgradeable path (proxy deployment), call `initialize(initialOwner)`
    ///      via the proxy's initializer; `__Ownable_init` rejects zero owners and `_transferOwnership`
    ///      emits `OwnershipTransferred(address(0), initialOwner)`. Refs:
    ///        - https://docs.openzeppelin.com/contracts/5.x/api/access#Ownable-_transferOwnership-address-
    ///        - https://docs.openzeppelin.com/contracts/5.x/api/access#Ownable__Ownable_init_address-
    constructor(
        address initialOwner,
        address signer_,
        uint256 maxProofAgeSeconds_
    ) {
        require(signer_ != address(0), "Zero signer address");
        require(initialOwner != address(0), "Zero initial owner");
        _getAxiomTeeVerifierStorage().registeredSigner = signer_;
        maxProofAgeSeconds = maxProofAgeSeconds_;
        // _transferOwnership is `internal virtual` (no onlyInitializing), so it is safe to call
        // from the constructor of a non-proxied contract. OZ OwnableUpgradeable storage lives
        // at its own ERC-7201 slot, so there is no overlap with the verifier's struct storage.
        _transferOwnership(initialOwner);
    }

    /// @notice Initializer for upgradeable (proxy) deployments. Sets the initial owner using
    ///         OZ's canonical `__Ownable_init`, which validates `initialOwner != address(0)`
    ///         (revert `OwnableInvalidOwner`) and forwards to `_transferOwnership`.
    /// @dev Use EITHER the constructor (for direct deploys) OR this initializer (for proxy
    ///      deploys via `ERC1967Proxy`). Calling both on the same contract will revert the
    ///      initializer (its `initializer` modifier can only run once).
    ///      Reference: https://docs.openzeppelin.com/contracts/5.x/api/access#Ownable__Ownable_init_address-
    function initialize(
        address initialOwner
    ) external initializer {
        __Ownable_init(initialOwner);
    }

    function registeredSigner() public view returns (address) {
        return _getAxiomTeeVerifierStorage().registeredSigner;
    }

    /// @dev Restricted to the contract owner via OZ `onlyOwner` (OwnableUpgradeable).
    ///      Without this guard, any external caller could rotate the trusted TEE signer
    ///      and steal every iNFT on the next transfer. Owner of the verifier is the
    ///      `AXIOM_DEPLOYER_ADDRESS` set at deploy time. Refs:
    ///        - https://docs.openzeppelin.com/contracts/5.x/access-control
    ///        - https://docs.openzeppelin.com/contracts/5.x/api/access#Ownable-onlyOwner--
    function registerSigner(
        address newSigner
    ) external onlyOwner {
        require(newSigner != address(0), "Zero address");
        AxiomTeeVerifierStorage storage $ = _getAxiomTeeVerifierStorage();
        address old = $.registeredSigner;
        $.registeredSigner = newSigner;
        emit SignerRegistered(old, newSigner);
    }

    /// @dev ERC-7857 leaves the exact freshness window to the implementation; the canonical
    ///      0G reference uses a 7-day expiry (replay protection is enforced via
    ///      `usedProofs` regardless). Override the value per deployment to tighten or relax.
    ///      Reference: EIP-7857 (FINAL) — `verifyTransferValidity` and Security Considerations
    ///      https://eips.ethereum.org/EIPS/eip-7857
    function _getMaxProofAge() internal view override returns (uint256) {
        return maxProofAgeSeconds;
    }

    /// @dev Both proof legs are now EIP-712 typed-data digests (see _domainSeparator).
    ///      Browser wallets produce raw ECDSA over the EIP-712 digest via
    ///      signTypedData_v4, so no EIP-191 prefix is applied off-chain.
    function _recoverSigner(
        bytes32 messageHash,
        bytes memory signature
    ) internal pure returns (address) {
        if (signature.length != 65) revert AxiomInvalidSigner();
        address recovered = ECDSA.recover(messageHash, signature);
        if (recovered == address(0)) revert AxiomInvalidSigner();
        return recovered;
    }

    /// @dev Off-chain signers (backend, oracle, browser wallet via signTypedData_v4)
    ///      MUST compute the same digest:
    ///        keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash))
    ///      Reference: https://eips.ethereum.org/EIPS/eip-712#definition-of-domainseparator
    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH, keccak256("AxiomTeeVerifier"), keccak256("1"), block.chainid, address(this)
            )
        );
    }

    function domainSeparator() public view returns (bytes32) {
        return _domainSeparator();
    }

    /// @inheritdoc IERC7857DataVerifier
    /// @dev Verifies a batch of AccessProof + OwnershipProof pairs against the registered TEE signer.
    ///      For each proof:
    ///        1. Check that the OwnershipProof's `validUntil` is `>= block.timestamp`
    ///           (i.e. the proof has not expired) and `validUntil - block.timestamp
    ///           <= maxProofAgeSeconds` (i.e. the TEE is not allowed to set arbitrarily
    ///           long-lived deadlines).
    ///        2. Check the same for the AccessProof's `validUntil`.
    ///        3. Verify the OwnershipProof EIP-712 digest (OWNERSHIP_PROOF_TYPEHASH struct hash
    ///           wrapped with the domain separator — see https://eips.ethereum.org/EIPS/eip-712).
    ///        4. Verify the AccessProof EIP-712 digest (ACCESS_PROOF_TYPEHASH struct hash
    ///           wrapped with the domain separator).
    ///        5. Mark the proof nonce as used (replay protection).
    ///        6. Populate the output struct.
    function verifyTransferValidity(
        TransferValidityProof[] calldata proofs,
        address to,
        address nft
    ) external override returns (TransferValidityProofOutput[] memory outputs) {
        address expectedSigner = registeredSigner();
        uint256 maxAge = maxProofAgeSeconds;
        uint256 nowTs = block.timestamp;
        outputs = new TransferValidityProofOutput[](proofs.length);

        for (uint256 i = 0; i < proofs.length; i++) {
            TransferValidityProof calldata p = proofs[i];

            // 0. Timestamp gate (EIP-712 deadline). The TEE / receiver signer chose
            //    `validUntil` at signing time; it must be in the future and within
            //    `maxAge` of `now`. Overflow-safe: `validUntil >= now` guarantees the
            //    subtraction is safe; `validUntil < now` is the expired branch.
            _checkValidUntil(p.ownershipProof.validUntil, nowTs, maxAge);
            _checkValidUntil(p.accessProof.validUntil, nowTs, maxAge);

            // 0.5 Cross-proof consistency: the two proofs must describe the same
            //     transfer. If the TEE-signed ownership leg and the receiver-signed
            //     access leg disagree on any shared field, the proof is invalid.
            if (
                p.accessProof.dataHash != p.ownershipProof.dataHash
                    || keccak256(p.accessProof.targetPubkey) != keccak256(p.ownershipProof.targetPubkey)
                    || p.accessProof.nonce != p.ownershipProof.nonce
                    || p.accessProof.validUntil != p.ownershipProof.validUntil
            ) {
                revert ProofFieldMismatch();
            }

            // 1. Verify OwnershipProof — signed by the TEE oracle via EIP-712.
            //    Digest: keccak256("\x19\x01" || domainSeparator || structHash)
            //    structHash = keccak256(abi.encode(TYPEHASH, dataHash,
            //      keccak256(sealedKey), keccak256(targetPubkey), nonce, validUntil)).
            //    Per EIP-712, `bytes`/`string` fields are pre-hashed to bytes32
            //    (https://eips.ethereum.org/EIPS/eip-712#definition-of-hashstruct)
            //    so browser wallets' signTypedData_v4 produces a matching digest.
            bytes32 ownershipMessage = keccak256(
                abi.encodePacked(
                    "\x19\x01",
                    _domainSeparator(),
                    keccak256(
                        abi.encode(
                            OWNERSHIP_PROOF_TYPEHASH,
                            p.ownershipProof.dataHash,
                            keccak256(p.ownershipProof.sealedKey),
                            keccak256(p.ownershipProof.targetPubkey),
                            to,
                            nft,
                            p.ownershipProof.nonce,
                            p.ownershipProof.validUntil
                        )
                    )
                )
            );
            address recovered = _recoverSigner(ownershipMessage, p.ownershipProof.proof);
            if (recovered != expectedSigner) revert AxiomInvalidOwnershipProof();

            // 2. Verify AccessProof — signed by the receiver via EIP-712.
            //    Browser wallets use signTypedData_v4, producing raw ECDSA over
            //    this digest (targetPubkey is pre-hashed per EIP-712 hashstruct).
            bytes32 accessMessage = keccak256(
                abi.encodePacked(
                    "\x19\x01",
                    _domainSeparator(),
                    keccak256(
                        abi.encode(
                            ACCESS_PROOF_TYPEHASH,
                            p.accessProof.dataHash,
                            keccak256(p.accessProof.targetPubkey),
                            to,
                            nft,
                            p.accessProof.nonce,
                            p.accessProof.validUntil
                        )
                    )
                )
            );
            address accessSigner = _recoverSigner(accessMessage, p.accessProof.proof);
            if (accessSigner == address(0)) revert AxiomInvalidAccessProof();

            // 3. Mark proof nonces as used (replay protection). The nonce is a
            //     canonical digest of the verified proof fields; because the
            //     consistency check above guarantees the access/ownership legs
            //     agree on the shared fields, we use the accessProof side.
            bytes32 proofNonce = keccak256(
                abi.encode(
                    p.accessProof.dataHash,
                    p.accessProof.targetPubkey,
                    p.ownershipProof.sealedKey,
                    p.accessProof.nonce,
                    p.accessProof.validUntil
                )
            );
            _checkAndMarkProof(proofNonce);

            // 4. Populate the output struct
            outputs[i] = TransferValidityProofOutput({
                dataHash: p.ownershipProof.dataHash,
                sealedKey: p.ownershipProof.sealedKey,
                targetPubkey: p.ownershipProof.targetPubkey,
                wantedKey: "", // no wanted-key in the canonical flow
                accessAssistant: accessSigner,
                accessProofNonce: p.accessProof.nonce,
                ownershipProofNonce: p.ownershipProof.nonce
            });
        }
    }

    /// @dev Enforce the EIP-712 `validUntil` deadline. Overflow-safe.
    ///      - If `validUntil < now`            => revert `AxiomProofExpired`.
    ///      - If `validUntil - now > maxAge`   => revert `AxiomValidUntilTooFar`
    ///        (also covers `validUntil = type(uint256).max` since the subtraction
    ///        is huge and definitely exceeds `maxAge`).
    ///      - Otherwise, the proof is valid for the current block.
    function _checkValidUntil(
        uint256 validUntil,
        uint256 nowTs,
        uint256 maxAge
    ) private pure {
        if (validUntil < nowTs) {
            revert AxiomProofExpired(validUntil, nowTs);
        }
        // validUntil >= nowTs, so subtraction is safe (no underflow).
        if (validUntil - nowTs > maxAge) {
            revert AxiomValidUntilTooFar(validUntil, nowTs, maxAge);
        }
    }
}
