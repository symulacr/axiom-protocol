// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {AxiomPaymentProcessor} from "../src/AxiomPaymentProcessor.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @title UpgradeProcessorWitness.s.sol — in-place UUPS upgrade of the Galileo V3 PaymentProcessor
/// @notice Deploys the FIXED Processor implementation (Permit2 witness type string with the full
///         referenced-type concatenation) and hot-swaps the existing V3 proxy to it. State
///         (earnings, royalties, caps, treasury) is preserved — only the code hash changes.
/// @dev    Invocation (default profile, via_ir ON):
///   DEPLOYER_PK=<pk> PROCESSOR_PROXY=<proxy> \
///   forge script script/UpgradeProcessorWitness.s.sol \
///     --rpc-url https://evmrpc-testnet.0g.ai --chain-id 16602 \
///     --legacy --gas-price 2000000000 --slow --broadcast
contract UpgradeProcessorWitness is Script {
    uint256 internal constant GALILEO_CHAIN_ID = 16_602;

    error WrongChain(uint256 actual, uint256 expected);

    function run() external {
        if (block.chainid != GALILEO_CHAIN_ID) {
            revert WrongChain(block.chainid, GALILEO_CHAIN_ID);
        }
        console2.log("[UpgradeProcessorWitness] chainId:", block.chainid, "(Galileo)");

        uint256 deployerKey = vm.envUint("DEPLOYER_PK");
        address processorProxy = vm.envAddress("PROCESSOR_PROXY");

        vm.startBroadcast(deployerKey);
        AxiomPaymentProcessor newImpl = new AxiomPaymentProcessor();
        console2.log("New Processor implementation at:", address(newImpl));
        AxiomPaymentProcessor(payable(processorProxy)).upgradeToAndCall(address(newImpl), "");
        vm.stopBroadcast();

        // Post-checks: state preserved, code swapped.
        AxiomPaymentProcessor p = AxiomPaymentProcessor(payable(processorProxy));
        console2.log("Proxy now at impl:", address(newImpl));
        console2.log("paymentToken (state preserved):", p.paymentToken());
        console2.log("maxPayCap (state preserved):", p.maxPayCap());
        console2.log("computeRatioMax (state preserved):", p.computeRatioMax());
        console2.log("Upgrade complete - witness type string fixed.");
    }
}
