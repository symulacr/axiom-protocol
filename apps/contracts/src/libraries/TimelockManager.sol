// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Shared 1-day timelock (propose → wait 1 day → execute, with cancel); each caller stores its own State in its storage namespace.
library TimelockManager {
    struct State {
        address proposed;
        uint256 proposedAt;
    }

    uint256 internal constant DELAY = 10 minutes;

    error NoPendingProposal();
    error DelayNotElapsed(uint256 remaining);

    function propose(State storage s, address target) internal {
        s.proposed = target;
        s.proposedAt = block.timestamp;
    }

    function execute(State storage s) internal returns (address) {
        if (s.proposed == address(0)) revert NoPendingProposal();
        uint256 elapsed = block.timestamp - s.proposedAt;
        if (elapsed < DELAY) revert DelayNotElapsed(DELAY - elapsed);
        address result = s.proposed;
        delete s.proposed;
        delete s.proposedAt;
        return result;
    }

    function cancel(State storage s) internal {
        delete s.proposed;
        delete s.proposedAt;
    }
}
