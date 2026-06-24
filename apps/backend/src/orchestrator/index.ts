import type { Wallet } from "ethers";
import { AbiCoder, JsonRpcProvider, keccak256, type TransactionReceipt, type TransactionResponse } from "ethers";
import { TypedContract } from "@axiom/config/types/contract";
import type OpenAI from "openai";
import { ZeroGStorage, type Encryption } from "../storage/0g.js";
import { createRouterClient } from "../compute/router.js";
import { DefaultSignerOracleClient } from "../oracle/client.js";
import { pickOGNetwork } from "../storage/0g.js";
const VAULT_ABI: string[] = [
  "function balanceOf(uint256 tokenId) view returns (uint256)",
  "function strategyOf(uint256 tokenId) view returns (bytes32 root, uint256 dailyLimit, uint256 dailySpent, uint64 resetDay)",
  "function execute(uint256 tokenId, address target, uint256 value, bytes data, bytes32[] proof) returns (bytes)",
  "event Deposited(uint256 indexed tokenId, address indexed from, address indexed asset, uint256 amount)",
  "event StrategySet(uint256 indexed tokenId, bytes32 strategyRoot, uint256 dailyLimit, uint64 validUntilDay)",
  "event Executed(uint256 indexed tokenId, bytes32 indexed actionHash, address indexed target, uint256 value, bytes result)",
];

// Local contract method types derived from VAULT_ABI (avoid shared contract-types.ts drift).
type StrategyVaultMethods = {
  balanceOf(tokenId: bigint): Promise<bigint>;
  strategyOf(tokenId: bigint): Promise<[string, bigint, bigint, bigint]>;
  execute(tokenId: bigint, target: string, value: bigint, data: string, proof: string[]): Promise<TransactionResponse>;
};

export interface MarketSignal {
  source: string;
  payload: unknown;
  emittedAt: number;
}

export interface StrategySpec {
  agentTokenId: bigint;
  agentNft: `0x${string}`;
  vault: `0x${string}`;
  computeModel: string;
  systemPrompt: string;
  modelDataRoot: `0x${string}`;
  modelEncryption: Encryption | undefined;
}

export interface TickResult {
  recommendation: { action: "buy" | "sell" | "hold"; amount?: number; reason: string };
  rawModelOutput: string;
  onchain: { vaultBalance: bigint; recentEvents: unknown[] };
  storage: { rootHash: `0x${string}`; size: number };
  execution?: {
    txHash: `0x${string}`;
    action: string;
    target: `0x${string}`;
    success: boolean;
    result?: `0x${string}`;
    gasUsed?: bigint;
  };
  durationMs: number;
}

export interface OrchestratorConfig {
  evmRpc: string;
  signer: Wallet;
  oracleBaseUrl: string;
  addresses?: {
    vault?: `0x${string}`;
  };
  /** EIP-155 chain id (default 16602 = Galileo testnet). */
  chainId?: number;
}

export class StrategyRunner {
  private readonly storage: ZeroGStorage;
  private openai: OpenAI | null = null;
  private readonly oracle: DefaultSignerOracleClient;
  private readonly chainId: number;
  private readonly provider: JsonRpcProvider;
  private readonly addresses: OrchestratorConfig["addresses"];
  private readonly signer: Wallet;

  constructor(config: OrchestratorConfig) {
    const chainId = config.chainId ?? 16602;
    this.chainId = chainId;
    this.provider = new JsonRpcProvider(config.evmRpc, chainId);
    this.addresses = config.addresses;
    this.signer = config.signer;
    const network = pickOGNetwork(chainId);
    if (!network) throw new Error(`Unsupported chainId ${chainId}`);
    this.storage = new ZeroGStorage({ indexerRpc: network.storageRpc, evmRpc: config.evmRpc, signer: config.signer });
    // OpenAI client is lazily created — createRouterClient() only called on first
    // actual tick request, so missing compute credentials don't crash the server.
    this.oracle = new DefaultSignerOracleClient({ baseUrl: config.oracleBaseUrl });
  }

