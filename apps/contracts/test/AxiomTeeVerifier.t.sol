// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AxiomTeeVerifier} from "../src/verifiers/AxiomTeeVerifier.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {
    TransferValidityProof,
    AccessProof,
    OwnershipProof,
    OracleType,
    TransferValidityProofOutput
} from "../src/interfaces/IERC7857DataVerifier.sol";

/// @title AxiomTeeVerifier.t.sol
/// @notice Test suite for F-01 fix: signer rotation must be onlyOwner + timelocked.
/// @dev    These tests cover the ship-blocker CRITICAL finding from docs/security/report-v0.md.
///         Before the fix, signer rotation had no access control, so any external caller could
///         rotate the trusted TEE signer and steal every iNFT on the next transfer. After the
///         fix, the constructor takes the initial owner (OZ OwnableUpgradeable), signer rotation
///         uses `proposeSigner` + `executeSigner` behind `onlyOwner` and `ADMIN_DELAY`, and a
///         separate `initialize` is available for proxied deployments. References:
///           - https://docs.openzeppelin.com/contracts/5.x/access-control
///           - https://docs.openzeppelin.com/contracts/5.x/api/access#OwnableUpgradeable
///           - https://docs.openzeppelin.com/contracts/5.x/api/access#Ownable-_transferOwnership-address-
contract AxiomTeeVerifierTest is Test {
    AxiomTeeVerifier internal verifier;

    // Deterministic test keys (mirroring the pattern in AxiomAgentNFT.t.sol).
    uint256 internal constant OWNER_KEY = 0x0FF1000000000000000000000000000000000000000000000000000000000FF1;
    uint256 internal constant STRANGER_KEY = 0x57E40000000000000000000000000000000000000000000000000000000057E4;
    uint256 internal constant TEE_KEY = 0x7E000000000000000000000000000000000000000000000000000000000E007;
    uint256 internal constant NEW_TEE_KEY = 0x7E110000000000000000000000000000000000000000000000000000000E011;
    uint256 internal constant RECEIVER_KEY = 0x10C011C011C011C011C011C011C011C011C011C011C011C011C011C011C011CE;

    bytes32 internal constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 internal constant OWNERSHIP_PROOF_TYPEHASH = keccak256(
        "OwnershipProof(bytes32 dataHash,bytes sealedKey,bytes targetPubkey,address to,address nft,uint256 nonce,uint256 validUntil)"
    );
    bytes32 internal constant ACCESS_PROOF_TYPEHASH = keccak256(
        "AccessProof(bytes32 dataHash,bytes targetPubkey,address to,address nft,uint256 nonce,uint256 validUntil)"
    );

    address internal owner;
    address internal stranger;
    address internal teeSigner;
    address internal newTeeSigner;

    uint256 internal constant MAX_PROOF_AGE = 7 days;

    function setUp() public {
        owner = vm.addr(OWNER_KEY);
        stranger = vm.addr(STRANGER_KEY);
        teeSigner = vm.addr(TEE_KEY);
        newTeeSigner = vm.addr(NEW_TEE_KEY);

        // Deploy verifier with owner as the explicit initial owner. This is the path the
        // production scripts (Deploy.s.sol, DeployAristotle.s.sol) follow.
        verifier = new AxiomTeeVerifier(owner, teeSigner, MAX_PROOF_AGE);
    }

    // ─── F-01 negative case ────────────────────────────────────────────────────

    /// @notice F-01: a non-owner calling proposeSigner MUST revert with OwnableUnauthorizedAccount.
    function test_proposeSigner_onlyOwner_reverts() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        verifier.proposeSigner(newTeeSigner);
    }

    /// @notice F-01: the owner CAN rotate the signer via proposeSigner + executeSigner after ADMIN_DELAY.
    function test_proposeSigner_owner_succeeds() public {
        assertEq(verifier.registeredSigner(), teeSigner, "precondition: initial signer");

        vm.prank(owner);
        verifier.proposeSigner(newTeeSigner);
        assertEq(verifier.pendingSigner(), newTeeSigner, "pending signer recorded");

        vm.prank(owner);
        vm.expectRevert(
            abi.encodeWithSelector(
                AxiomTeeVerifier.SignerDelayNotElapsed.selector, block.timestamp + 1 days, block.timestamp
            )
        );
        verifier.executeSigner();

        vm.warp(block.timestamp + 1 days);

        vm.prank(owner);
        verifier.executeSigner();

        assertEq(verifier.registeredSigner(), newTeeSigner, "signer should rotate to newTeeSigner");
        assertEq(verifier.pendingSigner(), address(0), "pending signer cleared");

        vm.prank(owner);
        vm.expectRevert(bytes("Zero address"));
        verifier.proposeSigner(address(0));
    }

    /// @notice Owner can cancel a pending signer rotation before execution.
    function test_cancelSignerProposal_owner_succeeds() public {
        vm.prank(owner);
        verifier.proposeSigner(newTeeSigner);
        assertEq(verifier.pendingSigner(), newTeeSigner, "pending signer recorded");

        vm.prank(owner);
        verifier.cancelSignerProposal();

        assertEq(verifier.pendingSigner(), address(0), "pending signer cleared");
        assertEq(verifier.registeredSigner(), teeSigner, "active signer unchanged");
    }

    /// @notice executeSigner without a pending proposal reverts.
    function test_executeSigner_noPending_reverts() public {
        vm.prank(owner);
        vm.expectRevert(AxiomTeeVerifier.NoPendingSignerProposal.selector);
        verifier.executeSigner();
    }

    /// @notice Constructor must seed both the signer and the owner. Owner must be queryable
    ///         via OZ's `owner()` so external monitors (e.g. an off-chain watcher) can verify
    ///         deployment configuration.
    function test_constructor_setsSigner() public view {
        assertEq(verifier.registeredSigner(), teeSigner, "constructor: signer");
        assertEq(verifier.owner(), owner, "constructor: owner");
        assertEq(verifier.maxProofAgeSeconds(), MAX_PROOF_AGE, "constructor: maxProofAge");
    }

    // ─── M-C1 / P0-6: accessSigner must equal `to` ───────────────────────────

    /// @notice Valid proofs where accessSigner == to still pass.
    function test_verifyTransferValidity_accessSignerEqualsTo_succeeds() public {
        address receiver = vm.addr(RECEIVER_KEY);
        TransferValidityProof[] memory proofs = _signProof(receiver, receiver);

        TransferValidityProofOutput[] memory outs = verifier.verifyTransferValidity(proofs, receiver, address(0xBEEF));

        assertEq(outs.length, 1, "proof accepted");
        assertEq(outs[0].accessAssistant, receiver, "access signer is recipient");
    }

    /// @notice Access signer must equal `to` even when ownership verification passes.
    function test_verifyTransferValidity_accessSignerNotTo_reverts() public {
        address receiver = vm.addr(RECEIVER_KEY);
        address wrongTo = vm.addr(STRANGER_KEY);
        // Both digests bind `wrongTo`, but the access leg is signed by `receiver`.
        TransferValidityProof[] memory proofs = _signProof(wrongTo, receiver);

        vm.expectRevert(AxiomTeeVerifier.AxiomInvalidAccessProof.selector);
        verifier.verifyTransferValidity(proofs, wrongTo, address(0xBEEF));
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH, keccak256("AxiomTeeVerifier"), keccak256("1"), block.chainid, address(verifier)
            )
        );
    }

    function _signProof(
        address to,
        address receiver
    ) internal view returns (TransferValidityProof[] memory proofs) {
        uint256 validUntil = block.timestamp + 1 days;
        uint256 nonce = 42;
        bytes32 dataHash = keccak256("M-C1-dataHash");
        bytes memory pub = _addressToPubKey(receiver);
        bytes memory sealedKey = hex"01";

        bytes32 ownershipMsg = keccak256(
            abi.encodePacked(
                "\x19\x01",
                _domainSeparator(),
                keccak256(
                    abi.encode(
                        OWNERSHIP_PROOF_TYPEHASH,
                        dataHash,
                        keccak256(sealedKey),
                        keccak256(pub),
                        to,
                        address(0xBEEF),
                        nonce,
                        validUntil
                    )
                )
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(TEE_KEY, ownershipMsg);
        bytes memory ownershipSig = abi.encodePacked(r, s, v);

        bytes32 accessMsg = keccak256(
            abi.encodePacked(
                "\x19\x01",
                _domainSeparator(),
                keccak256(
                    abi.encode(
                        ACCESS_PROOF_TYPEHASH, dataHash, keccak256(pub), to, address(0xBEEF), nonce, validUntil
                    )
                )
            )
        );
        (v, r, s) = vm.sign(RECEIVER_KEY, accessMsg);
        bytes memory accessSig = abi.encodePacked(r, s, v);

        proofs = new TransferValidityProof[](1);
        proofs[0] = TransferValidityProof({
            accessProof: AccessProof({
                dataHash: dataHash, targetPubkey: pub, nonce: nonce, proof: accessSig, validUntil: validUntil
            }),
            ownershipProof: OwnershipProof({
                oracleType: OracleType.TEE,
                dataHash: dataHash,
                sealedKey: sealedKey,
                targetPubkey: pub,
                nonce: nonce,
                proof: ownershipSig,
                validUntil: validUntil
            })
        });
    }

    function _addressToPubKey(
        address a
    ) internal pure returns (bytes memory) {
        bytes memory pub = new bytes(64);
        bytes20 addrBytes = bytes20(a);
        for (uint256 i = 0; i < 20; i++) {
            pub[i] = addrBytes[i];
        }
        for (uint256 i = 20; i < 64; i++) {
            pub[i] = 0x01;
        }
        return pub;
    }
}
