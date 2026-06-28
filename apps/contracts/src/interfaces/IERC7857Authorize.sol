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

    /// @dev DEV-NOTE: Per EIP-7857 spec, `_tokenId` and `_to` should both be `indexed`.
    ///      Current form indexes `tokenId` only (not `to`). This is NOT spec-compliant.
    ///      Fix deferred to next major version — changing indexed params is ABI-breaking.
    event Authorization(address indexed from, address indexed to, uint256 indexed tokenId);
    event AuthorizationRevoked(uint256 indexed tokenId, address indexed from, address indexed to);

    /// @notice Authorize a user to use the token's private metadata
    /// @param _tokenId Token to authorize
    /// @param _user Address to authorize
    function authorizeUsage(
        uint256 _tokenId,
        address _user
    ) external;

    /// @notice Revoke a user's authorization
    function revokeAuthorization(
        uint256 _tokenId,
        address _user
    ) external;

    /// @notice Get the list of users authorized for a token
    /// @return Array of authorized user addresses
    function authorizedUsersOf(
        uint256 _tokenId
    ) external view returns (address[] memory);
}
