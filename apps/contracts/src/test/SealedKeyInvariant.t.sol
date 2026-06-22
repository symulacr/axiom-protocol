// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AxiomAgentNFT} from "../AxiomAgentNFT.sol";
import {AxiomTeeVerifier} from "../verifiers/AxiomTeeVerifier.sol";
import {
    TransferValidityProof,
    AccessProof,
    OwnershipProof,
    OracleType,
    TransferValidityProofOutput
} from "../interfaces/IERC7857DataVerifier.sol";

/// @title  SealedKeyInvariant.t.sol
/// @notice Wave 6B invariant-style regression suite for the 7-day
///         Exercises the LIVE AxiomAgentNFT proxy at `0xf12F15…` and
///         the LIVE v2 AxiomTeeVerifier at `0x24f725…` on 0G Galileo
///         testnet.
/// @dev    Invariant being proven:
///           For every `tokenId` whose current owner was set by a
///           successful `iTransferFrom`, the owner's ability to decrypt
///           the agent's private metadata is bound to a `sealedKey`
///           that the TEE re-issues, with the next 7 days enforced by
///           `maxProofAgeSeconds = 7 days` on the LIVE v2 verifier
///           (verified by `cast call` 2026-06-15:
///           `maxProofAgeSeconds() == 604_800`).
///         The 7-day re-seal window is a PROTOCOL-LEVEL invariant: the
///         contract does not (and MUST not) expose a `setSealedKey`
///         function — the only way for a new owner to obtain a fresh
///         `sealedKey` is to re-engage the TEE oracle via
///         `iTransferFrom` / `iCloneFrom`, which the LIVE v2 verifier
///         will only honor if (a) the TEE produced a new signed
///         `OwnershipProof` with `validUntil <= now + 7d`, and (b) the
///         proof's nonce is not in the `usedProofs` map.
///
///         On-chain corollaries pinned by this file (5 tests):
///           (1) The LIVE proxy's `verifier()` pointer is exactly the
///               LIVE v2 verifier (anti-rotation, anti-shadow).
///           (2) A forged `(dataHash, sealedKey)` pair is rejected by
///               the LIVE v2 verifier with `AxiomInvalidOwnershipProof`
///               (re-asserts Wave 5B's regression sentinel from a
///               different angle: the `sealedKey` is the payload, not
///               the signature).
///           (3) The LIVE v2 verifier's `TransferValidityProofOutput`
///               faithfully preserves the TEE-signed `sealedKey`
///               byte-for-byte — the on-chain receipt the NFT contract
///               then re-emits via `PublishedSealedKey`.
///           (4) The LIVE v2 verifier's `usedProofs` map forces
///               re-seal: a second `verifyTransferValidity` call with
///               the same proof reverts with "Proof already used". This
///               is the structural on-chain mechanism that prevents
///               stale `sealedKey`s from "riding" a second transfer.
///           (5) Three boundary cases for the 7-day `validUntil`
///               window: inside (accepted), exactly at `now + 7d`
///               (boundary, accepted), and one second past
///               (rejected with `AxiomValidUntilTooFar`).
///
///         Why a SEPARATE file from V12C3ValidUntil.t.sol:
///           - V12C3ValidUntil.t.sol (Wave 5B) is a 5-test
///             deterministic regression on the verifier alone, no
///             proxy interaction.
///           - This file is a 5-test deterministic regression +
///             proxy-wiring complement that closes the cross-layer
///             invariant: the verifier accepts a `sealedKey` payload,
///             the on-chain contract emits it as `PublishedSealedKey`,
///             and the only way to obtain a NEW one is to re-engage
///             the verifier with a fresh `sealedKey`.
///
///         Why NO proxy-level `iTransferFrom` test:
///           - `ERC7857Upgradeable._proofCheck` (line 107-110) requires
///             `Utils.pubKeyToAddress(targetPubkey) == to`. Synthesizing
///             a secp256k1 pubkey whose `keccak256(pubkey)[12:32]`
///             matches a target address is a secp256k1 point-recovery
///             problem; Foundry 0.8.20 has no `vm.publicKeySecp256k1`
///             cheatcode (only P-256 and Ed25519). This is the same
///             "KNOWN LIMITATION" documented in
///             `test/AxiomAgentNFT.t.sol:60-64`.
///           - The invariant is therefore exercised at the verifier
///             level (the structural core: signature, sealedKey,
///             validUntil window, replay protection), which is the
///             LIVE bytecode that real transfers hit.
///
///         Why NO fuzz test (5 deterministic tests, not 4+1 fuzz):
///           - An earlier fuzz form hit a public-RPC archive gap on
///             the verifier's `usedProofs` map at storage slots the
///             non-archive node doesn't carry (same pre-existing
///             issue Wave 5B documented at
///             `wave5-b-validuntil-v0.md:172-178`).
///           - The 3-test boundary sweep (inside / at / past) pins
///             the invariant just as rigorously for the 7-day window
///             and avoids the archive gap. The 7-day re-seal window
///             is a single uniform rule, not a property that needs
///             many random samples to expose.
///
///         Foundry forge-std cheatcodes used:
///           - `vm.createSelectFork(string url)`: live Galileo fork at
///             `latest` (consistent with Wave 5B's working pattern).
///             https://book.getfoundry.sh/forge/fork-testing
///           - `vm.warp(uint256 newTimestamp)`:
///             https://book.getfoundry.sh/forge/cheatcodes#warp
///           - `vm.sign(uint256 privKey, bytes32 digest)`:
///             https://book.getfoundry.sh/forge/cheatcodes#sign
///           - `vm.expectRevert(bytes4 | bytes)`:
///             https://book.getfoundry.sh/forge/cheatcodes#expect-revert
///
///         Canonical sources (EIP-721, EIP-712, EIP-7857, 0g-agent-skills):
///           - https://eips.ethereum.org/EIPS/eip-721  (token ownership,
///             transfer event; the canonical `ownerOf` getter that the
///             oracle consults in `/v1/ownership`)
///           - https://eips.ethereum.org/EIPS/eip-712  (typed-data
///             `validUntil` deadline; the verifier signs
///             `keccak256(dataHash, sealedKey, targetPubkey, nonce, validUntil)`)
///           - https://eips.ethereum.org/EIPS/eip-7857  (iNFT; the
///             `sealedKey` is the new DEK encrypted for the receiver,
///             and the agent SKILL specifies a 7-day / 604_800-second
///             re-seal window)
///           - /tmp/0g-agent-skills/skills/agent-nft-lifecycle/SKILL.md
///             (the "Transfer" step: the receiver decrypts the
///             `sealedKey` with their private key to claim ownership)
///           - https://docs.0g.ai/developer-hub/testnet/testnet-overview
///             (Galileo testnet chainId 16602, RPC URL)
///           - https://docs.0g.ai/developer-hub/building-on-0g/agentic-id/erc7857
///             (canonical 0G re-seal pattern; 7-day expiry is the
///             default `maxProofAgeSeconds` in the reference
///             `AxiomTeeVerifier`)
///
///         Fork block: `latest` (no explicit blockNumber), consistent
///         with Wave 5B's working pattern. The live proxy and live
///         verifier bytecode is the same at every block >= their
///         deployment. The `setUp()` asserts
///         `verifier() == LIVE_VERIFIER_V2` and
///         `maxProofAgeSeconds() == 7 days` to catch any silent
///         rotation.
contract SealedKeyInvariantTest is Test {
    // ─── Live fork (0G Galileo testnet, chainId 16602) ────────────────
    string internal constant GALILEO_RPC = "https://evmrpc-testnet.0g.ai";
    uint256 internal constant GALILEO_CHAIN_ID = 16_602;

    // The LIVE v2 AxiomTeeVerifier deployment. Verified 2026-06-16 (Wave E-5):
    //   `cast call 0x24f725… "registeredSigner()(address)"` -> 0x4373…F91
    //   `cast call 0x24f725… "maxProofAgeSeconds()(uint256)"` -> 604800 (7 days)
    // Reference for the constant: EIP-7857 Security Considerations
    //   https://eips.ethereum.org/EIPS/eip-7857
    //   ("replay-protected, time-bounded, 7-day proof window")
    address internal constant LIVE_VERIFIER_V2 = 0x24f725198d64A3b03A8386cD8fa12BD7c591734A;

    // The LIVE ERC-1967 proxy for AxiomAgentNFT. Verified 2026-06-16 (Wave E-5):
    //   `cast call 0xf12F15… "verifier()(address)"` -> 0x24f725… (v2)
    //   `cast call 0xf12F15… "ownerOf(uint256)(address)" 1` -> 0x8450…E239
    address internal constant LIVE_NFT_PROXY = 0xf12F158a20c36a351b056FD60b3a7377ce4F1e09;

    // The LIVE registered TEE signer (operator wallet from
    // `wallets/ADDRESSES.md` line 25). The matching private key is the
    // canonical `TEE_SIGNER_KEY` below, used only via `vm.sign` so the
    // secret never appears in a static signature blob.
    //   https://book.getfoundry.sh/forge/cheatcodes#sign
    address internal constant LIVE_TEE_SIGNER = 0x437371dB1FBD534Bd01BD3f4E66DfA1675952F91;
    // TEE_SIGNER_KEY read from env var in setUp() via vm.envUint.
    uint256 internal TEE_SIGNER_KEY;

    // 7 days in seconds — the canonical re-seal window baked into the
    // LIVE v2 verifier's `maxProofAgeSeconds` immutable. Per the
    // 0g-agent-nft reference and the agent-nft-lifecycle SKILL, this
    // is the re-seal deadline: a new owner who does not engage the
    // TEE oracle within 7 days loses the ability to re-sign proofs
    // and must start over by re-running the TEE re-encryption
    // handshake.
    uint256 internal constant RESEAL_WINDOW_SECONDS = 7 days;

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

    // Private key for the receiver. Deterministic; derived from
    // `vm.addr(BOB_KEY)`. Inside the secp256k1 group order minus 1
    // so ECDSA.recover never returns the point at infinity
    // (address(0)). Per OpenZeppelin ECDSA docs:
    //   https://docs.openzeppelin.com/contracts/5.x/utils/cryptography#ECDSA
    uint256 internal constant BOB_KEY = 0xB0B_B0B_B0B_B0B_B0B_B0B_B0B_B0B_B0B_B0B_B0B_B0B;

    // ─── Fixture ──────────────────────────────────────────────────────
    AxiomAgentNFT    internal nft;
    AxiomTeeVerifier internal verifier;
    address          internal bob;
    bytes            internal bobPub;
    uint256          internal forkId;

    function setUp() public {
        // 0. Read private key from env var (never hardcoded in source).
        TEE_SIGNER_KEY = vm.envUint("AXIOM_TEE_SIGNER_PK");

        // 1. Select the live Galileo fork at `latest` (no explicit
        //    blockNumber; see file header for the rationale).
        forkId = vm.createSelectFork(GALILEO_RPC);
        assertEq(block.chainid, GALILEO_CHAIN_ID, "Galileo testnet (chainId 16602)");

        // 2. Bind to the LIVE proxy + LIVE v2 verifier. We
        //    deliberately use the bind-by-address form (no deploy
        //    bytecode) — the whole point of the invariant test is to
        //    exercise the on-chain bytecode that real transfers hit.
        nft = AxiomAgentNFT(LIVE_NFT_PROXY);
        verifier = AxiomTeeVerifier(LIVE_VERIFIER_V2);

        // 3. Sanity assertions against the live bytecode / state. A
        //    test that silently runs against a stale or rotated
        //    signer is worse than no test at all.
        assertEq(address(nft.verifier()), address(verifier), "live proxy wired to v2 verifier");
        assertEq(verifier.registeredSigner(), LIVE_TEE_SIGNER, "live registered signer");
        assertEq(verifier.maxProofAgeSeconds(), RESEAL_WINDOW_SECONDS, "maxProofAgeSeconds == 7d");

        // 4. Derive the receiver fixture.
        bob = vm.addr(BOB_KEY);
        bobPub = _addressToPubKey(bob);
    }

    // ════════════════════════════════════════════════════════════════════
    //  Invariant 1 — The LIVE proxy is wired to the LIVE v2 verifier
    // ════════════════════════════════════════════════════════════════════

    /// @notice The on-chain `verifier()` pointer on the LIVE proxy
    ///         MUST point at the LIVE v2 verifier. If a deployer
    ///         silently rotated the pointer (e.g. back to v1) the
    ///         7-day `maxProofAgeSeconds` invariant would silently
    ///         weaken (v1's `maxProofAgeSeconds` was the same value,
    ///         but the error path was the older `require`-based
    ///         string revert, not the v2 custom error). Pin the
    ///         wiring.
    function test_invariant_proxyWiredToV2() public view {
        assertEq(address(nft.verifier()), LIVE_VERIFIER_V2, "LIVE proxy -> LIVE v2 verifier");
        assertEq(verifier.maxProofAgeSeconds(), RESEAL_WINDOW_SECONDS, "7-day re-seal window");
    }

    // ════════════════════════════════════════════════════════════════════
    //  Invariant 2 — A forged (dataHash, sealedKey) pair is rejected
    // ════════════════════════════════════════════════════════════════════

    /// @notice A caller who substitutes a forged `sealedKey` into a
    ///         `validUntil`+`nonce` pair that the TEE did NOT sign
    ///         MUST be rejected with `AxiomInvalidOwnershipProof`.
    ///         This is the on-chain half of the agent-nft-lifecycle
    ///         SKILL "Transfer" step: the receiver can only decrypt
    ///         the metadata behind `sealedKey` if the TEE actually
    ///         issued it. A forged sealedKey is structurally
    ///         indistinguishable from a real one to a caller, but the
    ///         v2 verifier's `ecrecover` over the OwnershipProof
    ///         message hash returns a different signer and reverts.
    /// @dev    Re-asserts Wave 5B's regression sentinel from a
    ///         different angle: Wave 5B fuzzes the `validUntil`
    ///         timestamp gate; this test exercises the `sealedKey`
    ///         payload (the actual encrypted DEK).
    function test_forgedSealedKey_reverts() public {
        uint256 validUntil = block.timestamp + 1 days;
        uint256 nonce = 1;

        bytes32 realDataHash = keccak256("SealedKeyInvariant-real-dataHash");
        bytes memory realSealedKey = _deterministicSealedKey(uint256(realDataHash));
        bytes memory forgedSealedKey = _deterministicSealedKey(uint256(realDataHash) ^ 0xDEADBEEF);
        bytes memory pub = _addressToPubKey(bob);

        // 1. TEE signs the REAL (dataHash, sealedKey) pair. The
        //    forgery swaps `sealedKey` to the forged one, breaking
        //    the binding the TEE attested to. The verifier recovers
        //    a different signer (or the same signer over a different
        //    hash) and reverts.
        bytes32 ownershipMsg = _ownershipDigest(realDataHash, realSealedKey, pub, address(0), address(0), nonce, validUntil);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(TEE_SIGNER_KEY, ownershipMsg);
        bytes memory ownershipSig = abi.encodePacked(r, s, v);

        bytes32 accessMsg = _accessDigest(realDataHash, pub, address(0), address(0), nonce, validUntil);
        (v, r, s) = vm.sign(BOB_KEY, accessMsg);
        bytes memory accessSig = abi.encodePacked(r, s, v);

        TransferValidityProof[] memory proofs = new TransferValidityProof[](1);
        proofs[0] = TransferValidityProof({
            accessProof: AccessProof({
                dataHash: realDataHash,
                targetPubkey: pub,
                nonce: nonce,
                proof: accessSig,
                validUntil: validUntil
            }),
            ownershipProof: OwnershipProof({
                oracleType: OracleType.TEE,
                dataHash: realDataHash,
                sealedKey: forgedSealedKey, // <-- FORGED
                targetPubkey: pub,
                nonce: nonce,
                proof: ownershipSig,
                validUntil: validUntil
            })
        });

        vm.expectRevert(AxiomTeeVerifier.AxiomInvalidOwnershipProof.selector);
        verifier.verifyTransferValidity(proofs, address(0), address(0));
    }

    // ════════════════════════════════════════════════════════════════════
    //  Invariant 3 — The verifier output preserves the TEE-signed
    //                 sealedKey byte-for-byte
    // ════════════════════════════════════════════════════════════════════

    /// @notice The LIVE v2 verifier's
    ///         `TransferValidityProofOutput` MUST preserve the
    ///         TEE-signed `sealedKey` byte-for-byte in its
    ///         `sealedKey` field. This is the on-chain receipt chain:
    ///         TEE -> verifier -> `sealedKeys[]` returned from
    ///         `_proofCheck` -> emitted as `PublishedSealedKey`. Any
    ///         truncation, padding, or hashing would silently
    ///         corrupt the receiver's ability to decrypt.
    function test_verifierOutput_preservesSealedKey() public {
        uint256 nonce = 100;
        uint256 validUntil = block.timestamp + 60;
        bytes32 dataHash = keccak256(abi.encode("SealedKeyInvariant-preserve-dataHash", nonce));
        bytes memory sealedKey = _deterministicSealedKey(uint256(dataHash));
        bytes memory pub = _addressToPubKey(bob);

        TransferValidityProof[] memory proofs = _signProof(nonce, validUntil, dataHash, sealedKey, pub, address(0), address(0));
        TransferValidityProofOutput[] memory outs = verifier.verifyTransferValidity(proofs, address(0), address(0));
        assertEq(outs.length, 1, "exactly one output");
        assertEq(outs[0].sealedKey.length, sealedKey.length, "sealedKey length preserved");
        assertEq(keccak256(outs[0].sealedKey), keccak256(sealedKey), "sealedKey bytes preserved end-to-end");
    }

    // ════════════════════════════════════════════════════════════════════
    //  Invariant 4 — Replay protection forces re-seal
    //  (this is the on-chain mechanism that prevents stale sealedKeys
    //   from riding a second transfer)
    // ════════════════════════════════════════════════════════════════════

    /// @notice A receiver who holds a `sealedKey` from a prior
    ///         transfer CANNOT reuse it for a second transfer. The
    ///         LIVE v2 verifier's `usedProofs` mapping
    ///         (BaseVerifier:11) marks every consumed proof nonce as
    ///         used, and `_checkAndMarkProof` reverts on the second
    ///         consumption. This is the on-chain mechanism that
    ///         structurally forces the new owner to re-engage the
    ///         TEE oracle to obtain a fresh `sealedKey`
    ///         (re-encrypted for the next receiver's pubkey) — there
    ///         is no path for a stale sealedKey to "ride" a second
    ///         transfer.
    function test_replayProtection_forcesReseal() public {
        uint256 nonce = 200;
        uint256 validUntil = block.timestamp + 60;
        bytes32 dataHash = keccak256(abi.encode("SealedKeyInvariant-replay-dataHash", nonce));
        bytes memory sealedKey = _deterministicSealedKey(uint256(dataHash) ^ nonce);
        bytes memory pub = _addressToPubKey(bob);

        TransferValidityProof[] memory proofs = _signProof(nonce, validUntil, dataHash, sealedKey, pub, address(0), address(0));

        // First call: consumes the proof nonce.
        TransferValidityProofOutput[] memory outs = verifier.verifyTransferValidity(proofs, address(0), address(0));
        assertEq(outs.length, 1, "first call: 1 output");

        // Second call: reverts on the v2 verifier's `usedProofs` map.
        vm.expectRevert(bytes("Proof already used"));
        verifier.verifyTransferValidity(proofs, address(0), address(0));
    }

    // ════════════════════════════════════════════════════════════════════
    //  Invariant 5 — Three boundary cases for the 7-day validUntil
    //                window: inside, at the boundary, just past.
    // ════════════════════════════════════════════════════════════════════

    /// @notice A signed `validUntil` well inside the 7-day
    ///         `maxProofAgeSeconds` window MUST be accepted (the
    ///         receiver has time to re-seal).
    function test_validUntilInsideWindow_succeeds() public {
        vm.warp(1_700_000_000);
        uint256 nonce = 1_001;
        uint256 validUntil = block.timestamp + 1 days;
        TransferValidityProof[] memory proofs = _buildSignedProof(nonce, validUntil);
        TransferValidityProofOutput[] memory outs = verifier.verifyTransferValidity(proofs, address(0), address(0));
        assertEq(outs.length, 1, "inside window: 1 output");
    }

    /// @notice Boundary case: `validUntil == now + 7d` (the max) is
    ///         accepted (the `validUntil - now > maxAge` check at
    ///         AxiomTeeVerifier.sol:231 is strict greater-than, so
    ///         equality passes).
    function test_validUntilAt7dBoundary_succeeds() public {
        vm.warp(1_700_000_000);
        uint256 nonce = 2_002;
        uint256 validUntil = block.timestamp + RESEAL_WINDOW_SECONDS;
        TransferValidityProof[] memory proofs = _buildSignedProof(nonce, validUntil);
        TransferValidityProofOutput[] memory outs = verifier.verifyTransferValidity(proofs, address(0), address(0));
        assertEq(outs.length, 1, "at 7d boundary: 1 output");
    }

    /// @notice Boundary case: `validUntil == now + 7d + 1` is
    ///         rejected with `AxiomValidUntilTooFar` (one second
    ///         past the max-proof-age window).
    function test_validUntilJustPast7d_reverts() public {
        vm.warp(1_700_000_000);
        uint256 nonce = 3_003;
        uint256 validUntil = block.timestamp + RESEAL_WINDOW_SECONDS + 1;
        TransferValidityProof[] memory proofs = _buildSignedProof(nonce, validUntil);
        vm.expectRevert(
            abi.encodeWithSelector(
                AxiomTeeVerifier.AxiomValidUntilTooFar.selector,
                validUntil,
                block.timestamp,
                RESEAL_WINDOW_SECONDS
            )
        );
        verifier.verifyTransferValidity(proofs, address(0), address(0));
    }

    // ════════════════════════════════════════════════════════════════════
    //  Helpers
    // ════════════════════════════════════════════════════════════════════

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
        address nftAddr,
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
                nftAddr,
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
        address nftAddr,
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
                nftAddr,
                nonce,
                validUntil
            ))
        ));
    }

    /// @dev Build a TransferValidityProof with a caller-supplied
    ///      `nonce`, `validUntil`, `dataHash`, `sealedKey`, `pubkey`,
    ///      `to`, and `nft`. Signatures are produced with `vm.sign`
    ///      (the canonical Foundry cheatcode for EIP-191 secp256k1
    ///      signatures, per
    ///      https://book.getfoundry.sh/forge/cheatcodes#sign).
    function _signProof(
        uint256 nonce,
        uint256 validUntil,
        bytes32 dataHash,
        bytes memory sealedKey,
        bytes memory pub,
        address to,
        address nft
    ) internal view returns (TransferValidityProof[] memory proofs) {
        bytes32 ownershipMsg = _ownershipDigest(dataHash, sealedKey, pub, to, nft, nonce, validUntil);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(TEE_SIGNER_KEY, ownershipMsg);
        bytes memory ownershipSig = abi.encodePacked(r, s, v);

        bytes32 accessMsg = _accessDigest(dataHash, pub, to, nft, nonce, validUntil);
        (v, r, s) = vm.sign(BOB_KEY, accessMsg);
        bytes memory accessSig = abi.encodePacked(r, s, v);

        proofs = new TransferValidityProof[](1);
        proofs[0] = TransferValidityProof({
            accessProof: AccessProof({
                dataHash: dataHash,
                targetPubkey: pub,
                nonce: nonce,
                proof: accessSig,
                validUntil: validUntil
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

    /// @dev Build a TransferValidityProof with default `dataHash` and
    ///      `sealedKey` derived from the nonce. Used by the boundary
    ///      tests (5a, 5b, 5c) which only care about `validUntil`.
    function _buildSignedProof(
        uint256 nonce,
        uint256 validUntil
    ) internal view returns (TransferValidityProof[] memory) {
        bytes32 dataHash = keccak256(abi.encode("SealedKeyInvariant-dataHash", nonce));
        bytes memory sealedKey = _deterministicSealedKey(nonce);
        bytes memory pub = _addressToPubKey(bob);
        return _signProof(nonce, validUntil, dataHash, sealedKey, pub, address(0), address(0));
    }

    /// @dev Synthesize a 64-byte "pubkey" from an Ethereum address. The
    ///      verifier's `_recoverSigner` only ECDSA-recovers the access
    ///      message, so the synthetic pubkey's exact curve-point shape
    ///      is irrelevant for the verifier path; the high 20 bytes
    ///      embed the receiver address so downstream consumers (the
    ///      NFT contract) that later call `Utils.pubKeyToAddress` get
    ///      a deterministic value.
    function _addressToPubKey(address a) internal pure returns (bytes memory) {
        bytes memory pub = new bytes(64);
        bytes20 addrBytes = bytes20(a);
        for (uint256 i = 0; i < 20; i++) {
            pub[i]      = addrBytes[i];
            pub[44 + i] = addrBytes[i];
        }
        return pub;
    }

    /// @dev Return a deterministic-looking 64-byte sealed key (a DEK
    ///      encrypted for the receiver's pubkey, in production). For
    ///      tests, the bytes content only needs to round-trip through
    ///      the verifier output struct; the actual ECIES decryption
    ///      is exercised by the off-chain oracle.
    function _deterministicSealedKey(uint256 seed) internal pure returns (bytes memory sk) {
        sk = new bytes(64);
        bytes32 k1 = keccak256(abi.encodePacked("SealedKeyInvariant-sealedKey-1", seed));
        bytes32 k2 = keccak256(abi.encodePacked("SealedKeyInvariant-sealedKey-2", seed));
        for (uint256 i = 0; i < 32; i++) {
            sk[i]      = k1[i];
            sk[i + 32] = k2[i];
        }
    }
}
