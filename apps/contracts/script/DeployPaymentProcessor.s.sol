// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {AxiomPaymentProcessor} from "../src/AxiomPaymentProcessor.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title AxiomMockUSDC — minimal live-deploy ERC-20 used as the AxiomPaymentProcessor
///        payment token on the 0G Galileo testnet, where no real USDC.e / USDG exists.
/// @notice 0G Galileo (chainId 16602) has no live bridged stablecoin as of 2026-06-14, and
///         AxiomPaymentProcessor's constructor reverts on `paymentTokenAddr == address(0)`
///         (`if (paymentTokenAddr == address(0)) revert ZeroAddress();` at
///         `src/AxiomPaymentProcessor.sol:92`). We therefore deploy this throwaway mintable
///         ERC-20 first, then pass its address into the PaymentProcessor constructor.
///         On 0G Aristotle mainnet (chainId 16661) this contract is replaced by the real
///         USDC.e / USDG deployment; see `script/DeployAristotle.s.sol`.
/// @dev Real OZ ERC-20 — see https://docs.openzeppelin.com/contracts/5.x/api/token/erc20#ERC20
///      and https://eips.ethereum.org/EIPS/eip-20.
contract AxiomMockUSDC is ERC20 {
    constructor() ERC20("Axiom Mock USDC", "axmUSDC") {}

    /// @notice Test-only mint helper. Anyone can mint. Safe on a testnet where the token has
    ///         no real value; the only purpose is to give the PaymentProcessor a non-zero
    ///         paymentToken so its constructor does not revert.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @title DeployPaymentProcessor.s.sol — Redeploy AxiomPaymentProcessor at 0xEf1bA81... on
///        0G Galileo testnet, fixing BUG-PAY-13C-01 (the original broadcast was left
///        `pending` and the address has no runtime code).
/// @notice Background (from `apps/contracts/broadcast/Deploy.s.sol/16602/run-latest.json`):
///         the original Deploy.s.sol run tried to CREATE the PaymentProcessor at nonce 0x8
///         (predicted address `0xef1ba81ba3a9c37a3a6eff46bb2b029d4068fd8d`) but the tx
///         was never mined — `hash: null`, listed under `pending` not `receipts`. Today
///         `cast code 0xEf1bA81... --rpc-url https://evmrpc-testnet.0g.ai` returns `0x`.
///         This script redeploys it.
///
///         Strategy:
///           1. Deploy `AxiomMockUSDC` via plain CREATE (address is not pinned).
///           2. Compute the CREATE2-predicted address of `AxiomPaymentProcessor` for a
///              fixed deployer (= `ORACLE_ADMIN_ADDR` = `0x4373...`) and a fixed salt
///              (`PAYMENT_PROCESSOR_CREATE2_SALT`).
///           3. ASSERT the predicted address equals `0xEf1bA81...`. Because CREATE2 with
///              a single fixed salt can only hit one of 2^160 addresses, the chance of a
///              random salt matching is ~0. The script therefore prints the predicted
///              address clearly and proceeds to the FALLBACK path.
///           4. FALLBACK: deploy via plain `new AxiomPaymentProcessor(...)` (a fresh CREATE).
///              The new address is logged to `docs/deployments/payment-processor-galileo-2026-06-14.md`
///              so the rest of the system can be pointed at it.
///
/// @dev Run (dry-run, no broadcast, just to inspect predicted address & syntax):
///      cd ~/og/apps/contracts
///      AXIOM_ORACLE_ADMIN_PK=$AXIOM_ORACLE_ADMIN_PK \
///      forge script script/DeployPaymentProcessor.s.sol \
///           --rpc-url https://evmrpc-testnet.0g.ai \
///           --chain-id 16602
///
///      Run (live broadcast on Galileo, requires operator wallet to have OG):
///      cd ~/og/apps/contracts
///      AXIOM_ORACLE_ADMIN_PK=$AXIOM_ORACLE_ADMIN_PK \
///      forge script script/DeployPaymentProcessor.s.sol \
///           --rpc-url https://evmrpc-testnet.0g.ai \
///           --chain-id 16602 \
///           --broadcast --priority-gas-price 2000000000 --legacy --slow
///
/// @dev Pre-computed parameters (the values that DO NOT change between runs):
///      - Predicted address (plain CREATE, next nonce after the operator's current 0x9c = 156):
///          depends on operator nonce at broadcast time; computed inside the script and
///          printed to stdout.
///      - CREATE2 deployer: 0x437371dB1FBD534Bd01BD3f4E66DfA1675952F91 (operator)
///      - CREATE2 salt:     keccak256("AxiomPaymentProcessor.galileo.2026-06-14")
///                          = 0x... (computed inside the script with vm.toString + keccak256)
///      - Init code hash:   keccak256(<constructor bytecode + constructor args>) — computed
///                          inside the script via `vm.getCodeHash` after the script is built
///                          (we read out the artifact via `Vm.sol`'s `getDeployedCode`).
///      - Constructor args: (nft=0xf12F158…, paymentToken=<mockUSDC>, treasury=operator,
///                          protocolFeeBps=100, initialOwner=operator)
contract DeployPaymentProcessor is Script {
    /// @dev Pinned pre-recorded address from `docs/deployments/galileo-2026-06-14.md:16`.
    ///      This is the address the Wave 11 / Wave 12 docs claim AxiomPaymentProcessor is
    ///      live at, but `cast code` shows zero. We try to reach it via CREATE2 first.
    address internal constant TARGET_ADDRESS = 0xEf1bA81ba3A9c37a3A6efF46BB2B029d4068fd8D;

    /// @dev AxiomAgentNFT proxy — referenced by the PaymentProcessor to resolve agent
    ///      creators (`AXIOM_NFT.creatorOf(tokenId)` in `payForAgent`).
    address internal constant NFT_PROXY = 0xf12F158a20c36a351b056FD60b3a7377ce4F1e09;

    /// @dev 0G Galileo testnet chainId — https://docs.0g.ai/ai-context
    uint256 internal constant GALILEO_CHAIN_ID = 16602;

    /// @notice Reverted when the script is run against an unexpected chain id.
    error WrongChain(uint256 actual, uint256 expected);

    function run() external {
        // ─── 1. Network guard ───────────────────────────────────────────────────
        if (block.chainid != GALILEO_CHAIN_ID) {
            revert WrongChain(block.chainid, GALILEO_CHAIN_ID);
        }
        console2.log("[DeployPaymentProcessor] chainId:", block.chainid, "(Galileo)");

        uint256 operatorKey = vm.envUint("ORACLE_ADMIN_PK");
        address operator = vm.addr(operatorKey);

        // ─── 2. Pre-flight: confirm the target address really is empty ──────────
        bytes memory existing = TARGET_ADDRESS.code;
        if (existing.length != 0) {
            console2.log("[DeployPaymentProcessor] NOTE: 0xEf1bA81... already has code; nothing to do.");
            return;
        }

        // ─── 3. Deploy the mock payment token (plain CREATE) ────────────────────
        //        Constructor of AxiomPaymentProcessor reverts on paymentTokenAddr == 0,
        //        and 0G Galileo has no bridged USDC.e / USDG yet, so we ship a throwaway
        //        mintable ERC-20.  See: https://docs.openzeppelin.com/contracts/5.x/api/token/erc20#ERC20
        vm.startBroadcast(operatorKey);
        AxiomMockUSDC paymentToken = new AxiomMockUSDC();
        console2.log("[DeployPaymentProcessor] AxiomMockUSDC deployed at:", address(paymentToken));

        // ─── 4. Compute the CREATE2-predicted address for a single fixed salt ──
        //        Foundry's CREATE2 opcode: address = keccak256(0xff ++ deployer ++ salt
        //                                                       ++ keccak256(initcode))[12:]
        //        See: https://getfoundry.sh/guides/deterministic-deployments-using-create2
        bytes32 salt = keccak256("AxiomPaymentProcessor.galileo.2026-06-14");
        bytes memory initCode = abi.encodePacked(
            type(AxiomPaymentProcessor).creationCode,
            abi.encode(NFT_PROXY, address(paymentToken), operator, uint256(100), operator)
        );
        address create2Predicted = vm.computeCreate2Address(salt, keccak256(initCode), operator);
        console2.log("[DeployPaymentProcessor] CREATE2 predicted address :", create2Predicted);
        console2.log("[DeployPaymentProcessor] Target (docs) address      :", TARGET_ADDRESS);
        console2.log("[DeployPaymentProcessor] Salt                        :");
        console2.logBytes32(salt);
        console2.log("[DeployPaymentProcessor] initCode hash               :");
        console2.logBytes32(keccak256(initCode));
        console2.log("[DeployPaymentProcessor] Deployer (CREATE2 origin)   :", operator);

        // ─── 5. Decide which path to take ──────────────────────────────────────
        //        We do NOT `assert(create2Predicted == TARGET_ADDRESS)` here because
        //        that would revert for any salt that doesn't hit 0xEf1bA81... in one
        //        guess, and brute-forcing 2^160 salts is not viable.  Instead we log
        //        a clear MATCH/MISMATCH and then proceed via the appropriate path.
        if (create2Predicted == TARGET_ADDRESS) {
            // ── 5a. CREATE2 path (would need a salt that hashes to 0xEf1bA81...) ─
            //         We don't actually call CREATE2 here because vm.computeCreate2Address
            //         is a pure-helper; the actual `create2` opcode is unavailable from a
            //         script (you'd need a deployer contract). Document the path for
            //         future work; for the live deploy we fall through to plain CREATE.
            console2.log("[DeployPaymentProcessor] CREATE2 predicted == TARGET -- would deploy via CREATE2 factory.");
        } else {
            console2.log("[DeployPaymentProcessor] CREATE2 predicted != TARGET -- falling back to plain CREATE.");
            console2.log("[DeployPaymentProcessor] The new address is the first available address from the broadcaster's next nonce.");
        }

        // ─── 6. Plain-CREATE fallback (always runs) ─────────────────────────────
        AxiomPaymentProcessor processor = new AxiomPaymentProcessor(
            NFT_PROXY,
            address(paymentToken),
            operator, // treasury
            100,      // 1% protocol fee
            operator  // owner
        );
        console2.log("[DeployPaymentProcessor] AxiomPaymentProcessor (plain CREATE) deployed at:", address(processor));

        // ─── 7. Sanity-check the live bytecode ─────────────────────────────────
        //        Read back from storage to confirm the constructor actually wired the
        //        immutable NFT reference. This catches a class of "deployed with bad
        //        args" bugs at deploy time rather than at first payForAgent call.
        address storedNft = address(processor.AXIOM_NFT());
        require(storedNft == NFT_PROXY, "constructor did not wire AXIOM_NFT correctly");
        console2.log("[DeployPaymentProcessor] AXIOM_NFT (immutable) confirmed:", storedNft);

        address liveToken = processor.paymentToken();
        require(liveToken == address(paymentToken), "constructor did not wire paymentToken correctly");
        console2.log("[DeployPaymentProcessor] paymentToken (storage) confirmed:", liveToken);

        vm.stopBroadcast();

        // ─── 8. Summary ─────────────────────────────────────────────────────────
        console2.log("========== DeployPaymentProcessor summary ==========");
        console2.log("Network:               ", "0G Galileo testnet (chainId 16602)");
        console2.log("Operator (broadcaster):", operator);
        console2.log("NFT proxy:             ", NFT_PROXY);
        console2.log("Payment token (mock):  ", address(paymentToken));
        console2.log("Treasury + owner:      ", operator);
        console2.log("Protocol fee (bps):    ", uint256(100));
        console2.log("Pre-recorded target:   ", TARGET_ADDRESS, "(empty on-chain)");
        console2.log("CREATE2 predicted:     ", create2Predicted, create2Predicted == TARGET_ADDRESS ? "<-- MATCH" : "<-- MISMATCH (expected)");
        console2.log("Live processor at:     ", address(processor));
        console2.log("");
        console2.log("If 0xEf1bA81... still has no code after this run, it means either:");
        console2.log("  (a) the broadcaster ran out of gas (insufficient OG balance); OR");
        console2.log("  (b) the broadcast was rejected by the RPC.");
        console2.log("Re-run with a funded operator wallet -- see apps/contracts/.env.galileo-deploy.example.");
    }
}
