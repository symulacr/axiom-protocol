// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AxiomTeeVerifier} from "../src/verifiers/AxiomTeeVerifier.sol";
import {
    TransferValidityProof,
    AccessProof,
    OwnershipProof,
    OracleType,
    TransferValidityProofOutput
} from "../src/interfaces/IERC7857DataVerifier.sol";

/// @title V12C3ValidUntil.t.sol
/// @notice Wave 5B deterministic regression suite for the EIP-712 `validUntil`
///         timestamp gate on the LIVE AxiomTeeVerifier v2 deployment.
/// @dev    Exercises both branches and boundary cases against the live on-chain
///         verifier at 0x24f725198d64A3b03A8386cD8fa12BD7c591734A (Galileo testnet).
///         Why separate from FuzzAxiomTeeVerifier.t.sol: that file fuzzes locally;
///         this file pins 5 canonical cases against the LIVE verifier.
contract V12C3ValidUntilTest is Test {
    // ─── Live fork (0G Galileo testnet, chainId 16602) ──────────────────
    string internal constant GALILEO_RPC = "https://0g-galileo-testnet.drpc.org";
    uint256 internal constant GALILEO_CHAIN_ID = 16_602;

    // The LIVE v2 AxiomTeeVerifier deployment. Verified 2026-06-16 (Wave E-5).
    address internal constant LIVE_VERIFIER_V2 = 0x24f725198d64A3b03A8386cD8fa12BD7c591734A;

    // The LIVE registered TEE signer — operator wallet from wallets/ADDRESSES.md
    address internal constant LIVE_TEE_SIGNER = 0x437371dB1FBD534Bd01BD3f4E66DfA1675952F91;
    // TEE private key — initialized in setUp() from env var.
    uint256 internal teeSignerKey;

    // The maxProofAgeSeconds immutable on the live v2 verifier. 7 days = 604_800 seconds.
    uint256 internal constant MAX_PROOF_AGE_SECONDS = 7 days;

    // A second private key for the AccessProof leg (signed by the receiver).
    // The key must be inside the secp256k1 group order.
    uint256 internal constant RECEIVER_KEY =
        0x10C011C011C011C011C011C011C011C011C011C011C011C011C011C011C011CE;

    // ─── Fixture ────────────────────────────────────────────────────────
    AxiomTeeVerifier internal verifier;
    address internal receiverAddr;
    bytes  internal receiverPub;
    uint256 internal forkId;

    function setUp() public {
        // 0. Read private key from env var.
        teeSignerKey = vm.envUint("AXIOM_TEE_SIGNER_PK");

        // 1. Select the live Galileo fork. Fork at latest per canonical Foundry practice.
        forkId = vm.createSelectFork(GALILEO_RPC);
        assertEq(block.chainid, GALILEO_CHAIN_ID, "Galileo testnet (chainId 16602)");

        // 2. Load the LIVE v2 verifier bind-by-address (no deploy bytecode).
        verifier = AxiomTeeVerifier(LIVE_VERIFIER_V2);

        // 3. Sanity assertions against the live bytecode / state.
        assertEq(verifier.registeredSigner(), LIVE_TEE_SIGNER, "live registered signer");
        assertEq(verifier.maxProofAgeSeconds(), MAX_PROOF_AGE_SECONDS, "maxProofAgeSeconds == 7d");

        // 4. Derive the receiver fixture.
        receiverAddr = vm.addr(RECEIVER_KEY);
        receiverPub  = _addressToPubKey(receiverAddr);
    }

    // ════════════════════════════════════════════════════════════════════
    //  Test 1: validUntil in the past  →  AxiomProofExpired
    // ════════════════════════════════════════════════════════════════════

    /// @notice validUntil < block.timestamp MUST revert with AxiomProofExpired.
    function test_validUntilPast_reverts() public {
        uint256 validUntil = block.timestamp - 1;
        // Belt-and-suspenders: warp a tick forward so block.timestamp != validUntil.
        vm.warp(block.timestamp + 1);

        TransferValidityProof[] memory proofs = _signProof(validUntil);

        vm.expectRevert(
            abi.encodeWithSelector(
                AxiomTeeVerifier.AxiomProofExpired.selector,
                validUntil,
                block.timestamp
            )
        );
        verifier.verifyTransferValidity(proofs, address(0), address(0));
    }

    // ════════════════════════════════════════════════════════════════════
    //  Test 2: validUntil == block.timestamp  →  success (boundary)
    // ════════════════════════════════════════════════════════════════════

    /// @notice validUntil == block.timestamp MUST pass (boundary case).
    function test_validUntilAtNow_succeeds() public {
        // Pin the timestamp so the test is deterministic across reruns.
        vm.warp(1_700_000_000); // a fixed, easy-to-read anchor
        uint256 validUntil = block.timestamp;

        TransferValidityProof[] memory proofs = _signProof(validUntil);
        TransferValidityProofOutput[] memory outs = verifier.verifyTransferValidity(proofs, address(0), address(0));

        assertEq(outs.length, 1, "exactly-at-boundary: passes");
        assertEq(outs[0].accessAssistant, receiverAddr, "access signer recovered");
    }

    // ════════════════════════════════════════════════════════════════════
    //  Test 3: validUntil in the near future  →  success
    // ════════════════════════════════════════════════════════════════════

    /// @notice validUntil in the near future (within maxProofAgeSeconds) MUST pass.
    function test_validUntilFuture_succeeds() public {
        vm.warp(1_700_000_000);
        uint256 validUntil = block.timestamp + 60;

        TransferValidityProof[] memory proofs = _signProof(validUntil);
        TransferValidityProofOutput[] memory outs = verifier.verifyTransferValidity(proofs, address(0), address(0));

        assertEq(outs.length, 1, "60s in the future: passes");
        assertEq(outs[0].accessAssistant, receiverAddr, "access signer recovered");
    }

    // ════════════════════════════════════════════════════════════════════
    //  Test 4: validUntil = now + 7d + 1s  →  AxiomValidUntilTooFar
    // ════════════════════════════════════════════════════════════════════

    /// @notice validUntil just past maxProofAgeSeconds MUST revert with AxiomValidUntilTooFar.
    function test_validUntilTooFar_reverts() public {
        vm.warp(1_700_000_000);
        uint256 validUntil = block.timestamp + 7 days + 1;

        TransferValidityProof[] memory proofs = _signProof(validUntil);

        vm.expectRevert(
            abi.encodeWithSelector(
                AxiomTeeVerifier.AxiomValidUntilTooFar.selector,
                validUntil,
                block.timestamp,
                MAX_PROOF_AGE_SECONDS
            )
        );
        verifier.verifyTransferValidity(proofs, address(0), address(0));
    }

    // ════════════════════════════════════════════════════════════════════
    //  Test 5: validUntil = type(uint256).max  →  AxiomValidUntilTooFar (NOT Panic)
    // ════════════════════════════════════════════════════════════════════

    /// @notice validUntil = type(uint256).max MUST revert with AxiomValidUntilTooFar (NOT Panic(0x11)).
    function test_validUntilOverflow_reverts() public {
        vm.warp(1_700_000_000);
        uint256 validUntil = type(uint256).max;

        TransferValidityProof[] memory proofs = _signProof(validUntil);

        vm.expectRevert(
            abi.encodeWithSelector(
                AxiomTeeVerifier.AxiomValidUntilTooFar.selector,
                type(uint256).max,
                block.timestamp,
                MAX_PROOF_AGE_SECONDS
            )
        );
        verifier.verifyTransferValidity(proofs, address(0), address(0));
    }

    // ════════════════════════════════════════════════════════════════════
    //  Helpers
    // ════════════════════════════════════════════════════════════════════

    /// @dev Build a single TransferValidityProof with a caller-supplied `validUntil`.
    function _signProof(uint256 validUntil) internal view returns (TransferValidityProof[] memory proofs) {
        // Use a fresh nonce per call so the replay-protection map does not cause spurious reverts.
        uint256 nonce = uint256(keccak256(abi.encode("V12C3ValidUntil", validUntil)));
        bytes32 dataHash = keccak256(abi.encode("V12C3ValidUntil-dataHash", validUntil));
        bytes  memory sealedKey = _randomSealedKey(uint256(validUntil));

        // Ownership leg: TEE signs.
        bytes32 ownershipMsg = keccak256(
            abi.encode(dataHash, sealedKey, receiverPub, nonce, validUntil)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(teeSignerKey, ownershipMsg);
        bytes memory ownershipSig = abi.encodePacked(r, s, v);

        // Access leg: receiver signs.
        bytes32 accessMsg = keccak256(abi.encode(dataHash, receiverPub, nonce, validUntil));
        (v, r, s) = vm.sign(RECEIVER_KEY, accessMsg);
        bytes memory accessSig = abi.encodePacked(r, s, v);

        proofs = new TransferValidityProof[](1);
        proofs[0] = TransferValidityProof({
            accessProof: AccessProof({
                dataHash: dataHash,
                targetPubkey: receiverPub,
                nonce: nonce,
                proof: accessSig,
                validUntil: validUntil
            }),
            ownershipProof: OwnershipProof({
                oracleType: OracleType.TEE,
                dataHash: dataHash,
                sealedKey: sealedKey,
                targetPubkey: receiverPub,
                nonce: nonce,
                proof: ownershipSig,
                validUntil: validUntil
            })
        });
    }

    /// @dev Synthesize a 64-byte "pubkey" from an Ethereum address.
    function _addressToPubKey(address a) internal pure returns (bytes memory) {
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

    /// @dev Return a deterministic-looking 64-byte sealed key for tests.
    function _randomSealedKey(uint256 seed) internal pure returns (bytes memory sk) {
        sk = new bytes(64);
        bytes32 k1 = keccak256(abi.encodePacked("V12C3-sealedKey", seed));
        bytes32 k2 = keccak256(abi.encodePacked("V12C3-sealedKey-2", seed));
        for (uint256 i = 0; i < 32; i++) {
            sk[i]      = k1[i];
            sk[i + 32] = k2[i];
        }
    }
}
