// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Derived from 0G Agentic ID reference (MIT)
// https://github.com/0gfoundation/0g-agent-nft
// Forked because Axiom's ERC7857Upgradeable uses 3-arg verifyTransferValidity
// (EIP-712 domain binding per security fix F-03/F-04/F-12)
// Reference uses 1-arg verifyTransferValidity — incompatible base contract
//
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {ERC7857Upgradeable} from "../ERC7857Upgradeable.sol";
import {IERC7857Cloneable} from "../interfaces/IERC7857Cloneable.sol";
import {IntelligentData} from "../interfaces/IERC7857Metadata.sol";
import {IERC7857DataVerifier, TransferValidityProof} from "../interfaces/IERC7857DataVerifier.sol";

/// @title ERC7857CloneableUpgradeable
/// @notice Extension that allows cloning a token (new token with same metadata)
/// @dev Adapted from the 0G Agentic ID reference (MIT)
abstract contract ERC7857CloneableUpgradeable is IERC7857Cloneable, ERC7857Upgradeable {
    /// @custom:storage-location erc7857:0g.storage.ERC7857Cloneable
    struct ERC7857CloneableStorage {
        uint256 nextTokenId;
    }

    // keccak256(abi.encode(uint256(keccak256("0g.storage.ERC7857Cloneable")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant STORAGE_LOCATION = 0x03de6cf14ecf4575e0ed0cc2fdb9b7ee13500cb3c0c403254fc893bf6e0c8000;

    function _getERC7857CloneableStorage() private pure returns (ERC7857CloneableStorage storage $) {
        assembly {
            $.slot := STORAGE_LOCATION
        }
    }

    function _incrementTokenId() internal returns (uint256 nextTokenId) {
        ERC7857CloneableStorage storage $ = _getERC7857CloneableStorage();
        nextTokenId = $.nextTokenId;
        $.nextTokenId++;
    }

    function _clone(
        address from,
        address to,
        uint256 tokenId,
        TransferValidityProof[] calldata proofs
    ) internal returns (uint256) {
        bytes[] memory sealedKeys = _proofCheck(from, to, tokenId, proofs);

        uint256 newTokenId = _incrementTokenId();
        _safeMint(to, newTokenId);
        IntelligentData[] memory datas = _intelligentDatasOf(tokenId);
        _updateData(newTokenId, datas);

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
