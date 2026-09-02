// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "forge-std/Script.sol";

contract P2Variant is Script {
    function run() external {
        uint256 key = vm.envUint("DEPLOYER_PK");
        // Variant A: with TokenPermissions suffix (upstream current)
        // Variant B: without suffix (stub style)
        // Compute both digests, sign both, and emit r/s/v for the caller to try.
        bytes32 tp = keccak256("TokenPermissions(address token,uint256 amount)");
        bytes32[] memory h = new bytes32[](2);
        h[0] = keccak256(abi.encode(tp, 0x354CA53bAB51C0666964fa050628d8351f8A7d19, uint256(1e12)));
        h[1] = keccak256(abi.encode(tp, 0x62e5ead40C2105d44A705E87F370776bd12BF6ec, uint256(1e21)));
        bytes32 ph = keccak256(abi.encodePacked(h));
        bytes32 ta = keccak256("PermitBatchTransferFrom(TokenPermissions[] permitted,address spender,uint256 nonce,uint256 deadline)TokenPermissions(address token,uint256 amount)");
        bytes32 tb = keccak256("PermitBatchTransferFrom(TokenPermissions[] permitted,address spender,uint256 nonce,uint256 deadline)");
        bytes32 dom = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,uint256 chainId,address verifyingContract)"),
            keccak256("Permit2"), uint256(16602), 0x000000000022D473030F116dDEE9F6B43aC78BA3));
        // nonces: use 1 for BOTH (nonce 0 was burned by earlier failed attempts? failed txs don't burn. but the FIRST attempt's revert means nonce not burned; keep 0)
        bytes32 sa = keccak256(abi.encode(ta, ph, 0xe6956f663103c6E1e5077c3256c453b95924112a, uint256(0), uint256(1788220629)));
        bytes32 sb = keccak256(abi.encode(tb, ph, 0xe6956f663103c6E1e5077c3256c453b95924112a, uint256(0), uint256(1788220629)));
        bytes32 da = keccak256(abi.encodePacked("\x19\x01", dom, sa));
        bytes32 db = keccak256(abi.encodePacked("\x19\x01", dom, sb));
        (uint8 va, bytes32 ra, bytes32 s2a) = vm.sign(key, da);
        (uint8 vb, bytes32 rb, bytes32 s2b) = vm.sign(key, db);
        console.log("A r/v:"); console.logBytes32(ra); console.log(va);
        console.log("B r/v:"); console.logBytes32(rb); console.log(vb);
    }
}
