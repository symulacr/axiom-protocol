// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {AxiomPaymentProcessor} from "../src/AxiomPaymentProcessor.sol";
import {AxiomMockUSDC, AxiomMockWETH} from "../src/mocks/AxiomMockUSDC.sol";
import {ISignatureTransfer} from "../src/permit2/ISignatureTransfer.sol";

/// @title SeedSwapPool.s.sol — V3 W6 ops: mint axmWETH to the pool seeder, approve Permit2,
///        and add the founding liquidity to the Processor swap pool.
/// @notice Seeds 1,000 axmWETH : 1,000,000 axmUSDC (1 WETH = 1000 USDC, both mock-decimals:
///         axmWETH 18 / axmUSDC 6 — so 1000e18 WETH vs 1000_000e6 USDC keeps the ratio 1:1000).
/// @dev    Invocation (default profile, via_ir ON):
///   DEPLOYER_PK=<pk> PROCESSOR_PROXY=<proxy> AXM_WETH=<weth> AXM_USDC=<usdc> \
///   forge script script/SeedSwapPool.s.sol \
///     --rpc-url https://evmrpc-testnet.0g.ai --chain-id 16602 \
///     --legacy --gas-price 2100000000 --slow --broadcast
///   The Permit2 permit signature is produced in-script from the seeder key (testnet-only
///   convenience — production LPs sign in the wallet).
contract SeedSwapPool is Script {
    uint256 internal constant GALILEO_CHAIN_ID = 16_602;
    address internal constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;

    error WrongChain(uint256 actual, uint256 expected);

    function run() external {
        if (block.chainid != GALILEO_CHAIN_ID) {
            revert WrongChain(block.chainid, GALILEO_CHAIN_ID);
        }
        console2.log("[SeedSwapPool] chainId:", block.chainid, "(Galileo)");

        uint256 seederKey = vm.envUint("DEPLOYER_PK");
        address seeder = vm.addr(seederKey);
        address processorProxy = vm.envAddress("PROCESSOR_PROXY");
        AxiomMockWETH weth = AxiomMockWETH(vm.envAddress("AXM_WETH"));
        AxiomMockUSDC usdc = AxiomMockUSDC(vm.envAddress("AXM_USDC"));

        uint256 wethAmount = 1000e18; // 1,000 axmWETH
        uint256 usdcAmount = 1_000_000e6; // 1,000,000 axmUSDC (1:1000 price)

        vm.startBroadcast(seederKey);
        if (weth.balanceOf(seeder) < wethAmount) {
            weth.mint(seeder, wethAmount * 2);
            console2.log("minted axmWETH to seeder:", seeder);
        }
        if (usdc.balanceOf(seeder) < usdcAmount) {
            usdc.mint(seeder, usdcAmount * 2);
            console2.log("minted axmUSDC to seeder:", seeder);
        }
        weth.approve(PERMIT2, type(uint256).max);
        usdc.approve(PERMIT2, type(uint256).max);
        console2.log("approved Permit2 for both tokens");

        // addLiquidity(usdcAmount, wethAmount) — first LP gets sqrt(1e24 * 1e24) = 1e24 shares.
        // Direct approve path (seeder trusts itself); Permit2 signatures used by real users via
        // addLiquidity's permit lane — here we call the internal flow through the public fn with
        // the allowance Permit2 already holds.
        // NOTE: addLiquidity REQUIRES the Permit2 batch signature lane; for the seed we sign
        // in-script (testnet convenience).
        (uint256 amountOutBefore) = processorQuote(processorProxy);
        console2.log("reserveA before (axmUSDC):", amountOutBefore);

        // Build Permit2 batch permit signed by the seeder
        AxiomPaymentProcessor p = AxiomPaymentProcessor(payable(processorProxy));
        bytes memory sig = _signBatch(
            seederKey,
            address(usdc),
            usdcAmount,
            address(weth),
            wethAmount,
            address(processorProxy),
            block.timestamp + 1 hours
        );
        ISignatureTransfer.PermitBatchTransferFrom memory permit = ISignatureTransfer
            .PermitBatchTransferFrom({
            permitted: _batchTokens(address(usdc), usdcAmount, address(weth), wethAmount),
            nonce: 0,
            deadline: block.timestamp + 1 hours
        });
        p.addLiquidity(usdcAmount, wethAmount, permit, sig);
        vm.stopBroadcast();

        // Post-checks
        require(p.swapReserveA() == usdcAmount, "seed: reserveA mismatch");
        require(p.swapReserveB() == wethAmount, "seed: reserveB mismatch");
        require(p.totalLpShares() > 0, "seed: no LP minted");
        console2.log("Pool seeded. reserveA (axmUSDC):", p.swapReserveA());
        console2.log("Pool seeded. reserveB (axmWETH):", p.swapReserveB());
        console2.log("totalLpShares:", p.totalLpShares());
        console2.log("quote: 1e18 axmWETH out for 1000e6 axmUSDC in:", p.quoteSwap(address(usdc), 1000e6));
    }

    function processorQuote(address processorProxy) internal view returns (uint256) {
        (bool ok, bytes memory ret) = processorProxy.staticcall(
            abi.encodeWithSignature("swapReserveA()(uint256)")
        );
        if (!ok) return 0;
        return abi.decode(ret, (uint256));
    }

    function _batchTokens(
        address usdc,
        uint256 usdcAmount,
        address weth,
        uint256 wethAmount
    ) internal pure returns (ISignatureTransfer.TokenPermissions[] memory permitted) {
        permitted = new ISignatureTransfer.TokenPermissions[](2);
        permitted[0] = ISignatureTransfer.TokenPermissions({token: usdc, amount: usdcAmount});
        permitted[1] = ISignatureTransfer.TokenPermissions({token: weth, amount: wethAmount});
    }

    /// @dev Signs the Permit2 batch permit exactly as a wallet would: EIP-712 domain
    ///      (name "Permit2", chainId, verifyingContract PERMIT2), struct hash per upstream
    ///      PermitHash (batch: PermitBatchTransferFrom with TokenPermissions[] permitted).
    function _signBatch(
        uint256 signKey,
        address usdc,
        uint256 usdcAmount,
        address weth,
        uint256 wethAmount,
        address spender,
        uint256 deadline
    ) internal view returns (bytes memory) {
        // hash the TokenPermissions[] array per upstream _hashPermitted
        bytes32[] memory tpHashes = new bytes32[](2);
        tpHashes[0] = keccak256(
            abi.encode(
                keccak256("TokenPermissions(address token,uint256 amount)"), usdc, usdcAmount
            )
        );
        tpHashes[1] = keccak256(
            abi.encode(
                keccak256("TokenPermissions(address token,uint256 amount)"), weth, wethAmount
            )
        );
        bytes32 permittedHash = keccak256(abi.encodePacked(tpHashes));

        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "PermitBatchTransferFrom(TokenPermissions[] permitted,address spender,uint256 nonce,uint256 deadline)"
                ),
                permittedHash,
                spender,
                uint256(0), // nonce
                deadline
            )
        );
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                keccak256(
                    abi.encode(
                        keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)"),
                        keccak256("Permit2"),
                        block.chainid,
                        PERMIT2
                    )
                ),
                structHash
            )
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signKey, digest);
        return abi.encodePacked(r, s, v);
    }
}
