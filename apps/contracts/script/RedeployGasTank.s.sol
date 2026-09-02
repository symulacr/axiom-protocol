// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {AxiomGasTank} from "../src/AxiomGasTank.sol";
import {AxiomPaymentProcessor} from "../src/AxiomPaymentProcessor.sol";
import {AxiomAgentNFT} from "../src/AxiomAgentNFT.sol";

/// @title RedeployGasTank.s.sol — W8/B4: fresh non-upgradeable AxiomGasTank with the canonical
///        EIP-712 digest fix, forwarder rewiring on BOTH consumers, reserve re-seed, and a live
///        digest-parity post-check.
/// @notice The deployed tank hashed the ForwardRequest struct via `abi.encode(TYPEHASH, req)` —
///         Solidity's calldata-struct expansion ABI-encodes the dynamic `bytes data` IN-PLACE,
///         diverging from canonical EIP-712 hashStruct semantics (dynamic members keccak256'd,
///         Permit2 PermitHash.hashWithWitness form). Every wallet-signed relay reverted
///         InvalidUserSignature. GasTank is non-upgradeable → fresh deploy + rewiring.
/// @dev RESERVE MIGRATION: the OLD tank's tracked reserve (0.1 OG) is NOT owner-recoverable —
///         `recoverReserve` only ever touches UNTRACKED surplus and reverts ZeroAmount here;
///         the only tracked-exit path (grantCredit + withdrawTank) is closed because grant wei
///         are spend-only (withdrawable = tank - grantBalance = 0). renounceOwnership would
///         strand the funds permanently, so it is not executed. Migration is DEFERRED (wave MD
///         operator notes) and this script seeds a FRESH reserve sized to the operator's
///         available balance. USER STATE RESET: user tanks, grants, grantsUsed and nonces on
///         the old tank are abandoned (testnet-only).
///    Invocation (two explicit broadcast keys, never printed — DEPLOYER_PK deploys and funds
///    the reserve from its own balance; ORACLE_ADMIN_PK signs the admin-gated wiring leg):
///   DEPLOYER_PK=<pk> ORACLE_ADMIN_PK=<pk> \
///   OLD_GAS_TANK=0xE986B04Cf266E06D7097452af471D7b0e306898d \
///   GAS_TANK_ADMIN=0x0553f58a0209Fb8DcE201fCD9406Be56da890D73 \
///   MAX_GAS_PER_OP=300000 NEW_RESERVE_WEI=100000000000000000 \
///   PROCESSOR_PROXY=0xe6956f663103c6E1e5077c3256c453b95924112a \
///   NFT_PROXY=0xe32f87C6F8070C89a82D51BDd3fab578C0d7be6f \
///   ~/.foundry/bin/forge script script/RedeployGasTank.s.sol \
///     --rpc-url https://evmrpc-testnet.0g.ai --chain-id 16602 --legacy --slow --broadcast
contract RedeployGasTank is Script {
    uint256 internal constant GALILEO_CHAIN_ID = 16_602;

    error WrongChain(uint256 actual, uint256 expected);
    error OldTankStillTrusted();
    error OldTankReserveUnmigrated();

    function run() external {
        if (block.chainid != GALILEO_CHAIN_ID) {
            revert WrongChain(block.chainid, GALILEO_CHAIN_ID);
        }
        console2.log("[RedeployGasTank] chainId:", block.chainid, "(Galileo)");

        uint256 deployerKey = vm.envUint("DEPLOYER_PK");
        address deployer = vm.addr(deployerKey);
        uint256 adminKey = vm.envUint("ORACLE_ADMIN_PK");
        address adminKeyAddr = vm.addr(adminKey);
        AxiomGasTank oldTank = AxiomGasTank(payable(vm.envAddress("OLD_GAS_TANK")));
        address admin = vm.envAddress("GAS_TANK_ADMIN");
        uint256 maxGasPerOp = vm.envUint("MAX_GAS_PER_OP");
        uint256 newReserve = vm.envUint("NEW_RESERVE_WEI");
        AxiomPaymentProcessor processor = AxiomPaymentProcessor(payable(vm.envAddress("PROCESSOR_PROXY")));
        AxiomAgentNFT nft = AxiomAgentNFT(vm.envAddress("NFT_PROXY"));

        require(adminKeyAddr == admin, "ORACLE_ADMIN_PK must be the GAS_TANK_ADMIN");
        console2.log("[RedeployGasTank] old tank:", address(oldTank));
        console2.log("[RedeployGasTank] old reserve (wei):", oldTank.reserve());
        console2.log("[RedeployGasTank] admin:      ", admin);
        console2.log("[RedeployGasTank] deployer:  ", deployer);

        // Leg 1 (deployer key): deploy the fixed tank, fund the reserve from the deployer's
        // own balance, then hand ownership to the admin. The reserve is sized to the FRESH
        // value passed in NEW_RESERVE_WEI — the old tank's 0.1 OG cannot be moved on-chain
        // (see NatSpec), so do NOT pass the old reserve here.
        vm.startBroadcast(deployerKey);
        AxiomGasTank gasTank = new AxiomGasTank(deployer, maxGasPerOp);
        console2.log("[RedeployGasTank] NEW AxiomGasTank (canonical digest) at:", address(gasTank));
        gasTank.depositReserve{value: newReserve}();
        gasTank.transferOwnership(admin);
        vm.stopBroadcast();

        // Leg 2 (admin key): admin-gated forwarder rewiring on BOTH consumers.
        vm.startBroadcast(adminKey);
        processor.setTrustedForwarder(address(gasTank));
        nft.setTrustedForwarder(address(gasTank));
        vm.stopBroadcast();
        oldTank; // read-only reference; the old reserve is intentionally left stranded (NatSpec)

        // ── Post-checks (asserted against on-chain state, not logs) ──
        require(gasTank.owner() == admin, "gastank: owner mismatch");
        require(gasTank.maxGasPerOp() == maxGasPerOp, "gastank: maxGasPerOp mismatch");
        require(processor.trustedForwarder() == address(gasTank), "processor: forwarder mismatch");
        require(nft.trustedForwarder() == address(gasTank), "nft: forwarder mismatch");
        require(gasTank.reserve() == newReserve, "gastank: reserve funding mismatch");
        require(
            address(gasTank).balance == gasTank.reserve() + gasTank.totalTankBalance(),
            "gastank: untracked balance != 0"
        );
        // Old tank must be fully unwired before traffic cuts over.
        if (processor.isTrustedForwarder(address(oldTank))) revert OldTankStillTrusted();
        if (nft.isTrustedForwarder(address(oldTank))) revert OldTankStillTrusted();
        // Old reserve could not be migrated on-chain (see NatSpec) — surfaced, not silent.
        console2.log("[RedeployGasTank] WARN: old tank reserve NOT migrated (wei):", oldTank.reserve());
        // ── Live digest-parity check: the view must return the CANONICAL EIP-712 digest. ──
        bytes32 TYPEHASH = keccak256(
            "ForwardRequest(address user,address target,bytes data,uint256 maxGasCost,uint256 nonce,uint256 deadline)"
        );
        AxiomGasTank.ForwardRequest memory req = AxiomGasTank.ForwardRequest({
            user: admin,
            target: address(processor),
            data: hex"deadbeef",
            maxGasCost: 0.0005 ether,
            nonce: 42,
            deadline: block.timestamp + 10 minutes
        });
        bytes32 structHash = keccak256(
            abi.encode(TYPEHASH, req.user, req.target, keccak256(req.data), req.maxGasCost, req.nonce, req.deadline)
        );
        bytes32 sep = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("AxiomGasTank"),
                keccak256("1"),
                block.chainid,
                address(gasTank)
            )
        );
        bytes32 canonical = keccak256(abi.encodePacked("\x19\x01", sep, structHash));
        bytes32 live = gasTank.forwardRequestDigest(req);
        require(live == canonical, "LIVE DIGEST DRIFT: deployed tank is not canonical");
        console2.logBytes32(canonical);
        console2.logBytes32(live);
        console2.log("[RedeployGasTank] DIGEST PARITY OK (canonical EIP-712)");
        console2.log("========== RedeployGasTank summary ==========");
        console2.log("NEW GasTank:", address(gasTank));
        console2.log("reserve (wei):", newReserve);
        console2.log("OLD GasTank (deprecated, 0.1 OG stranded):", address(oldTank));
    }
}
