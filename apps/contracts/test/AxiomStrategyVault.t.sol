// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {AxiomStrategyVault} from "../src/AxiomStrategyVault.sol";
import {IAxiomAgentNFT} from "../src/interfaces/IAxiomAgentNFT.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

contract MockAxiomAgentNFT is IAxiomAgentNFT {
    mapping(uint256 => address) internal _owners;

    function setOwner(
        uint256 tokenId,
        address owner
    ) external {
        _owners[tokenId] = owner;
    }

    function ownerOf(
        uint256 tokenId
    ) external view override returns (address) {
        return _owners[tokenId];
    }

    function creatorOf(
        uint256
    ) external pure override returns (address) {
        return address(0);
    }
}

contract AxiomStrategyVaultTest is Test {
    AxiomStrategyVault internal vault;
    MockAxiomAgentNFT internal nft;

    address internal owner = address(0x0A11CE);
    address internal tokenOwner = address(0xB0B);

    uint256 internal constant TOKEN_ID = 1;

    function _noExpiry() internal pure returns (uint64) {
        return 0;
    }

    function _farFuture() internal view returns (uint64) {
        return uint64(block.timestamp / 1 days) + 365;
    }

    function setUp() public {
        nft = new MockAxiomAgentNFT();
        nft.setOwner(TOKEN_ID, tokenOwner);
        AxiomStrategyVault vaultImpl = new AxiomStrategyVault();
        ERC1967Proxy vaultProxy = new ERC1967Proxy(
            address(vaultImpl),
            abi.encodeWithSelector(vaultImpl.initialize.selector, address(nft), owner)
        );
        vault = AxiomStrategyVault(payable(address(vaultProxy)));
    }

    function test_directSend_reverts() public {
        vm.deal(address(this), 1 ether);
        vm.expectRevert(AxiomStrategyVault.UseDeposit.selector);
        address(vault).call{value: 1 ether}("");
    }

    function test_deposit_and_withdraw() public {
        uint256 amount = 2 ether;
        vm.deal(tokenOwner, amount);

        vm.prank(tokenOwner);
        vault.deposit{value: amount}(TOKEN_ID);
        assertEq(vault.balanceOf(TOKEN_ID), amount);
        assertEq(vault.totalTrackedBalance(), amount);

        vm.prank(tokenOwner);
        vault.withdraw(TOKEN_ID, 1 ether);
        assertEq(vault.balanceOf(TOKEN_ID), 1 ether);
        assertEq(vault.totalTrackedBalance(), 1 ether);
    }

    function test_execute_happy() public {
        address sink = address(0xDEAD);
        uint256 executeAmount = 0.5 ether;

        vm.deal(tokenOwner, executeAmount);
        vm.prank(tokenOwner);
        vault.deposit{value: executeAmount}(TOKEN_ID);

        bytes memory data = new bytes(0);
        bytes32 leaf = keccak256(abi.encode(sink, executeAmount, keccak256(data)));
        vm.prank(tokenOwner);
        vault.setStrategy(TOKEN_ID, leaf, executeAmount, _farFuture());

        vm.prank(tokenOwner);
        vault.execute(TOKEN_ID, sink, executeAmount, data, new bytes32[](0));

        assertEq(vault.balanceOf(TOKEN_ID), 0);
        assertEq(vault.totalTrackedBalance(), 0);
        assertEq(sink.balance, executeAmount);
    }

    function test_execute_noStrategy_reverts() public {
        vm.deal(tokenOwner, 1 ether);
        vm.prank(tokenOwner);
        vault.deposit{value: 1 ether}(TOKEN_ID);

        vm.prank(tokenOwner);
        vm.expectRevert(AxiomStrategyVault.NoStrategySet.selector);
        vault.execute(TOKEN_ID, address(0xDEAD), 1 ether, new bytes(0), new bytes32[](0));
    }

    function test_execute_dailyLimitExceeded_reverts() public {
        address sink = address(0xDEAD);
        uint256 depositAmount = 2 ether;
        uint256 dailyLimit = 1 ether;

        vm.deal(tokenOwner, depositAmount);
        vm.prank(tokenOwner);
        vault.deposit{value: depositAmount}(TOKEN_ID);

        bytes memory data = new bytes(0);
        bytes32 leaf = keccak256(abi.encode(sink, depositAmount, keccak256(data)));
        vm.prank(tokenOwner);
        vault.setStrategy(TOKEN_ID, leaf, dailyLimit, _farFuture());

        vm.prank(tokenOwner);
        vm.expectRevert(AxiomStrategyVault.DailyLimitExceeded.selector);
        vault.execute(TOKEN_ID, sink, depositAmount, data, new bytes32[](0));
    }

    function test_execute_strategyExpired_reverts() public {
        vm.warp(10 days);
        address sink = address(0xDEAD);
        uint256 amount = 0.5 ether;

        vm.deal(tokenOwner, amount);
        vm.prank(tokenOwner);
        vault.deposit{value: amount}(TOKEN_ID);

        bytes memory data = new bytes(0);
        bytes32 leaf = keccak256(abi.encode(sink, amount, keccak256(data)));
        uint64 yesterday = uint64(block.timestamp / 1 days) - 1;
        vm.prank(tokenOwner);
        vault.setStrategy(TOKEN_ID, leaf, amount, yesterday);

        vm.prank(tokenOwner);
        vm.expectRevert(AxiomStrategyVault.StrategyExpired.selector);
        vault.execute(TOKEN_ID, sink, amount, data, new bytes32[](0));
    }

    function test_setStrategy_limitOverflow_reverts() public {
        vm.prank(tokenOwner);
        vm.expectRevert(AxiomStrategyVault.LimitOverflow.selector);
        vault.setStrategy(TOKEN_ID, bytes32(uint256(1)), uint256(type(uint128).max) + 1, _noExpiry());
    }

    function test_recoverExcessNative() public {
        uint256 amount = 1 ether;
        vm.deal(tokenOwner, amount);
        vm.prank(tokenOwner);
        vault.deposit{value: amount}(TOKEN_ID);

        // Simulate mistaken direct send bypassing receive (selfdestruct / coinbase)
        vm.deal(address(vault), address(vault).balance + 0.25 ether);

        address treasury = address(0xFEE);
        uint256 before = treasury.balance;
        vm.prank(owner);
        vault.recoverExcessNative(treasury);
        assertEq(treasury.balance - before, 0.25 ether);
        assertEq(vault.totalTrackedBalance(), amount);
        assertEq(vault.balanceOf(TOKEN_ID), amount);
    }
}
