// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title Axiom testnet mock ERC-20s (Galileo 16602). Public mint() is E2E
///        funding only, not production rails.
/// @notice AxiomMockUSDC — 6-decimal mintable payment token stand-in (no
///         canonical USDC.e on testnet).
/// @notice AxiomMockWETH — 18-decimal mintable WETH stand-in for the
///         AxiomPaymentProcessor swap pair (token B; V3 W6).
contract AxiomMockUSDC is ERC20 {
    constructor() ERC20("Axiom Mock USDC", "axmUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(
        address to,
        uint256 amount
    ) external {
        _mint(to, amount);
    }
}

contract AxiomMockWETH is ERC20 {
    constructor() ERC20("Axiom Mock WETH", "axmWETH") {}

    function mint(
        address to,
        uint256 amount
    ) external {
        _mint(to, amount);
    }
}
