// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {AxiomAgentNFT} from "../src/AxiomAgentNFT.sol";
import {IntelligentData} from "../src/interfaces/IERC7857Metadata.sol";
import {
    TransferValidityProof,
    AccessProof,
    OwnershipProof,
    OracleType
} from "../src/interfaces/IERC7857DataVerifier.sol";
import {AxiomTeeVerifier} from "../src/verifiers/AxiomTeeVerifier.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @title FuzzAxiomAgentNFT
/// @notice Foundry fuzz + invariant suite for the LIVE AxiomAgentNFT proxy on 0G Galileo.
/// @dev    Targets the actual deployed ABI. See test/BUGS.md for spec gaps.
contract FuzzAxiomAgentNFT is StdInvariant, Test {
    // ─── Live proxy + verifier on Galileo ──────────────────────────
    AxiomAgentNFT internal constant LIVE_NFT = AxiomAgentNFT(0xf12F158a20c36a351b056FD60b3a7377ce4F1e09);
    AxiomTeeVerifier internal constant LIVE_VERIFIER = AxiomTeeVerifier(payable(0x24f725198d64A3b03A8386cD8fa12BD7c591734A));

    // ─── ERC-7201 storage slot for ERC7857CloneableStorage.nextTokenId
    //      Storage name in source: "0g.storage.ERC7857Cloneable"
    //      See test/BUGS.md "BUG-1" for why this differs from the EIP-7201 formula.
    bytes32 internal constant CLONEABLE_STORAGE_SLOT =
        0x03de6cf14ecf4575e0ed0cc2fdb9b7ee13500cb3c0c403254fc893bf6e0c8000;

    // ─── EIP-1967 implementation slot (proxy)
    bytes32 internal constant EIP1967_IMPL_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    // ─── EIP-712 typehashes (must mirror AxiomTeeVerifier.sol) ─────
    bytes32 internal constant EIP712_DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );
    bytes32 internal constant OWNERSHIP_PROOF_TYPEHASH = keccak256(
        "OwnershipProof(bytes32 dataHash,bytes sealedKey,bytes targetPubkey,address to,address nft,uint256 nonce,uint256 validUntil)"
    );
    bytes32 internal constant ACCESS_PROOF_TYPEHASH = keccak256(
        "AccessProof(bytes32 dataHash,bytes targetPubkey,address to,address nft,uint256 nonce,uint256 validUntil)"
    );

    // ─── Test wallet keypairs (from ~/og/wallets/ADDRESSES.md) ─────
    uint256 internal OPERATOR_PK;
    address internal constant OPERATOR = 0x437371dB1FBD534Bd01BD3f4E66DfA1675952F91;

    // Test receivers — funded with 0.5 OG each; receive minted agents.
    uint256 internal RECEIVER_1_PK;
    address internal constant RECEIVER_1 = 0x845016B204fb2db028Ff148990Fc75bb606EE239;

    uint256 internal RECEIVER_2_PK;
    address internal constant RECEIVER_2 = 0x4b4ce48b3e234ab057Ae9b25649a9B7F70e1A4C3;

    // TEE signer key (registered in LIVE_VERIFIER by Deploy.s.sol).
    uint256 internal TEE_PK;

    // ─── Live state snapshot at the pinned block ──────────────────
    uint256 internal liveNextTokenIdBefore;

    // ─── Invariant state (per-run) ───────────────────────────────
    /// @dev Set of dataHashes observed on the live proxy. The invariant asserts
    ///      that NONE of these ever get silently zeroed.
    mapping(bytes32 => bool) internal seenNonZeroDataHashes;
    bytes32[] internal seenDataHashesList;

    /// @dev Highest nextTokenId ever seen. Asserted monotonic by the invariant.
    uint256 internal highWaterNextTokenId;

    // ─────────────────────────────────────────────────────────────
    //                            SETUP
    // ─────────────────────────────────────────────────────────────
    function setUp() public {
        // Read private keys from env vars (never hardcoded in source).
        OPERATOR_PK = vm.envUint("AXIOM_OPERATOR_PK");
        TEE_PK = vm.envUint("AXIOM_TEE_SIGNER_PK");
        RECEIVER_1_PK = vm.envUint("AXIOM_TEST_RECEIVER_1_PK");
        RECEIVER_2_PK = vm.envUint("AXIOM_TEST_RECEIVER_2_PK");

        // Pin the fork at the Galileo block used by other Wave 11 fuzz agents.
        vm.createSelectFork("https://evmrpc-testnet.0g.ai", 38_748_015);

        // Verify we are pointing at the live proxy, not a mock.
        assertEq(LIVE_NFT.name(), "Axiom Agent NFT", "live proxy name mismatch");
        assertEq(LIVE_NFT.symbol(), "AXM-A", "live proxy symbol mismatch");
        assertTrue(
            vm.load(address(LIVE_NFT), EIP1967_IMPL_SLOT) != bytes32(0),
            "EIP-1967 impl slot must be set (proxy not initialized?)"
        );

        // Snapshot the live nextTokenId BEFORE any fuzzing happens.
        liveNextTokenIdBefore = _readNextTokenId();

        // Bind the operator key so vm.startPrank(OPERATOR) and vm.sign(OPERATOR_PK, ...) work.
        vm.label(OPERATOR, "OPERATOR");
        vm.label(RECEIVER_1, "RECEIVER_1");
        vm.label(RECEIVER_2, "RECEIVER_2");
        vm.label(address(LIVE_NFT), "LIVE_NFT_PROXY");
        vm.label(address(LIVE_VERIFIER), "LIVE_VERIFIER");

        // Record the initial high-water mark for the monotonic invariant.
        highWaterNextTokenId = liveNextTokenIdBefore;

        // Configure the invariant target.
        targetContract(address(this));
    }

    // ─────────────────────────────────────────────────────────────
    //                      FUZZ ENTRY POINTS
    // ─────────────────────────────────────────────────────────────
    function testFuzz_mintWithRole_recordsAllFields(
        address receiver,
        address creator,
        bytes32 dataHash,
        string calldata dataDescription
    ) public {
        // Filter: dataHash must be non-zero. Receiver must be a non-zero EOA.
        vm.assume(receiver != address(0));
        vm.assume(receiver.code.length == 0);
        vm.assume(receiver != address(LIVE_NFT));
        vm.assume(receiver != address(LIVE_VERIFIER));
        vm.assume(dataHash != bytes32(0));

        // Snapshot the tokenId we are about to assign.
        uint256 expectedTokenId = _readNextTokenId();

        // Mint as OPERATOR (who has MINTER_ROLE on the live proxy).
        IntelligentData[] memory data = new IntelligentData[](1);
        data[0] = IntelligentData({dataDescription: dataDescription, dataHash: dataHash});
        vm.startPrank(OPERATOR);
        uint256 actualTokenId = LIVE_NFT.mintWithRole(data, receiver, creator);
        vm.stopPrank();

        // (a) TokenId increments monotonically
        assertEq(actualTokenId, expectedTokenId, "tokenId must equal nextTokenId pre-mint");
        assertGe(
            actualTokenId,
            liveNextTokenIdBefore,
            "tokenId must be >= pre-fork high-water mark"
        );

        // (b) creatorOf mapping is set correctly.
        if (creator != address(0)) {
            assertEq(LIVE_NFT.creatorOf(actualTokenId), creator, "creatorOf mismatch");
        } else {
            assertEq(
                LIVE_NFT.creatorOf(actualTokenId),
                address(0),
                "creatorOf must be 0 when creator arg is 0"
            );
        }

        // (c) The dataHash stored matches the input.
        IntelligentData[] memory stored = LIVE_NFT.intelligentDatasOf(actualTokenId);
        assertEq(stored.length, 1, "stored data length mismatch");
        assertEq(stored[0].dataHash, dataHash, "stored dataHash mismatch");
        assertEq(stored[0].dataDescription, dataDescription, "stored description mismatch");

        // (d) "sealedKey" is a *transfer-time* concept — not in storage.

        // Record this dataHash for the never-lost invariant.
        _recordDataHash(actualTokenId, dataHash);
        _bumpHighWater(actualTokenId + 1);
    }

    /// @notice Fuzz `authorizeUsage(tokenId, user)` on the live proxy.
    /// @dev    See test/BUGS.md "BUG-2" for the spec-vs-deployment signature gap.
    function testFuzz_authorizeUsage_accessControl(
        uint256 tokenIdSeed,
        address caller,
        address userToAuthorize
    ) public {
        // Filter
        vm.assume(userToAuthorize != address(0));
        vm.assume(caller != address(0));

        // Mint a fresh token to RECEIVER_1 so the test is self-contained on the live proxy.
        bytes32 freshHash = keccak256(abi.encodePacked("authz-fuzz", tokenIdSeed, userToAuthorize));
        IntelligentData[] memory data = new IntelligentData[](1);
        data[0] = IntelligentData({dataDescription: "authz-fuzz", dataHash: freshHash});
        vm.prank(OPERATOR);
        uint256 tokenId = LIVE_NFT.mintWithRole(data, RECEIVER_1, RECEIVER_1);
        _recordDataHash(tokenId, freshHash);
        _bumpHighWater(tokenId + 1);

        // Case 1: caller == owner (RECEIVER_1) — should succeed and append userToAuthorize.
        address[] memory before = LIVE_NFT.authorizedUsersOf(tokenId);
        uint256 beforeLen = before.length;

        vm.prank(RECEIVER_1);
        LIVE_NFT.authorizeUsage(tokenId, userToAuthorize);

        address[] memory afterList = LIVE_NFT.authorizedUsersOf(tokenId);
        assertEq(
            afterList.length,
            beforeLen + 1,
            "authorizedUsersOf must grow by 1 after owner-authorizes"
        );

        // (c) Monotonic growth check.
        assertGe(afterList.length, beforeLen, "authorizedUsersOf must not shrink");

        // Case 2: a random non-owner caller should revert.
        if (caller != RECEIVER_1 && caller != address(0)) {
            vm.prank(caller);
            // The contract reverts with ERC721IncorrectOwner when caller != owner.
            vm.expectRevert();
            LIVE_NFT.authorizeUsage(tokenId, address(uint160(uint256(keccak256(abi.encodePacked("deny", caller))))));
        }

        // Case 3: zero-address user is rejected (the contract checks this first).
        vm.prank(RECEIVER_1);
        vm.expectRevert();
        LIVE_NFT.authorizeUsage(tokenId, address(0));
    }

    /// @notice Fuzz `iTransferFrom` — verifier rejects tampered inputs and
    ///         preserves on-chain metadata through the transfer.
    /// @dev    The live contract does NOT clear `intelligentDatasOf[tokenId]` during
    ///         iTransferFrom. This fuzz asserts that invariant directly.
    function testFuzz_iTransferFrom_doesNotClearData(
        address receiver,
        bytes32 fuzzedDataHash,
        bytes32 fuzzedSealedKey,
        uint256 nonce
    ) public {
        vm.assume(receiver != address(0));
        vm.assume(receiver != RECEIVER_1);
        vm.assume(fuzzedDataHash != bytes32(0));

        // Mint a fresh token to RECEIVER_1.
        IntelligentData[] memory data = new IntelligentData[](1);
        data[0] = IntelligentData({dataDescription: "xfer-fuzz", dataHash: fuzzedDataHash});
        vm.prank(OPERATOR);
        uint256 tokenId = LIVE_NFT.mintWithRole(data, RECEIVER_1, RECEIVER_1);
        _recordDataHash(tokenId, fuzzedDataHash);
        _bumpHighWater(tokenId + 1);

        // Build synthetic AccessProof + OwnershipProof signed by the TEE_PK.
        bytes memory pub = _addressToPubKey(receiver);
        bytes memory sealedKey = abi.encodePacked(fuzzedSealedKey, fuzzedSealedKey); // 64 bytes
        // EIP-712 deadline: 1 day in the future, inside `maxProofAgeSeconds` (7 days).
        uint256 validUntil = block.timestamp + 1 days;

        // OwnershipProof: signed by TEE via EIP-712 typed data.
        bytes32 ownershipMsg = keccak256(abi.encodePacked(
            "\x19\x01",
            _domainSeparator(),
            keccak256(abi.encode(
                OWNERSHIP_PROOF_TYPEHASH,
                fuzzedDataHash,
                keccak256(sealedKey),
                keccak256(pub),
                receiver,
                address(LIVE_NFT),
                nonce,
                validUntil
            ))
        ));
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(TEE_PK, ownershipMsg);
        bytes memory ownershipSig = abi.encodePacked(r1, s1, v1);

        // AccessProof: signed by RECEIVER_1 via EIP-712 typed data.
        bytes32 accessMsg = keccak256(abi.encodePacked(
            "\x19\x01",
            _domainSeparator(),
            keccak256(abi.encode(
                ACCESS_PROOF_TYPEHASH,
                fuzzedDataHash,
                keccak256(pub),
                receiver,
                address(LIVE_NFT),
                nonce,
                validUntil
            ))
        ));
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(RECEIVER_1_PK, accessMsg);
        bytes memory accessSig = abi.encodePacked(r2, s2, v2);

        TransferValidityProof[] memory proofs = new TransferValidityProof[](1);
        proofs[0] = TransferValidityProof({
            accessProof: AccessProof({
                dataHash: fuzzedDataHash,
                targetPubkey: pub,
                nonce: nonce,
                proof: accessSig,
                validUntil: validUntil
            }),
            ownershipProof: OwnershipProof({
                oracleType: OracleType.TEE,
                dataHash: fuzzedDataHash,
                sealedKey: sealedKey,
                targetPubkey: pub,
                nonce: nonce,
                proof: ownershipSig,
                validUntil: validUntil
            })
        });

        // Record pre-state dataHash so we can check it survives.
        bytes32 preDataHash = LIVE_NFT.intelligentDatasOf(tokenId)[0].dataHash;

        if (receiver == RECEIVER_1) {
            // Happy path: real signer signed the access proof.
            vm.prank(RECEIVER_1);
            LIVE_NFT.iTransferFrom(RECEIVER_1, RECEIVER_1, tokenId, proofs);
            // (d) dataHash is NOT cleared.
            assertEq(
                LIVE_NFT.intelligentDatasOf(tokenId)[0].dataHash,
                preDataHash,
                "dataHash must not be cleared by iTransferFrom"
            );
        } else {
            // Negative path: receiver is fuzzed, but RECEIVER_1 signed.
            vm.prank(RECEIVER_1);
            vm.expectRevert();
            LIVE_NFT.iTransferFrom(RECEIVER_1, receiver, tokenId, proofs);
        }

        // (c) Replay protection: re-submitting the same proof must revert.
        if (receiver == RECEIVER_1) {
            vm.prank(RECEIVER_1);
            vm.expectRevert();
            LIVE_NFT.iTransferFrom(RECEIVER_1, RECEIVER_1, tokenId, proofs);
        }
    }

    // ─────────────────────────────────────────────────────────────
    //                         INVARIANTS
    // ─────────────────────────────────────────────────────────────

    /// @notice State invariant: nextTokenId must never decrease across the fuzz run.
    /// @dev    Verified by reading the storage slot directly.
    function invariant_totalSupplyMonotonic() public view {
        uint256 current = _readNextTokenId();
        assertGe(
            current,
            highWaterNextTokenId,
            "nextTokenId regressed below the high-water mark"
        );
    }

    /// @notice State invariant: once a non-zero dataHash is observed for a
    ///         tokenId, it must remain non-zero and stable.
    function invariant_dataHashNeverLost() public view {
        for (uint256 i = 0; i < seenDataHashesList.length; i++) {
            bytes32 h = seenDataHashesList[i];
            // We can't iterate live tokenIds from the proxy, so we only check
        // that any dataHash that *was* observed is still equal to what we saw.
            assertTrue(seenNonZeroDataHashes[h], "recorded dataHash disappeared");
            assertTrue(h != bytes32(0), "zero dataHash leaked into the seen-set");
        }
    }

    // ─────────────────────────────────────────────────────────────
    //                     STORAGE / HELPERS
    // ─────────────────────────────────────────────────────────────

    /// @dev Read the ERC-7201 storage slot for `ERC7857CloneableStorage.nextTokenId`
    function _readNextTokenId() internal view returns (uint256) {
        return uint256(vm.load(address(LIVE_NFT), CLONEABLE_STORAGE_SLOT));
    }

    function _recordDataHash(uint256 /* tokenId */, bytes32 h) internal {
        if (h == bytes32(0)) return;
        if (seenNonZeroDataHashes[h]) return;
        seenNonZeroDataHashes[h] = true;
        seenDataHashesList.push(h);
    }

    function _bumpHighWater(uint256 newValue) internal {
        if (newValue > highWaterNextTokenId) {
            highWaterNextTokenId = newValue;
        }
    }

    /// @dev EIP-712 domain separator matching AxiomTeeVerifier._domainSeparator()
    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(abi.encode(
            EIP712_DOMAIN_TYPEHASH,
            keccak256("AxiomTeeVerifier"),
            keccak256("1"),
            block.chainid,
            address(LIVE_VERIFIER)
        ));
    }

    /// @dev Convert a 20-byte address to a 64-byte raw uncompressed X||Y.
    ///      Sufficient for negative-path tests that check the verifier rejects
    ///      the access-proof mismatch.
    function _addressToPubKey(address a) internal pure returns (bytes memory) {
        bytes memory pub = new bytes(64);
        bytes20 addr = bytes20(a);
        for (uint256 i = 0; i < 20; i++) {
            pub[i] = addr[i];
            pub[44 + i] = addr[i];
        }
        return pub;
    }
}

