// Axiom Protocol — AxiomStrategyVault ABI module.
//
// The actual ABI lives in `AxiomStrategyVault.json` (the canonical,
// human-readable source of truth) and is re-exported here as a readonly
// tuple so wagmi v2 can use it for `useReadContracts` / `useReadContract`
// inference.
//
// The JSON file wraps the ABI in `{ _meta, abi }` so the metadata
// (canonical source URLs, contract source path) is co-located with the
// data. We unwrap the `abi` field here; wagmi only reads the array.
// `resolveJsonModule` is enabled in `tsconfig.base.json`, so the JSON
// import is already typed as a `readonly` array — adding `as const` on
// a non-literal import binding is a TS error (TS1355).
import axiomStrategyVaultAbiJson from './AxiomStrategyVault.json';

export const axiomStrategyVaultAbi = axiomStrategyVaultAbiJson.abi;

export type AxiomStrategyVaultAbi = typeof axiomStrategyVaultAbi;
