// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {AxiomPaymentProcessor} from "../src/AxiomPaymentProcessor.sol";

/// @title UpgradeProcessor2771.s.sol — V3 W5: upgrade the Galileo PaymentProcessor to the
///        ERC-2771 implementation (modeled on UpgradeProcessorStatefold.s.sol from W4) and wire
///        the deployed AxiomGasTank as the sole trusted forwarder. State (earnings, royalties,
///        caps, treasury, vault) is preserved — only the code hash changes; the single new
///        storage field (trustedForwarder) sits at the namespace gap tail and defaults to zero
///        ("no forwarder trusted") until setTrustedForwarder runs.
/// @dev    Invocation (default profile, via_ir ON):
///   DEPLOYER_PK=<pk> PROCESSOR_PROXY=<proxy> GAS_TANK=<gastank> \
///   forge script script/UpgradeProcessor2771.s.sol \
///     --rpc-url https://evmrpc-testnet.0g.ai --chain-id 16602 \
///     --legacy --gas-price 2000000000 --slow --broadcast
///   Key discipline (w4 §3, verbatim): DEPLOYER_PK is exported at run time from ../../.env
///   TEE_SIGNER_PK (= ORACLE_ADMIN = DEFAULT_ADMIN on the Processor proxy) — never printed.
contract UpgradeProcessor2771 is Script {
    uint256 internal constant GALILEO_CHAIN_ID = 16_602;

    error WrongChain(uint256 actual, uint256 expected);

    function run() external {
        if (block.chainid != GALILEO_CHAIN_ID) {
            revert WrongChain(block.chainid, GALILEO_CHAIN_ID);
        }
        console2.log("[UpgradeProcessor2771] chainId:", block.chainid, "(Galileo)");

        uint256 deployerKey = vm.envUint("DEPLOYER_PK");
        address processorProxy = vm.envAddress("PROCESSOR_PROXY");
        address gasTank = vm.envAddress("GAS_TANK");

        vm.startBroadcast(deployerKey);
        AxiomPaymentProcessor newImpl = new AxiomPaymentProcessor();
        console2.log("New Processor implementation (ERC-2771) at:", address(newImpl));
        AxiomPaymentProcessor(payable(processorProxy)).upgradeToAndCall(address(newImpl), "");
        AxiomPaymentProcessor(payable(processorProxy)).setTrustedForwarder(gasTank);
        vm.stopBroadcast();

        // Post-checks: forwarder wired, pre-upgrade state preserved.
        AxiomPaymentProcessor p = AxiomPaymentProcessor(payable(processorProxy));
        console2.log("Proxy now at impl:", address(newImpl));
        require(p.isTrustedForwarder(gasTank), "2771: forwarder not wired");
        require(p.trustedForwarder() == gasTank, "2771: forwarder mismatch");
        console2.log("trustedForwarder (wired):", p.trustedForwarder());
        console2.log("paymentToken (state preserved):", p.paymentToken());
        console2.log("maxPayCap (state preserved):", p.maxPayCap());
        console2.log("computeRatioMax (state preserved):", p.computeRatioMax());
        console2.log("Upgrade complete - Processor is ERC-2771 relayable via the GasTank.");
    }
}
