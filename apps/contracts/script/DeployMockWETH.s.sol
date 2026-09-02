// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {AxiomMockWETH} from "../src/mocks/AxiomMockUSDC.sol";

/// @title DeployMockWETH — Deploy the axmWETH mock (swap pair token B, V3 W6)
///        and log the address. No wiring is performed here: setSwapPairToken()
///        is an admin op on the PaymentProcessor proxy and runs separately.
/// @dev    Broadcast key discipline: export DEPLOYER_PK at run time from
///         ../../.env TEE_SIGNER_PK — never print or commit it.
///   DEPLOYER_PK=<pk> forge script script/DeployMockWETH.s.sol \
///     --rpc-url https://evmrpc-testnet.0g.ai --chain-id 16602 \
///     --legacy --gas-price 2100000000 --slow --broadcast
contract DeployMockWETH is Script {
    uint256 internal constant GALILEO_CHAIN_ID = 16_602;

    error WrongChain(uint256 actual, uint256 expected);

    function run() external {
        if (block.chainid != GALILEO_CHAIN_ID) {
            revert WrongChain(block.chainid, GALILEO_CHAIN_ID);
        }
        console2.log("[DeployMockWETH] chainId:", block.chainid, "(Galileo)");

        uint256 deployerKey = vm.envUint("DEPLOYER_PK");

        vm.startBroadcast(deployerKey);
        AxiomMockWETH weth = new AxiomMockWETH();
        vm.stopBroadcast();

        require(keccak256(bytes(weth.symbol())) == keccak256(bytes("axmWETH")), "symbol mismatch");
        require(weth.decimals() == 18, "decimals mismatch");
        console2.log("========== DeployMockWETH ==========");
        console2.log("AxiomMockWETH at:", address(weth));
    }
}
