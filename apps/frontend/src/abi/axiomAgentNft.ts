// AxiomProtocol — AxiomAgentNFT ABI. Re-exports `abi` from JSON for wagmi v2 inference.
import axiomAgentNftAbiJson from './AxiomAgentNFT.json';

export const axiomAgentNftAbi = axiomAgentNftAbiJson.abi;

export type AxiomAgentNftAbi = typeof axiomAgentNftAbi;
