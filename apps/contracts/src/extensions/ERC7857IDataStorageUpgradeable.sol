// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Forked from 0G reference (MIT): Axiom's base uses 3-arg verifyTransferValidity (EIP-712 domain binding, fixes F-03/F-04/F-12); the reference's 1-arg form is incompatible.

import {ERC7857Upgradeable} from "../ERC7857Upgradeable.sol";
import {IntelligentData} from "../interfaces/IERC7857Metadata.sol";

/// @title ERC7857IDataStorageUpgradeable — stores IntelligentData[] per token (0G reference MIT)
abstract contract ERC7857IDataStorageUpgradeable is ERC7857Upgradeable {
    /// @custom:storage-location erc7857:0g.storage.ERC7857IDataStorage
    struct ERC7857IDataStorageStorage {
        mapping(uint256 tokenId => IntelligentData[]) iDatas;
        uint256[50] __gap;
    }

    bytes32 private constant STORAGE_LOCATION = 0xcee27158032fdbe7e1246476ff878669b520bc82ee1a949d22135b88cc5f5b00;

    function _getERC7857IDataStorageStorage() private pure returns (ERC7857IDataStorageStorage storage $) {
        assembly {
            $.slot := STORAGE_LOCATION
        }
    }

    /// @notice Emitted whenever a token's stored IntelligentData array is replaced wholesale
    event Updated(uint256 indexed tokenId, IntelligentData[] oldDatas, IntelligentData[] newDatas);

    function _intelligentDatasOf(
        uint256 tokenId
    ) internal view virtual override returns (IntelligentData[] memory) {
        ERC7857IDataStorageStorage storage $ = _getERC7857IDataStorageStorage();
        return $.iDatas[tokenId];
    }

    function _intelligentDatasLengthOf(
        uint256 tokenId
    ) internal view virtual override returns (uint256) {
        ERC7857IDataStorageStorage storage $ = _getERC7857IDataStorageStorage();
        return $.iDatas[tokenId].length;
    }

    function _updateData(
        uint256 tokenId,
        IntelligentData[] memory newDatas
    ) internal virtual override {
        ERC7857IDataStorageStorage storage $ = _getERC7857IDataStorageStorage();
        // Cache pointer + length to avoid re-hashing the mapping per loop; delete must target the mapping value, not the pointer (compiler forbids pointer delete).
        IntelligentData[] storage stored = $.iDatas[tokenId];
        uint256 oldLen = stored.length;

        IntelligentData[] memory oldDatas = new IntelligentData[](oldLen);
        for (uint256 i = 0; i < oldLen; i++) {
            oldDatas[i] = stored[i];
        }

        delete $.iDatas[tokenId];
        for (uint256 i = 0; i < newDatas.length; i++) {
            stored.push(newDatas[i]);
        }

        emit Updated(tokenId, oldDatas, newDatas);
    }
}
