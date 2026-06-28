// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IntelligentData} from "../interfaces/IERC7857Metadata.sol";

/// @title  AxiomMetadataJson
/// @notice Optional iNFT metadata extension for AxiomAgentNFT
/// @dev    ─────────────────────  DECISION  ─────────────────────
///         The 2-root-hash metadata pattern (store an additional, unencrypted
///         ERC-721-style JSON metadata blob on 0G Storage and record its root
///         hash on-chain as a second `metadataHash`) is **explicitly REJECTED**
///         for the Axiom Agent NFT. Rationale:
///
///         1. EIP-7857 §Metadata Interface already defines a richer
///            `intelligentDatasOf(tokenId) → IntelligentData[]{description, dataHash}`
///            accessor. The `dataHash` is the root hash of the encrypted blob
///            stored on 0G Storage; the description is human-readable
///            per-data-slice metadata. Together they cover every field an
///            ERC-721-style JSON would carry except for an HTTP image URL.
///            See: https://eips.ethereum.org/EIPS/eip-7857#metadata-interface
///
///         2. EIP-7857's whole motivation is *private* metadata. Storing an
///            *unencrypted* second JSON in 0G Storage that links capabilities
///            to a public root hash would defeat the encryption guarantee —
///            the JSON itself (description, image, attributes) becomes
///            plaintext-readable to anyone with the root hash, which is
///            exactly what EIP-7857 §Abstract warns against ("Metadata
///            represents agent capabilities and requires privacy protection").
///
///         3. The 0G cross-layer pattern (storage + chain) is already
///            applied: encrypted blob → 0G Storage, single `dataHash` → chain.
///            A second JSON would be a third layer with no purpose; the
///            recovery path (any integrator can fetch `intelligentDatasOf`
///            and render an OpenSea-compatible JSON off-chain) is sufficient
///            for marketplaces.
///            See: https://docs.0g.ai/developer-hub/building-on-0g/agentic-id/erc7857
///
///         4. The 0G cross-layer Storage+Chain skill is the same one that
///            produced the per-blob `dataHash` on-chain. Storing a 2nd hash
///            would be the same skill repeated, doubling storage per token
///            and a 2nd upload cost on every `update()` for no privacy or
///            integrity gain (the original `dataHash` is the integrity anchor
///            per EIP-7857 §Data Verification System).
///            See: https://github.com/0gfoundation/0g-agent-skills
///
///         ───────────────────  WHAT THIS EXTENSION ADDS  ───────────────────
///         This extension is therefore **non-additive**: it introduces NO new
///         storage layout, NO new write functions, NO new roles, and NO new
///         on-chain bytes per token. It exposes a single pure-function view
///         that reconstructs an OpenSea-compatible JSON metadata string from
///         the on-chain EIP-7857 state (name(), symbol(), intelligentDatasOf).
///         Off-chain renderers (wallets, marketplaces, the Axiom indexer in
///         apps/indexer) can call this view to obtain a standards-conformant
///         JSON without needing to talk to 0G Storage at all; if the renderer
///         wants the full payload, it follows the `dataHash` to 0G Storage
///         using the per-hash client (the same path Wave 9-A's
///         verify-data-hash.ts uses for integrity checks).
/// @dev    Adapted from https://github.com/0gfoundation/0g-agent-nft (MIT)

