# Security posture

Full honest-security statement. The README carries a three-line summary; this file
carries the details, the key hygiene rules, and the known gaps.

## Auth model

- **API-key based.** `AXIOM_API_KEY` (server-side, full access) and
  `AXIOM_CLIENT_API_KEY` / `VITE_API_KEY` (browser, hard allowlist of skills, no vault
  execute).
- `AXIOM_DISABLE_AUTH=true` is refused when `NODE_ENV=production`.

## TEE posture (simulated, honestly)

- The TEE signer is **simulated**: a software secp256k1 signer holding a cleartext key.
  It is not a hardware TEE (no Intel TDX/SEV).
- Everything else is built as if the hardware were real: sealed key transport, one-shot
  proof nonces, 7-day proof freshness, signer allowlist. The hardware swap is a
  deployment change, not a rewrite.
- Transfers require an ECIES-**sealed** data-encryption key. Cleartext DEKs are rejected.

## Signer allowlist

- Revocation is immediate (`revokeSigner`); adding a signer keeps the 1-day
  propose/execute timelock. A compromised key is contained in one block instead of one
  day.
- k-of-1 quorum is a deliberate product decision (V3 wave 1B): quorum would multiply TEE
  infrastructure without changing the containment story. See ADR 004 §1.4.

## Key hygiene

- Production deploy keys live only in git-ignored local files or env vars, never in the
  repo.
- Rotate testnet keys before mainnet.
- Secret scanning runs in CI (gitleaks, `.gitleaks.toml`; `.env.example` is
  placeholder-only by convention).

## Known gaps, stated plainly

- The DEK custody store is a JSON file — fine for testnet, needs a real store for
  mainnet.
- The keeper's Chainlink/Gelato modes are documented stubs.
- The strategy-invariant TS mirror is machine-pinned against current Solidity and must be
  re-pinned after any vault change.
- The verifier implements no ERC-165 and reverts on interface probes (see
  [ERC-7857 divergence register](erc7857-divergences.md) D9).
