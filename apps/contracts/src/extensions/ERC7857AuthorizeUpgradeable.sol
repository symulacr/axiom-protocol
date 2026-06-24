// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Derived from 0G Agentic ID reference (MIT)
// https://github.com/0gfoundation/0g-agent-nft
// Forked because Axiom's ERC7857Upgradeable uses 3-arg verifyTransferValidity
// (EIP-712 domain binding per security fix F-03/F-04/F-12)
// Reference uses 1-arg verifyTransferValidity — incompatible base contract
//
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {ERC7857Upgradeable} from "../ERC7857Upgradeable.sol";
import {IERC7857Authorize} from "../interfaces/IERC7857Authorize.sol";
import {IntelligentData} from "../interfaces/IERC7857Metadata.sol";

/// @title ERC7857AuthorizeUpgradeable
/// @notice Extension that lets the owner grant usage rights to other addresses (max 100, cleared on transfer)
/// @dev Adapted from the 0G Agentic ID reference (MIT)
abstract contract ERC7857AuthorizeUpgradeable is IERC7857Authorize, ERC7857Upgradeable {
    using EnumerableSet for EnumerableSet.AddressSet;

    uint256 public constant MAX_AUTHORIZED_USERS = 100;

    /// @custom:storage-location erc7857:0g.storage.ERC7857Authorize
    struct ERC7857AuthorizeStorage {
        mapping(uint256 tokenId => EnumerableSet.AddressSet) authorizedUsers;
    }

    // keccak256(abi.encode(uint256(keccak256("0g.storage.ERC7857Authorize")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant STORAGE_LOCATION = 0xf386e9faca35fbde2fe950510f665060c1dd15a136a76c268b6e6459b9945700;

    function _getERC7857AuthorizeStorage() private pure returns (ERC7857AuthorizeStorage storage $) {
        assembly {
            $.slot := STORAGE_LOCATION
        }
    }

    function authorizedUsersOf(uint256 tokenId) public view virtual returns (address[] memory) {
        ERC7857AuthorizeStorage storage $ = _getERC7857AuthorizeStorage();
        if (_ownerOf(tokenId) == address(0)) {
            revert ERC721NonexistentToken(tokenId);
        }
        return $.authorizedUsers[tokenId].values();
    }

    function _authorizeUsage(uint256 tokenId, address to) internal {
        ERC7857AuthorizeStorage storage $ = _getERC7857AuthorizeStorage();

        EnumerableSet.AddressSet storage authorizedUsers = $.authorizedUsers[tokenId];

        if (authorizedUsers.length() >= MAX_AUTHORIZED_USERS) {
            revert ERC7857TooManyAuthorizedUsers();
        }

        if (authorizedUsers.contains(to)) {
            revert ERC7857AlreadyAuthorized();
        }

        authorizedUsers.add(to);

        emit Authorization(msg.sender, to, tokenId);
    }

    function _clearAuthorized(uint256 tokenId) internal {
        ERC7857AuthorizeStorage storage $ = _getERC7857AuthorizeStorage();
        address[] memory values = $.authorizedUsers[tokenId].values();
        for (uint256 i = 0; i < values.length; ++i) {
            $.authorizedUsers[tokenId].remove(values[i]);
        }
    }

    function authorizeUsage(uint256 tokenId, address to) public virtual {
        if (to == address(0)) {
            revert ERC7857InvalidAuthorizedUser(address(0));
        }

        if (_ownerOf(tokenId) != msg.sender) {
            revert ERC721IncorrectOwner(msg.sender, tokenId, _ownerOf(tokenId));
        }

        _authorizeUsage(tokenId, to);
    }

    function revokeAuthorization(uint256 tokenId, address user) public virtual {
        ERC7857AuthorizeStorage storage $ = _getERC7857AuthorizeStorage();
        if (_ownerOf(tokenId) != msg.sender) {
            revert ERC721InvalidSender(msg.sender);
        }
        if (user == address(0)) {
            revert ERC7857InvalidAuthorizedUser(user);
        }

        if (!$.authorizedUsers[tokenId].remove(user)) {
            revert ERC7857NotAuthorized();
        }

        emit AuthorizationRevoked(tokenId, msg.sender, user);
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC7857Upgradeable, IERC165) returns (bool) {
        return interfaceId == type(IERC7857Authorize).interfaceId
            || super.supportsInterface(interfaceId);
    }

    function _update(address to, uint256 tokenId, address auth) internal virtual override returns (address) {
        address from = super._update(to, tokenId, auth);
        _clearAuthorized(tokenId);
        return from;
    }
}
