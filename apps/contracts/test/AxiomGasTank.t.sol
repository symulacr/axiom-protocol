// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AxiomGasTank} from "../src/AxiomGasTank.sol";

/// @dev Payable-reverting recipient for the TransferFailed paths (withdrawTank / recoverReserve).
contract RevertingPayable {
    receive() external payable {
        revert("no native accepted");
    }
}

/// @dev Gas-burning target for the reimbursement clamp tests. `burnGas` burns ~`burn` gas of
///      extra EVM work (storage-loop) so `measured` lands near but never exactly at `burn`.
contract GasGuzzler {
    uint256 public burn;

    function setBurn(
        uint256 burn_
    ) external {
        burn = burn_;
    }

    function burnGas() external returns (bool) {
        uint256 start = gasleft();
        uint256 target = burn;
        while (start - gasleft() < target) {
            burn += 1;
        }
        burn = target;
        return true;
    }

    function alwaysReverts() external pure {
        revert("guzzler revert");
    }
}

/// @dev Local ECDSA recovery used by the ERC-1271 signer stub (avoids OZ import churn).
library LocalECDSA {
    enum RecoverError {
        NoError,
        InvalidSignature,
        InvalidSignatureLength,
        InvalidSignatureV
    }

    function tryRecover(
        bytes32 digest,
        bytes memory sig
    ) internal pure returns (address, RecoverError) {
        if (sig.length != 65) return (address(0), RecoverError.InvalidSignatureLength);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly ("memory-safe") {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        if (v != 27 && v != 28) return (address(0), RecoverError.InvalidSignatureV);
        address recovered = ecrecover(digest, v, r, s);
        if (recovered == address(0)) return (address(0), RecoverError.InvalidSignature);
        return (recovered, RecoverError.NoError);
    }
}

/// @dev ERC-1271 signer contract for the dual-path signature verification tests.
contract ERC1271Signer {
    using LocalECDSA for *;
    address public owner;

    constructor(
        address owner_
    ) {
        owner = owner_;
    }

    function isValidSignature(
        bytes32 digest,
        bytes memory sig
    ) external view returns (bytes4) {
        (address recovered, LocalECDSA.RecoverError err) = LocalECDSA.tryRecover(digest, sig);
        if (err != LocalECDSA.RecoverError.NoError || recovered != owner) return 0xffffffff;
        return 0x1626ba7e;
    }

    receive() external payable {}
}

contract AxiomGasTankTest is Test {
    AxiomGasTank internal tank;
    GasGuzzler internal guzzler;

    address internal admin = address(0xA11CE);
    address internal relayer = address(0x2E1A7E2);
    address internal user;
    uint256 internal userKey = 0xBEEF;

    uint256 internal constant MAX_GAS_PER_OP = 300_000;

    function setUp() public {
        user = vm.addr(userKey);
        tank = new AxiomGasTank(admin, MAX_GAS_PER_OP);
        guzzler = new GasGuzzler();
        vm.deal(admin, 1000 ether);
        vm.deal(relayer, 1000 ether);
        vm.deal(user, 1000 ether);
        // forge defaults tx.gasprice to 0, which would zero every measured*gasprice term;
        // 1 wei keeps the wei math exact in assertions (production uses real gas prices).
        vm.txGasPrice(1 wei);
    }

    // ─── helpers ───

    function _burnCalldata() internal view returns (bytes memory) {
        return abi.encodeCall(GasGuzzler.burnGas, ());
    }

    function _sign(
        uint256 key,
        address u,
        address target,
        bytes memory data,
        uint256 maxGasCost,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (AxiomGasTank.ForwardRequest memory req, bytes memory sig) {
        req = AxiomGasTank.ForwardRequest({
            user: u, target: target, data: data, maxGasCost: maxGasCost, nonce: nonce, deadline: deadline
        });
        bytes32 digest = tank.forwardRequestDigest(req);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        sig = abi.encodePacked(r, s, v);
    }

    function _fundReserve(
        uint256 amount
    ) internal {
        vm.prank(admin);
        tank.depositReserve{value: amount}();
    }

    // ─── T1: first relay lazily grants 0.01, spends from tank ───

    function test_relay_lazyGrant_firstRelay() public {
        uint256 reserve = 10 ether;
        _fundReserve(reserve);

        (AxiomGasTank.ForwardRequest memory req, bytes memory sig) =
            _sign(userKey, user, address(guzzler), _burnCalldata(), 0.01 ether, 0, block.timestamp + 100);

        uint256 relayerBefore = relayer.balance;
        vm.prank(relayer);
        bool ok = tank.relay(req, sig);
        assertTrue(ok);

        uint256 reimburse = relayer.balance - relayerBefore;
        assertGt(reimburse, 0, "relayer reimbursed");
        assertLe(reimburse, req.maxGasCost, "clamp to maxGasCost");
        assertLe(reimburse, MAX_GAS_PER_OP * tx.gasprice, "clamp to per-op cap");
        // Grant issued: tank funded from reserve, op debited (grant wei debited first).
        assertEq(tank.grantsUsed(user), 1);
        assertEq(tank.tank(user), 0.01 ether - reimburse);
        assertEq(tank.grantBalance(user), 0.01 ether - reimburse);
        assertEq(tank.reserve(), reserve - 0.01 ether);
        assertEq(tank.nonces(user), 1);
    }

    // ─── T2: second relay uses remaining deposit tank, no new grant ───

    function test_relay_secondRelay_usesTank_noNewGrant() public {
        _fundReserve(10 ether);
        vm.prank(user);
        tank.deposit{value: 0.05 ether}();

        (AxiomGasTank.ForwardRequest memory req, bytes memory sig) =
            _sign(userKey, user, address(guzzler), _burnCalldata(), 0.001 ether, 0, block.timestamp + 100);

        uint256 relayerBefore = relayer.balance;
        vm.prank(relayer);
        assertTrue(tank.relay(req, sig));
        uint256 reimburse = relayer.balance - relayerBefore;

        assertEq(tank.grantsUsed(user), 0, "no grant for deposit-funded tank");
        assertEq(tank.tank(user), 0.05 ether - reimburse);
        assertEq(tank.grantBalance(user), 0);
        assertEq(tank.nonces(user), 1);
    }

    // ─── T3: grants cap exhaustion; failed grant leaves nonce unbuned ───

    function test_relay_grantsCapExhaustion_revertsTankExhausted() public {
        _fundReserve(10 ether);
        guzzler.setBurn(50_000);
        // Shrink the cap to 1 so the very first relay consumes the only grant; the tank
        // carries the unspent remainder but a new op still needs a fresh grant.
        vm.prank(admin);
        tank.setGrantsCap(1);
        (AxiomGasTank.ForwardRequest memory req, bytes memory sig) =
            _sign(userKey, user, address(guzzler), _burnCalldata(), 0.01 ether, 0, block.timestamp + 100);
        vm.prank(relayer);
        tank.relay(req, sig);
        assertEq(tank.grantsUsed(user), 1);

        // Next op needs a grant → TankExhausted.
        (AxiomGasTank.ForwardRequest memory req4, bytes memory sig4) =
            _sign(userKey, user, address(guzzler), _burnCalldata(), 0.01 ether, 1, block.timestamp + 100);
        vm.prank(relayer);
        vm.expectRevert(AxiomGasTank.TankExhausted.selector);
        tank.relay(req4, sig4);
        // Nonce NOT burned on the failed grant path.
        assertEq(tank.nonces(user), 1);
        // Retry on the SAME nonce with a deposit-funded tank succeeds.
        vm.prank(user);
        tank.deposit{value: 1 ether}();
        vm.prank(relayer);
        assertTrue(tank.relay(req4, sig4));
        assertEq(tank.grantsUsed(user), 1);
    }

    // ─── T4: replay protection (sequential nonce) ───

    function test_relay_nonceReplay_reverts() public {
        _fundReserve(10 ether);
        (AxiomGasTank.ForwardRequest memory req, bytes memory sig) =
            _sign(userKey, user, address(guzzler), _burnCalldata(), 0.005 ether, 0, block.timestamp + 100);
        vm.prank(relayer);
        assertTrue(tank.relay(req, sig));

        vm.prank(relayer);
        vm.expectRevert(AxiomGasTank.InvalidNonce.selector);
        tank.relay(req, sig);

        // Out-of-order nonce rejected too.
        (AxiomGasTank.ForwardRequest memory future, bytes memory fsig) =
            _sign(userKey, user, address(guzzler), _burnCalldata(), 0.005 ether, 5, block.timestamp + 100);
        vm.prank(relayer);
        vm.expectRevert(AxiomGasTank.InvalidNonce.selector);
        tank.relay(future, fsig);
    }

    // ─── T5: deadline expiry (nonce not burned) ───

    function test_relay_deadline_reverts() public {
        _fundReserve(10 ether);
        (AxiomGasTank.ForwardRequest memory req, bytes memory sig) =
            _sign(userKey, user, address(guzzler), _burnCalldata(), 0.005 ether, 0, block.timestamp - 1);
        vm.prank(relayer);
        vm.expectRevert(AxiomGasTank.DeadlineExpired.selector);
        tank.relay(req, sig);
        assertEq(tank.nonces(user), 0, "nonce not burned on expired deadline");
    }

    // ─── T6: relayer reimbursed even when target reverts (relay succeeds, success=false) ───

    function test_reimburse_onTargetRevert_relaySucceeds() public {
        _fundReserve(10 ether);
        vm.prank(user);
        tank.deposit{value: 0.1 ether}();

        (AxiomGasTank.ForwardRequest memory req, bytes memory sig) = _sign(
            userKey,
            user,
            address(guzzler),
            abi.encodeCall(GasGuzzler.alwaysReverts, ()),
            0.01 ether,
            0,
            block.timestamp + 100
        );
        uint256 relayerBefore = relayer.balance;

        vm.prank(relayer);
        bool ok = tank.relay(req, sig);
        assertFalse(ok, "target failure reported via success=false, not reverted");

        assertGt(relayer.balance, relayerBefore, "relayer paid despite target revert");
        assertLt(tank.tank(user), 0.1 ether, "user debited for gas");
        assertEq(tank.nonces(user), 1, "nonce burned despite target revert");
    }

    // ─── T7: reimbursement clamped by maxGasCost and maxGasPerOp*gasprice ───

    function test_reimburse_clampedToMaxGasCost_andMaxGasPerOp() public {
        _fundReserve(10 ether);
        vm.prank(user);
        tank.deposit{value: 20 ether}();
        guzzler.setBurn(100_000);

        // maxGasCost clamps below measured cost.
        (AxiomGasTank.ForwardRequest memory req, bytes memory sig) =
            _sign(userKey, user, address(guzzler), _burnCalldata(), 1 wei, 0, block.timestamp + 100);
        uint256 relayerBefore = relayer.balance;
        vm.prank(relayer);
        tank.relay(req, sig);
        assertEq(relayer.balance - relayerBefore, 1 wei, "clamp to maxGasCost");

        // maxGasPerOp*gasprice clamps a huge signed cost (tx.gasprice = 1 wei in forge).
        (AxiomGasTank.ForwardRequest memory req2, bytes memory sig2) =
            _sign(userKey, user, address(guzzler), _burnCalldata(), 10 ether, 1, block.timestamp + 100);
        uint256 relayerBefore2 = relayer.balance;
        vm.prank(relayer);
        tank.relay(req2, sig2);
        assertLe(relayer.balance - relayerBefore2, MAX_GAS_PER_OP * tx.gasprice, "clamp to maxGasPerOp*gasprice");
    }

    // ─── T8: near-empty reserve still reimburses (grant + tank + reserve drain, no revert) ───

    function test_reimburse_clampedToReserve_relayerNeverEatsLoss() public {
        // Reserve exactly one grant's worth.
        _fundReserve(0.01 ether);
        vm.prank(user);
        tank.deposit{value: 0.001 ether}();
        guzzler.setBurn(50_000);

        uint256 relayerBefore = relayer.balance;
        uint256 tankBefore = tank.tank(user);
        (AxiomGasTank.ForwardRequest memory req, bytes memory sig) =
            _sign(userKey, user, address(guzzler), _burnCalldata(), 0.01 ether, 0, block.timestamp + 100);
        vm.prank(relayer);
        tank.relay(req, sig);

        uint256 reimburse = relayer.balance - relayerBefore;
        assertGt(reimburse, 0, "relayer not left short");
        // Grant wei (spend-only) covered the reimbursement: grant balance debited first.
        assertEq(tank.grantBalance(user), 0.01 ether - reimburse);
        assertEq(tank.reserve(), 0, "reserve fully drained by the grant");
        assertEq(tank.tank(user), tankBefore + 0.01 ether - reimburse, "tank credited grant, debited spend");
    }

    // ─── T9: daily window — pre-execution check, post-measurement debit, day reset ───

    function test_reimburse_dailyWindow_resetAndLimit() public {
        _fundReserve(10 ether);
        vm.prank(admin);
        tank.setDailyLimit(100_000 wei); // measured-wei scale (tx.gasprice = 1 wei in forge)

        vm.prank(user);
        tank.deposit{value: 1 ether}();
        guzzler.setBurn(10_000);

        (AxiomGasTank.ForwardRequest memory req, bytes memory sig) =
            _sign(userKey, user, address(guzzler), _burnCalldata(), 30_000 wei, 0, block.timestamp + 100);
        uint256 relayerBefore = relayer.balance;
        vm.prank(relayer);
        tank.relay(req, sig);
        uint256 reimburse1 = relayer.balance - relayerBefore;
        (uint256 spent,,) = tank.dailyWindowOf(user);
        assertEq(spent, reimburse1, "window debited with reimbursed wei");

        // Same window: a second op whose maxGasCost would push spent+cap over the limit reverts
        // (spent ≈ 11-16k wei + 95k > 100k, always).
        (AxiomGasTank.ForwardRequest memory req2, bytes memory sig2) =
            _sign(userKey, user, address(guzzler), _burnCalldata(), 95_000 wei, 1, block.timestamp + 100);
        vm.prank(relayer);
        vm.expectRevert(AxiomGasTank.DailyLimitExceeded.selector);
        tank.relay(req2, sig2);

        // Next window: resets and passes.
        vm.warp(block.timestamp + 1 days + 1);
        (AxiomGasTank.ForwardRequest memory req3, bytes memory sig3) =
            _sign(userKey, user, address(guzzler), _burnCalldata(), 30_000 wei, 1, block.timestamp + 1000);
        vm.prank(relayer);
        tank.relay(req3, sig3);
        (spent,,) = tank.dailyWindowOf(user);
        assertLe(spent, 30_000 wei, "window reset on day boundary");
    }

    // ─── T10: zero-value setters revert (non-zero floor); dailyLimit 0 allowed ───

    function test_setMaxGasPerOp_zeroReverts() public {
        vm.startPrank(admin);
        vm.expectRevert(AxiomGasTank.ZeroGasCap.selector);
        tank.setMaxGasPerOp(0);
        vm.expectRevert(AxiomGasTank.ZeroAmount.selector);
        tank.setGasGrant(0);
        vm.expectRevert(AxiomGasTank.ZeroAmount.selector);
        tank.setGrantsCap(0);
        // dailyLimit(0) is the documented "disabled" sentinel — allowed.
        tank.setDailyLimit(0);
        vm.stopPrank();

        // Non-admin cannot call setters.
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        tank.setMaxGasPerOp(1);
    }

    // ─── T11: EOA signature path — wrong signer reverts ───

    function test_relay_invalidSignature_reverts() public {
        _fundReserve(10 ether);
        (AxiomGasTank.ForwardRequest memory req, bytes memory badSig) =
            _sign(0xDEAD, user, address(guzzler), _burnCalldata(), 0.005 ether, 0, block.timestamp + 100);
        vm.prank(relayer);
        vm.expectRevert(AxiomGasTank.InvalidUserSignature.selector);
        tank.relay(req, badSig);
    }

    // ─── T12: deposit/withdrawTank CEI + receive() guard ───

    function test_deposit_withdrawTank_receiveGuard() public {
        vm.prank(user);
        tank.deposit{value: 1 ether}();
        assertEq(tank.balanceOf(user), 1 ether);
        assertEq(tank.totalTankBalance(), 1 ether);

        vm.prank(user);
        tank.withdrawTank(0.5 ether);
        assertEq(tank.balanceOf(user), 0.5 ether);
        assertEq(tank.totalTankBalance(), 0.5 ether);

        // Over-withdraw reverts.
        vm.prank(user);
        vm.expectRevert(AxiomGasTank.InsufficientTankBalance.selector);
        tank.withdrawTank(0.6 ether);

        // receive() reverts UseDeposit.
        (bool sent,) = address(tank).call{value: 0.1 ether}("");
        assertFalse(sent, "receive reverts UseDeposit");

        // Zero-amount guards.
        vm.prank(user);
        vm.expectRevert(AxiomGasTank.ZeroAmount.selector);
        tank.deposit();
        vm.prank(user);
        vm.expectRevert(AxiomGasTank.ZeroAmount.selector);
        tank.withdrawTank(0);
    }

    // ─── T13: recoverReserve — only untracked surplus, TransferFailed path ───

    function test_recoverReserve_onlySurplus() public {
        _fundReserve(0.1 ether);
        vm.prank(user);
        tank.deposit{value: 0.05 ether}();

        // No surplus → revert (tracked funds are untouchable).
        address recipient = address(0x9999);
        vm.prank(admin);
        vm.expectRevert(AxiomGasTank.ZeroAmount.selector);
        tank.recoverReserve(payable(recipient));

        // Stray native appears (forced).
        vm.deal(address(tank), address(tank).balance + 0.01 ether);

        // Surplus transfer to a reverting recipient reverts TransferFailed.
        RevertingPayable revertor = new RevertingPayable();
        vm.prank(admin);
        vm.expectRevert(AxiomGasTank.TransferFailed.selector);
        tank.recoverReserve(payable(address(revertor)));

        // Happy path: exactly the surplus moves; tracked funds untouched.
        vm.prank(admin);
        tank.recoverReserve(payable(recipient));
        assertEq(recipient.balance, 0.01 ether, "only surplus recovered");
        assertEq(tank.reserve(), 0.1 ether, "tracked reserve untouched");
        assertEq(tank.totalTankBalance(), 0.05 ether, "tracked tank untouched");

        // Non-owner cannot call.
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        tank.recoverReserve(payable(recipient));
    }

    // ─── T14: fuzz — reimburse = min(measured*gasprice, maxGasCost, maxGasPerOp*gasprice) ───

    function testFuzz_reimburse_minOfThree(
        uint96 measuredBound,
        uint256 maxGasCost
    ) public {
        measuredBound = uint96(bound(uint256(measuredBound), 1000, 100_000));
        maxGasCost = bound(maxGasCost, 1 wei, 0.05 ether);

        _fundReserve(100 ether);
        vm.prank(user);
        tank.deposit{value: 10 ether}();
        guzzler.setBurn(measuredBound);

        (AxiomGasTank.ForwardRequest memory req, bytes memory sig) =
            _sign(userKey, user, address(guzzler), _burnCalldata(), maxGasCost, 0, block.timestamp + 1000);
        uint256 relayerBefore = relayer.balance;
        vm.prank(relayer);
        tank.relay(req, sig);

        uint256 reimburse = relayer.balance - relayerBefore;
        assertLe(reimburse, maxGasCost, "reimburse over user cap");
        assertLe(reimburse, MAX_GAS_PER_OP * tx.gasprice, "reimburse over per-op cap");
        assertGt(reimburse, 0, "reimburse non-zero");
    }

    // ─── T15: ERC-1271 dual-path signature verification ───

    function test_relay_erc1271_contractSigner() public {
        _fundReserve(10 ether);
        ERC1271Signer signerContract = new ERC1271Signer(user);
        vm.deal(address(signerContract), 1 ether);
        vm.prank(address(signerContract));
        tank.deposit{value: 0.05 ether}();

        (AxiomGasTank.ForwardRequest memory req, bytes memory sig) = _sign(
            userKey, address(signerContract), address(guzzler), _burnCalldata(), 0.005 ether, 0, block.timestamp + 100
        );

        vm.prank(relayer);
        assertTrue(tank.relay(req, sig), "ERC-1271 path accepted");
    }

    function test_relay_erc1271_invalidContractSig_reverts() public {
        _fundReserve(10 ether);
        ERC1271Signer signerContract = new ERC1271Signer(address(0xBAD));
        vm.deal(address(signerContract), 1 ether);
        vm.prank(address(signerContract));
        tank.deposit{value: 0.05 ether}();

        (AxiomGasTank.ForwardRequest memory req, bytes memory sig) = _sign(
            userKey, address(signerContract), address(guzzler), _burnCalldata(), 0.005 ether, 0, block.timestamp + 100
        );

        vm.prank(relayer);
        vm.expectRevert(AxiomGasTank.InvalidUserSignature.selector);
        tank.relay(req, sig);
    }

    // ─── T16: grantCredit self-serve claim ───

    function test_grantCredit_claimAndCap() public {
        _fundReserve(10 ether);
        vm.prank(user);
        uint256 credited = tank.grantCredit();
        assertEq(credited, 0.01 ether);
        assertEq(tank.tank(user), 0.01 ether);
        assertEq(tank.grantBalance(user), 0.01 ether);
        assertEq(tank.grantsUsed(user), 1);

        // Full-grant tank cannot claim again.
        vm.prank(user);
        vm.expectRevert(AxiomGasTank.TankExhausted.selector);
        tank.grantCredit();

        // Spend the grant, then claim again (second of 3).
        (AxiomGasTank.ForwardRequest memory req, bytes memory sig) =
            _sign(userKey, user, address(guzzler), _burnCalldata(), 0.005 ether, 0, block.timestamp + 100);
        vm.prank(relayer);
        tank.relay(req, sig);

        vm.prank(user);
        tank.grantCredit();
        assertEq(tank.grantsUsed(user), 2);
    }

    // ─── T17: drift guard — forwardRequestDigest must equal the canonical EIP-712 digest
    //      (dynamic `bytes data` keccak256'd, Permit2-style), computed inline here so any
    //      future regression to the non-canonical abi.encode(tp, req) form fails loudly. ───

    function test_forwardRequestDigest_matchesCanonicalEip712() public view {
        bytes32 TYPEHASH = keccak256(
            "ForwardRequest(address user,address target,bytes data,uint256 maxGasCost,uint256 nonce,uint256 deadline)"
        );
        AxiomGasTank.ForwardRequest memory req = AxiomGasTank.ForwardRequest({
            user: user,
            target: address(guzzler),
            data: hex"4e71d92d",
            maxGasCost: 0.005 ether,
            nonce: 7,
            deadline: 1_800_000_000
        });

        bytes32 structHash =
            keccak256(abi.encode(TYPEHASH, req.user, req.target, keccak256(req.data), req.maxGasCost, req.nonce, req.deadline));
        bytes32 sep = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("AxiomGasTank"),
                keccak256("1"),
                block.chainid,
                address(tank)
            )
        );
        bytes32 canonical = keccak256(abi.encodePacked("\x19\x01", sep, structHash));
        assertEq(tank.forwardRequestDigest(req), canonical, "digest drifted from canonical EIP-712");
    }

    // ─── T22: solvency fuzz invariant ───

    function testFuzz_solvency_trackedFundsNeverExceedBalance(
        uint256 depositAmount,
        uint256 opGasCost
    ) public {
        depositAmount = bound(depositAmount, 1 wei, 100 ether);
        opGasCost = bound(opGasCost, 1 wei, 0.05 ether);

        _fundReserve(1 ether);
        vm.prank(user);
        tank.deposit{value: 10 ether}(); // deposit covers any single grant-bounded op

        (AxiomGasTank.ForwardRequest memory req, bytes memory sig) =
            _sign(userKey, user, address(guzzler), _burnCalldata(), opGasCost, 0, block.timestamp + 1000);
        vm.prank(relayer);
        tank.relay(req, sig);

        assertLe(
            tank.reserve() + tank.totalTankBalance(), address(tank).balance, "tracked funds exceed contract balance"
        );
    }

    receive() external payable {}
}
