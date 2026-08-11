// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IntelligentData} from "../interfaces/IERC7857Metadata.sol";

/// @title AxiomMetadataJson — non-additive iNFT metadata extension for the AxiomAgentNFT contract
/// @dev 2-root-hash metadata pattern REJECTED: EIP-7857's `intelligentDatasOf` already carries description + dataHash, and an unencrypted JSON blob would defeat the standard's privacy guarantee. Adds no storage/roles/bytes — a pure view rebuilds OpenSea JSON from on-chain state. 0G reference (MIT); the sentinel event lives on AxiomAgentNFT because libraries cannot emit contract-scoped events.
library AxiomMetadataJson {
    /// @notice Build OpenSea-compatible JSON from on-chain state; raw string (not a data: URI), no storage writes, safe for any off-chain renderer. Emits name/symbol, first dataDescription, and data_hash traits (0x-prefixed 64-hex; extras as data_hash_N).
    function buildMetadataJson(
        uint256 tokenId,
        IntelligentData[] memory datas,
        string memory collectionName,
        string memory collectionSymbol
    ) public pure returns (string memory json) {
        // Image URL intentionally empty — on-chain state holds none; frontends fetch it via the first dataHash from 0G Storage.
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

    /// @notice buildMetadataJson wrapped as a `data:application/json;base64,…` URI for an inline ERC-721 tokenURI().
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

    /// @dev data_hash trait for the first dataHash, then data_hash_1..N so a 1-N iNFT round-trips its full metadata surface.
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

    /// @dev Escape RFC 8259 §7 characters; control bytes become \uXXXX while non-ASCII passes through (Solidity string is raw bytes; OpenSea parses UTF-8).
    function _escapeJson(
        string memory s
    ) private pure returns (string memory) {
        bytes memory b = bytes(s);
        string memory out;
        unchecked {
            for (uint256 i = 0; i < b.length; i++) {
                bytes1 char = b[i];
                if (char == '"') { out = string.concat(out, '\\"'); }
                else if (char == '\\') { out = string.concat(out, '\\\\'); }
                else if (char == '/') { out = string.concat(out, '\\/'); }
                else if (char == '\x08') { out = string.concat(out, '\\b'); }
                else if (char == '\x0c') { out = string.concat(out, '\\f'); }
                else if (char == '\n') { out = string.concat(out, '\\n'); }
                else if (char == '\r') { out = string.concat(out, '\\r'); }
                else if (char == '\t') { out = string.concat(out, '\\t'); }
                else if (char < 0x20) {
                    out = string.concat(out, '\\u', string(abi.encodePacked(_hexDigit(uint8(char) >> 4))), string(abi.encodePacked(_hexDigit(uint8(char) & 0x0F))));
                } else {
                    out = string.concat(out, string(abi.encodePacked(char)));
                }
            }
        }
        return out;
    }

    function _hexDigit(uint8 x) private pure returns (bytes1) {
        if (x < 10) return bytes1(uint8(48 + x));
        return bytes1(uint8(87 + x));
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

    /// @dev Minimal RFC 4648 §4 base64 (pads `=`, no newlines); the & 0x3F mask makes the forge-lint unsafe-typecast site provably safe.
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
            out[j + 2] = 0x3D;
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

    function _base64At(
        bytes memory alphabet,
        uint256 n,
        uint256 shift
    ) private pure returns (bytes1) {
        return alphabet[SafeCast.toUint8((n >> shift) & 0x3F)];
    }
}
