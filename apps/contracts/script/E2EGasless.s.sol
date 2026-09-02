// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "forge-std/Script.sol";
import {AxiomGasTank} from "../src/AxiomGasTank.sol";
import {AxiomPaymentProcessor} from "../src/AxiomPaymentProcessor.sol";
import {AxiomMockUSDC} from "../src/mocks/AxiomMockUSDC.sol";

/// @title E2EGasless.s.sol — LIVE: fresh EOA gets faucet funds + gas grant, then a fully
///        gasless (from the user's side) relayed payForAgent through the GasTank.
contract E2EGasless is Script {
    function run() external {
        uint256 relayerKey = vm.envUint("RELAYER_PK");
        address relayer = vm.addr(relayerKey);
        uint256 userKey = uint256(keccak256(abi.encodePacked("axiom-e2e-user-2026-09-01")));
        address user = vm.addr(userKey);
        AxiomGasTank gt = AxiomGasTank(payable(vm.envAddress("GAS_TANK")));
        AxiomPaymentProcessor p = AxiomPaymentProcessor(payable(vm.envAddress("PROCESSOR_PROXY")));
        AxiomMockUSDC usdc = AxiomMockUSDC(vm.envAddress("AXM_USDC"));

        console2.log("== E2E user:", user);

        // STEP 1 (relayer acts as faucet): mint 1000 axmUSDC to the fresh user
        vm.startBroadcast(relayerKey);
        usdc.mint(user, 1000e6);
        vm.stopBroadcast();
        console2.log("faucet done, user axmUSDC:", usdc.balanceOf(user));

        // STEP 2: user balance is 0 — the relay's lazy grant will pull 0.01 0G from reserve.
        // Build ForwardRequest for payForAgent(0, 1e6): user pays agent #0's creator 1 axmUSDC.
        bytes memory inner = abi.encodeWithSignature("payForAgent(uint256,uint256)", 0, 1e6);
        uint256 maxGasCost = 0.0005 ether;
        uint256 nonce = gt.nonces(user);
        uint256 deadline = block.timestamp + 10 minutes;

        bytes32 tp = keccak256(
            "ForwardRequest(address user,address target,bytes data,uint256 maxGasCost,uint256 nonce,uint256 deadline)");
        bytes32 structHash = keccak256(abi.encode(tp, user, address(p), keccak256(inner), maxGasCost, nonce, deadline));
        bytes32 dom = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("AxiomGasTank"), keccak256("1"), block.chainid, address(gt)));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", dom, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userKey, digest);

        vm.startBroadcast(relayerKey);
        AxiomGasTank.ForwardRequest memory req = AxiomGasTank.ForwardRequest(
            user, address(p), inner, maxGasCost, nonce, deadline
        );
        bool ok = gt.relay(req, abi.encodePacked(r, s, v));
        vm.stopBroadcast();
        require(ok, "relay returned false");

        console2.log("relay ok");
        console2.log("user tank balance (grant - spent):", gt.balanceOf(user));
        console2.log("grantsUsed:", gt.grantsUsed(user));
        console2.log("processor USDC balance increased by payForAgent: user paid 1e6 to agent 0 creator");
    }
}
