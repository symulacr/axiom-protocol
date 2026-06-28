// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {IERC7857} from "./interfaces/IERC7857.sol";
import {IERC7857Metadata, IntelligentData} from "./interfaces/IERC7857Metadata.sol";
import {
    IERC7857DataVerifier,
    TransferValidityProof,
    TransferValidityProofOutput
} from "./interfaces/IERC7857DataVerifier.sol";

import "@0g-agent-nft/Utils.sol";

/// @title ERC7857Upgradeable
/// @notice Base ERC-7857 implementation: token transfer with re-encrypted metadata
/// @dev Adapted from the 0G Agentic ID reference (MIT)
abstract contract ERC7857Upgradeable is IERC7857, ERC721Upgradeable {
    /// @notice Emitted when a token is transferred with proof verification (EIP-7857)
    event Transferred(uint256 _tokenId, address indexed _from, address indexed _to);

    /// @custom:storage-location erc7857:0g.storage.ERC7857
    struct ERC7857Storage {
        mapping(address owner => address) accessAssistants;
        IERC7857DataVerifier verifier;
    }

    // keccak256(abi.encode(uint256(keccak256("0g.storage.ERC7857")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant STORAGE_LOCATION = 0xa2b40c657abdbf180a6038c081d3a0af6206dcea36f4558f991bf8c787ef3c00;

    function _getERC7857Storage() private pure returns (ERC7857Storage storage $) {
        assembly {
            $.slot := STORAGE_LOCATION
        }
    }

    constructor() {
        _disableInitializers();
    }

    function __ERC7857_init(
        string memory name_,
        string memory symbol_,
        address verifier_
    ) internal onlyInitializing {
        __ERC721_init(name_, symbol_);
        __ERC7857_init_unchained(verifier_);
    }

    function __ERC7857_init_unchained(
        address verifier_
    ) internal onlyInitializing {
        _setVerifier(verifier_);
    }

    function _setVerifier(
        address verifier_
    ) internal {
        ERC7857Storage storage $ = _getERC7857Storage();
        $.verifier = IERC7857DataVerifier(verifier_);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(ERC721Upgradeable, IERC165) returns (bool) {
        return interfaceId == type(IERC7857).interfaceId || interfaceId == type(IERC7857Metadata).interfaceId
            || super.supportsInterface(interfaceId);
    }

    function delegateAccess(
        address assistant
    ) public virtual {
        if (assistant == address(0)) {
            revert ERC7857InvalidAssistant(assistant);
        }
        ERC7857Storage storage $ = _getERC7857Storage();
        $.accessAssistants[msg.sender] = assistant;
        emit DelegateAccess(msg.sender, assistant);
    }

    function getDelegateAccess(
        address user
    ) public view virtual returns (address) {
        ERC7857Storage storage $ = _getERC7857Storage();
        return $.accessAssistants[user];
    }

    function _proofCheck(
        address from,
        address to,
        uint256 tokenId,
        TransferValidityProof[] calldata proofs
    ) internal returns (bytes[] memory sealedKeys) {
        ERC7857Storage storage $ = _getERC7857Storage();
        if (to == address(0)) {
            revert ERC721InvalidReceiver(to);
        }
        if (_ownerOf(tokenId) != from) {
            revert ERC721InvalidSender(from);
        }
        if (proofs.length == 0) {
            revert ERC7857EmptyProof();
        }

        TransferValidityProofOutput[] memory proofOutput = $.verifier.verifyTransferValidity(proofs, to, address(this));

        IntelligentData[] memory datas = _intelligentDatasOf(tokenId);

        if (proofOutput.length != datas.length) {
            revert ERC7857ProofCountMismatch();
        }

        sealedKeys = new bytes[](proofOutput.length);

        for (uint256 i = 0; i < proofOutput.length; i++) {
            if (proofOutput[i].dataHash != datas[i].dataHash) {
                revert ERC7857DataHashMismatch();
            }

            if (proofOutput[i].accessAssistant != $.accessAssistants[to] && proofOutput[i].accessAssistant != to) {
                revert ERC7857AccessAssistantMismatch();
            }

            bytes memory wantedKey = proofOutput[i].wantedKey;
            bytes memory targetPubkey = proofOutput[i].targetPubkey;
            if (wantedKey.length == 0) {
                address defaultWantedReceiver = Utils.pubKeyToAddress(targetPubkey);
                if (defaultWantedReceiver != to) {
                    revert ERC7857WantedReceiverMismatch();
                }
            } else {
                if (!Utils.bytesEqual(targetPubkey, wantedKey)) {
                    revert ERC7857TargetPubkeyMismatch();
                }
            }

            sealedKeys[i] = proofOutput[i].sealedKey;
        }
    }

    function _transfer(
        address from,
        address to,
        uint256 tokenId,
        TransferValidityProof[] calldata proofs
    ) internal {
        bytes[] memory sealedKeys = _proofCheck(from, to, tokenId, proofs);
        safeTransferFrom(from, to, tokenId);
        emit PublishedSealedKey(to, tokenId, sealedKeys);
        emit Transferred(tokenId, from, to);
    }

    function iTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        TransferValidityProof[] calldata proofs
    ) public virtual {
        _transfer(from, to, tokenId, proofs);
    }

    function iTransfer(
        address to,
        uint256 tokenId,
        TransferValidityProof[] calldata proofs
    ) public virtual {
        address from = _ownerOf(tokenId);
        if (from == address(0)) revert ERC721NonexistentToken(tokenId);
        _checkAuthorized(from, _msgSender(), tokenId);
        _transfer(from, to, tokenId, proofs);
    }

    function _intelligentDatasOf(
        uint256 /*tokenId*/
    ) internal view virtual returns (IntelligentData[] memory) {
        return new IntelligentData[](0);
    }

    function _intelligentDatasLengthOf(
        uint256 /*tokenId*/
    ) internal view virtual returns (uint256) {
        return 0;
    }

    function _updateData(
        uint256 tokenId,
        IntelligentData[] memory newDatas
    ) internal virtual {}

    function intelligentDatasOf(
        uint256 tokenId
    ) public view virtual returns (IntelligentData[] memory) {
        if (_ownerOf(tokenId) == address(0)) {
            revert ERC721NonexistentToken(tokenId);
        }
        return _intelligentDatasOf(tokenId);
    }

    /// @notice Alias for intelligentDatasOf (EIP-7857 uses singular form)
    function intelligentDataOf(
        uint256 tokenId
    ) external view virtual returns (IntelligentData[] memory data) {
        return intelligentDatasOf(tokenId);
    }

    function verifier() public view virtual returns (IERC7857DataVerifier) {
        ERC7857Storage storage $ = _getERC7857Storage();
        return $.verifier;
    }
}
