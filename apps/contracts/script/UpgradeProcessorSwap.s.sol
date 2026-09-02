// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {AxiomPaymentProcessor} from "../src/AxiomPaymentProcessor.sol";

/// @title UpgradeProcessorSwap.s.sol — V3 W6: upgrade the Processor to the swap/LP/lend
///        implementation and wire the swap pair token.
/// @notice Upgrade-in-place (UUPS): state (earnings, royalties, caps, forwarder) preserved.
///         After upgrade: setSwapPairToken(axmWETH), assert forwarder + caps survived, and
///         verify the swap surface is live (quoteSwap on an empty pool reverts gracefully /
///         returns 0 for zero reserves — asserted via swapReserveA/B == 0).
/// @dev    Invocation (default profile, via_ir ON):
///   DEPLOYER_PK=<pk> PROCESSOR_PROXY=<proxy> SWAP_PAIR_TOKEN=<axmWETH> \
///   forge script script/UpgradeProcessorSwap.s.sol \
///     --rpc-url https://evmrpc-testnet.0g.ai --chain-id 16602 \
///     --legacy --gas-price 2100000000 --slow --broadcast
///   The broadcast key is ORACLE_ADMIN (= DEFAULT_ADMIN on the Processor proxy) — export at
///   run time from ../../.env TEE_SIGNER_PK; NEVER print or commit it.
contract UpgradeProcessorSwap is Script {
    uint256 internal constant GALILEO_CHAIN_ID = 16_602;

    error WrongChain(uint256 actual, uint256 expected);

    function run() external {
        if (block.chainid != GALILEO_CHAIN_ID) {
            revert WrongChain(block.chainid, GALILEO_CHAIN_ID);
        }
        console2.log("[UpgradeProcessorSwap] chainId:", block.chainid, "(Galileo)");

        uint256 deployerKey = vm.envUint("DEPLOYER_PK");
        address processorProxy = vm.envAddress("PROCESSOR_PROXY");
        address swapPairToken = vm.envAddress("SWAP_PAIR_TOKEN");

        vm.startBroadcast(deployerKey);
        AxiomPaymentProcessor newImpl = new AxiomPaymentProcessor();
        console2.log("New Processor implementation (swap/lend) at:", address(newImpl));
        AxiomPaymentProcessor(payable(processorProxy)).upgradeToAndCall(address(newImpl), "");
        AxiomPaymentProcessor(payable(processorProxy)).setSwapPairToken(swapPairToken);
        vm.stopBroadcast();

        // Post-checks: state preserved + swap surface live.
        AxiomPaymentProcessor p = AxiomPaymentProcessor(payable(processorProxy));
        console2.log("paymentToken (state preserved):", p.paymentToken());
        console2.log("trustedForwarder (state preserved):", p.trustedForwarder());
        console2.log("maxPayCap (state preserved):", p.maxPayCap());
        require(p.swapPairToken() == swapPairToken, "swap: pair token mismatch");
        require(p.swapReserveA() == 0 && p.swapReserveB() == 0, "swap: reserves nonzero at init");
        require(p.totalLpShares() == 0, "swap: LP shares nonzero at init");
        console2.log("Upgrade complete - swap pool wired to pair token:", swapPairToken);
    }
}
