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
/// @dev    The "validUntil" field is the EIP-712 "deadline" — the latest
///         block.timestamp at which a transfer-validity proof may be consumed.
///         Reference: https://eips.ethereum.org/EIPS/eip-712 (definition of
///         hashStruct — typed-data signed payload). The verifier at
///         `AxiomTeeVerifier.sol:226-234` enforces the gate via
///         `_checkValidUntil(validUntil, nowTs, maxAge)`:
///           (a) if `validUntil < nowTs`            => `AxiomProofExpired`
///           (b) if `validUntil - nowTs > maxAge`   => `AxiomValidUntilTooFar`
///         This file exercises both branches and the boundary cases against
///         the LIVE on-chain verifier at
///         `0x24f725198d64A3b03A8386cD8fa12BD7c591734A` (Galileo testnet,
///         chainId 16602), with no mocks.
///
///         Why a SEPARATE file from FuzzAxiomTeeVerifier.t.sol:
///           - FuzzAxiomTeeVerifier.t.sol fuzzes the gate against a LOCALLY
///             deployed verifier (`new AxiomTeeVerifier(...)` in setUp).
///           - This file pins the 5 canonical cases against the LIVE
///             deployed verifier, with the LIVE registered signer (operator
///             TEE key 0x437371dB1FBD534Bd01BD3f4E66DfA1675952F91, private
///             key in wallets/ADDRESSES.md). The two files together close
///             BUG-TEE-FIX-02's regression test gap.
///
///         Foundry forge-std cheatcodes used (canonical sources):
///           - `vm.createSelectFork(string url)`:
///             https://book.getfoundry.sh/forge/fork-testing
///             https://nipunjindal.medium.com/important-foundry-cheatcodes-c7c0867c7d77
///           - `vm.warp(uint256 newTimestamp)`:
///             https://book.getfoundry.sh/forge/cheatcodes#warp
///             https://docs.soliditylang.org/en/v0.8.20/contracts.html#block-and-transaction-properties
///           - `vm.sign(uint256 privKey, bytes32 digest)`:
///             https://book.getfoundry.sh/forge/cheatcodes#sign
///           - `vm.expectRevert(bytes4 selector | bytes data)`:
///             https://book.getfoundry.sh/forge/cheatcodes#expect-revert
///
///         Fork block: the prompt specified `38_862_018`; that block is
///         BEYOND the Galileo chain tip at the time of writing (latest block
///         38_850_461 on 2026-06-15). We use `vm.createSelectFork(url)` with
///         no explicit blockNumber — Foundry forks at LATEST, which is the
///         most reproducible choice for a live regression test. The block
///         number at run time is recorded in the BUGS.md entry.
contract V12C3ValidUntilTest is Test {
    // ─── Live fork (0G Galileo testnet, chainId 16602) ──────────────────
    // Reference: https://docs.0g.ai/developer-hub/testnet/testnet-overview
    string internal constant GALILEO_RPC = "https://0g-galileo-testnet.drpc.org";
    uint256 internal constant GALILEO_CHAIN_ID = 16_602;

    // The LIVE v2 AxiomTeeVerifier deployment. Verified 2026-06-16 (Wave E-5):
    //   `cast code 0x24f725…`  → contains 0x1c8d368c (maxProofAgeSeconds())
    //   `cast call 0x24f725… "registeredSigner()(address)"` → 0x4373…F91
    //   `cast call 0x24f725… "maxProofAgeSeconds()(uint256)"` → 604800 (7 days)
    address internal constant LIVE_VERIFIER_V2 = 0x24f725198d64A3b03A8386cD8fa12BD7c591734A;

    // The LIVE registered TEE signer — operator wallet from
    // `wallets/ADDRESSES.md` line 25 (Oracle Admin, plays all 3 roles on
    // testnet). The matching private key is read from the AXIOM_TEE_SIGNER_PK
    // env var in setUp() via vm.envUint.
    address internal constant LIVE_TEE_SIGNER = 0x437371dB1FBD534Bd01BD3f4E66DfA1675952F91;
    // TEE private key — initialized in setUp() from env var.
    uint256 internal teeSignerKey;

    // The maxProofAgeSeconds immutable on the live v2 verifier, baked into
    // the deployed bytecode. Verified by static call to the live contract.
    // 7 days = 604_800 seconds. Per AxiomTeeVerifier.sol:113-123, the
    // canonical 0G reference uses 7 days.
    uint256 internal constant MAX_PROOF_AGE_SECONDS = 7 days;

    // A second private key for the AccessProof leg (signed by the
    // receiver). Random but deterministic; the corresponding address is
    // derived via `vm.addr`. The key must be inside the secp256k1 group
    // order minus 1 so ECDSA.recover never returns the point at infinity
    // (address(0)) and so the access path is non-degenerate. Reference:
    // https://docs.openzeppelin.com/contracts/5.x/utils/cryptography#ECDSA
    uint256 internal constant RECEIVER_KEY =
        0x10C011C011C011C011C011C011C011C011C011C011C011C011C011C011C011CE;

    // ─── Fixture ────────────────────────────────────────────────────────
    AxiomTeeVerifier internal verifier;
    address internal receiverAddr;
    bytes  internal receiverPub;
    uint256 internal forkId;

    function setUp() public {
        // 0. Read private key from env var (never hardcoded in source).
        teeSignerKey = vm.envUint("AXIOM_TEE_SIGNER_PK");

        // 1. Select the live Galileo fork. We do NOT pass a block number
        //    because the prompt's specified block (38_862_018) is BEYOND
        //    the Galileo chain tip at the time of writing (38_850_461).
        //    Forking at `latest` is the canonical, reproducible default —
        //    see https://book.getfoundry.sh/forge/fork-testing.
        forkId = vm.createSelectFork(GALILEO_RPC);
        assertEq(block.chainid, GALILEO_CHAIN_ID, "Galileo testnet (chainId 16602)");

        // 2. Load the LIVE v2 verifier. We deliberately use the
        //    bind-by-address form (no deploy bytecode) — this is the whole
        //    point of the regression test: exercise the on-chain
        //    bytecode that real transfers hit.
        verifier = AxiomTeeVerifier(LIVE_VERIFIER_V2);

        // 3. Sanity assertions against the live bytecode / state. A test
        //    that silently runs against a stale or rotated signer is
        //    worse than no test at all.
        assertEq(verifier.registeredSigner(), LIVE_TEE_SIGNER, "live registered signer");
        assertEq(verifier.maxProofAgeSeconds(), MAX_PROOF_AGE_SECONDS, "maxProofAgeSeconds == 7d");

        // 4. Derive the receiver fixture. The receiver signs the
        //    AccessProof leg; its address is recovered by the verifier
        //    and echoed into the output's `accessAssistant` field.
        receiverAddr = vm.addr(RECEIVER_KEY);
        receiverPub  = _addressToPubKey(receiverAddr);
    }

    // ════════════════════════════════════════════════════════════════════
    //  Test 1: validUntil in the past  →  AxiomProofExpired
    // ════════════════════════════════════════════════════════════════════

    /// @notice validUntil < block.timestamp MUST revert with `AxiomProofExpired`.
    /// @dev    EIP-712 deadline semantic: once `block.timestamp > validUntil`,
    ///         the proof is dead. The first custom error to fire is the
    ///         correct one — a `validUntil` from "yesterday" is more useful
    ///         to operators as "expired" than as "too far" (which would
    ///         imply an overflow or a malicious long-lived proof).
    ///         Reference: https://eips.ethereum.org/EIPS/eip-712
    function test_validUntilPast_reverts() public {
        uint256 validUntil = block.timestamp - 1;
        // Belt-and-suspenders: warp a tick forward so block.timestamp can
        // never silently equal validUntil (which would be a different
        // branch — the "exactly at boundary" test below).
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

    /// @notice validUntil == block.timestamp MUST pass.
    /// @dev    Boundary case: the proof expires at the END of the current
    ///         second, so it is still valid in this block. The source
    ///         guard at AxiomTeeVerifier.sol:227 reads
    ///         `if (validUntil < nowTs) revert …` — strict less-than,
    ///         so equality passes.
    function test_validUntilAtNow_succeeds() public {
        // Pin the timestamp so the test is deterministic across reruns.
        // `vm.warp` is the Foundry cheatcode for the EVM `TIMESTAMP`
        // opcode; the live fork's `block.timestamp` advances independently
        // of warp. Reference:
        // https://book.getfoundry.sh/forge/cheatcodes#warp
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

    /// @notice validUntil in the future (within maxProofAgeSeconds) MUST pass.
    /// @dev    A signed deadline 60 seconds ahead is the canonical "happy
    ///         path" for a freshly minted transfer validity proof. This
    ///         case is the regression sentinel for "did the timestamp gate
    ///         regress and start rejecting short-future proofs?".
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

    /// @notice validUntil just past the maxProofAgeSeconds window MUST
    ///         revert with `AxiomValidUntilTooFar`.
    /// @dev    Per AxiomTeeVerifier.sol:30-35, the too-far branch is the
    ///         guard against a malicious TEE signer minting arbitrarily
    ///         long-lived proofs (and the overflow attack on the simpler
    ///         `validUntil > now + maxAge` formulation — see test 5).
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

    /// @notice The classic overflow attack: validUntil = type(uint256).max.
    ///         MUST revert with `AxiomValidUntilTooFar`, NOT `Panic(0x11)`.
    /// @dev    The contract subtracts `nowTs` from `validUntil` ONLY after
    ///         asserting `validUntil >= nowTs` (overflow-safe). The result
    ///         is a delta so large it trivially exceeds `maxProofAgeSeconds`,
    ///         so the second branch fires. This is the strongest evidence
    ///         that BUG-TEE-FIX-02's overflow guard works end-to-end on
    ///         the LIVE bytecode.
    ///         Reference: https://docs.soliditylang.org/en/v0.8.20/control-structures.html#panic-via-the-revert-function
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

    /// @dev Build a single TransferValidityProof with a caller-supplied
    ///      `validUntil` and a fresh, nonce-disjoint proof body.
    ///      The signatures are produced with `vm.sign` (the canonical
    ///      Foundry cheatcode for EIP-191 secp256k1 signatures).
    ///      Reference: https://book.getfoundry.sh/forge/cheatcodes#sign
    function _signProof(uint256 validUntil) internal view returns (TransferValidityProof[] memory proofs) {
        // Use a fresh nonce per call so the replay-protection map (which
        // is a stateful mapping on the live verifier) does not cause
        // spurious reverts. Nonce derives from `validUntil` to keep
        // the helper side-effect-free across tests.
        uint256 nonce = uint256(keccak256(abi.encode("V12C3ValidUntil", validUntil)));
        bytes32 dataHash = keccak256(abi.encode("V12C3ValidUntil-dataHash", validUntil));
        bytes  memory sealedKey = _randomSealedKey(uint256(validUntil));

        // Ownership leg: TEE signs keccak256(dataHash, sealedKey, pub, nonce, validUntil).
        // Per AxiomTeeVerifier.sol:174-182 and IERC7857DataVerifier.sol:33-34.
        bytes32 ownershipMsg = keccak256(
            abi.encode(dataHash, sealedKey, receiverPub, nonce, validUntil)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(teeSignerKey, ownershipMsg);
        bytes memory ownershipSig = abi.encodePacked(r, s, v);

        // Access leg: receiver signs keccak256(dataHash, pub, nonce, validUntil).
        // Per AxiomTeeVerifier.sol:188-194 and IERC7857DataVerifier.sol:18-19.
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

    /// @dev Synthesize a 64-byte "pubkey" from an Ethereum address. This
    ///      mirrors the helper in FuzzAxiomTeeVerifier.t.sol and the
    ///      production `_addressToPubKey` in AxiomAgentNFT.t.sol. The
    ///      verifier's `_recoverSigner` only ECDSA-recovers the access
    ///      message, so the synthetic pubkey's exact curve-point shape is
    ///      irrelevant — the high 20 bytes need to embed the receiver
    ///      address for downstream consumers (the NFT contract) that
    ///      later call `Utils.pubKeyToAddress`.
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
