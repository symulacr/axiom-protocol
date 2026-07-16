# Wave 3 Report — Settlement & Vault

## Fixed
- **C4:** `settleOnChain` executes when `executionPlan` (Merkle proof) provided; else honest skip
- Tick schema accepts `executionPlan`
- Vault: `usedActions` one-shot leaves (`ActionAlreadyUsed`)
- NFT: bare `transferFrom` blocked via `_update` (`UseITransferWithProofs`); mint/iTransfer ok
- `mintWithRole` now `whenNotPaused` + `nonReentrant`

## Tests
- settle-parse / settle-execution-plan unit tests; forge suite (gas benches expect bare-transfer revert)
