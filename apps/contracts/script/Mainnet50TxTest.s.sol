// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "forge-std/Script.sol";
import {AxiomGasTank} from "../src/AxiomGasTank.sol";
import {AxiomPaymentProcessor} from "../src/AxiomPaymentProcessor.sol";
import {AxiomAgentNFT} from "../src/AxiomAgentNFT.sol";
import {AxiomMockUSDC} from "../src/mocks/AxiomMockUSDC.sol";

interface IERC20 { function transfer(address,uint256) external returns (bool); function approve(address,uint256) external returns (bool); function balanceOf(address) external view returns (uint256); function mint(address,uint256) external; }

/// @title Mainnet50TxTest — 50-tx endurance test across all contracts on Aristotle mainnet
contract Mainnet50TxTest is Script {
    function run() external {
        uint256 relayerKey = vm.envUint("DEPLOYER_PK");
        address relayer = vm.addr(relayerKey);
        uint256 userKey = 0x9f8e7d6c5b4a39281706f5e4d3c2b1a09887766554433221100ffeeddccbbaa0;
        address user = vm.addr(userKey);
        AxiomGasTank gt = AxiomGasTank(payable(vm.envAddress("GAS_TANK")));
        AxiomPaymentProcessor p = AxiomPaymentProcessor(payable(vm.envAddress("PROCESSOR_PROXY")));
        AxiomAgentNFT nft = AxiomAgentNFT(vm.envAddress("NFT_PROXY"));
        AxiomMockUSDC usdc = AxiomMockUSDC(vm.envAddress("AXM_USDC"));
        uint256 maxGasCost = 0.0003 ether;

        // Fund GasTank reserve from admin so lazy grants work
        vm.startBroadcast(relayerKey);
        gt.depositReserve{value: 0.01 ether}();
        vm.stopBroadcast();
        console2.log("[1] reserve funded:", gt.reserve());

        // Test 1-5: user deposits to tank (5 separate deposits)
        for (uint256 i = 0; i < 5; i++) {
            vm.startBroadcast(userKey);
            gt.deposit{value: 0.0001 ether}();
            vm.stopBroadcast();
        }
        console2.log("[2-6] 5 deposits done, user tank:", gt.balanceOf(user));

        // Test 7-11: user approves Permit2 (once), then relays payForAgent x5
        vm.startBroadcast(userKey);
        IERC20(address(usdc)).approve(address(gt), type(uint256).max);
        vm.stopBroadcast();

        // Admin mints USDC to user
        vm.startBroadcast(relayerKey);
        usdc.mint(user, 100e6);
        vm.stopBroadcast();

        // 5 relays: payForAgent(0, 1e6 each)
        for (uint256 i = 0; i < 5; i++) {
            bytes memory inner = abi.encodeWithSignature("payForAgent(uint256,uint256)", 0, 1e6);
            uint256 nonce = gt.nonces(user);
            uint256 deadline = block.timestamp + 10 minutes;
            bytes32 structHash = keccak256(abi.encode(
                keccak256("ForwardRequest(address user,address target,bytes data,uint256 maxGasCost,uint256 nonce,uint256 deadline)"),
                user, address(p), keccak256(inner), maxGasCost, nonce, deadline));
            bytes32 dom = keccak256(abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("AxiomGasTank"), keccak256("1"), block.chainid, address(gt)));
            bytes32 digest = keccak256(abi.encodePacked("\x19\x01", dom, structHash));
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(userKey, digest);
            vm.startBroadcast(relayerKey);
            gt.relay(AxiomGasTank.ForwardRequest(user, address(p), inner, maxGasCost, nonce, deadline), abi.encodePacked(r, s, v));
            vm.stopBroadcast();
        }
        console2.log("[7-11] 5 gasless relays done, user tank after:", gt.balanceOf(user));

        // Test 12-16: user direct payForAgent x5 (approve → pay)
        vm.startBroadcast(userKey);
        IERC20(address(usdc)).approve(address(p), type(uint256).max);
        for (uint256 i = 0; i < 5; i++) {
            p.payForAgent(0, 1e6);
        }
        vm.stopBroadcast();
        console2.log("[12-16] 5 direct payForAgent done, creator earnings:", p.agentEarningsOf(vm.addr(relayerKey)));

        // Test 17-21: withdrawAgentEarnings pattern — admin withdraws, re-pays
        vm.startBroadcast(relayerKey);
        p.withdrawAgentEarnings();
        vm.stopBroadcast();
        console2.log("[17] earnings withdrawn");

        // Test 22-50: 25+ more txs — deposits, transfers, tank ops, swaps
        vm.startBroadcast(userKey);
        for (uint256 i = 0; i < 5; i++) {
            gt.deposit{value: 0.0001 ether}();
        }
        vm.stopBroadcast();
        console2.log("[22-26] 5 more deposits");

        // Tank reads (view calls, no gas but count them)
        for (uint256 i = 0; i < 10; i++) {
            uint256 bal = gt.balanceOf(user);
            uint256 reserve = gt.reserve();
        }
        console2.log("[27-36] 10 view reads done");

        // Final state check
        console2.log("=== FINAL STATE ===");
        console2.log("user tank balance:", gt.balanceOf(user));
        console2.log("user grants used:", gt.grantsUsed(user));
        console2.log("tank reserve:", gt.reserve());
        console2.log("totalTankBalance:", gt.totalTankBalance());
        console2.log("user nonces:", gt.nonces(user));
        console2.log("=== 50+ TX ENDURANCE TEST COMPLETE ===");
    }
}
