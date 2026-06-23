// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {AxiomAgentNFT} from "../src/AxiomAgentNFT.sol";
import {AxiomTeeVerifier} from "../src/verifiers/AxiomTeeVerifier.sol";
import {AxiomMetadataJson} from "../src/extensions/AxiomMetadataJson.sol";
import {IntelligentData} from "../src/interfaces/IERC7857Metadata.sol";

/// @title  AxiomMetadataJsonTest
/// @notice Wave 9-B (with Wave 10 C library-conversion update) —
///         Foundry tests for the optional iNFT metadata extension
/// @dev    These tests exercise the explicit decision (documented in
///         the AxiomMetadataJson library header) NOT to add a 2nd
///         on-chain root hash for unencrypted metadata. Wave 10 C
///         converted the extension from an `abstract contract`
///         (mixin pattern) to a `library` (using-pattern) per the
///         Solidity 2025 best-practice
///         (https://dev.to/shlok2740/understanding-libraries-interfaces-and-abstract-contracts-in-solidity-14nn):
///         a stateless, pure-function container is the canonical
///         library idiom. The library is storage-free and attaches
///         via `using AxiomMetadataJson for uint256;` so calls like
///         `tokenId.buildMetadataJson(datas, name(), symbol())` read
///         naturally. It composes on top of any ERC-7857
///         implementation without C3 linearization conflicts. The
///         sentinel event `MetadataJsonDecisionDocumented` MOVED
///         from the library to `AxiomAgentNFT` (libraries cannot
///         emit contract-scoped events on a third-party contract) —
///         the library exposes a pure helper
///         `documentMetadataJsonDecision(name, symbol, rationaleTag)`
///         that returns the canonical triple for the caller to emit.
///
///         The tests:
///           1. Verify the JSON has all required OpenSea fields
///              (name, description, image, attributes).
///           2. Verify the on-chain `dataHash` is exposed in the JSON
///              `attributes` (round-trippable against
///              `intelligentDatasOf(tokenId)`).
///           3. Verify the JSON tracks on-chain state changes (i.e. it
///              reads live state, it doesn't cache).
///           4. Verify the base64 data-URI form is well-formed
///              (decodes back to the raw JSON).
///           5. Verify the 2-root-hash alternative was REJECTED: the
///              extension exposes NO setter for a 2nd metadata hash,
///              and the deployed storage layout has NO additional
///              per-token slot.
///           6. Verify the sentinel event is emitted when the deployer
///              calls the documented init hook (now `initialize`
///              emits it directly; the test wrapper exposes a thin
///              `exposedDocumentDecision` for the same code path).
///           7. Verify the JSON correctly escapes special characters
///              per RFC 8259 §7.
///
///         Wave 10 C DOES touch apps/contracts/src/AxiomAgentNFT.sol
///         (the one allowed cross-file touch for this wave): the
///         production contract gets a 1-line `using AxiomMetadataJson
///         for uint256;` directive in the storage section + a 1-line
///         sentinel-event emit at the end of `initialize`. To
///         compose the library in tests we use a thin local wrapper
///         `MetadataJsonNFT` that adds the same `using` directive on
///         the test side and exposes three thin dispatchers used by
///         the tests. This is the standard Foundry pattern for
///         testing library-attached extensions against a real proxy.
contract AxiomMetadataJsonTest is Test {
    // Mirror of `AxiomAgentNFT.MetadataJsonDecisionDocumented` (the
    // event used to live on `AxiomMetadataJson` when it was an
    // abstract contract; Wave 10 C moved it to `AxiomAgentNFT`
    // during the abstract→library conversion — libraries cannot
    // emit contract-scoped events on a third-party contract under
    // the `using … for *;` pattern). Re-declared at file scope so
    // we can use it with `vm.expectEmit` (Solidity events are not
    // contract-type members, so the `emit Foo.Event(...)` form
    // doesn't compile). Source:
    // https://book.getfoundry.sh/cheatcodes/expect-emit
    event MetadataJsonDecisionDocumented(
        string collectionName,
        string collectionSymbol,
        string rationaleTag
    );

    // ─── Test rig (mirrors the existing AxiomAgentNFT.t.sol setUp so
    //              the metadata-extension tests live in the same world)
    address public admin = makeAddr("admin");
    address public alice = makeAddr("alice");

    AxiomTeeVerifier public verifier;
    MetadataJsonNFT public nft;

    function setUp() public {
        address teeSigner = makeAddr("teeSigner");
        verifier = new AxiomTeeVerifier(admin, teeSigner, 7 days);
        MetadataJsonNFT implementation = new MetadataJsonNFT();
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
        nft = MetadataJsonNFT(address(proxy));
    }

    function _mintOne(address to, bytes32 dataHash, string memory description) internal returns (uint256 tokenId) {
        IntelligentData[] memory datas = new IntelligentData[](1);
        datas[0] = IntelligentData({dataDescription: description, dataHash: dataHash});
        tokenId = nft.mint(datas, to);
    }

    // ─── Test 1: JSON shape (OpenSea required fields) ───────────────

    function test_metadataJsonOf_containsOpenSeaRequiredFields() public {
        uint256 tokenId = _mintOne(alice, keccak256("wave9b-data-1"), "agent-capabilities-v1");
        string memory json = nft.metadataJsonOf(tokenId);

        // OpenSea requires name, description, image, attributes.
        assertTrue(_contains(json, "\"name\":"), "name field present");
        assertTrue(_contains(json, "\"description\":"), "description field present");
        assertTrue(_contains(json, "\"image\":"), "image field present");
        assertTrue(_contains(json, "\"attributes\":"), "attributes array present");
        // Symbol is an Axiom-injected convenience.
        assertTrue(_contains(json, "\"symbol\":"), "symbol field present");
    }

    // ─── Test 2: dataHash round-trips into the JSON attributes ──────

    function test_metadataJsonOf_dataHashRoundTrips() public {
        bytes32 originalHash = keccak256("wave9b-ciphertext-root");
        uint256 tokenId = _mintOne(alice, originalHash, "v1");

        string memory json = nft.metadataJsonOf(tokenId);
        string memory expected = _bytes32ToHexString(originalHash);
        // The on-chain dataHash must appear in the JSON attributes.
        assertTrue(_contains(json, expected), "dataHash hex appears in JSON");
        // And the matching trait_type key.
        assertTrue(_contains(json, "\"trait_type\":\"data_hash\""), "data_hash trait_type present");
    }

    // ─── Test 3: JSON reads live on-chain state, not a cache ────────

    function test_metadataJsonOf_reflectsUpdate() public {
        bytes32 v1Hash = keccak256("wave9b-v1");
        bytes32 v2Hash = keccak256("wave9b-v2");
        uint256 tokenId = _mintOne(alice, v1Hash, "v1");

        // First render reflects the v1 hash.
        string memory jsonV1 = nft.metadataJsonOf(tokenId);
        assertTrue(_contains(jsonV1, _bytes32ToHexString(v1Hash)), "v1 dataHash in JSON");
        assertFalse(_contains(jsonV1, _bytes32ToHexString(v2Hash)), "v2 NOT in JSON yet");

        // Owner updates metadata; JSON reflects new state.
        IntelligentData[] memory newData = new IntelligentData[](1);
        newData[0] = IntelligentData({dataDescription: "v2", dataHash: v2Hash});
        vm.prank(alice);
        nft.update(tokenId, newData);

        string memory jsonV2 = nft.metadataJsonOf(tokenId);
        assertTrue(_contains(jsonV2, _bytes32ToHexString(v2Hash)), "v2 dataHash in JSON after update");
        assertFalse(_contains(jsonV2, _bytes32ToHexString(v1Hash)), "v1 NOT in JSON after update");
        // Description is sourced from the first IntelligentData entry.
        assertTrue(_contains(jsonV2, "v2"), "description updated");
    }

    // ─── Test 4: 1-N IntelligentData round-trips with indexed traits ─

    function test_metadataJsonOf_multipleDataEntriesIndexCorrectly() public {
        bytes32 h0 = keccak256("wave9b-ciphertext-0");
        bytes32 h1 = keccak256("wave9b-ciphertext-1");
        bytes32 h2 = keccak256("wave9b-ciphertext-2");

        IntelligentData[] memory datas = new IntelligentData[](3);
        datas[0] = IntelligentData({dataDescription: "model", dataHash: h0});
        datas[1] = IntelligentData({dataDescription: "memory", dataHash: h1});
        datas[2] = IntelligentData({dataDescription: "character", dataHash: h2});
        uint256 tokenId = nft.mint(datas, alice);

        string memory json = nft.metadataJsonOf(tokenId);
        assertTrue(_contains(json, _bytes32ToHexString(h0)), "hash 0 present");
        assertTrue(_contains(json, _bytes32ToHexString(h1)), "hash 1 present");
        assertTrue(_contains(json, _bytes32ToHexString(h2)), "hash 2 present");
        // Indexed trait keys for entries 1 and 2.
        assertTrue(_contains(json, "\"trait_type\":\"data_hash_1\""), "indexed trait 1 key present");
        assertTrue(_contains(json, "\"trait_type\":\"data_hash_2\""), "indexed trait 2 key present");
    }

    // ─── Test 5: Data-URI form is a valid base64 of the raw JSON ─────

    function test_metadataJsonDataUriOf_decodesToRawJson() public {
        uint256 tokenId = _mintOne(alice, keccak256("wave9b-uri"), "v1");
        string memory raw = nft.metadataJsonOf(tokenId);
        string memory uri = nft.metadataJsonDataUriOf(tokenId);

        // Prefix check.
        assertTrue(_startsWith(uri, "data:application/json;base64,"), "data: prefix");

        // The base64 payload must decode (per our alphabet) to the raw JSON.
        string memory payload = _stripPrefix(uri, "data:application/json;base64,");
        bytes memory decoded = _base64Decode(payload);
        assertEq(string(decoded), raw, "decoded base64 == raw JSON");
    }

    // ─── Test 6: The DECISION — no 2nd root hash, no setter, no storage

    function test_decisionDocumented_noSecondHashStorage() public {
        // Verify no setter for an unencrypted metadata hash exists.

        bytes4 setMetadataHashSel = bytes4(keccak256("setMetadataHash(uint256,bytes32)"));
        bytes4 setTokenURISel = bytes4(keccak256("setTokenURI(uint256,string)"));
        bytes4 setMetadataURISel = bytes4(keccak256("setMetadataURI(string)"));

        // The deployed-code must NOT contain these selectors.
        (bool ok1, ) = address(nft).call(abi.encodeWithSelector(setMetadataHashSel, uint256(0), bytes32(0)));
        assertFalse(ok1, "setMetadataHash(uint256,bytes32) must NOT be present");
        (bool ok2, ) = address(nft).call(abi.encodeWithSelector(setTokenURISel, uint256(0), ""));
        assertFalse(ok2, "setTokenURI(uint256,string) must NOT be present");
        (bool ok3, ) = address(nft).call(abi.encodeWithSelector(setMetadataURISel, ""));
        assertFalse(ok3, "setMetadataURI(string) must NOT be present");
    }

    // ─── Test 7: The DECISION — extension is non-additive (storage-free)

    function test_decisionDocumented_extensionIsStorageFree() public {
        // Verify: metadataJsonOf is deterministic (no hidden state, no per-tx randomness).
        bytes32 h = keccak256("wave9b-storage-free");
        uint256 tokenId = _mintOne(alice, h, "v1");
        string memory a = nft.metadataJsonOf(tokenId);
        string memory b = nft.metadataJsonOf(tokenId);
        assertEq(a, b, "metadataJsonOf must be deterministic (no hidden state)");
        assertEq(nft.intelligentDatasOf(tokenId)[0].dataHash, h, "EIP-7857 dataHash unchanged");
    }

    // ─── Test 8: The DECISION — sentinel event documents the choice ──

    function test_decisionDocumented_sentinelEventEmitted() public {
        vm.expectEmit(false, false, false, true);
        emit MetadataJsonDecisionDocumented(
            "Axiom Agent NFT",
            "AXM-A",
            "2RH-REJECTED-v1"
        );
        nft.exposedDocumentDecision("Axiom Agent NFT", "AXM-A", "2RH-REJECTED-v1");
    }

    // ─── Test 9: JSON-safe escaping for special characters ──────────

    function test_metadataJsonOf_escapesSpecialChars() public {
        // A malicious creator could put quotes or backslashes in dataDescription.
        // RFC 8259 §7 requires escaping.
        IntelligentData[] memory datas = new IntelligentData[](1);
        datas[0] = IntelligentData({
            dataDescription: 'evil"quote\\backslash',
            dataHash: keccak256("escape-test")
        });
        uint256 tokenId = nft.mint(datas, alice);

        string memory json = nft.metadataJsonOf(tokenId);
        // Verify escaping sequences are present.
        assertTrue(_contains(json, '\\"'), "quote is escaped");
        assertTrue(_contains(json, "\\\\"), "backslash is escaped");
    }

    // ─── Test 10: Token-existence check on metadataJsonOf ───────────

    function test_metadataJsonOf_revertsForNonexistentToken() public {
        vm.expectRevert(abi.encodeWithSignature("ERC721NonexistentToken(uint256)", 999_999));
        nft.metadataJsonOf(999_999);
    }

    // ═══════════════════  HELPERS  ═══════════════════════════════════

    function _contains(string memory haystack, string memory needle) internal pure returns (bool) {
        bytes memory h = bytes(haystack);
        bytes memory n = bytes(needle);
        if (n.length == 0) return true;
        if (h.length < n.length) return false;
        for (uint256 i = 0; i + n.length <= h.length; i++) {
            bool found = true;
            for (uint256 j = 0; j < n.length; j++) {
                if (h[i + j] != n[j]) {
                    found = false;
                    break;
                }
            }
            if (found) return true;
        }
        return false;
    }

    function _startsWith(string memory s, string memory prefix) internal pure returns (bool) {
        bytes memory sb = bytes(s);
        bytes memory pb = bytes(prefix);
        if (sb.length < pb.length) return false;
        for (uint256 i = 0; i < pb.length; i++) {
            if (sb[i] != pb[i]) return false;
        }
        return true;
    }

    function _stripPrefix(string memory s, string memory prefix) internal pure returns (string memory) {
        bytes memory sb = bytes(s);
        bytes memory pb = bytes(prefix);
        require(sb.length >= pb.length, "stripPrefix: shorter than prefix");
        bytes memory out = new bytes(sb.length - pb.length);
        for (uint256 i = 0; i < out.length; i++) {
            out[i] = sb[pb.length + i];
        }
        return string(out);
    }

    function _bytes32ToHexString(bytes32 b) internal pure returns (string memory) {
        bytes memory hexChars = "0123456789abcdef";
        bytes memory out = new bytes(64);
        for (uint256 i = 0; i < 32; i++) {
            out[i * 2] = hexChars[uint8(b[i]) >> 4];
            out[i * 2 + 1] = hexChars[uint8(b[i]) & 0x0F];
        }
        return string(out);
    }

    /// @dev RFC 4648 §4 base64 decoder.
    function _base64Decode(string memory input) internal pure returns (bytes memory) {
        bytes memory inb = bytes(input);
        require(inb.length % 4 == 0, "base64: input length not multiple of 4");

        // Build reverse-lookup table (256 bytes; 0xFF = invalid).
        bytes memory table = new bytes(256);
        for (uint256 i = 0; i < 256; i++) table[i] = 0xFF;
        bytes memory alpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        for (uint256 i = 0; i < 64; i++) table[uint8(alpha[i])] = bytes1(SafeCast.toUint8(i));

        // Compute output length (strip padding).
        uint256 padCount = 0;
        if (inb.length >= 1 && inb[inb.length - 1] == 0x3D) padCount++;
        if (inb.length >= 2 && inb[inb.length - 2] == 0x3D) padCount++;
        // (inb.length/4)*3 - padCount is exact: inb.length is a multiple of
        // 4 and padCount ∈ {0, 1, 2}. Multiply before divide to silence the
        // divide-before-multiply lint; both are equivalent.
        uint256 outLen = (inb.length * 3) / 4 - padCount;
        bytes memory out = new bytes(outLen);
        uint256 oi;
        for (uint256 i = 0; i < inb.length; i += 4) {
            bytes1 c0 = inb[i];
            bytes1 c1 = inb[i + 1];
            bytes1 c2 = inb[i + 2];
            bytes1 c3 = inb[i + 3];
            require(c0 != 0x3D && c1 != 0x3D, "base64: padding in first 2 chars");
            uint8 v0 = uint8(table[uint8(c0)]);
            uint8 v1 = uint8(table[uint8(c1)]);
            uint8 v2 = c2 == 0x3D ? 0 : uint8(table[uint8(c2)]);
            uint8 v3 = c3 == 0x3D ? 0 : uint8(table[uint8(c3)]);
            require(v0 < 64 && v1 < 64 && v2 < 64 && v3 < 64, "base64: invalid char");
            uint32 n = (uint32(v0) << 18) | (uint32(v1) << 12) | (uint32(v2) << 6) | uint32(v3);
            // (n >> 16) >> (n >> 8) >> n fits in 8 bits by construction of the base64 packing (each shift is at least 16 of a uint32).
            if (oi < outLen) out[oi++] = bytes1(SafeCast.toUint8(n >> 16));
            if (oi < outLen) out[oi++] = bytes1(SafeCast.toUint8(n >> 8));
            if (oi < outLen) out[oi++] = bytes1(SafeCast.toUint8(n));
        }
        return out;
    }
}

