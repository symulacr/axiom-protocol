// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title AxiomMockUSDC — mintable ERC-20 for Galileo (no canonical USDC.e on testnet)
/// @dev Public `mint` for E2E funding; not for production mainnet payment rails.
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
