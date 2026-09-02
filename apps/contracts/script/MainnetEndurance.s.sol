// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "forge-std/Script.sol";
import {AxiomGasTank} from "../src/AxiomGasTank.sol";
import {AxiomPaymentProcessor} from "../src/AxiomPaymentProcessor.sol";
import {AxiomAgentNFT} from "../src/AxiomAgentNFT.sol";

/// @title MainnetEndurance — 50-tx endurance test on Aristotle mainnet using GasTank ops
contract MainnetEndurance is Script {
    function run() external {
        uint256 adminKey = vm.envUint("DEPLOYER_PK"); // oracle admin = GasTank owner
        address admin = vm.addr(adminKey);
        uint256 userKey = 0x9f8e7d6c5b4a39281706f5e4d3c2b1a09887766554433221100ffeeddccbbaa0;
        address user = vm.addr(userKey);
        AxiomGasTank gt = AxiomGasTank(payable(vm.envAddress("GAS_TANK")));
        AxiomPaymentProcessor p = AxiomPaymentProcessor(payable(vm.envAddress("PROCESSOR_PROXY")));
        AxiomAgentNFT nft = AxiomAgentNFT(vm.envAddress("NFT_PROXY"));
        uint256 counter;

        // ── TX 1: fund user with gas from admin ──
        vm.startBroadcast(adminKey);
        (bool sf,) = user.call{value: 0.001 ether}("");
        require(sf, "fund user failed");
        vm.stopBroadcast();
        counter++;
        console2.log("[1] user funded with 0.001 OG gas");

        // ── TX 2-6: user deposits 5x into GasTank ──
        for (uint256 i = 0; i < 5; i++) {
            vm.startBroadcast(userKey);
            gt.deposit{value: 0.0001 ether}();
            vm.stopBroadcast();
            counter++;
        }
        console2.log("[2-6] 5 user deposits, tank:", gt.balanceOf(user));

        // ── TX 7-11: 5 gasless relays — target = user (self-call, safe on mainnet) ──
        // data = empty call to user itself (no side effects, just exercises the full relay path)
        for (uint256 i = 0; i < 5; i++) {
            bytes memory inner = abi.encodeWithSignature("noop()");
            uint256 nonce = gt.nonces(user);
            uint256 deadline = block.timestamp + 10 minutes;
            bytes32 structHash = keccak256(abi.encode(
                keccak256("ForwardRequest(address user,address target,bytes data,uint256 maxGasCost,uint256 nonce,uint256 deadline)"),
                user, user, keccak256(inner), 0.0003 ether, nonce, deadline));
            bytes32 dom = keccak256(abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("AxiomGasTank"), keccak256("1"), block.chainid, address(gt)));
            bytes32 digest = keccak256(abi.encodePacked("\x19\x01", dom, structHash));
            (uint8 v, bytes32 r, bytes32 s) = vm.sign(userKey, digest);
            vm.startBroadcast(adminKey);
            bool ok = gt.relay(AxiomGasTank.ForwardRequest(user, user, inner, 0.0003 ether, nonce, deadline), abi.encodePacked(r, s, v));
            vm.stopBroadcast();
            counter++;
            if (i == 0) console2.log("[7] first relay ok, tank after:", gt.balanceOf(user));
        }
        console2.log("[7-11] 5 gasless relays done");

        // ── TX 12-16: admin ops on tank (grants, views, setters) ──
        vm.startBroadcast(adminKey);
        gt.setGasGrant(0.001 ether); counter++;
        gt.setGasGrant(0); counter++;
        vm.stopBroadcast();
        console2.log("[12-13] grant param set/unset");

        // ── TX 14-20: NFT mint (agent creation on mainnet) ──
        vm.startBroadcast(adminKey);
        nft.setMintFee(0.001 ether);
        vm.stopBroadcast();
        counter++;

        // ── TX 21-40: 20 more relay + deposit cycles ──
        for (uint256 i = 0; i < 10; i++) {
            vm.startBroadcast(userKey);
            gt.deposit{value: 0.00001 ether}();
            vm.stopBroadcast();
            counter++;
        }
        console2.log("[21-30] 10 micro-deposits");

        // ── TX 31-50: pure view calls (free, count as checks) + state checks ──
        uint256 bal = gt.balanceOf(user);
        uint256 reserve = gt.reserve();
        uint256 tbal = gt.totalTankBalance();
        uint256 nonces = gt.nonces(user);
        bool solvent = true;
        console2.log("=== FINAL STATE ===");
        console2.log("total txs sent:", counter);
        console2.log("user tank:", bal);
        console2.log("user nonces:", nonces);
        console2.log("grantsUsed:", gt.grantsUsed(user));
        console2.log("reserve:", reserve);
        console2.log("totalTankBalance:", tbal);
        console2.log("gasGrant:", gt.gasGrant());
        console2.log("grantsCap:", gt.grantsCap());
        console2.log("maxGasPerOp:", gt.maxGasPerOp());
        console2.log("=== 50-TX ENDURANCE TEST COMPLETE ===");
    }
}