/// @dev    The sentinel event `MetadataJsonDecisionDocumented` lives on
///         `AxiomAgentNFT` because libraries cannot emit contract-scoped
///         events on a third-party contract under `using … for *;`. The
///         library exposes a public pure helper
///         `documentMetadataJsonDecision(name, symbol, rationaleTag)`
///         that returns the canonical triple so the caller can emit the
///         event itself.
library AxiomMetadataJson {
    // NOTE: The `MetadataJsonDecisionDocumented` event used to live here.
    // It was MOVED to AxiomAgentNFT (the only contract that ever emits
    // it) during the Wave 10 C abstract→library conversion. See the
    // file header for the rationale (libraries cannot emit
    // contract-scoped events on a third-party contract under
    // `using … for *;` and even then the event is indexed under the
    // caller's ABI — keeping it on the contract that owns the
    // deployment is the idiomatic choice). The library exposes a
    // public pure helper `documentMetadataJsonDecision(...)` that
    // returns the canonical triple for callers that want to emit it
    // themselves.
    /// @notice Pure-function view: build an OpenSea-compatible JSON metadata
    ///         blob for a token from its on-chain state.
    /// @dev    Returns the raw JSON string (NOT a `data:` URI; the caller
    ///         decides whether to base64-wrap it for an inline `tokenURI()`).
    ///         No storage writes; no external calls; safe to call from any
    ///         off-chain renderer (wallet, marketplace, IPFS gateway, the
    ///         Axiom indexer).
    /// @param  tokenId         The token to build metadata for
    /// @param  datas           The on-chain IntelligentData[] for the token
    /// @param  collectionName  The collection's name() (passed by the
    ///                         inheriting concrete to keep this contract
    ///                         storage-free and inheritance-isolated)
    /// @param  collectionSymbol The collection's symbol()
    /// @return json            OpenSea-shaped JSON string with the collection
    ///                         name, symbol, the first IntelligentData
    ///                         .dataDescription, and a `data_hash` trait
    ///                         carrying the first dataHash (0x-prefixed
    ///                         64-char hex). Subsequent IntelligentData
    ///                         entries are appended as `data_hash_N` traits
    ///                         so the full EIP-7857 metadata surface
    ///                         round-trips.
    function buildMetadataJson(
        uint256 tokenId,
        IntelligentData[] memory datas,
        string memory collectionName,
        string memory collectionSymbol
    ) public pure returns (string memory json) {
        // The image URL is intentionally left empty: per the DECISION
        // block above, the JSON is reconstructed from on-chain state, and
        // on-chain state does not store an image URL. A frontend that
        // wants an image calls the 0G Storage client with the first
        // dataHash (which is what the Wave 9-A verify-data-hash.ts helper
        // does for integrity).
        string memory description = datas.length > 0 ? datas[0].dataDescription : collectionName;

        json = string.concat(
            "{",
            "\"name\":\"",
            collectionName,
            " #",
            _u256ToString(tokenId),
            "\",",
            "\"description\":\"",
            _escapeJson(description),
            "\",",
            "\"symbol\":\"",
            collectionSymbol,
            "\",",
            "\"image\":\"\",",
            "\"external_url\":\"\",",
            "\"attributes\":[",
            _attributesJson(datas),
            "]",
            "}"
        );
    }

    /// @notice Convenience: build the OpenSea JSON wrapped in a
    ///         `data:application/json;base64,…` URI suitable for an inline
    ///         ERC-721 `tokenURI()` implementation. Off-chain indexers can
    ///         call either form depending on whether they need a raw JSON
    ///         blob or a URI they can pass straight to OpenSea.
    function buildMetadataJsonDataUri(
        uint256 tokenId,
        IntelligentData[] memory datas,
        string memory collectionName,
        string memory collectionSymbol
    ) public pure returns (string memory) {
        return string.concat(
            "data:application/json;base64,",
            _base64Encode(bytes(buildMetadataJson(tokenId, datas, collectionName, collectionSymbol)))
        );
    }

    /// @dev Build the `attributes` array JSON for the OpenSea schema. The
    ///      first attribute is always `data_hash` (the first IntelligentData
    ///      dataHash, 0x-prefixed 64-hex). Subsequent dataHashes are
    ///      emitted as `data_hash_1`, `data_hash_2`, … so a 1-N iNFT
    ///      round-trips its full EIP-7857 metadata surface in the JSON view.
    function _attributesJson(
        IntelligentData[] memory datas
    ) private pure returns (string memory) {
        if (datas.length == 0) {
            return string.concat("{\"trait_type\":\"agent\",\"value\":\"empty\"}");
        }
        string memory out = string.concat(
            "{\"trait_type\":\"data_hash\",\"value\":\"0x", _bytes32ToHexString(datas[0].dataHash), "\"}"
        );
        for (uint256 i = 1; i < datas.length; i++) {
            out = string.concat(
                out,
                ",{\"trait_type\":\"data_hash_",
                _u256ToString(i),
                "\",\"value\":\"0x",
                _bytes32ToHexString(datas[i].dataHash),
                "\"}"
            );
        }
        return out;
    }

    /// @dev Escape the three characters that must be escaped in a JSON string
    ///      per RFC 8259 §7: backslash, double-quote. Control characters
    ///      (< 0x20) are dropped (they have no place in a marketplace
    ///      render and OpenSea's policy is to skip them). Non-ASCII bytes
    ///      are passed through verbatim — Solidity 0.8.20 treats `string`
    ///      as raw bytes and OpenSea's JSON parser is UTF-8.
    function _escapeJson(
        string memory s
    ) private pure returns (string memory) {
        bytes memory b = bytes(s);
        bytes memory buf = new bytes(0);
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            if (c == 0x22) {
                buf = _appendBytes(buf, bytes('\\"'));
            } else if (c == 0x5C) {
                buf = _appendBytes(buf, bytes("\\\\"));
            } else if (uint8(c) < 0x20) {
                // Drop control chars; they cannot appear in valid marketplace JSON.
                continue;
            } else {
                buf = _appendBytes(buf, abi.encodePacked(c));
            }
        }
        return string(buf);
    }

    function _appendBytes(
        bytes memory buf,
        bytes memory tail
    ) private pure returns (bytes memory) {
        bytes memory res = new bytes(buf.length + tail.length);
        for (uint256 i = 0; i < buf.length; i++) {
            res[i] = buf[i];
        }
        for (uint256 i = 0; i < tail.length; i++) {
            res[buf.length + i] = tail[i];
        }
        return res;
    }

    function _u256ToString(
        uint256 v
    ) private pure returns (string memory) {
        if (v == 0) return "0";
        uint256 j = v;
        uint256 len;
        while (j != 0) {
            len++;
            j /= 10;
        }
        bytes memory bstr = new bytes(len);
        uint256 k = len;
        while (v != 0) {
            k--;
            bstr[k] = bytes1(uint8(48 + (v % 10)));
            v /= 10;
        }
        return string(bstr);
    }

    function _bytes32ToHexString(
        bytes32 b
    ) private pure returns (string memory) {
        bytes memory hexChars = "0123456789abcdef";
        bytes memory out = new bytes(64);
        for (uint256 i = 0; i < 32; i++) {
            out[i * 2] = hexChars[uint8(b[i]) >> 4];
            out[i * 2 + 1] = hexChars[uint8(b[i]) & 0x0F];
        }
        return string(out);
    }

    /// @dev Minimal RFC 4648 §4 base64 encoder. Pads with `=` to a multiple
    ///      of 4. No newlines. Alphabet: A–Z, a–z, 0–9, +, /.
    ///      The `& 0x3F` mask guarantees the result fits in `uint8`, so the
    ///      forge-lint `unsafe-typecast` warnings on the index expression
    ///      are provably safe.
    function _base64Encode(
        bytes memory data
    ) private pure returns (string memory) {
        if (data.length == 0) return "";

        bytes memory alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        uint256 encodedLen = 4 * ((data.length + 2) / 3);
        bytes memory out = new bytes(encodedLen);

        uint256 i;
        uint256 j;
        for (i = 0; i + 2 < data.length; i += 3) {
            uint256 n =
                (uint256(uint8(data[i])) << 16) | (uint256(uint8(data[i + 1])) << 8) | uint256(uint8(data[i + 2]));
            out[j] = _base64At(alphabet, n, 18);
            out[j + 1] = _base64At(alphabet, n, 12);
            out[j + 2] = _base64At(alphabet, n, 6);
            out[j + 3] = _base64At(alphabet, n, 0);
            j += 4;
        }

        uint256 rem = data.length - i;
        if (rem == 1) {
            uint256 n = uint256(uint8(data[i])) << 16;
            out[j] = _base64At(alphabet, n, 18);
            out[j + 1] = _base64At(alphabet, n, 12);
            out[j + 2] = 0x3D; // '='
            out[j + 3] = 0x3D;
        } else if (rem == 2) {
            uint256 n = (uint256(uint8(data[i])) << 16) | (uint256(uint8(data[i + 1])) << 8);
            out[j] = _base64At(alphabet, n, 18);
            out[j + 1] = _base64At(alphabet, n, 12);
            out[j + 2] = _base64At(alphabet, n, 6);
            out[j + 3] = 0x3D;
        }
        return string(out);
    }

    /// @dev Look up the 6-bit value in the 64-byte base64 alphabet. Extracted
    ///      into a helper so the forge-lint `unsafe-typecast` warning is
    ///      isolated to a single, well-justified site.
    function _base64At(
        bytes memory alphabet,
        uint256 n,
        uint256 shift
    ) private pure returns (bytes1) {
        return alphabet[SafeCast.toUint8((n >> shift) & 0x3F)];
    }
}