  private getClient(): OpenAI {
    if (!this.openai) {
      this.openai = createRouterClient();
    }
    return this.openai;
  }

  /** Run a single strategy tick: fan out to compute, on-chain reads, and storage. */
  async runTick(strategy: StrategySpec, signal: MarketSignal): Promise<TickResult> {
    const start = Date.now();

    const [rawModelOutput, onchain, storage] = await Promise.all([
      this.runInference(strategy, signal),
      this.fetchOnchainState(strategy),
      this.fetchStoragePeek(strategy),
    ]);

    const recommendation = this.parseRecommendation(rawModelOutput);

    const execution = recommendation.action === "hold"
      ? undefined
      : await this.settleOnChain(strategy, recommendation.action).catch((err) => {
          // Settlement failure must not poison the tick — return a failed
          // execution record so the caller can see the recommendation still.
          return {
            txHash: "0x" as `0x${string}`,
            action: recommendation.action,
            target: (this.addresses?.vault ?? "0x") as `0x${string}`,
            success: false,
            result: `0x${(err instanceof Error ? err.message : String(err)).slice(0, 64)}` as `0x${string}`,
          } satisfies NonNullable<TickResult["execution"]>;
        });

    return {
      recommendation,
      rawModelOutput,
      onchain,
      storage,
      execution,
      durationMs: Date.now() - start,
    };
  }

  /** Parse raw LLM output into a validated recommendation. Falls back to "hold". */
  private parseRecommendation(rawModelOutput: string): TickResult["recommendation"] {
    try {
      const parsed = JSON.parse(rawModelOutput.trim()) as TickResult["recommendation"];
      const action = parsed.action === "buy" || parsed.action === "sell" || parsed.action === "hold" ? parsed.action : "hold";
      return {
        action,
        amount: typeof parsed.amount === "number" ? parsed.amount : undefined,
        reason: typeof parsed.reason === "string" ? parsed.reason : "no reason provided",
      };
    } catch {
      console.warn("[orchestrator] unparseable model output:", rawModelOutput.slice(0, 200));
      return { action: "hold", reason: `Model output not parseable as JSON: ${rawModelOutput.slice(0, 80)}…` };
    }
  }

  /**
   * Settle on-chain via vault.execute(). MVP uses a single-leaf Merkle tree
   * (root == leaf, proof == []) with a no-op action (target=vault, value=0, data="").
   */
  private async settleOnChain(strategy: StrategySpec, action: string): Promise<NonNullable<TickResult["execution"]>> {
    const vaultAddr = this.addresses?.vault;
    if (!vaultAddr) {
      throw new Error("No vault address configured for on-chain settlement");
    }

    const target = vaultAddr;
    const value = 0n;
    const data = "0x";
    // actionHash mirrors AxiomStrategyVault.execute(): keccak256(abi.encode(target, value, keccak256(data)))
    const innerHash = keccak256(data);
    const _actionHash = keccak256(AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256", "bytes32"],
      [target, value, innerHash],
    ));
    // Single-leaf Merkle tree: proof is empty, root == leaf.
    const proof: `0x${string}`[] = [];

    const vaultTc = new TypedContract<StrategyVaultMethods>(vaultAddr, VAULT_ABI, this.signer);
    const tx = await vaultTc.contract.execute(strategy.agentTokenId, target, value, data, proof);
    const receipt: TransactionReceipt | null = await tx.wait();
    if (!receipt) {
      throw new Error(`vault.execute() tx ${tx.hash} returned no receipt`);
    }

    // Capture the Executed event from the receipt logs.
    const executedEvent = vaultTc.iface.getEvent("Executed");
    let result: `0x${string}` | undefined;
    let success = receipt.status === 1;
    if (executedEvent) {
      const executedLog = receipt.logs.find((log) => log.topics[0] === executedEvent.topicHash);
      if (executedLog) {
        const parsed = vaultTc.iface.parseLog(executedLog);
        if (parsed && parsed.args.result) {
          result = parsed.args.result as `0x${string}`;
        }
      }
    }

