// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {AxiomPaymentProcessor} from "../src/AxiomPaymentProcessor.sol";

/// @title UpgradeProcessorStatefold.s.sol — V3 W4 "5-contract fold" upgrade of the Galileo
///        PaymentProcessor (modeled on UpgradeProcessorWitness.s.sol from the witness-fix wave).
/// @notice Deploys the statefold Processor implementation (folded AxiomStateView views +
///         `axiomVault` storage var), hot-swaps the existing V3 proxy to it, then wires the live
///         V3 vault via setAxiomVault. State (earnings, royalties, caps, treasury) is preserved —
///         only the code hash changes; the standalone AxiomStateView facade is retired.
/// @dev    Invocation (default profile, via_ir ON):
///   DEPLOYER_PK=<pk> PROCESSOR_PROXY=<proxy> VAULT=<vault> \
///   forge script script/UpgradeProcessorStatefold.s.sol \
///     --rpc-url https://evmrpc-testnet.0g.ai --chain-id 16602 \
///     --legacy --gas-price 2000000000 --slow --broadcast
contract UpgradeProcessorStatefold is Script {
    uint256 internal constant GALILEO_CHAIN_ID = 16_602;

    error WrongChain(uint256 actual, uint256 expected);

    function run() external {
        if (block.chainid != GALILEO_CHAIN_ID) {
            revert WrongChain(block.chainid, GALILEO_CHAIN_ID);
        }
        console2.log("[UpgradeProcessorStatefold] chainId:", block.chainid, "(Galileo)");

        uint256 deployerKey = vm.envUint("DEPLOYER_PK");
        address processorProxy = vm.envAddress("PROCESSOR_PROXY");
        address vault = vm.envAddress("VAULT");

        vm.startBroadcast(deployerKey);
        AxiomPaymentProcessor newImpl = new AxiomPaymentProcessor();
        console2.log("New Processor implementation at:", address(newImpl));
        AxiomPaymentProcessor(payable(processorProxy)).upgradeToAndCall(address(newImpl), "");
        AxiomPaymentProcessor(payable(processorProxy)).setAxiomVault(vault);
        vm.stopBroadcast();

        // Post-checks: state preserved, code swapped, vault wired.
        AxiomPaymentProcessor p = AxiomPaymentProcessor(payable(processorProxy));
        console2.log("Proxy now at impl:", address(newImpl));
        console2.log("axiomVault (wired):", p.axiomVault());
        require(p.axiomVault() == vault, "statefold: axiomVault mismatch");
        console2.log("paymentToken (state preserved):", p.paymentToken());
        console2.log("maxPayCap (state preserved):", p.maxPayCap());
        console2.log("computeRatioMax (state preserved):", p.computeRatioMax());
        console2.log("Upgrade complete - statefold views live on the Processor.");
    }
}
