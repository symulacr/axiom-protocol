// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "forge-std/Script.sol";
import {AxiomGasTank} from "../src/AxiomGasTank.sol";
import {AxiomMockUSDC} from "../src/mocks/AxiomMockUSDC.sol";

/// @title E2EFinal.s.sol — gasless E2E with hard-coded canonical digest math
contract E2EFinal is Script {
    function run() external {
        uint256 relayerKey = vm.envUint("RELAYER_PK");
        address relayer = vm.addr(relayerKey);
        uint256 userKey = uint256(keccak256(abi.encodePacked("axiom-e2e-user-2026-09-01")));
        address user = vm.addr(userKey);
        AxiomGasTank gt = AxiomGasTank(payable(vm.envAddress("GAS_TANK")));
        address p = vm.envAddress("PROCESSOR_PROXY");
        AxiomMockUSDC usdc = AxiomMockUSDC(vm.envAddress("AXM_USDC"));

        console2.log("user:", user);

        vm.startBroadcast(relayerKey);
        usdc.mint(user, 1000e6);
        vm.stopBroadcast();

        // User-side: approve Permit2 (in prod the user does this themselves)
        vm.startBroadcast(userKey);
        usdc.approve(p, type(uint256).max); // inner payForAgent pulls via Processor
        vm.stopBroadcast();

        bytes memory inner = abi.encodeWithSignature("payForAgent(uint256,uint256)", 0, 1e6);
        uint256 maxGasCost = 0.0005 ether;
        uint256 nonce = gt.nonces(user);
        uint256 deadline = block.timestamp + 10 minutes;

        AxiomGasTank.ForwardRequest memory req = AxiomGasTank.ForwardRequest(
            user, p, inner, maxGasCost, nonce, deadline
        );
        // Canonical EIP-712 struct hash computed inline (dynamic bytes keccak256'd, Permit2-style)
        // — the same digest eth_signTypedData_v4 wallets produce. Cross-checked against the
        // contract view below so any digest drift between the two fails loudly.
        bytes32 tp = keccak256(
            "ForwardRequest(address user,address target,bytes data,uint256 maxGasCost,uint256 nonce,uint256 deadline)"
        );
        bytes32 structHash = keccak256(
            abi.encode(tp, req.user, req.target, keccak256(req.data), req.maxGasCost, req.nonce, req.deadline)
        );
        bytes32 sep = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("AxiomGasTank"),
                keccak256("1"),
                block.chainid,
                address(gt)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", sep, structHash));
        require(digest == gt.forwardRequestDigest(req), "digest drift: contract view != canonical EIP-712");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userKey, digest);
        

        vm.startBroadcast(relayerKey);
        bool ok = gt.relay(req, abi.encodePacked(r, s, v));
        vm.stopBroadcast();
        require(ok, "relay returned false");

        console2.log("GASLESS E2E SUCCESS");
        console2.log("user axmUSDC after paying 1 USDC:", usdc.balanceOf(user));
        console2.log("user tank balance:", gt.balanceOf(user));
        console2.log("grantsUsed:", gt.grantsUsed(user));
    }
}
