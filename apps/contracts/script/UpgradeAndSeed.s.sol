// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "forge-std/Script.sol";
import {AxiomPaymentProcessor} from "../src/AxiomPaymentProcessor.sol";
import {AxiomMockUSDC, AxiomMockWETH} from "../src/mocks/AxiomMockUSDC.sol";

contract UpgradeAndSeed is Script {
    function run() external {
        uint256 key = vm.envUint("DEPLOYER_PK");
        address admin = vm.addr(key);
        address proxy = vm.envAddress("PROCESSOR_PROXY");
        AxiomPaymentProcessor p = AxiomPaymentProcessor(payable(proxy));
        AxiomMockUSDC usdc = AxiomMockUSDC(vm.envAddress("AXM_USDC"));
        AxiomMockWETH weth = AxiomMockWETH(vm.envAddress("AXM_WETH"));
        uint256 usdcAmt = 1_000_000e6;
        uint256 wethAmt = 1000e18;

        vm.startBroadcast(key);
        AxiomPaymentProcessor newImpl = new AxiomPaymentProcessor();
        console2.log("impl with seedSwapPool at:", address(newImpl));
        p.upgradeToAndCall(address(newImpl), "");
        p.setSwapPairToken(address(weth));
        usdc.mint(proxy, usdcAmt);
        weth.mint(proxy, wethAmt);
        p.seedSwapPool(usdcAmt, wethAmt, admin);
        vm.stopBroadcast();

        console2.log("reserveA:", p.swapReserveA());
        console2.log("reserveB:", p.swapReserveB());
        console2.log("quote 1000e6 USDC:", p.quoteSwap(address(usdc), 1000e6));
        console2.log("quote 1e18 WETH:", p.quoteSwap(address(weth), 1e18));
    }
}
