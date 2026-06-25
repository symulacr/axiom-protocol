// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {AxiomPaymentProcessor} from "../src/AxiomPaymentProcessor.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title AxiomMockUSDC — mintable ERC-20 for Galileo (no real USDC.e exists)
contract AxiomMockUSDC is ERC20 {
    constructor() ERC20("Axiom Mock USDC", "axmUSDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @title DeployPaymentProcessor.s.sol — Redeploy AxiomPaymentProcessor on Galileo
/// @notice Original broadcast was left pending (never mined). Deploys mock USDC first,
///         then the processor via plain CREATE.
/// @dev AXIOM_ORACLE_ADMIN_PK=<pk> forge script script/DeployPaymentProcessor.s.sol --rpc-url https://evmrpc-testnet.0g.ai --chain-id 16602 --broadcast --priority-gas-price 2000000000 --legacy --slow
contract DeployPaymentProcessor is Script {
    uint256 internal constant GALILEO_CHAIN_ID = 16602;

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
            console2.log("[DeployPaymentProcessor] NOTE: 0xEf1bA81... already has code; nothing to do.");
            return;
        }

        vm.startBroadcast(operatorKey);
        AxiomMockUSDC paymentToken = new AxiomMockUSDC();
        console2.log("[DeployPaymentProcessor] AxiomMockUSDC deployed at:", address(paymentToken));

        bytes32 salt = keccak256("AxiomPaymentProcessor.galileo.2026-06-14");
        bytes memory initCode = abi.encodePacked(
            type(AxiomPaymentProcessor).creationCode,
            abi.encode(nftProxy, address(paymentToken), operator, uint256(100), operator)
        );
        address create2Predicted = vm.computeCreate2Address(salt, keccak256(initCode), operator);
        console2.log("[DeployPaymentProcessor] CREATE2 predicted address :", create2Predicted);
        console2.log("[DeployPaymentProcessor] Target (docs) address      :", targetAddress);

        if (create2Predicted == targetAddress) {
            console2.log("[DeployPaymentProcessor] CREATE2 predicted == TARGET.");
        } else {
            console2.log("[DeployPaymentProcessor] CREATE2 predicted != TARGET -- using plain CREATE.");
        }

        AxiomPaymentProcessor processor = new AxiomPaymentProcessor(
            nftProxy,
            address(paymentToken),
            operator, // treasury
            100,      // 1% protocol fee
            operator  // owner
        );
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
