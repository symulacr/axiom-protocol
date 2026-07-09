// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";

/// @notice Gates fork tests behind FOUNDRY_LIVE_FORK=1 (off in default CI).
abstract contract LiveForkTest is Test {
    function _liveForkEnabled() internal view returns (bool) {
        try vm.envBool("FOUNDRY_LIVE_FORK") returns (bool on) {
            return on;
        } catch {
            return false;
        }
    }

    function _skipUnlessLiveFork() internal {
        if (!_liveForkEnabled()) {
            vm.skip(true);
        }
    }

    function _forkRpcUrl() internal view returns (string memory) {
        try vm.envString("OG_RPC_URL") returns (string memory url) {
            return url;
        } catch {
            return "https://evmrpc-testnet.0g.ai";
        }
    }

    function _forkPinBlock() internal view returns (uint256) {
        try vm.envUint("FOUNDRY_FORK_BLOCK") returns (uint256 blockNum) {
            return blockNum;
        } catch {
            return 38_748_015;
        }
    }
}
