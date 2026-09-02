// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "forge-std/Script.sol";
import {AxiomPaymentProcessor} from "../src/AxiomPaymentProcessor.sol";
import {AxiomMockUSDC, AxiomMockWETH} from "../src/mocks/AxiomMockUSDC.sol";

/// @title SeedPoolAdmin.s.sol — mint mocks directly to the Processor, then admin-seed the pool.
contract SeedPoolAdmin is Script {
    function run() external {
        uint256 key = vm.envUint("DEPLOYER_PK");
        address admin = vm.addr(key);
        AxiomPaymentProcessor p = AxiomPaymentProcessor(payable(vm.envAddress("PROCESSOR_PROXY")));
        AxiomMockUSDC usdc = AxiomMockUSDC(vm.envAddress("AXM_USDC"));
        AxiomMockWETH weth = AxiomMockWETH(vm.envAddress("AXM_WETH"));
        uint256 usdcAmt = 1_000_000e6; // 1M axmUSDC
        uint256 wethAmt = 1000e18; // 1k axmWETH

        vm.startBroadcast(key);
        usdc.mint(address(p), usdcAmt);
        weth.mint(address(p), wethAmt);
        p.seedSwapPool(usdcAmt, wethAmt, admin);
        vm.stopBroadcast();

        require(p.swapReserveA() == usdcAmt, "seed: A");
        require(p.swapReserveB() == wethAmt, "seed: B");
        console2.log("Pool seeded via admin path");
        console2.log("quote 1000 axmUSDC ->", p.quoteSwap(address(usdc), 1000e6));
        console2.log("quote 1 axmWETH ->", p.quoteSwap(address(weth), 1e18));
    }
}
