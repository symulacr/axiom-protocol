// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Derived from 0G Agentic ID reference (MIT)
// https://github.com/0gfoundation/0g-agent-nft
// Forked because Axiom's ERC7857Upgradeable uses 3-arg verifyTransferValidity
// (EIP-712 domain binding per security fix F-03/F-04/F-12)
// Reference uses 1-arg verifyTransferValidity — incompatible base contract
//
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import {ERC7857Upgradeable} from "../ERC7857Upgradeable.sol";
import {IntelligentData} from "../interfaces/IERC7857Metadata.sol";

/// @title ERC7857IDataStorageUpgradeable
/// @notice Extension that stores IntelligentData[] per token
/// @dev Adapted from https://github.com/0gfoundation/0g-agent-nft (MIT)
abstract contract ERC7857IDataStorageUpgradeable is ERC7857Upgradeable {
    /// @custom:storage-location erc7857:0g.storage.ERC7857IDataStorage
    struct ERC7857IDataStorageStorage {
        mapping(uint256 tokenId => IntelligentData[]) iDatas;
    }

    // keccak256(abi.encode(uint256(keccak256("0g.storage.ERC7857IDataStorage")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant STORAGE_LOCATION = 0xcee27158032fdbe7e1246476ff878669b520bc82ee1a949d22135b88cc5f5b00;

    function _getERC7857IDataStorageStorage() private pure returns (ERC7857IDataStorageStorage storage $) {
        assembly {
            $.slot := STORAGE_LOCATION
        }
    }

    /// @notice Emitted when a token's data is updated
    event Updated(uint256 indexed tokenId, IntelligentData[] oldDatas, IntelligentData[] newDatas);

    function _intelligentDatasOf(uint256 tokenId) internal view virtual override returns (IntelligentData[] memory) {
        ERC7857IDataStorageStorage storage $ = _getERC7857IDataStorageStorage();
        return $.iDatas[tokenId];
    }

    function _intelligentDatasLengthOf(uint256 tokenId) internal view virtual override returns (uint256) {
        ERC7857IDataStorageStorage storage $ = _getERC7857IDataStorageStorage();
        return $.iDatas[tokenId].length;
    }

    function _updateData(uint256 tokenId, IntelligentData[] memory newDatas) internal virtual override {
        ERC7857IDataStorageStorage storage $ = _getERC7857IDataStorageStorage();

        IntelligentData[] memory oldDatas = new IntelligentData[]($.iDatas[tokenId].length);
        for (uint256 i = 0; i < $.iDatas[tokenId].length; i++) {
            oldDatas[i] = $.iDatas[tokenId][i];
        }

        delete $.iDatas[tokenId];
        for (uint256 i = 0; i < newDatas.length; i++) {
            $.iDatas[tokenId].push(newDatas[i]);
        }

        emit Updated(tokenId, oldDatas, newDatas);
    }
}