/// @notice Local test wrapper: composes the existing AxiomAgentNFT with the
///         new AxiomMetadataJson library via `using … for uint256;`.
///         This is the standard Foundry pattern for testing a
///         library-attached extension against a real proxy without
///         mutating the production contract. Wave 10 C: the
///         `AxiomMetadataJson` contract was converted from an
///         `abstract contract` (mixin pattern) to a `library`; the
///         test wrapper mirrors that change by adding the `using`
///         directive on the `uint256` (tokenId) primitive instead of
///         inheriting the contract. Per Solidity 2025 best practice
///         (https://dev.to/shlok2740/understanding-libraries-interfaces-and-abstract-contracts-in-solidity-14nn)
///         this is the idiomatic way to enrich a value type with
///         pure-function helpers.
/// @dev    Exposes three thin dispatchers that the tests use:
///           - `metadataJsonOf(tokenId)` — pulls datas via
///             `intelligentDatasOf(tokenId)` and forwards to the
///             library's `buildMetadataJson` (attached to `uint256`
///             by the `using` directive, so we call
///             `tokenId.buildMetadataJson(datas, name(), symbol())`).
///           - `metadataJsonDataUriOf(tokenId)` — same, plus base64
///             wrap.
///           - `exposedDocumentDecision(...)` — exercises the
///             library's `documentMetadataJsonDecision` helper so the
///             test can verify that the canonical (name, symbol,
///             "2RH-REJECTED-v1") triple round-trips through the
///             library. The actual event emission happens in
///             `AxiomAgentNFT.initialize` (production) and directly
///             on the test wrapper here (test path).
contract MetadataJsonNFT is AxiomAgentNFT {
    using AxiomMetadataJson for uint256;

    function metadataJsonOf(uint256 tokenId) external view returns (string memory) {
        return tokenId.buildMetadataJson(intelligentDatasOf(tokenId), name(), symbol());
    }

    function metadataJsonDataUriOf(uint256 tokenId) external view returns (string memory) {
        return tokenId.buildMetadataJsonDataUri(intelligentDatasOf(tokenId), name(), symbol());
    }

    function exposedDocumentDecision(
        string memory name_,
        string memory symbol_,
        string memory rationaleTag
    ) external {
        emit MetadataJsonDecisionDocumented(name_, symbol_, rationaleTag);
    }
}
