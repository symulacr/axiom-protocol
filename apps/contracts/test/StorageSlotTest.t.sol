// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";

/// @dev EIP-7201 slot verification.
/// Each storage namespace is derived from the comment above the STORAGE_LOCATION constant
/// in each contract, and the expected hex is the hardcoded constant value.
/// This test catches any drift between the namespace string and the constant.
contract StorageSlotTest is Test {
    /// @dev keccak256(abi.encode(uint256(keccak256(bytes(namespace))) - 1)) & ~bytes32(uint256(0xff))
    function _eip7201(string memory namespace) internal pure returns (bytes32) {
        bytes32 hash = keccak256(bytes(namespace));
        uint256 h;
        assembly {
            h := hash
        }
        unchecked {
            h = h - 1;
        }
        bytes32 result = keccak256(abi.encode(h));
        return result & ~bytes32(uint256(0xff));
    }

    function test_EIP7201_AxiomAgentNFT() public {
        assertEq(
            _eip7201("agent.storage.AxiomAgentNFT"),
            0xe982fe9a44d6409dbf89634fae06be5c796203a5c100b2ec87b395d27194a900,
            "AxiomAgentNFT STORAGE_LOCATION does not match EIP-7201"
        );
    }

    function test_EIP7201_AxiomPaymentProcessor() public {
        assertEq(
            _eip7201("agent.storage.AxiomPaymentProcessor"),
            0xb6e9ac8ab7d5307044651d01576943b58a3563d54e8f2be64d1601b1a6cebc00,
            "AxiomPaymentProcessor STORAGE_LOCATION does not match EIP-7201"
        );
    }

    function test_EIP7201_ERC7857() public {
        assertEq(
            _eip7201("0g.storage.ERC7857"),
            0xa2b40c657abdbf180a6038c081d3a0af6206dcea36f4558f991bf8c787ef3c00,
            "ERC7857Upgradeable STORAGE_LOCATION does not match EIP-7201"
        );
    }

    function test_EIP7201_ERC7857Authorize() public {
        assertEq(
            _eip7201("0g.storage.ERC7857Authorize"),
            0xf386e9faca35fbde2fe950510f665060c1dd15a136a76c268b6e6459b9945700,
            "ERC7857AuthorizeUpgradeable STORAGE_LOCATION does not match EIP-7201"
        );
    }

    function test_EIP7201_ERC7857Cloneable() public {
        assertEq(
            _eip7201("0g.storage.ERC7857Cloneable"),
            0x03de6cf14ecf4575e0ed0cc2fdb9b7ee13500cb3c0c403254fc893bf6e0c8000,
            "ERC7857CloneableUpgradeable STORAGE_LOCATION does not match EIP-7201"
        );
    }

    function test_EIP7201_ERC7857IDataStorage() public {
        assertEq(
            _eip7201("0g.storage.ERC7857IDataStorage"),
            0xcee27158032fdbe7e1246476ff878669b520bc82ee1a949d22135b88cc5f5b00,
            "ERC7857IDataStorageUpgradeable STORAGE_LOCATION does not match EIP-7201"
        );
    }
}