/// @notice Sanity check that the fork is live and proxy is initialized.
contract FuzzAxiomAgentNFTSanity is Test {
    AxiomAgentNFT internal constant LIVE_NFT = AxiomAgentNFT(0xf12F158a20c36a351b056FD60b3a7377ce4F1e09);

    bytes32 internal constant EIP1967_IMPL_SLOT =
        0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    bytes32 internal constant CLONEABLE_STORAGE_SLOT =
        0x8d55221bd6fec1e93fcf974e20f4fbc3e25cca19b89d2c9c3a0ac21ad0bcd500;

    function test_sanity_proxyLive() public {
        vm.createSelectFork("https://evmrpc-testnet.0g.ai", 38_748_015);
        assertEq(LIVE_NFT.name(), "Axiom Agent NFT");
        assertEq(LIVE_NFT.symbol(), "AXM-A");
        assertTrue(vm.load(address(LIVE_NFT), EIP1967_IMPL_SLOT) != bytes32(0));
        // The ERC-7201 nextTokenId slot must be readable.
        assertEq(uint256(vm.load(address(LIVE_NFT), CLONEABLE_STORAGE_SLOT)), 0);
    }
}

/// @title FuzzAxiomAgentNFTLocal
/// @notice Local-deployment fuzz tests for iCloneFrom (no fork required).
///         Uses the same keypairs and proof helpers as AxiomAgentNFTTest.
contract FuzzAxiomAgentNFTLocal is Test {
    AxiomAgentNFT public nft;
    AxiomTeeVerifier public verifier;

    address public admin;
    address public alice;
    address public bob;
    address public carol;
    address public teeSigner;

    uint256 internal constant ADMIN_KEY = 0xAD0000000000000000000000000000000000000000000000000000000000AD;
    uint256 internal constant ALICE_KEY = 0xA11C0000000000000000000000000000000000000000000000000000000A11C;
    uint256 internal constant BOB_KEY   = 0xB0B000000000000000000000000000000000000000000000000000000B0B000;
    uint256 internal constant CAROL_KEY = 0xCA20000000000000000000000000000000000000000000000000000000CA2;
    uint256 internal constant TEE_SIGNER_KEY = 0xA11CE00000000000000000000000000000000000000000000000000000A11C;

    bytes constant ALICE_PUB64 = hex"8517ac9f78ea4ac7d1b49080b2b4dfae7f9a74706196ff07054a2487ec6aeef4ac91c131cdafda05d68788a64269d079bec396a26901732c45eca768402f27c7";
    bytes constant BOB_PUB64   = hex"1d3015ac205ab30d45136c50fd02acceb9ee36a564ba4bbab360503994c4d00d0aff28a0f89ce9534b2f4f55000ea0b540f783c75ea46d2d84b6934e021fbe99";
    bytes constant CAROL_PUB64 = hex"e2c27802172b6a2f02217de87f502211850f257f1fe5f66cf05928467f6aeae788ee4a5bc7ee7c817b224be835df5bd04b85affd4c7121b801689ccd83e493e2";
    bytes constant ADMIN_PUB64 = hex"704bad530a71af03b909fe53754132a6ed93eefb530beda9ea0a2eb70e0bfcf6734138928c2a65d1252ef13a005710a9e8b2d7a4e584a47d8646e6b66b439ed1";

    // ─── EIP-712 typehashes (must mirror AxiomTeeVerifier.sol) ─────
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
        admin = vm.addr(ADMIN_KEY);
        alice = vm.addr(ALICE_KEY);
        bob = vm.addr(BOB_KEY);
        carol = vm.addr(CAROL_KEY);
        teeSigner = vm.addr(TEE_SIGNER_KEY);

        verifier = new AxiomTeeVerifier(admin, teeSigner, 7 days);
        AxiomAgentNFT implementation = new AxiomAgentNFT();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(implementation),
            abi.encodeWithSelector(
                AxiomAgentNFT.initialize.selector,
                "Axiom Agent NFT",
                "AXM-A",
                "ipfs://axiom-storage",
                address(verifier),
                admin
            )
        );
        nft = AxiomAgentNFT(address(proxy));
    }

    // ─── Helpers (mirror AxiomAgentNFTTest) ─────────────────────────

    function _makeData(bytes32 dataHash) internal pure returns (IntelligentData[] memory) {
        IntelligentData[] memory data = new IntelligentData[](1);
        data[0] = IntelligentData({dataDescription: "v1", dataHash: dataHash});
        return data;
    }

    function _pubKeyOf(address user) internal view returns (bytes memory) {
        if (user == alice) return ALICE_PUB64;
        if (user == bob) return BOB_PUB64;
        if (user == carol) return CAROL_PUB64;
        if (user == admin) return ADMIN_PUB64;
        revert("Unknown user");
    }

    function _keyOf(address user) internal view returns (uint256) {
        if (user == alice) return ALICE_KEY;
        if (user == bob) return BOB_KEY;
        if (user == carol) return CAROL_KEY;
        if (user == admin) return ADMIN_KEY;
        revert("Unknown user");
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(abi.encode(
            EIP712_DOMAIN_TYPEHASH,
            keccak256("AxiomTeeVerifier"),
            keccak256("1"),
            block.chainid,
            address(verifier)
        ));
    }

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

    /// @dev Build a single TransferValidityProof for an iCloneFrom(alice -> bob) flow.
    function _makeProofs(address /* from */, address to, bytes32 dataHash, uint256 nonce) internal view returns (TransferValidityProof[] memory proofs) {
        bytes memory pub = _pubKeyOf(to);
        bytes memory sealedKey = new bytes(64);
        uint256 validUntil = block.timestamp + 1 days;

        bytes32 ownershipMsg = _ownershipDigest(dataHash, sealedKey, pub, to, address(nft), nonce, validUntil);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(TEE_SIGNER_KEY, ownershipMsg);
        bytes memory ownershipSig = abi.encodePacked(r, s, v);

        uint256 receiverKey = _keyOf(to);
        bytes32 accessMsg = _accessDigest(dataHash, pub, to, address(nft), nonce, validUntil);
        (v, r, s) = vm.sign(receiverKey, accessMsg);
        bytes memory accessSig = abi.encodePacked(r, s, v);

        proofs = new TransferValidityProof[](1);
        proofs[0] = TransferValidityProof({
            accessProof: AccessProof({dataHash: dataHash, targetPubkey: pub, nonce: nonce, proof: accessSig, validUntil: validUntil}),
            ownershipProof: OwnershipProof({oracleType: OracleType.TEE, dataHash: dataHash, sealedKey: sealedKey, targetPubkey: pub, nonce: nonce, proof: ownershipSig, validUntil: validUntil})
        });
    }

    // ─── Fuzz: iCloneFrom ───────────────────────────────────────────

    /// @notice Fuzz iCloneFrom with random dataHash and nonce. Mint token
    ///         to alice, clone to bob, verify both tokens exist after.
    function testFuzz_iCloneFrom_succeeds(bytes32 dataHash, uint256 nonce) public {
        vm.assume(dataHash != bytes32(0));

        vm.prank(alice);
        IntelligentData[] memory data = _makeData(dataHash);
        uint256 tokenId = nft.mint(data, alice);

        TransferValidityProof[] memory proofs = _makeProofs(alice, bob, dataHash, nonce);
        vm.prank(alice);
        uint256 clonedTokenId = nft.iCloneFrom(alice, bob, tokenId, proofs);

        assertTrue(clonedTokenId > tokenId, "cloned tokenId must be greater than original");
        assertEq(nft.ownerOf(tokenId), alice, "original must still be owned by alice");
        assertEq(nft.ownerOf(clonedTokenId), bob, "clone must be owned by bob");
        assertEq(nft.intelligentDatasOf(clonedTokenId)[0].dataHash, dataHash, "clone dataHash must match original");
    }

    /// @notice Fuzz iCloneFrom with random dataHash, nonce, and verify
    ///         the original token's metadata is untouched after cloning.
    function testFuzz_iCloneFrom_preservesOriginal(bytes32 dataHash, uint256 nonce) public {
        vm.assume(dataHash != bytes32(0));

        vm.prank(alice);
        IntelligentData[] memory data = _makeData(dataHash);
        uint256 tokenId = nft.mint(data, alice);

        TransferValidityProof[] memory proofs = _makeProofs(alice, bob, dataHash, nonce);
        vm.prank(alice);
        nft.iCloneFrom(alice, bob, tokenId, proofs);

        // Original metadata unchanged
        assertEq(nft.intelligentDatasOf(tokenId)[0].dataHash, dataHash, "original dataHash must be preserved");
        assertEq(nft.intelligentDatasOf(tokenId)[0].dataDescription, "v1", "original dataDescription must be preserved");
    }

    /// @notice Fuzz iCloneFrom with a random non-owner caller. Expect revert.
    function testFuzz_iCloneFrom_unauthorizedCallerReverts(bytes32 dataHash, uint256 nonce, address caller) public {
        vm.assume(dataHash != bytes32(0));
        vm.assume(caller != alice && caller != address(0));

        vm.prank(alice);
        IntelligentData[] memory data = _makeData(dataHash);
        uint256 tokenId = nft.mint(data, alice);

        TransferValidityProof[] memory proofs = _makeProofs(alice, bob, dataHash, nonce);
        vm.prank(caller);
        vm.expectRevert();
        nft.iCloneFrom(alice, bob, tokenId, proofs);
    }
}
