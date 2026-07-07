// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {AxiomMockUSDC} from "../src/mocks/AxiomMockUSDC.sol";

/// @title MintE2eUsdc — Mint MockUSDC to the E2E operator wallet
/// @dev Default 1_000_000 USDC (6 decimals). Override with E2E_USDC_MINT_AMOUNT.
///      DEPLOYER_PK=<pk> forge script script/MintE2eUsdc.s.sol \
///        --rpc-url https://evmrpc-testnet.0g.ai --chain-id 16602 --broadcast --legacy
contract MintE2eUsdc is Script {
    uint256 internal constant GALILEO_CHAIN_ID = 16_602;
    /// @dev 1_000_000 USDC with 6 decimals
    uint256 internal constant DEFAULT_MINT_AMOUNT = 1_000_000_000_000;

    error WrongChain(uint256 actual, uint256 expected);

    function run() external {
        if (block.chainid != GALILEO_CHAIN_ID) {
            revert WrongChain(block.chainid, GALILEO_CHAIN_ID);
        }

        address tokenAddr = vm.envAddress("AXIOM_PAYMENT_TOKEN");
        address recipient = vm.envAddress("E2E_OPERATOR_ADDRESS");
        uint256 amount = vm.envOr("E2E_USDC_MINT_AMOUNT", DEFAULT_MINT_AMOUNT);

        uint256 broadcasterKey = vm.envUint("DEPLOYER_PK");
        address broadcaster = vm.addr(broadcasterKey);

        AxiomMockUSDC token = AxiomMockUSDC(tokenAddr);
        uint256 beforeBal = token.balanceOf(recipient);

        vm.startBroadcast(broadcasterKey);
        token.mint(recipient, amount);
        vm.stopBroadcast();

        uint256 afterBal = token.balanceOf(recipient);
        console2.log("========== MintE2eUsdc ==========");
        console2.log("Broadcaster:", broadcaster);
        console2.log("Token:      ", tokenAddr);
        console2.log("Recipient:  ", recipient);
        console2.log("Minted:     ", amount);
        console2.log("Balance:    ", beforeBal, "->", afterBal);
    }
}