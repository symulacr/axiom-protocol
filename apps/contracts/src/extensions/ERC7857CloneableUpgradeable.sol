// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Forked from 0G reference (MIT): Axiom's base uses 3-arg verifyTransferValidity (EIP-712 domain binding, fixes F-03/F-04/F-12); the reference's 1-arg form is incompatible.
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {ERC7857Upgradeable} from "../ERC7857Upgradeable.sol";
import {IERC7857Cloneable} from "../interfaces/IERC7857Cloneable.sol";
import {IntelligentData} from "../interfaces/IERC7857Metadata.sol";
import {TransferValidityProof} from "../interfaces/IERC7857DataVerifier.sol";

/// @title ERC7857CloneableUpgradeable — clone a token into a new id carrying the same metadata (0G reference MIT)
abstract contract ERC7857CloneableUpgradeable is IERC7857Cloneable, ERC7857Upgradeable {
    /// @custom:storage-location erc7857:0g.storage.ERC7857Cloneable
    struct ERC7857CloneableStorage {
        uint256 nextTokenId;
        uint256[50] __gap;
    }

    bytes32 private constant STORAGE_LOCATION = 0x03de6cf14ecf4575e0ed0cc2fdb9b7ee13500cb3c0c403254fc893bf6e0c8000;

    function _getERC7857CloneableStorage() private pure returns (ERC7857CloneableStorage storage $) {
        assembly {
            $.slot := STORAGE_LOCATION
        }
    }

    function nextTokenId() public view virtual returns (uint256) {
        return _getERC7857CloneableStorage().nextTokenId;
    }

    function _incrementTokenId() internal returns (uint256) {
        ERC7857CloneableStorage storage $ = _getERC7857CloneableStorage();
        uint256 id = $.nextTokenId;
        $.nextTokenId++;
        return id;
    }

    function _clone(
        address from,
        address to,
        uint256 tokenId,
        TransferValidityProof[] calldata proofs
    ) internal returns (uint256) {
        bytes[] memory sealedKeys = _proofCheck(from, to, tokenId, proofs);

        uint256 newTokenId = _incrementTokenId();
        IntelligentData[] memory datas = _intelligentDatasOf(tokenId);
        _updateData(newTokenId, datas);
        _safeMint(to, newTokenId);

        emit Cloned(tokenId, newTokenId, from, to);
        emit PublishedSealedKey(to, newTokenId, sealedKeys);

        return newTokenId;
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC7857Upgradeable, IERC165) returns (bool) {
        return interfaceId == type(IERC7857Cloneable).interfaceId || super.supportsInterface(interfaceId);
    }

    function iCloneFrom(
        address from,
        address to,
        uint256 tokenId,
        TransferValidityProof[] calldata proofs
    ) public virtual returns (uint256) {
        if (_ownerOf(tokenId) != from) {
            revert ERC721InvalidSender(from);
        }
        _checkAuthorized(from, msg.sender, tokenId);
        return _clone(from, to, tokenId, proofs);
    }

    function iClone(
        address to,
        uint256 tokenId,
        TransferValidityProof[] calldata proofs
    ) public virtual returns (uint256 newTokenId) {
        address from = _ownerOf(tokenId);
        if (from == address(0)) revert ERC721NonexistentToken(tokenId);
        _checkAuthorized(from, _msgSender(), tokenId);
        newTokenId = _clone(from, to, tokenId, proofs);
    }
}
