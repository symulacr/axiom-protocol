# On-Chain Call Patterns

## Three-Tier Model

| Tier | Signer | Gas Payer | Operations |
|------|--------|-----------|------------|
| Protocol | Backend wallet | Protocol funds | mintWithRole (MINTER_ROLE), payComputeProvider |
| User | User wallet | User funds | deposit, withdraw, setStrategy, payForAgent, withdrawAgentEarnings, iTransferFrom |
| Hybrid | Both | User funds | transfer (backend preps proofs, user signs EIP-712) |
