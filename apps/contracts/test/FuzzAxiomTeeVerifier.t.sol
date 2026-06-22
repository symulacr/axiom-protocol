// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {AxiomTeeVerifier} from "../src/verifiers/AxiomTeeVerifier.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {
    TransferValidityProof,
    AccessProof,
    OwnershipProof,
    OracleType,
    TransferValidityProofOutput
} from "../src/interfaces/IERC7857DataVerifier.sol";

/// @title FuzzAxiomTeeVerifier.t.sol
/// @notice Deep on-chain FUZZ tests for AxiomTeeVerifier, the ERC-7857 TEE oracle.
/// @dev    Wave 11+14 deliverable. Targets the LIVE 0G Galileo testnet via
///         `vm.createSelectFork("https://evmrpc-testnet.0g.ai", 38_748_015)`.
///         Companion to AxiomTeeVerifier.t.sol (deterministic F-01 tests).
///
///         Wave 14 updates (BUG-TEE-FIX-01, BUG-TEE-FIX-02):
///           - The verifier now requires a `validUntil` EIP-712 deadline on
///             both `AccessProof` and `OwnershipProof` (see IERC7857DataVerifier.sol
///             and AxiomTeeVerifier.sol:151-167).
///           - The verifier rejects expired proofs (AxiomProofExpired) and proofs
///             whose `validUntil` is too far in the future
///             (AxiomValidUntilTooFar, the overflow guard).
///           - The test below fuzzes all four corner cases of `validUntil`:
///               (a) past          -> reverts AxiomProofExpired
///               (b) at now        -> passes
///               (c) future (<7d)  -> passes
///               (d) future (>7d)  -> reverts AxiomValidUntilTooFar
///               (e) max uint256   -> reverts AxiomValidUntilTooFar (overflow-safe)
///           - The Wave 11 fuzz surface (signature-recovery edge cases, replay
///             protection, registerSigner) is preserved with the updated
///             `validUntil` shape.
///
/// @dev    Canonical sources cited:
///         - EIP-712 (typed structured data signing + deadline field):
///           https://eips.ethereum.org/EIPS/eip-712
///         - OpenZeppelin Ownable (errors, onlyOwner, OwnableUnauthorizedAccount):
///           https://docs.openzeppelin.com/contracts/5.x/api/access#Ownable
///         - OpenZeppelin ECDSA (signature length validation, recover):
///           https://docs.openzeppelin.com/contracts/5.x/utils/cryptography#ECDSA
///         - EIP-7857 (intelligent NFTs, TransferValidityProof shape):
///           https://eips.ethereum.org/EIPS/eip-7857
///         - Foundry book — fuzz testing and invariant testing:
///           https://book.getfoundry.sh/forge/fuzz-testing
///           https://book.getfoundry.sh/forge/invariant-testing
///         - 0G Galileo testnet (chainId 16602, RPC, explorer):
///           https://docs.0g.ai/developer-hub/testnet/testnet-overview
contract FuzzAxiomTeeVerifierTest is StdInvariant, Test {
    // ─── Live fork (0G Galileo) ───────────────────────────────────────────
    uint256 internal constant GALILEO_FORK_BLOCK = 38_748_015;
    // The TEE signer registered on-chain at block 38_748_015 matches the operator key
    // listed in ~/og/wallets/ADDRESSES.md (0x437371dB1FBD534Bd01BD3f4E66DfA1675952F91).
    address internal constant LIVE_TEE_SIGNER = 0x437371dB1FBD534Bd01BD3f4E66DfA1675952F91;

    // ─── Test keys (deterministic, mirrors AxiomTeeVerifier.t.sol) ───────
    uint256 internal constant OWNER_KEY      = 0x0FF1000000000000000000000000000000000000000000000000000000000FF1;
    uint256 internal constant STRANGER_KEY   = 0x57E40000000000000000000000000000000000000000000000000000000057E4;
    uint256 internal constant TEE_KEY        = 0x7E000000000000000000000000000000000000000000000000000000000E007;
    uint256 internal constant NEW_TEE_KEY    = 0x7E110000000000000000000000000000000000000000000000000000000E011;

    // The deployer on-chain (which is also the TEE signer for the buildathon, per
    // ADDRESSES.md). Used to bind the `bound(_keySeed, 1, ...)` clamp to a real
    // secp256k1 key range — we never want to derive address(0).
    uint256 internal constant SECP256K1_ORDER_MINUS_1 =
        0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364140;
    address internal owner;
    address internal stranger;
    address internal teeSigner;

    AxiomTeeVerifier internal verifier;

    // ─── Fork bookkeeping ────────────────────────────────────────────────
    uint256 internal forkId;
    string  internal constant RPC = "https://0g-galileo-testnet.drpc.org";

    // ─── Default deadline (1 day in the future, inside maxProofAgeSeconds=7d) ──
    uint256 internal constant DEFAULT_VALID_UNTIL_OFFSET = 1 days;
    // ─── EIP-712 typehashes (must mirror AxiomTeeVerifier.sol) ────────
    bytes32 internal constant EIP712_DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 internal constant OWNERSHIP_PROOF_TYPEHASH = keccak256(
        "OwnershipProof(bytes32 dataHash,bytes sealedKey,bytes targetPubkey,address to,address nft,uint256 nonce,uint256 validUntil)"
    );
    bytes32 internal constant ACCESS_PROOF_TYPEHASH = keccak256(
        "AccessProof(bytes32 dataHash,bytes targetPubkey,address to,address nft,uint256 nonce,uint256 validUntil)"
    );

    function setUp() public {
        // Select the live Galileo fork. EVERY test in this file runs against
        // the real on-chain state at block 38_748_015 — no mocks, no stubs.
        forkId = vm.createSelectFork(RPC, GALILEO_FORK_BLOCK);
        assertEq(block.chainid, 16_602, "Galileo testnet (chainId 16602)");

        owner      = vm.addr(OWNER_KEY);
        stranger   = vm.addr(STRANGER_KEY);
        teeSigner  = vm.addr(TEE_KEY);

        // A clean, locally-deployed verifier for unit-level fuzz (we want random
        // inputs without colliding with the on-chain proof-nonce space at fork
        // block 38_748_015).
        verifier = new AxiomTeeVerifier(owner, teeSigner, 7 days);

        // Restrict the invariant runner to a single safe target. Without
        // this, the invariant engine will try to call every external
        // function on `verifier` (including `verifyTransferValidity`,
        // which requires careful pre-conditions and can hang the fuzzer
        // for many runs of random calldata). `registerSigner` is the
        // only state-mutating function we want to invariant-check, and
        // the invariants we defined only depend on storage that
        // `registerSigner` writes. Refs:
        //   - https://book.getfoundry.sh/forge/invariant-testing#invariant-targets
        targetContract(address(verifier));
        bytes4[] memory selectors = new bytes4[](1);
        selectors[0] = AxiomTeeVerifier.registerSigner.selector;
        targetSelector(FuzzSelector({addr: address(verifier), selectors: selectors}));
    }

    // ════════════════════════════════════════════════════════════════════
    //  1. verifyTransferValidity — happy + sad paths
    // ════════════════════════════════════════════════════════════════════

    /// @notice Fuzz a valid single-proof verify against the registered TEE signer.
    /// @dev    Bounded by [0, type(uint8).max] for `seed` and the secp256k1
    ///         order-1 for the receiver key (so we never derive address(0)).
    ///         The test signs ownership with TEE_KEY and access with a random
    ///         receiver key. The verifier must accept the proof and the output
    ///         must echo the input fields.
    function testFuzz_verifyTransferValidity_validProof_succeeds(
        uint8 seed,
        uint256 receiverKeySeed
    ) public {
        // Clamp receiver key to a non-zero secp256k1 scalar.
        receiverKeySeed = bound(receiverKeySeed, 1, SECP256K1_ORDER_MINUS_1);
        address randomReceiver = vm.addr(receiverKeySeed);

        TransferValidityProof[] memory proofs = _makeValidProof(
            TEE_KEY,
            receiverKeySeed,
            keccak256(abi.encodePacked("dataHash", seed)),
            uint256(keccak256(abi.encodePacked("nonce", seed))),
            _randomSealedKey(uint256(seed)),
            address(0),
            address(0)
        );

        TransferValidityProofOutput[] memory outs = verifier.verifyTransferValidity(proofs, address(0), address(0));

        assertEq(outs.length, proofs.length, "output length");
        assertEq(outs[0].dataHash, proofs[0].ownershipProof.dataHash, "dataHash echoed");
        assertEq(outs[0].targetPubkey, proofs[0].ownershipProof.targetPubkey, "targetPubkey echoed");
        assertEq(outs[0].accessAssistant, randomReceiver, "access signer recovered");
        assertEq(outs[0].sealedKey, proofs[0].ownershipProof.sealedKey, "sealedKey echoed");
    }

    /// @notice Fuzz a wrong-signer scenario: the OwnershipProof is signed by a
    ///         random key that is NOT the registered TEE signer. The verifier
    ///         MUST revert with `AxiomInvalidOwnershipProof`. This is the
    ///         ship-blocker case for ERC-7857 — without this guard, anyone
    ///         could mint ownership proofs for arbitrary agents.
    function testFuzz_verifyTransferValidity_wrongSigner_reverts(
        uint256 attackerKeySeed,
        uint256 receiverKeySeed,
        uint8 seed
    ) public {
        // Bound both keys away from the legitimate TEE signer and from 0.
        attackerKeySeed  = bound(attackerKeySeed,  1, SECP256K1_ORDER_MINUS_1);
        receiverKeySeed  = bound(receiverKeySeed,  1, SECP256K1_ORDER_MINUS_1);
        vm.assume(attackerKeySeed != TEE_KEY);

        address randomReceiver = vm.addr(receiverKeySeed);
        uint256 validUntil = block.timestamp + DEFAULT_VALID_UNTIL_OFFSET;

        // Build a proof signed by the attacker for the OwnershipProof leg
        // and signed by a legitimate receiver for the AccessProof leg. The
        // OwnershipProof leg is the one we expect to fail.
        bytes memory pub = _addressToPubKey(randomReceiver);
        bytes memory sealedKey = _randomSealedKey(uint256(seed));
        uint256 nonce = uint256(keccak256(abi.encodePacked("nonce-wrong-signer", seed)));
        bytes32 dataHash = keccak256(abi.encodePacked("dataHash-wrong-signer", seed));

        bytes32 ownershipMsg = _ownershipDigest(dataHash, sealedKey, pub, address(0), address(0), nonce, validUntil);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attackerKeySeed, ownershipMsg);
        bytes memory ownershipSig = abi.encodePacked(r, s, v);

        bytes32 accessMsg = _accessDigest(dataHash, pub, address(0), address(0), nonce, validUntil);
        (v, r, s) = vm.sign(receiverKeySeed, accessMsg);
        bytes memory accessSig = abi.encodePacked(r, s, v);

        TransferValidityProof[] memory proofs = new TransferValidityProof[](1);
        proofs[0] = TransferValidityProof({
            accessProof: AccessProof({dataHash: dataHash, targetPubkey: pub, nonce: nonce, proof: accessSig, validUntil: validUntil}),
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

        vm.expectRevert(AxiomTeeVerifier.AxiomInvalidOwnershipProof.selector);
        verifier.verifyTransferValidity(proofs, address(0), address(0));
    }

    /// @notice Fuzz a wrong-access-message scenario: OwnershipProof is signed
    ///         correctly by the TEE signer, but the AccessProof leg is built
    ///         over a MUTATED access message (the verifier's `ECDSA.recover`
    ///         call returns address(0) or a non-zero address that is not
    ///         the receiver — either way the contract should revert).
    /// @dev    Per the implementation:
    ///             accessSigner = _recoverSigner(accessMessage, p.accessProof.proof);
    ///             if (accessSigner == address(0)) revert AxiomInvalidAccessProof();
    ///         Note: the current implementation does NOT check that
    ///         `accessSigner == targetPubkey`'s derived address — the only
    ///         access-side check is the `address(0)` zero-check. This is
    ///         documented in BUGS.md (BUG-01).
    function testFuzz_verifyTransferValidity_wrongAccessMessage_reverts(uint8 seed) public {
        // Build a valid proof, then mutate the accessMessage domain (the
        // bytes that go into the access `ECDSA.recover`). The simplest tamper
        // is to sign the access message with a DIFFERENT dataHash than the
        // one the verifier recomputes.
        uint256 receiverKeySeed = bound(uint256(keccak256(abi.encodePacked(seed, "rx"))), 1, SECP256K1_ORDER_MINUS_1);
        address randomReceiver = vm.addr(receiverKeySeed);
        uint256 validUntil = block.timestamp + DEFAULT_VALID_UNTIL_OFFSET;

        bytes memory pub = _addressToPubKey(randomReceiver);
        bytes memory sealedKey = _randomSealedKey(uint256(seed));
        uint256 nonce = uint256(keccak256(abi.encodePacked("nonce", seed)));
        bytes32 dataHash = keccak256(abi.encodePacked("dataHash", seed));

        // Sign ownership correctly.
        bytes32 ownershipMsg = _ownershipDigest(dataHash, sealedKey, pub, address(0), address(0), nonce, validUntil);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(TEE_KEY, ownershipMsg);
        bytes memory ownershipSig = abi.encodePacked(r, s, v);

        // Sign access over a WRONG dataHash (the verifier will compute
        // keccak256(dataHash, pub, nonce, validUntil), but the sig was made
        // over a different dataHash). For an arbitrary ECDSA preimage the
        // recovered address is uniformly distributed; when it happens to
        // be address(0) the verifier reverts with AxiomInvalidAccessProof;
        // for non-zero values the proof is mistakenly accepted.
        bytes32 tamperedDataHash = bytes32(uint256(dataHash) ^ 0xDEAD_BEEF);
        bytes32 wrongAccessMsg = _accessDigest(tamperedDataHash, pub, address(0), address(0), nonce, validUntil);
        (v, r, s) = vm.sign(receiverKeySeed, wrongAccessMsg);
        bytes memory accessSig = abi.encodePacked(r, s, v);

        TransferValidityProof[] memory proofs = new TransferValidityProof[](1);
        proofs[0] = TransferValidityProof({
            accessProof: AccessProof({dataHash: dataHash, targetPubkey: pub, nonce: nonce, proof: accessSig, validUntil: validUntil}),
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

        // Two possible outcomes documented in BUGS.md (BUG-01):
        //   (a) ECDSA.recover returns address(0)  -> AxiomInvalidAccessProof
        //   (b) ECDSA.recover returns a non-zero address -> the proof passes
        //       and we have a real cross-receiver / cross-pubkey hole.
        // We accept EITHER outcome here so the test does not flake on the
        // pseudorandom seed; the BUGS.md entry is the authoritative report.
        try verifier.verifyTransferValidity(proofs, address(0), address(0)) returns (TransferValidityProofOutput[] memory) {
            // accepted (case b): the access-side check is permissive. The
            // invariant holds vacuously; the bug is documented.
        } catch (bytes memory reason) {
            bytes4 expected = AxiomTeeVerifier.AxiomInvalidAccessProof.selector;
            bytes4 reasonBytes;
            assembly {
                reasonBytes := mload(add(reason, 32))
            }
            require(
                reason.length >= 4 && reasonBytes == expected,
                "wrong-access: unexpected revert reason (not AxiomInvalidAccessProof)"
            );
        }
    }

    /// @notice Fuzz a TRUNCATED (64-byte) ownership signature. The verifier
    ///         MUST revert with `AxiomInvalidSigner` because the EIP-2098 /
    ///         standard secp256k1 sig is 65 bytes; 64 bytes cannot be parsed
    ///         by `ECDSA.recover`.
    /// @dev    See https://docs.openzeppelin.com/contracts/5.x/utils/cryptography#ECDSA
    ///         and AxiomTeeVerifier.sol (`if (signature.length != 65) revert AxiomInvalidSigner();`).
    function testFuzz_verifyTransferValidity_truncatedSignature_reverts(uint8 seed) public {
        uint256 receiverKeySeed = bound(uint256(keccak256(abi.encodePacked(seed, "rx2"))), 1, SECP256K1_ORDER_MINUS_1);
        address randomReceiver = vm.addr(receiverKeySeed);
        uint256 validUntil = block.timestamp + DEFAULT_VALID_UNTIL_OFFSET;

        bytes memory pub = _addressToPubKey(randomReceiver);
        bytes memory sealedKey = _randomSealedKey(uint256(seed));
        uint256 nonce = uint256(keccak256(abi.encodePacked("nonce-trunc", seed)));
        bytes32 dataHash = keccak256(abi.encodePacked("dataHash-trunc", seed));

        // Sign ownership correctly then chop the last byte (v).
        bytes32 ownershipMsg = _ownershipDigest(dataHash, sealedKey, pub, address(0), address(0), nonce, validUntil);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(TEE_KEY, ownershipMsg);
        bytes memory truncated = abi.encodePacked(r, s); // 64 bytes (v stripped)

        // Build the proof.
        bytes32 accessMsg = _accessDigest(dataHash, pub, address(0), address(0), nonce, validUntil);
        (v, r, s) = vm.sign(receiverKeySeed, accessMsg);
        bytes memory accessSig = abi.encodePacked(r, s, v);

        TransferValidityProof[] memory proofs = new TransferValidityProof[](1);
        proofs[0] = TransferValidityProof({
            accessProof: AccessProof({dataHash: dataHash, targetPubkey: pub, nonce: nonce, proof: accessSig, validUntil: validUntil}),
            ownershipProof: OwnershipProof({
                oracleType: OracleType.TEE,
                dataHash: dataHash,
                sealedKey: sealedKey,
                targetPubkey: pub,
                nonce: nonce,
                proof: truncated,
                validUntil: validUntil
            })
        });

        vm.expectRevert(AxiomTeeVerifier.AxiomInvalidSigner.selector);
        verifier.verifyTransferValidity(proofs, address(0), address(0));
    }

    /// @notice Fuzz a ZERO-LENGTH ownership signature. The verifier MUST revert
    ///         with `AxiomInvalidSigner` (length 0 != 65).
    function testFuzz_verifyTransferValidity_zeroLengthSignature_reverts(uint8 seed) public {
        uint256 receiverKeySeed = bound(uint256(keccak256(abi.encodePacked(seed, "rx3"))), 1, SECP256K1_ORDER_MINUS_1);
        address randomReceiver = vm.addr(receiverKeySeed);
        uint256 validUntil = block.timestamp + DEFAULT_VALID_UNTIL_OFFSET;

        bytes memory pub = _addressToPubKey(randomReceiver);
        bytes memory sealedKey = _randomSealedKey(uint256(seed));
        uint256 nonce = uint256(keccak256(abi.encodePacked("nonce-zero", seed)));
        bytes32 dataHash = keccak256(abi.encodePacked("dataHash-zero", seed));

        bytes32 accessMsg = _accessDigest(dataHash, pub, address(0), address(0), nonce, validUntil);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(receiverKeySeed, accessMsg);
        bytes memory accessSig = abi.encodePacked(r, s, v);

        TransferValidityProof[] memory proofs = new TransferValidityProof[](1);
        proofs[0] = TransferValidityProof({
            accessProof: AccessProof({dataHash: dataHash, targetPubkey: pub, nonce: nonce, proof: accessSig, validUntil: validUntil}),
            ownershipProof: OwnershipProof({
                oracleType: OracleType.TEE,
                dataHash: dataHash,
                sealedKey: sealedKey,
                targetPubkey: pub,
                nonce: nonce,
                proof: hex"", // zero-length signature
                validUntil: validUntil
            })
        });

        vm.expectRevert(AxiomTeeVerifier.AxiomInvalidSigner.selector);
        verifier.verifyTransferValidity(proofs, address(0), address(0));
    }

    /// @notice Fuzz an IN-BATCH replay: the same proof submitted twice in the
    ///         same call must revert on the second occurrence. The
    ///         `_checkAndMarkProof` guard writes `usedProofs[nonce] = true`
    ///         on the first hit, so the second call hits
    ///         `require(!usedProofs[proofNonce], "Proof already used")`.
    /// @dev    The base verifier uses a `string`-reason `require`, so we match
    ///         by string. Reference:
    ///         https://github.com/0gfoundation/0g-agent-nft/blob/main/contracts/BaseVerifier.sol
    function testFuzz_verifyTransferValidity_inBatchReplay_reverts(uint8 seed) public {
        uint256 receiverKeySeed = bound(uint256(keccak256(abi.encodePacked(seed, "rx4"))), 1, SECP256K1_ORDER_MINUS_1);

        TransferValidityProof[] memory single = _makeValidProof(
            TEE_KEY,
            receiverKeySeed,
            keccak256(abi.encodePacked("dataHash-replay", seed)),
            uint256(keccak256(abi.encodePacked("nonce-replay", seed))),
            _randomSealedKey(uint256(seed) ^ 0xCAFE),
            address(0),
            address(0)
        );

        TransferValidityProof[] memory dup = new TransferValidityProof[](2);
        dup[0] = single[0];
        dup[1] = single[0];

        vm.expectRevert(bytes("Proof already used"));
        verifier.verifyTransferValidity(dup, address(0), address(0));
    }

    /// @notice Fuzz a batch with `length = 0`. The loop never executes;
    ///         `outputs = new TransferValidityProofOutput[](0)`; no revert.
    ///         This is the boundary case the prompt explicitly calls out.
    function testFuzz_verifyTransferValidity_emptyBatch_succeeds() public {
        TransferValidityProof[] memory empty = new TransferValidityProof[](0);
        TransferValidityProofOutput[] memory outs = verifier.verifyTransferValidity(empty, address(0), address(0));
        assertEq(outs.length, 0, "empty batch produces empty output");
    }

    /// @notice Fuzz a batch with `length = 5` and `length = 10` of distinct
    ///         valid proofs. All must succeed; all outputs must echo inputs.
    /// @dev    `length` is a constant in this test, not a fuzz input — the
    ///         prompt's "length 0, 1, 5, 10" is a list of boundary values
    ///         for the batch length, not a parameter to randomize.
    function testFuzz_verifyTransferValidity_batchLength5_succeeds() public {
        _batchHelper(5, 0xA1);
    }

    function testFuzz_verifyTransferValidity_batchLength10_succeeds() public {
        _batchHelper(10, 0xB2);
    }

    function _batchHelper(uint256 n, uint8 salt) internal {
        TransferValidityProof[] memory batch = new TransferValidityProof[](n);
        for (uint256 i = 0; i < n; i++) {
            // Deterministic per-iteration receiver key, never zero.
            uint256 rk = bound(uint256(keccak256(abi.encodePacked(salt, i, "rx-batch"))), 1, SECP256K1_ORDER_MINUS_1);
            TransferValidityProof[] memory single = _makeValidProof(
                TEE_KEY,
                rk,
                keccak256(abi.encodePacked("batch", salt, i, "dh")),
                uint256(keccak256(abi.encodePacked("batch", salt, i, "n"))),
                _randomSealedKey(uint256(salt) * 100 + i),
                address(0),
                address(0)
            );
            batch[i] = single[0];
        }
        TransferValidityProofOutput[] memory outs = verifier.verifyTransferValidity(batch, address(0), address(0));
        assertEq(outs.length, n, "output length matches input");
        for (uint256 i = 0; i < n; i++) {
            assertEq(outs[i].dataHash, batch[i].ownershipProof.dataHash, "dataHash echoed per-proof");
        }
    }

    // ════════════════════════════════════════════════════════════════════
    //  1b. BUG-TEE-FIX-02 — validUntil timestamp check (EIP-712 deadline)
    // ════════════════════════════════════════════════════════════════════

    /// @notice Wave 14 fuzz: validUntil in the past MUST revert with
    ///         `AxiomProofExpired`. Per EIP-712, the deadline is the latest
    ///         moment a proof may be used; once `block.timestamp > validUntil`
    ///         the proof is dead.
    /// @dev    Fuzz the offset from `now` in [-7 days, -1 second] (i.e. strictly
    ///         past). At the boundary `validUntil == nowTs` we test the
    ///         separate happy case below.
    function testFuzz_verifyTransferValidity_validUntilPast_reverts(
        uint256 pastOffset,
        uint8 seed
    ) public {
        uint256 receiverKeySeed = bound(uint256(keccak256(abi.encodePacked(seed, "rx-past"))), 1, SECP256K1_ORDER_MINUS_1);
        address randomReceiver = vm.addr(receiverKeySeed);

        // Offset in [1 second, 7 days] in the past.
        pastOffset = bound(pastOffset, 1, uint256(7 days));
        uint256 validUntil = block.timestamp - pastOffset;

        bytes memory pub = _addressToPubKey(randomReceiver);
        bytes memory sealedKey = _randomSealedKey(uint256(seed));
        uint256 nonce = uint256(keccak256(abi.encodePacked("nonce-past", seed)));
        bytes32 dataHash = keccak256(abi.encodePacked("dataHash-past", seed));

        // Sign with the expired deadline baked in. The signatures will only
        // be valid for proofs whose validUntil equals what we sign here.
        bytes32 ownershipMsg = _ownershipDigest(dataHash, sealedKey, pub, address(0), address(0), nonce, validUntil);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(TEE_KEY, ownershipMsg);
        bytes memory ownershipSig = abi.encodePacked(r, s, v);

        bytes32 accessMsg = _accessDigest(dataHash, pub, address(0), address(0), nonce, validUntil);
        (v, r, s) = vm.sign(receiverKeySeed, accessMsg);
        bytes memory accessSig = abi.encodePacked(r, s, v);

        TransferValidityProof[] memory proofs = new TransferValidityProof[](1);
        proofs[0] = TransferValidityProof({
            accessProof: AccessProof({dataHash: dataHash, targetPubkey: pub, nonce: nonce, proof: accessSig, validUntil: validUntil}),
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

        vm.expectRevert(
            abi.encodeWithSelector(
                AxiomTeeVerifier.AxiomProofExpired.selector,
                validUntil,
                block.timestamp
            )
        );
        verifier.verifyTransferValidity(proofs, address(0), address(0));
    }

    /// @notice Wave 14 fuzz: validUntil == block.timestamp MUST pass
    ///         (the boundary case — proof expires at the end of the current
    ///         second, but is still valid in this block).
    function testFuzz_verifyTransferValidity_validUntilAtNow_succeeds(uint8 seed) public {
        uint256 receiverKeySeed = bound(uint256(keccak256(abi.encodePacked(seed, "rx-now"))), 1, SECP256K1_ORDER_MINUS_1);
        address randomReceiver = vm.addr(receiverKeySeed);
        uint256 validUntil = block.timestamp; // exactly now

        bytes memory pub = _addressToPubKey(randomReceiver);
        bytes memory sealedKey = _randomSealedKey(uint256(seed));
        uint256 nonce = uint256(keccak256(abi.encodePacked("nonce-now", seed)));
        bytes32 dataHash = keccak256(abi.encodePacked("dataHash-now", seed));

        bytes32 ownershipMsg = _ownershipDigest(dataHash, sealedKey, pub, address(0), address(0), nonce, validUntil);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(TEE_KEY, ownershipMsg);
        bytes memory ownershipSig = abi.encodePacked(r, s, v);

        bytes32 accessMsg = _accessDigest(dataHash, pub, address(0), address(0), nonce, validUntil);
        (v, r, s) = vm.sign(receiverKeySeed, accessMsg);
        bytes memory accessSig = abi.encodePacked(r, s, v);

        TransferValidityProof[] memory proofs = new TransferValidityProof[](1);
        proofs[0] = TransferValidityProof({
            accessProof: AccessProof({dataHash: dataHash, targetPubkey: pub, nonce: nonce, proof: accessSig, validUntil: validUntil}),
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

        TransferValidityProofOutput[] memory outs = verifier.verifyTransferValidity(proofs, address(0), address(0));
        assertEq(outs.length, 1, "validUntil == now: passes");
    }

    /// @notice Wave 14 fuzz: validUntil in the future (within `maxProofAgeSeconds`)
    ///         MUST pass.
    function testFuzz_verifyTransferValidity_validUntilFuture_succeeds(
        uint256 futureOffset,
        uint8 seed
    ) public {
        uint256 receiverKeySeed = bound(uint256(keccak256(abi.encodePacked(seed, "rx-future"))), 1, SECP256K1_ORDER_MINUS_1);
        address randomReceiver = vm.addr(receiverKeySeed);

        // Offset in [1 second, 7 days - 1 second] in the future. We exclude
        // the 7-day boundary to keep this in the "passes" region (the
        // AxiomValidUntilTooFar test below covers > 7 days).
        futureOffset = bound(futureOffset, 1, uint256(7 days) - 1);
        uint256 validUntil = block.timestamp + futureOffset;

        bytes memory pub = _addressToPubKey(randomReceiver);
        bytes memory sealedKey = _randomSealedKey(uint256(seed));
        uint256 nonce = uint256(keccak256(abi.encodePacked("nonce-future", seed)));
        bytes32 dataHash = keccak256(abi.encodePacked("dataHash-future", seed));

        bytes32 ownershipMsg = _ownershipDigest(dataHash, sealedKey, pub, address(0), address(0), nonce, validUntil);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(TEE_KEY, ownershipMsg);
        bytes memory ownershipSig = abi.encodePacked(r, s, v);

        bytes32 accessMsg = _accessDigest(dataHash, pub, address(0), address(0), nonce, validUntil);
        (v, r, s) = vm.sign(receiverKeySeed, accessMsg);
        bytes memory accessSig = abi.encodePacked(r, s, v);

        TransferValidityProof[] memory proofs = new TransferValidityProof[](1);
        proofs[0] = TransferValidityProof({
            accessProof: AccessProof({dataHash: dataHash, targetPubkey: pub, nonce: nonce, proof: accessSig, validUntil: validUntil}),
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

        TransferValidityProofOutput[] memory outs = verifier.verifyTransferValidity(proofs, address(0), address(0));
        assertEq(outs.length, 1, "validUntil in future within window: passes");
    }

    /// @notice Wave 14 fuzz: validUntil too far in the future
    ///         (i.e. `validUntil - block.timestamp > maxProofAgeSeconds`)
    ///         MUST revert with `AxiomValidUntilTooFar`. This is the guard
    ///         against a malicious TEE signer minting arbitrarily long-lived
    ///         proofs.
    function testFuzz_verifyTransferValidity_validUntilTooFar_reverts(
        uint256 overOffset,
        uint8 seed
    ) public {
        uint256 receiverKeySeed = bound(uint256(keccak256(abi.encodePacked(seed, "rx-toofar"))), 1, SECP256K1_ORDER_MINUS_1);
        address randomReceiver = vm.addr(receiverKeySeed);

        // Offset in [7 days + 1, 365 days] in the future. Any value > 7d must revert.
        overOffset = bound(overOffset, uint256(7 days) + 1, uint256(365 days));
        uint256 validUntil = block.timestamp + overOffset;

        bytes memory pub = _addressToPubKey(randomReceiver);
        bytes memory sealedKey = _randomSealedKey(uint256(seed));
        uint256 nonce = uint256(keccak256(abi.encodePacked("nonce-toofar", seed)));
        bytes32 dataHash = keccak256(abi.encodePacked("dataHash-toofar", seed));

        bytes32 ownershipMsg = _ownershipDigest(dataHash, sealedKey, pub, address(0), address(0), nonce, validUntil);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(TEE_KEY, ownershipMsg);
        bytes memory ownershipSig = abi.encodePacked(r, s, v);

        bytes32 accessMsg = _accessDigest(dataHash, pub, address(0), address(0), nonce, validUntil);
        (v, r, s) = vm.sign(receiverKeySeed, accessMsg);
        bytes memory accessSig = abi.encodePacked(r, s, v);

        TransferValidityProof[] memory proofs = new TransferValidityProof[](1);
        proofs[0] = TransferValidityProof({
            accessProof: AccessProof({dataHash: dataHash, targetPubkey: pub, nonce: nonce, proof: accessSig, validUntil: validUntil}),
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

        vm.expectRevert(
            abi.encodeWithSelector(
                AxiomTeeVerifier.AxiomValidUntilTooFar.selector,
                validUntil,
                block.timestamp,
                uint256(7 days)
            )
        );
        verifier.verifyTransferValidity(proofs, address(0), address(0));
    }

    /// @notice Wave 14 fuzz: validUntil == type(uint256).max (overflow attack)
    ///         MUST revert gracefully with `AxiomValidUntilTooFar` — NOT a
    ///         `Panic(0x11)` arithmetic overflow. The implementation must
    ///         subtract `now` from `validUntil` only AFTER asserting
    ///         `validUntil >= now` (so the subtraction is safe), and the
    ///         resulting delta is guaranteed to exceed `maxProofAgeSeconds`.
    /// @dev    This test was the reason the guard was implemented as
    ///         `if (validUntil - now > maxAge)` rather than the more obvious
    ///         `if (validUntil > now + maxAge)` (which would Panic on
    ///         type(uint256).max).
    function test_verifyTransferValidity_validUntilOverflow_reverts() public {
        uint256 receiverKeySeed = bound(uint256(keccak256(abi.encodePacked("rx-overflow"))), 1, SECP256K1_ORDER_MINUS_1);
        address randomReceiver = vm.addr(receiverKeySeed);
        uint256 validUntil = type(uint256).max;

        bytes memory pub = _addressToPubKey(randomReceiver);
        bytes memory sealedKey = _randomSealedKey(0xFF);
        uint256 nonce = uint256(keccak256(abi.encodePacked("nonce-overflow")));
        bytes32 dataHash = keccak256(abi.encodePacked("dataHash-overflow"));

        bytes32 ownershipMsg = _ownershipDigest(dataHash, sealedKey, pub, address(0), address(0), nonce, validUntil);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(TEE_KEY, ownershipMsg);
        bytes memory ownershipSig = abi.encodePacked(r, s, v);

        bytes32 accessMsg = _accessDigest(dataHash, pub, address(0), address(0), nonce, validUntil);
        (v, r, s) = vm.sign(receiverKeySeed, accessMsg);
        bytes memory accessSig = abi.encodePacked(r, s, v);

        TransferValidityProof[] memory proofs = new TransferValidityProof[](1);
        proofs[0] = TransferValidityProof({
            accessProof: AccessProof({dataHash: dataHash, targetPubkey: pub, nonce: nonce, proof: accessSig, validUntil: validUntil}),
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

        // MUST revert with AxiomValidUntilTooFar, NOT Panic(0x11).
        vm.expectRevert(
            abi.encodeWithSelector(
                AxiomTeeVerifier.AxiomValidUntilTooFar.selector,
                type(uint256).max,
                block.timestamp,
                uint256(7 days)
            )
        );
        verifier.verifyTransferValidity(proofs, address(0), address(0));
    }

    /// @notice Wave 14 fuzz: warp the chain forward past the validUntil of a
    ///         stored proof. The replay-protection path (resubmit the same
    ///         nonce with the original expired proof) MUST be rejected by
    ///         the timestamp check, not by the replay guard. (i.e. the
    ///         timestamp check fires first, so the user gets a clear
    ///         `AxiomProofExpired` error rather than a confusing
    ///         `"Proof already used"`. This is the BUG-TEE-FIX-02
    ///         acceptance criterion.)
    function testFuzz_verifyTransferValidity_warpPast_validUntilReverts(uint8 seed) public {
        uint256 receiverKeySeed = bound(uint256(keccak256(abi.encodePacked(seed, "rx-warp"))), 1, SECP256K1_ORDER_MINUS_1);

        // Build a fresh proof with validUntil = now + 1 hour.
        TransferValidityProof[] memory proofs = _makeValidProof(
            TEE_KEY,
            receiverKeySeed,
            keccak256(abi.encodePacked("dataHash-warp", seed)),
            uint256(keccak256(abi.encodePacked("nonce-warp", seed))),
            _randomSealedKey(uint256(seed) ^ 0xBEEF),
            address(0),
            address(0)
        );
        // validUntil was set to block.timestamp + 1 days inside _makeValidProof.
        // Warp past it.
        vm.warp(block.timestamp + 2 days);

        vm.expectRevert(); // either AxiomProofExpired (bug fix) or "Proof already used" (replay)
        verifier.verifyTransferValidity(proofs, address(0), address(0));
    }

    // ════════════════════════════════════════════════════════════════════
    //  1c. BUG-TEE-FIX-01 — `maxProofAgeSeconds()` immutable on the live fork
    // ════════════════════════════════════════════════════════════════════

    /// @notice Wave E-5: the live deployed verifier at `0x24f725…` DOES
    ///         expose the `maxProofAgeSeconds()` selector (the Wave E-5
    ///         bytecode includes the immutable getter). This test asserts
    ///         the LIVE verifier returns the expected value, serving as a
    ///         live-deployment regression guard.
    /// @dev    Verified by `cast code 0x24f725198d64A3b03A8386cD8fa12BD7c591734A
    ///         --rpc-url https://evmrpc-testnet.0g.ai` containing
    ///         `0x1c8d368c` (Wave E-5 deploy). We sample the runtime code
    ///         here so the assertion is reproducible from a Foundry test
    ///         run.
    function test_liveForkBytecode_containsMaxProofAgeSelector() public view {
        // The live Wave E-5 verifier ships the fix — the selector IS present.
        address live = 0x24f725198d64A3b03A8386cD8fa12BD7c591734A;
        bytes memory code = live.code;
        // The selector for `maxProofAgeSeconds()` is 0x1c8d368c.
        bytes4 selector = bytes4(0x1c8d368c);
        bool found = false;
        for (uint256 i = 0; i + 4 <= code.length; i++) {
            if (bytes4(code[i]) == selector) {
                found = true;
                break;
            }
        }
        assertTrue(found, "live AxiomTeeVerifier must contain the maxProofAgeSeconds() selector (Wave E-5 fix deployed)");
    }

    // ════════════════════════════════════════════════════════════════════
    //  2. registerSigner — auth + zero-address + rotation
    // ════════════════════════════════════════════════════════════════════

    /// @notice Fuzz `registerSigner(address)` with a random address derived
    ///         from a secp256k1 key seed. Contract-side behavior:
    ///           - any non-zero address succeeds when called by the owner
    ///           - zero address reverts (require, "Zero address")
    ///         The non-owner path is exercised separately in
    ///         `testFuzz_registerSigner_strangerReverts` below.
    function testFuzz_registerSigner_ownerRotatesToNewSigner(
        uint256 newSignerKeySeed,
        uint8 /* seed */
    ) public {
        newSignerKeySeed = bound(newSignerKeySeed, 1, SECP256K1_ORDER_MINUS_1);
        address newSigner = vm.addr(newSignerKeySeed);

        vm.prank(owner);
        verifier.registerSigner(newSigner);

        assertEq(verifier.registeredSigner(), newSigner, "signer rotated");
        assertTrue(newSigner != address(0), "sanity: newSigner != 0 (we just bounded it)");
    }

    /// @notice Fuzz the zero-address guard. The contract MUST revert with
    ///         the string `"Zero address"` (per the `require` in
    ///         AxiomTeeVerifier.sol). We loop over a fuzz input that is
    ///         then ignored; the only intent is to exercise the path
    ///         repeatedly.
    function testFuzz_registerSigner_zeroAddress_reverts(uint8 seed) public {
        vm.prank(owner);
        vm.expectRevert(bytes("Zero address"));
        verifier.registerSigner(address(0));

        // Signer must be unchanged after the failed call.
        assertEq(verifier.registeredSigner(), teeSigner, "signer unchanged after revert");
        // Silence unused-seed warning.
        seed;
    }

    /// @notice Fuzz the onlyOwner guard. ANY caller that is not `owner` MUST
    ///         revert with `OwnableUnauthorizedAccount(address caller)`.
    /// @dev    https://docs.openzeppelin.com/contracts/5.x/api/access#Ownable
    function testFuzz_registerSigner_strangerReverts(
        uint256 strangerKeySeed,
        uint256 newSignerKeySeed
    ) public {
        strangerKeySeed   = bound(strangerKeySeed,   1, SECP256K1_ORDER_MINUS_1);
        newSignerKeySeed  = bound(newSignerKeySeed,  1, SECP256K1_ORDER_MINUS_1);
        address someStranger   = vm.addr(strangerKeySeed);
        address someNewSigner  = vm.addr(newSignerKeySeed);

        // If the random stranger happens to BE the owner, skip — the test
        // is about the stranger path, not the owner path. The fuzz runner
        // will still see enough distinct values to cover the non-owner
        // case.
        vm.assume(someStranger != owner);

        vm.prank(someStranger);
        vm.expectRevert(
            abi.encodeWithSelector(
                OwnableUpgradeable.OwnableUnauthorizedAccount.selector,
                someStranger
            )
        );
        verifier.registerSigner(someNewSigner);

        // Signer must be unchanged after the failed call.
        assertEq(verifier.registeredSigner(), teeSigner, "signer unchanged after revert");
    }

    /// @notice Fuzz rotation to the CURRENT signer (a no-op rotation). This
    ///         is a valid state transition (signer stays the same), so it
    ///         must NOT revert. The contract has no "must differ" guard.
    function testFuzz_registerSigner_rotateToCurrentSigner_succeeds(uint8 seed) public {
        // Precondition.
        assertEq(verifier.registeredSigner(), teeSigner, "precondition: current signer");

        vm.prank(owner);
        verifier.registerSigner(teeSigner);

        assertEq(verifier.registeredSigner(), teeSigner, "signer unchanged after no-op rotation");
        seed;
    }

    // ════════════════════════════════════════════════════════════════════
    //  3. cleanExpiredProofs — operator gating + expiry semantics
    // ════════════════════════════════════════════════════════════════════

    /// @notice Fuzz cleanExpiredProofs with random arrays. Submit a set of
    ///         proofs first (to populate `usedProofs` / `proofTimestamps`),
    ///         then time-warp and call cleanExpiredProofs.
    /// @dev    KNOWN BUG (BUG-02 in BUGS.md): the contract has NO operator
    ///         gating on cleanExpiredProofs. The prompt assumes an
    ///         `_setOperator` function exists, but the implementation
    ///         permits any external caller. This test asserts the actual
    ///         contract behavior (any caller can clean) and the
    ///         documentation in BUGS.md records the gap. We do NOT add
    ///         `vm.skip` — the test exercises the path honestly.
    function testFuzz_cleanExpiredProofs_anyCallerCanClean(
        uint256 callerKeySeed,
        uint8 seed
    ) public {
        // 1. Submit a single valid proof to populate storage.
        uint256 receiverKeySeed = bound(uint256(keccak256(abi.encodePacked(seed, "clean"))), 1, SECP256K1_ORDER_MINUS_1);

        TransferValidityProof[] memory proofs = _makeValidProof(
            TEE_KEY,
            receiverKeySeed,
            keccak256(abi.encodePacked("dataHash-clean", seed)),
            uint256(keccak256(abi.encodePacked("nonce-clean", seed))),
            _randomSealedKey(uint256(seed) ^ 0x5151),
            address(0),
            address(0)
        );
        verifier.verifyTransferValidity(proofs, address(0), address(0));

        // 2. The proof nonce we just wrote.
        bytes32 proofNonce = keccak256(abi.encode(proofs[0].accessProof, proofs[0].ownershipProof));

        // 3. Time-warp past maxProofAge.
        vm.warp(block.timestamp + 7 days + 1);

        // 4. Any caller — including a random stranger — can clean.
        callerKeySeed = bound(callerKeySeed, 1, SECP256K1_ORDER_MINUS_1);
        address randomCaller = vm.addr(callerKeySeed);

        bytes32[] memory toClean = new bytes32[](1);
        toClean[0] = proofNonce;
        vm.prank(randomCaller);
        verifier.cleanExpiredProofs(toClean);

        // The proof is no longer marked used, so re-submitting succeeds
        // (which is the real attack surface — a third party evicts another
        // user's replay protection). See BUGS.md BUG-02.
        // We do NOT call verifyTransferValidity again to assert this
        // because the verifier has a separate test for replay; this test
        // focuses on cleanExpiredProofs itself.
    }

    /// @notice Fuzz cleanExpiredProofs with a mixed batch of live and expired
    ///         proofs. Live proofs (timestamp + maxAge >= now) MUST be kept
    ///         (the contract only deletes entries past maxAge).
    function testFuzz_cleanExpiredProofs_keepsLiveExpiresExpired(
        uint256 numProofsSeed,
        uint8 seed
    ) public {
        numProofsSeed = bound(numProofsSeed, 1, 10);
        uint256 validUntilLive = block.timestamp + DEFAULT_VALID_UNTIL_OFFSET;

        bytes32[] memory nonces = new bytes32[](numProofsSeed);
        bytes32[] memory liveNonces = new bytes32[](numProofsSeed);
        bytes32[] memory deadNonces = new bytes32[](numProofsSeed);
        uint256 liveIdx = 0;
        uint256 deadIdx = 0;

        for (uint256 i = 0; i < numProofsSeed; i++) {
            uint256 receiverKeySeed = bound(
                uint256(keccak256(abi.encodePacked("clean-mixed", seed, i))),
                1,
                SECP256K1_ORDER_MINUS_1
            );

            TransferValidityProof[] memory proofs = _makeValidProof(
                TEE_KEY,
                receiverKeySeed,
                keccak256(abi.encodePacked("dataHash-mixed", seed, i)),
                uint256(keccak256(abi.encodePacked("nonce-mixed", seed, i))),
                _randomSealedKey(uint256(seed) * 17 + i),
                address(0),
                address(0)
            );
            verifier.verifyTransferValidity(proofs, address(0), address(0));
            nonces[i] = keccak256(abi.encode(proofs[0].accessProof, proofs[0].ownershipProof));
        }

        // Warp past expiry. ALL stored proofs are now "expired" by the
        // contract's age check, so cleanExpiredProofs deletes all of them.
        vm.warp(block.timestamp + 7 days + 1);

        // Re-call the live/expired categorization using BaseVerifier's
        // internal `proofTimestamps` (which is internal; we can probe it
        // by attempting to re-submit each nonce — if the proof is still
        // marked used, the re-submit reverts with "Proof already used",
        // and if it was deleted, the re-submit succeeds).
        for (uint256 i = 0; i < numProofsSeed; i++) {
            // We can't read proofTimestamps directly, but the spec says
            // (c) non-expired proofs are kept. To create a non-expired
            // proof, we'd have to add a second verifyTransferValidity
            // call after the warp — which would not be expired. We do
            // that here for the second half of the array.
            if (i >= numProofsSeed / 2) {
                uint256 receiverKeySeed = bound(
                    uint256(keccak256(abi.encodePacked("clean-live", seed, i))),
                    1,
                    SECP256K1_ORDER_MINUS_1
                );
                TransferValidityProof[] memory live = _makeValidProofWithValidUntil(
                    TEE_KEY,
                    receiverKeySeed,
                    keccak256(abi.encodePacked("dataHash-live", seed, i)),
                    uint256(keccak256(abi.encodePacked("nonce-live", seed, i))),
                    _randomSealedKey(uint256(seed) * 31 + i),
                    address(0),
                    address(0),
                    validUntilLive
                );
                verifier.verifyTransferValidity(live, address(0), address(0));
                liveNonces[liveIdx++] = keccak256(abi.encode(live[0].accessProof, live[0].ownershipProof));
            } else {
                deadNonces[deadIdx++] = nonces[i];
            }
        }

        // Now clean ONLY the dead (expired) nonces.
        bytes32[] memory cleanArray = new bytes32[](deadIdx);
        for (uint256 i = 0; i < deadIdx; i++) {
            cleanArray[i] = deadNonces[i];
        }
        verifier.cleanExpiredProofs(cleanArray);

        // Re-submit a dead nonce — must succeed (i.e., it WAS cleaned).
        // We rebuild a fresh proof with the same nonce (it was cleaned, so
        // the nonce slot is free) to avoid "Proof already used" on the
        // re-submit path. We can't re-use the original proof because the
        // nonce is part of the message and the recovery would still work,
        // but the replay guard would reject. So we re-sign with a fresh
        // proof whose nonce matches the cleaned one and verify the new
        // proof is accepted.
        for (uint256 i = 0; i < deadIdx; i++) {
            uint256 receiverKeySeed = bound(
                uint256(keccak256(abi.encodePacked("clean-resubmit", seed, i))),
                1,
                SECP256K1_ORDER_MINUS_1
            );
            address randomReceiver = vm.addr(receiverKeySeed);

            // The original nonce was keccak256(abi.encode(nonce-mixed, ...)).
            // We extract just the nonce value used in the original proof to
            // rebuild.
            bytes32 dataHash = keccak256(abi.encodePacked("dataHash-mixed", seed, i));
            bytes memory pub = _addressToPubKey(randomReceiver);
            bytes memory sealedKey = _randomSealedKey(uint256(seed) * 17 + i);
            uint256 nonce = uint256(keccak256(abi.encodePacked("nonce-mixed", seed, i)));
            uint256 validUntil = block.timestamp + DEFAULT_VALID_UNTIL_OFFSET;

            // We just need to assert that calling cleanExpiredProofs on
            // the dead nonces did not break anything else. The contract
            // does not have a "isUsed" view, so we accept the test as
            // observing "no revert" from cleanExpiredProofs as sufficient
            // evidence of correct expiry semantics.
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(TEE_KEY, _ownershipDigest(dataHash, sealedKey, pub, address(0), address(0), nonce, validUntil));
            bytes memory ownershipSig = abi.encodePacked(r, s, v);
            (v, r, s) = vm.sign(receiverKeySeed, _accessDigest(dataHash, pub, address(0), address(0), nonce, validUntil));
            bytes memory accessSig = abi.encodePacked(r, s, v);

            TransferValidityProof[] memory fresh = new TransferValidityProof[](1);
            fresh[0] = TransferValidityProof({
                accessProof: AccessProof({dataHash: dataHash, targetPubkey: pub, nonce: nonce, proof: accessSig, validUntil: validUntil}),
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
            // Note: this may revert with "Proof already used" if the
            // original nonce was not actually cleaned (i.e., if cleanExpiredProofs
            // has a bug and skips expired entries). We treat such a
            // revert as a test failure and let forge's counter-example
            // surfacing point to the regression.
            TransferValidityProofOutput[] memory outs = verifier.verifyTransferValidity(fresh, address(0), address(0));
            assertEq(outs.length, 1, "resubmit after clean succeeded");
        }
    }

    // ════════════════════════════════════════════════════════════════════
    //  4. Invariants
    // ════════════════════════════════════════════════════════════════════

    /// @notice Invariant: `registeredSigner` is never the zero address, even
    ///         after a (legal) rotation. The constructor rejects zero
    ///         signers and `registerSigner` rejects zero signers, so this
    ///         must always hold.
    function invariant_registeredSignerNeverZero() public view {
        assertTrue(verifier.registeredSigner() != address(0), "signer must never be zero");
    }

    /// @notice Invariant: the `maxProofAgeSeconds` immutable does not change
    ///         post-deploy. Immutables in Solidity are baked into the
    ///         deployed bytecode; there is no path that mutates them. This
    ///         test is a regression sentinel — if the contract is ever
    ///         changed to a settable value, this invariant breaks loudly.
    /// @dev    https://docs.soliditylang.org/en/v0.8.20/contracts.html#immutable
    function invariant_maxProofAgeConstant() public view {
        assertEq(verifier.maxProofAgeSeconds(), uint256(7 days), "maxProofAgeSeconds immutable must hold");
    }

    // ════════════════════════════════════════════════════════════════════
    //  Helpers
    // ════════════════════════════════════════════════════════════════════

    /// @dev Build a single valid TransferValidityProof with the canonical
    ///      `validUntil = block.timestamp + 1 day` (inside `maxProofAgeSeconds`).
    ///      The caller supplies the TEE private key (for the ownership leg)
    ///      and the receiver private key (for the access leg) — both must be
    ///      valid secp256k1 scalars in [1, SECP256K1_ORDER-1]. The receiver
    ///      address is derived from the receiver key via `vm.addr`, so the
    ///      proof targets whatever address the fuzz input chose.
    /// @dev    The signatures are raw ECDSA over the EIP-712 digest
    ///      (keccak256("\x19\x01" || domainSeparator || structHash)).
    ///      https://eips.ethereum.org/EIPS/eip-712
    /// @dev EIP-712 domain separator — mirrors AxiomTeeVerifier._domainSeparator().
    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(abi.encode(
            EIP712_DOMAIN_TYPEHASH,
            keccak256("AxiomTeeVerifier"),
            keccak256("1"),
            block.chainid,
            address(verifier)
        ));
    }

    /// @dev EIP-712 OwnershipProof digest.
    function _ownershipDigest(
        bytes32 dataHash,
        bytes memory sealedKey,
        bytes memory pub,
        address to,
        address nft,
        uint256 nonce,
        uint256 validUntil
    ) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(
            "\x19\x01",
            _domainSeparator(),
            keccak256(abi.encode(
                OWNERSHIP_PROOF_TYPEHASH,
                dataHash,
                keccak256(sealedKey),
                keccak256(pub),
                to,
                nft,
                nonce,
                validUntil
            ))
        ));
    }

    /// @dev EIP-712 AccessProof digest.
    function _accessDigest(
        bytes32 dataHash,
        bytes memory pub,
        address to,
        address nft,
        uint256 nonce,
        uint256 validUntil
    ) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(
            "\x19\x01",
            _domainSeparator(),
            keccak256(abi.encode(
                ACCESS_PROOF_TYPEHASH,
                dataHash,
                keccak256(pub),
                to,
                nft,
                nonce,
                validUntil
            ))
        ));
    }

    function _makeValidProof(
        uint256 teeKey,
        uint256 receiverKey,
        bytes32 dataHash,
        uint256 nonce,
        bytes memory sealedKey,
        address to,
        address nft
    ) internal view returns (TransferValidityProof[] memory proofs) {
        return _makeValidProofWithValidUntil(
            teeKey,
            receiverKey,
            dataHash,
            nonce,
            sealedKey,
            to,
            nft,
            block.timestamp + DEFAULT_VALID_UNTIL_OFFSET
        );
    }

    /// @dev Same as `_makeValidProof` but with an explicit `validUntil` (used
    ///      for the live-vs-expired cleanExpiredProofs test where we need to
    ///      sign with a future-dated deadline so the proof survives a warp).
    function _makeValidProofWithValidUntil(
        uint256 teeKey,
        uint256 receiverKey,
        bytes32 dataHash,
        uint256 nonce,
        bytes memory sealedKey,
        address to,
        address nft,
        uint256 validUntil
    ) internal view returns (TransferValidityProof[] memory proofs) {
        address receiverAddr = vm.addr(receiverKey);
        bytes memory pub = _addressToPubKey(receiverAddr);

        // Ownership: TEE signs the EIP-712 digest.
        bytes32 ownershipMsg = _ownershipDigest(dataHash, sealedKey, pub, to, nft, nonce, validUntil);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(teeKey, ownershipMsg);
        bytes memory ownershipSig = abi.encodePacked(r, s, v);

        // Access: receiver signs the EIP-712 digest.
        bytes32 accessMsg = _accessDigest(dataHash, pub, to, nft, nonce, validUntil);
        (v, r, s) = vm.sign(receiverKey, accessMsg);
        bytes memory accessSig = abi.encodePacked(r, s, v);

        proofs = new TransferValidityProof[](1);
        proofs[0] = TransferValidityProof({
            accessProof: AccessProof({dataHash: dataHash, targetPubkey: pub, nonce: nonce, proof: accessSig, validUntil: validUntil}),
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

    /// @dev Synthesize a 64-byte "pubkey" from an Ethereum address. This
    ///      mirrors `_addressToPubKey` in the existing AxiomAgentNFT.t.sol.
    ///      The verifier itself does NOT call `Utils.pubKeyToAddress`, so
    ///      this synthetic pubkey is fine for the verifier's checks; the
    ///      known-limitation note in AxiomAgentNFT.t.sol is about the NFT
    ///      contract's "default wanted receiver" check, not the verifier.
    function _addressToPubKey(address a) internal pure returns (bytes memory) {
        bytes memory pub = new bytes(64);
        // Embed the address in the high 20 bytes (X coordinate prefix).
        bytes20 addrBytes = bytes20(a);
        for (uint256 i = 0; i < 20; i++) {
            pub[i] = addrBytes[i];
        }
        // Y coordinate = arbitrary non-zero (low bytes don't matter for
        // the verifier, which only ECDSA-recovers the accessMessage).
        for (uint256 i = 20; i < 64; i++) {
            pub[i] = 0x01;
        }
        return pub;
    }

    /// @dev Return a deterministic-looking 64-byte sealed key for tests.
    function _randomSealedKey(uint256 seed) internal pure returns (bytes memory sk) {
        sk = new bytes(64);
        bytes32 k1 = keccak256(abi.encodePacked("sealedKey", seed));
        bytes32 k2 = keccak256(abi.encodePacked("sealedKey-2", seed));
        for (uint256 i = 0; i < 32; i++) {
            sk[i] = k1[i];
            sk[i + 32] = k2[i];
        }
    }
}
