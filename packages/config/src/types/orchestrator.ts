type TickAction = "act" | "hold";

interface TickRecommendation {
  action: TickAction;
  amount?: number;
  confidence?: number;
  reason: string;
}

interface TickOnchainState {
  vaultBalance: bigint;
  recentEvents: unknown[];
}

interface TickStorageInfo {
  rootHash: `0x${string}`;
  size: number;
}

interface TickExecution {
  success?: boolean;
  status?: "pending" | "success" | "skipped" | "executed" | "failed";
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
  executionPlan?: {
    // Optional Merkle-backed vault execute plan; uses server-key settlement, not client key
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

export interface PerformanceMetrics {
  totalTicks: number;
  buyCount: number;
  sellCount: number;
  holdCount: number;
  buyRate: number;
  // (buyCount + sellCount)/totalTicks — trade-action rate, NOT buyRate; mirrors routers/performance.ts.
  winRate: number;
}
