// AxiomProtocol — AxiomStrategyVault ABI. Re-exports `abi` from JSON for wagmi v2 inference.
import axiomStrategyVaultAbiJson from './AxiomStrategyVault.json';

export const axiomStrategyVaultAbi = axiomStrategyVaultAbiJson.abi;

export type AxiomStrategyVaultAbi = typeof axiomStrategyVaultAbi;
