// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC7857Metadata as IERC7857MetadataBase, IntelligentData} from "@0g-agent-nft/interfaces/IERC7857Metadata.sol";

/// @title IERC7857Metadata
/// @notice ERC-7857 metadata interface with singular alias for EIP compliance
interface IERC7857Metadata is IERC7857MetadataBase {
    /// @notice Alias for intelligentDatasOf (EIP-7857 uses singular form)
    /// @param tokenId The token to query
    /// @return data The IntelligentData entries associated with the token
    function intelligentDataOf(uint256 tokenId) external view returns (IntelligentData[] memory data);
}
