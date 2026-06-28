// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {AxiomTeeVerifier} from "../src/verifiers/AxiomTeeVerifier.sol";

/// @title RedeployTeeVerifier.s.sol — Redeploy AxiomTeeVerifier on Galileo
/// @notice Pre-fix verifier lacked the validUntil gate. Re-deploys from current source
///         via plain CREATE (original address has code). Proxy owner must rotate after.
/// @dev AXIOM_ORACLE_ADMIN_PK=<pk> forge script script/RedeployTeeVerifier.s.sol --rpc-url https://evmrpc-testnet.0g.ai --chain-id 16602 --broadcast --priority-gas-price 3000000000 --legacy --slow
contract RedeployTeeVerifier is Script {
    uint256 internal constant MAX_PROOF_AGE_SECONDS = 604_800;
    uint256 internal constant GALILEO_CHAIN_ID = 16_602;

    error WrongChain(uint256 actual, uint256 expected);

    function run() external {
        if (block.chainid != GALILEO_CHAIN_ID) {
            revert WrongChain(block.chainid, GALILEO_CHAIN_ID);
        }
        console2.log("[RedeployTeeVerifier] chainId:", block.chainid, "(Galileo)");

        uint256 operatorKey = vm.envUint("ORACLE_ADMIN_PK");
        address operator = vm.addr(operatorKey);
        address operatorAddr = vm.envAddress("AXIOM_OPERATOR_ADDRESS");
        address teeSigner = vm.envAddress("AXIOM_TEE_SIGNER_ADDRESS");
        require(operator == operatorAddr, "broadcaster must be the operator");

        uint64 currentNonce = vm.getNonce(operator);
        console2.log("[RedeployTeeVerifier] Operator nonce at broadcast time:", currentNonce);
        console2.log("[RedeployTeeVerifier] Operator:                       ", operator);
        console2.log("[RedeployTeeVerifier] Constructor args:");
        console2.log("    initialOwner        =", operatorAddr);
        console2.log("    signer (TEE)        =", teeSigner);
        console2.log("    maxProofAgeSeconds  =", MAX_PROOF_AGE_SECONDS);

        vm.startBroadcast(operatorKey);
        AxiomTeeVerifier verifier = new AxiomTeeVerifier(operatorAddr, teeSigner, MAX_PROOF_AGE_SECONDS);
        vm.stopBroadcast();
        console2.log("[RedeployTeeVerifier] AxiomTeeVerifier deployed at:", address(verifier));

        address liveSigner = verifier.registeredSigner();
        require(liveSigner == teeSigner, "constructor did not wire signer correctly");
        console2.log("[RedeployTeeVerifier] registeredSigner confirmed:", liveSigner);

        uint256 liveMaxAge = verifier.maxProofAgeSeconds();
        require(liveMaxAge == MAX_PROOF_AGE_SECONDS, "constructor did not wire maxProofAgeSeconds correctly");
        console2.log("[RedeployTeeVerifier] maxProofAgeSeconds confirmed:", liveMaxAge);

        console2.log("========== RedeployTeeVerifier summary ==========");
        console2.log("Network:                0G Galileo testnet (chainId 16602)");
        console2.log("Operator (broadcaster): ", operator);
        console2.log("Operator nonce (before):", currentNonce);
        console2.log("TEE signer (registered):", liveSigner);
        console2.log("maxProofAgeSeconds:     ", liveMaxAge, "(7 days)");
        console2.log("Live verifier at:       ", address(verifier));
        console2.log("");
        console2.log("Verification commands:");
        console2.log("  cast code", address(verifier), "--rpc-url $OG_RPC_URL");
        console2.log("  cast call", address(verifier), "\"maxProofAgeSeconds()(uint256)\" --rpc-url $OG_RPC_URL");
        console2.log("  cast call", address(verifier), "\"registeredSigner()(address)\" --rpc-url $OG_RPC_URL");
    }
}