    return {
      txHash: receipt.hash as `0x${string}`,
      action,
      target,
      success,
      result,
      gasUsed: receipt.gasUsed,
    };
  }

  private async runInference(strategy: StrategySpec, signal: MarketSignal): Promise<string> {
    const userPrompt = `Vault state: ${JSON.stringify(signal.payload)}\n` +
      `Provide a JSON recommendation: {"action":"buy|sell|hold","amount":number,"reason":"…"}`;
    const messages = [
      { role: "system" as const, content: strategy.systemPrompt },
      { role: "user" as const, content: userPrompt },
    ];
    const completion = await this.getClient().chat.completions.create({
      model: strategy.computeModel,
      messages,
      response_format: { type: "json_object" },
    });
    return completion.choices?.[0]?.message?.content ?? "";
  }

  private async fetchOnchainState(strategy: StrategySpec): Promise<TickResult["onchain"]> {
    const vaultAddr = this.addresses?.vault;
    if (!vaultAddr) {
      return { vaultBalance: 0n, recentEvents: [] };
    }
    const vaultTc = new TypedContract<StrategyVaultMethods>(vaultAddr, VAULT_ABI, this.provider);
    const tokenId = strategy.agentTokenId;
    if (!vaultTc.raw.filters?.StrategySet || !vaultTc.raw.filters?.Deposited) {
      return { vaultBalance: 0n, recentEvents: [] };
    }
    const [rawBalance] = await Promise.all([
      vaultTc.contract.balanceOf(tokenId),
      vaultTc.contract.strategyOf(tokenId),
    ]);
    const vaultBalance = rawBalance ?? 0n;

    const latest = await this.provider.getBlockNumber();
    const fromBlock = Math.max(0, latest - 2000);
    const strategyFilter = vaultTc.raw.filters.StrategySet(tokenId);
    const depositFilter = vaultTc.raw.filters.Deposited(tokenId);
    const strategyEvent = vaultTc.iface.getEvent("StrategySet");
    const depositEvent = vaultTc.iface.getEvent("Deposited");
    if (!strategyEvent || !depositEvent) {
      return { vaultBalance: 0n, recentEvents: [] };
    }
    const strategyTopic = strategyEvent.topicHash;
    const depositTopic = depositEvent.topicHash;
    const [strategyLogs, depositLogs] = await Promise.all([
      this.provider.getLogs({ ...strategyFilter, fromBlock, toBlock: latest }),
      this.provider.getLogs({ ...depositFilter, fromBlock, toBlock: latest }),
    ]);
    const recentEvents = [...strategyLogs, ...depositLogs]
      .sort((a, b) => a.blockNumber - b.blockNumber)
      .slice(-10)
      .map((log) => {
        const topic0 = log.topics[0];
        const name = topic0 === strategyTopic ? "StrategySet" : topic0 === depositTopic ? "Deposited" : "Unknown";
        return {
          blockNumber: BigInt(log.blockNumber),
          txHash: log.transactionHash as `0x${string}`,
          name,
        };
      });
    return { vaultBalance, recentEvents };
  }

  private async fetchStoragePeek(strategy: StrategySpec): Promise<TickResult["storage"]> {
    if (strategy.modelDataRoot === ("0x" + "0".repeat(64))) {
      return { rootHash: strategy.modelDataRoot, size: 0 };
    }
    // ECIES-encrypted blobs skipped in devnet (no receiver key). AES-256 uses symmetric key.
    const opts = strategy.modelEncryption?.type === "aes256"
      ? { symmetricKey: strategy.modelEncryption.key, withProof: true }
      : { withProof: true };
    const blob = await this.storage.download(strategy.modelDataRoot, opts);
    return { rootHash: strategy.modelDataRoot, size: blob.size };
  }
}
