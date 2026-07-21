// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC7857} from "./IERC7857.sol";

/// @title IERC7857Authorize
/// @notice Extension to ERC-7857 that lets the owner grant usage rights to other addresses
/// @dev Max 100 authorized users per token; cleared on transfer
interface IERC7857Authorize is IERC7857 {
    error ERC7857InvalidAuthorizedUser(address user);
    error ERC7857TooManyAuthorizedUsers();
    error ERC7857AlreadyAuthorized();
    error ERC7857NotAuthorized();

    /// @dev NOTE: `to` parameter is NOT indexed (ABI compatibility constraint).
    /// Per EIP-7857 spec, both `tokenId` and `to` should be indexed.
    /// Will be corrected in next major version (v2).
    event Authorization(address indexed from, address indexed to, uint256 indexed tokenId);
    event AuthorizationRevoked(address indexed from, address indexed to, uint256 indexed tokenId);

    /// @notice Authorize a user to use the token's private metadata
    /// @param _tokenId Token to authorize
    /// @param _user Address to authorize
    function authorizeUsage(
        uint256 _tokenId,
        address _user
    ) external;

    function revokeAuthorization(
        uint256 _tokenId,
        address _user
    ) external;

    function authorizedUsersOf(
        uint256 _tokenId
    ) external view returns (address[] memory);
}
