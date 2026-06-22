// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {AxiomTeeVerifier} from "../src/verifiers/AxiomTeeVerifier.sol";

/// @title RedeployTeeVerifier.s.sol — Redeploy AxiomTeeVerifier on 0G Galileo
///        testnet with the Wave 14B `validUntil` fix (BUG-TEE-13D-02) live on-chain.
/// @notice Background:
///         The pre-fix verifier at `0xe0D0… (Wave 16B)` (Wave 16B, now superseded by
///         Wave E-5 at `0x24f725…`) was deployed from a previous source
///         revision that lacked the `_checkValidUntil` gate (and its two
///         custom errors `AxiomProofExpired` and `AxiomValidUntilTooFar`).
///         Wave 14B added the `validUntil` field to `OwnershipProof` /
///         `AccessProof` and the EIP-712 deadline check to
///         `verifyTransferValidity`. Wave 16A brings the fix on-chain by
///         re-deploying the verifier from current source.
///
///         Strategy: plain CREATE (NOT CREATE2). The original salt would
///         deterministically map to the pre-fix bytecode address
///         (`0xe0D0… (Wave 16B)`), and that address already has runtime code
///         on-chain; the chain rejects a second deployment to the same
///         address (EIP-684 — https://eips.ethereum.org/EIPS/eip-684).
///         A fresh CREATE lands at a brand-new address predicted by the
///         operator nonce at broadcast time. The AxiomAgentNFT proxy
///         (`0xf12F15…`) references the verifier; after this redeploy the
///         proxy's `getAxiomTeeVerifier()` getter can be queried but
///         `setAxiomTeeVerifier` is owner-gated so the proxy owner must
///         rotate to the new address in a follow-up admin tx (documented
///         in the redeploy log).
///
///         Canonical sources:
///           - EIP-684 (no duplicate contract at one address):
///             https://eips.ethereum.org/EIPS/eip-684
///           - EIP-2 (contract creation collision detection):
///             https://eips.ethereum.org/EIPS/eip-2
///           - OZ OwnableUpgradeable (constructor + initializer pattern):
///             https://docs.openzeppelin.com/contracts/5.x/api/access#OwnableUpgradeable
///           - Foundry CREATE2 guide (why we DON'T use it here):
///             https://getfoundry.sh/guides/deterministic-deployments-using-create2
///           - Foundry `cast code` (verification):
///             https://book.getfoundry.sh/reference/cast/cast-code
///
///         Run (dry-run, no broadcast):
///           cd ~/og/apps/contracts
///           forge script script/RedeployTeeVerifier.s.sol \
///                --rpc-url https://evmrpc-testnet.0g.ai \
///                --chain-id 16602
///
///         Run (live broadcast on Galileo, requires operator wallet to have OG):
///           cd ~/og/apps/contracts
///           AXIOM_ORACLE_ADMIN_PK=$AXIOM_ORACLE_ADMIN_PK \
///           forge script script/RedeployTeeVerifier.s.sol \
///                --rpc-url https://evmrpc-testnet.0g.ai \
///                --chain-id 16602 \
///                --broadcast --priority-gas-price 3000000000 --legacy --slow
///
/// @dev Pinned parameters:
///      - initialOwner          = 0x437371dB1FBD534Bd01BD3f4E66DfA1675952F91 (operator)
///      - signer (TEE)          = 0x437371dB1FBD534Bd01BD3f4E66DfA1675952F91 (operator TEE on testnet)
///      - maxProofAgeSeconds    = 604800 (7 days; matches AxiomTeeVerifier.sol's
///                                recommended value and Wave 12A's pre-fix deployment)
///      - 0G Galileo chainId    = 16602
contract RedeployTeeVerifier is Script {
    /// @dev Operator / Oracle Admin on the 0G Galileo testnet (per wallets/ADDRESSES.md).
    address internal constant OPERATOR = 0x437371dB1FBD534Bd01BD3f4E66DfA1675952F91;
    /// @dev TEE signer — same address as the operator on the testnet (the production
    ///      buildathon TEE signer is a separate key, but on Galileo we use the
    ///      operator as a stand-in).
    address internal constant TEE_SIGNER = 0x437371dB1FBD534Bd01BD3f4E66DfA1675952F91;
    /// @dev 7 days in seconds (matches the pre-fix deployment's `7 days` literal).
    uint256 internal constant MAX_PROOF_AGE_SECONDS = 604800;
    /// @dev 0G Galileo testnet chainId — https://docs.0g.ai/ai-context
    uint256 internal constant GALILEO_CHAIN_ID = 16602;

    /// @notice Reverted when the script is run against an unexpected chain id.
    error WrongChain(uint256 actual, uint256 expected);

    function run() external {
        // ─── 1. Network guard ───────────────────────────────────────────────────
        if (block.chainid != GALILEO_CHAIN_ID) {
            revert WrongChain(block.chainid, GALILEO_CHAIN_ID);
        }
        console2.log("[RedeployTeeVerifier] chainId:", block.chainid, "(Galileo)");

        uint256 operatorKey = vm.envUint("ORACLE_ADMIN_PK");
        address operator = vm.addr(operatorKey);
        require(operator == OPERATOR, "broadcaster must be the operator (0x4373...)");

        // ─── 2. Pre-flight: log the broadcaster's current nonce so the predicted
        //        new address can be reconstructed from `cast compute-address`.  ──
        uint64 currentNonce = vm.getNonce(operator);
        console2.log("[RedeployTeeVerifier] Operator nonce at broadcast time:", currentNonce);
        console2.log("[RedeployTeeVerifier] Operator:                       ", operator);
        console2.log("[RedeployTeeVerifier] Constructor args:              ");
        console2.log("    initialOwner        =", OPERATOR);
        console2.log("    signer (TEE)        =", TEE_SIGNER);
        console2.log("    maxProofAgeSeconds  =", MAX_PROOF_AGE_SECONDS);

        // ─── 3. Broadcast the deployment ──────────────────────────────────────
        //        Plain CREATE — `new AxiomTeeVerifier(...)` from the script's
        //        broadcaster. The new address is the first available from the
        //        operator's next nonce; we log it immediately after construction.
        vm.startBroadcast(operatorKey);
        AxiomTeeVerifier verifier = new AxiomTeeVerifier(
            OPERATOR,           // initialOwner
            TEE_SIGNER,         // signer
            MAX_PROOF_AGE_SECONDS // 7 days
        );
        vm.stopBroadcast();
        console2.log("[RedeployTeeVerifier] AxiomTeeVerifier (plain CREATE) deployed at:", address(verifier));

        // ─── 4. Sanity-check the on-chain state ───────────────────────────────
        //        Read back the immutable + storage fields to confirm the constructor
        //        wired them correctly. This catches "deployed with bad args" bugs
        //        at deploy time rather than at first verifyTransferValidity call.
        //        (vm.read-storage is too low-level; we use the public getters
        //        instead — `maxProofAgeSeconds` is `public` on the immutable and
        //        `registeredSigner` is `public` on the storage field.)
        address liveSigner = verifier.registeredSigner();
        require(liveSigner == TEE_SIGNER, "constructor did not wire signer correctly");
        console2.log("[RedeployTeeVerifier] registeredSigner (storage) confirmed:", liveSigner);

        // maxProofAgeSeconds is `public` → ABI getter exists; calling it via the
        // verifier address returns the immutable value.
        // (We can't call the getter directly through Solidity in a script without
        // an interface, so we re-read via the `AxiomTeeVerifier` type's public
        // auto-generated getter.)
        uint256 liveMaxAge = verifier.maxProofAgeSeconds();
        require(liveMaxAge == MAX_PROOF_AGE_SECONDS, "constructor did not wire maxProofAgeSeconds correctly");
        console2.log("[RedeployTeeVerifier] maxProofAgeSeconds (immutable) confirmed:", liveMaxAge);

        // ─── 5. Summary ─────────────────────────────────────────────────────────
        console2.log("========== RedeployTeeVerifier summary ==========");
        console2.log("Network:                ", "0G Galileo testnet (chainId 16602)");
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
        console2.log("");
        console2.log("Pre-fix verifier (do NOT use, kept for historical record):");
        console2.log("  0xe0D0... (historical, superseded by Wave E-5)");
    }
}
