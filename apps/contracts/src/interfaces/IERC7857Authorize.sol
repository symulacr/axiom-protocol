// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC7857} from "./IERC7857.sol";

/// @title IERC7857Authorize — extension letting the owner grant usage rights (max 100 per token, cleared on transfer)
interface IERC7857Authorize is IERC7857 {
    error ERC7857InvalidAuthorizedUser(address user);
    error ERC7857TooManyAuthorizedUsers();
    error ERC7857AlreadyAuthorized();
    error ERC7857NotAuthorized();

    /// @dev NOTE: `to` is NOT indexed — ABI compatibility constraint per EIP-7857; corrected in v2.
    event Authorization(address indexed from, address indexed to, uint256 indexed tokenId);
    event AuthorizationRevoked(address indexed from, address indexed to, uint256 indexed tokenId);

    /// @notice Authorize a user to access the token's private encrypted metadata
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
