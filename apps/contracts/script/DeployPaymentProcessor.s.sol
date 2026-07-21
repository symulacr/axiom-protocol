// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {AxiomPaymentProcessor} from "../src/AxiomPaymentProcessor.sol";
import {AxiomMockUSDC} from "../src/mocks/AxiomMockUSDC.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/// @title DeployPaymentProcessor.s.sol — Redeploy AxiomPaymentProcessor on Galileo
/// @notice Original broadcast was left pending (never mined). Deploys mock USDC first,
///         then the processor via plain CREATE.
/// @dev AXIOM_ORACLE_ADMIN_PK=<pk> forge script script/DeployPaymentProcessor.s.sol --rpc-url https://evmrpc-testnet.0g.ai --chain-id 16602 --broadcast --priority-gas-price 2000000000 --legacy --slow
contract DeployPaymentProcessor is Script {
    uint256 internal constant GALILEO_CHAIN_ID = 16_602;

    error WrongChain(uint256 actual, uint256 expected);

    function run() external {
        if (block.chainid != GALILEO_CHAIN_ID) {
            revert WrongChain(block.chainid, GALILEO_CHAIN_ID);
        }
        console2.log("[DeployPaymentProcessor] chainId:", block.chainid, "(Galileo)");

        uint256 operatorKey = vm.envUint("ORACLE_ADMIN_PK");
        address operator = vm.addr(operatorKey);

        address targetAddress = vm.envAddress("AXIOM_PAYMENT_PROCESSOR_ADDRESS");
        address nftProxy = vm.envAddress("AGENT_NFT_ADDRESS");

        bytes memory existing = targetAddress.code;
        if (existing.length != 0) {
            console2.log("[DeployPaymentProcessor] NOTE:", targetAddress, "already has code; nothing to do.");
            return;
        }

        vm.startBroadcast(operatorKey);
        AxiomMockUSDC paymentToken = new AxiomMockUSDC();
        console2.log("[DeployPaymentProcessor] AxiomMockUSDC deployed at:", address(paymentToken));

        // Deploy implementation and wrap in ERC1967Proxy
        AxiomPaymentProcessor processorImpl = new AxiomPaymentProcessor();
        ERC1967Proxy processorProxy = new ERC1967Proxy(
            address(processorImpl),
            abi.encodeWithSelector(
                AxiomPaymentProcessor.initialize.selector,
                nftProxy,
                address(paymentToken),
                operator, // treasury
                uint256(100), // 1% protocol fee
                operator // owner
            )
        );
        AxiomPaymentProcessor processor = AxiomPaymentProcessor(address(processorProxy));
        console2.log("[DeployPaymentProcessor] AxiomPaymentProcessor impl at:", address(processorImpl));
        console2.log("[DeployPaymentProcessor] AxiomPaymentProcessor proxy at:", address(processor));
        console2.log("[DeployPaymentProcessor] AxiomPaymentProcessor deployed at:", address(processor));

        address storedNft = address(processor.AXIOM_NFT());
        require(storedNft == nftProxy, "constructor did not wire AXIOM_NFT correctly");
        console2.log("[DeployPaymentProcessor] AXIOM_NFT confirmed:", storedNft);

        address liveToken = processor.paymentToken();
        require(liveToken == address(paymentToken), "constructor did not wire paymentToken correctly");
        console2.log("[DeployPaymentProcessor] paymentToken confirmed:", liveToken);

        vm.stopBroadcast();

        console2.log("========== DeployPaymentProcessor summary ==========");
        console2.log("Network:               0G Galileo testnet (chainId 16602)");
        console2.log("Operator (broadcaster):", operator);
        console2.log("NFT proxy:             ", nftProxy);
        console2.log("Payment token (mock):  ", address(paymentToken));
        console2.log("Treasury + owner:      ", operator);
        console2.log("Protocol fee (bps):    100");
        console2.log("Live processor at:     ", address(processor));
    }
}
