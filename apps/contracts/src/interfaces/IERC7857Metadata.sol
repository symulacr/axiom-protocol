// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC7857Metadata as IERC7857MetadataBase, IntelligentData} from "@0g-agent-nft/interfaces/IERC7857Metadata.sol";

/// @title IERC7857Metadata — ERC-7857 metadata interface with a singular alias for EIP compliance
interface IERC7857Metadata is IERC7857MetadataBase {
    /// @notice Alias for intelligentDatasOf, since EIP-7857 uses the singular form
    function intelligentDataOf(
        uint256 tokenId
    ) external view returns (IntelligentData[] memory data);
}
