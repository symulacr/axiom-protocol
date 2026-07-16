
export type TickAction = "act" | "hold";

export interface TickRecommendation {
  action: TickAction;
  amount?: number;
  confidence?: number;
  reason: string;
}

export interface TickOnchainState {
  vaultBalance: bigint;
  recentEvents: unknown[];
}

export interface TickStorageInfo {
  rootHash: `0x${string}`;
  size: number;
}

export interface TickExecution {
  success?: boolean;
  status?: "success" | "skipped" | "executed" | "failed";
  reason?: string;
  txHash?: `0x${string}`;
  action?: string;
  target?: `0x${string}`;
  result?: `0x${string}`;
  gasUsed?: bigint;
}
export interface TickResult {
  recommendation: TickRecommendation;
  rawModelOutput: string;
  onchain: TickOnchainState;
  storage: TickStorageInfo;
  execution?: TickExecution;
  durationMs: number;
}

export interface TickRequest {
  vault: `0x${string}`;
  agentNft: `0x${string}`;
  agentTokenId: string;
  computeModel?: string;
  strategy?: string;
  signalSource?: string;
  signalPayload?: unknown;
  stream?: boolean;
  /** Optional Merkle-backed vault execute plan (server-key settlement) */
  executionPlan?: {
    target: `0x${string}`;
    value?: string | number;
    data?: `0x${string}`;
    merkleProof: `0x${string}`[];
  };
}

export interface TickStreamOptions {
  onChunk?: (token: string) => void;
  signal?: AbortSignal;
}
