import type { Wallet } from "ethers";
import {
  Contract,
  type JsonRpcProvider,
  type Provider,
  type TransactionResponse,
} from "ethers";
import { TypedContract } from "@axiom/config/types/contract";
import type { StorageAdapter } from "@axiom/config/storage/0g";
import type { TickResult } from "@axiom/config/types/orchestrator";
import type OpenAI from "openai";
import type { OgChatParams } from "@axiom/chat-runtime";
import { z } from "zod";
import {
  createRouterClient,
  createStaticProvider,
  resolveChainId,
} from "../compute/index.js";
import { pickOGNetwork } from "@axiom/config/networks";
import { EVENT_NAMES, getRuntimeConfig, ZERO_DATA_ROOT } from "@axiom/config";
import {
  STRATEGY_OF_CURRENT,
  STRATEGY_OF_LEGACY,
  VAULT_ABI,
  VAULT_ABI_LEGACY,
} from "@axiom/config/abis";
import { createLogger } from "../utils/logger.js";
import { extractErrorMessage } from "../utils/response.js";
// .catch() per field mirrors parseRecommendation's hand-rolled graceful degradation: invalid/missing values fall back to safe defaults, never rejecting the whole payload.
const RecommendationSchema = z.object({
  action: z.enum(["act", "hold"]).catch("hold"),
  amount: z.number().min(0).max(1e18).optional().catch(undefined),
  confidence: z.number().min(0).max(1).optional().catch(undefined),
  reason: z.string().catch("no reason provided"),
});

type VaultAbiVariant = "legacy" | "current";

const variantCache = new Map<string, VaultAbiVariant>();

export async function detectVaultAbiVariant(
  provider: Provider,
  vaultAddress: string,
): Promise<VaultAbiVariant> {
  const key = vaultAddress.toLowerCase();
  const cached = variantCache.get(key);
  if (cached) return cached;

  const probe = async (
    abi: typeof STRATEGY_OF_CURRENT | typeof STRATEGY_OF_LEGACY,
    variant: VaultAbiVariant,
  ): Promise<VaultAbiVariant> => {
    const c = new Contract(vaultAddress, abi, provider);
    await c.getFunction("strategyOf").staticCall(0n);
    variantCache.set(key, variant);
    return variant;
  };
  try {
    return await probe(STRATEGY_OF_CURRENT, "current");
  } catch {
    return await probe(STRATEGY_OF_LEGACY, "legacy");
  }
}

export function vaultAbiFor(
  variant: VaultAbiVariant,
): typeof VAULT_ABI | typeof VAULT_ABI_LEGACY {
  return variant === "legacy" ? VAULT_ABI_LEGACY : VAULT_ABI;
}

export interface VaultStrategyState {
  root: string;
  dailyLimit: bigint;
  validUntilDay: bigint;
}

export async function readVaultStrategy(
  provider: Provider,
  vaultAddress: string,
  tokenId: bigint,
): Promise<VaultStrategyState> {
  const variant = await detectVaultAbiVariant(provider, vaultAddress);
  if (variant === "legacy") {
    const vault = new Contract(vaultAddress, STRATEGY_OF_LEGACY, provider);
    const [root, dailyLimit] = await vault.getFunction("strategyOf")(tokenId);
    return { root, dailyLimit, validUntilDay: 0n };
  }
  const vault = new Contract(vaultAddress, STRATEGY_OF_CURRENT, provider);
  const [root, dailyLimit, , , validUntilDay] =
    await vault.getFunction("strategyOf")(tokenId);
  return { root, dailyLimit, validUntilDay };
}

const log = createLogger("orchestrator");
type StrategyVaultMethods = {
  balanceOf(tokenId: bigint): Promise<bigint>;
  execute(
    tokenId: bigint,
    target: string,
    value: bigint,
    data: string,
    proof: string[],
  ): Promise<TransactionResponse>;
};

export interface MarketSignal {
  source: string;
  payload: unknown;
  emittedAt: number;
}

interface VaultExecutionPlan {
  target: `0x${string}`;
  value?: string | number | bigint;
  data?: `0x${string}`;
  /** Merkle proof of the leaf keccak256(abi.encode(target, value, keccak256(data))) — one leaf per execution plan */
  merkleProof: `0x${string}`[];
}

export interface StrategySpec {
  agentTokenId: bigint;
  agentNft: `0x${string}`;
  vault: `0x${string}`;
  computeModel: string;
  systemPrompt: string;
  modelDataRoot: `0x${string}`;
  executionPlan?: VaultExecutionPlan;
}

type StreamCallback = (
  chunk:
    | { type: "token"; content: string; index: number }
    | { type: "complete"; result: TickResult }
    | { type: "error"; error: string },
) => void;

interface OrchestratorConfig {
  evmRpc: string;
  signer: Wallet;
  addresses?: {
    vault?: `0x${string}`;
  };
  chainId?: number;
  /** Optional 0G storage adapter; when set, tick reports real blob size instead of the size-0 stub. */
  storage?: StorageAdapter;
}

export class StrategyRunner {
  private openai: OpenAI | null = null;
  private openaiModel: string | undefined;
  private readonly provider: JsonRpcProvider;
  private readonly addresses: OrchestratorConfig["addresses"];

  private readonly signer: Wallet;
  private readonly storage: StorageAdapter | undefined;
  private vaultReadTc: TypedContract<StrategyVaultMethods> | null = null;
  private vaultWriteTc: TypedContract<StrategyVaultMethods> | null = null;
  private vaultAbiVariant: VaultAbiVariant | null = null;

  constructor(config: OrchestratorConfig) {
    const chainId = resolveChainId(config.chainId);
    this.provider = createStaticProvider(config.evmRpc, chainId, {
      timeoutMs: getRuntimeConfig().orchestratorProviderTimeoutMs,
    });
    this.addresses = config.addresses;
    this.signer = config.signer;
    this.storage = config.storage;
    const network = pickOGNetwork(chainId); // network const exists only for the unsupported-chain guard's type narrowing
    if (!network) throw new Error(`Unsupported chainId ${chainId}`);
  }

  private async getClient(model?: string): Promise<OpenAI> {
    if (this.openai && this.openaiModel === model) return this.openai;
    this.openai = await createRouterClient(model, { timeout: undefined });
    this.openaiModel = model;
    return this.openai;
  }

  async runTick(
    strategy: StrategySpec,
    signal: MarketSignal,
    onChunk?: StreamCallback,
  ): Promise<TickResult> {
    const start = Date.now();

    const skipInference =
      signal.source === "manual:e2e" ||
      signal.source === "manual:e2e-mock" ||
      signal.source === "manual:e2e-availability";
    const onchainTask = this.fetchOnchainState(strategy);
    const inferenceTask = skipInference
      ? Promise.resolve(
          JSON.stringify({
            action: "hold",
            reason: "E2E mock tick (compute inference skipped)",
          }),
        )
      : this.runInference(strategy, signal, onchainTask, onChunk);

    // Storage read: when a 0G adapter is configured, download the blob by root and report
    // its real size; otherwise report configured modelDataRoot with size 0 (honest: not measured).
    const storageTask = (async (): Promise<{ rootHash: `0x${string}`; size: number }> => {
      if (this.storage && strategy.modelDataRoot !== ZERO_DATA_ROOT) {
        try {
          const dl = await this.storage.download(strategy.modelDataRoot);
          return { rootHash: strategy.modelDataRoot, size: dl.length };
        } catch {
          /* blob absent / undecryptable — report root with size 0 */
        }
      }
      return { rootHash: strategy.modelDataRoot, size: 0 };
    })();
    const [inferenceResult, onchainResult, storageResult] =
      await Promise.allSettled([
        inferenceTask,
        onchainTask,
        storageTask,
      ]);

    const rawModelOutput =
      inferenceResult.status === "fulfilled"
        ? inferenceResult.value
        : (() => {
            throw new Error(
              `Inference failed: ${extractErrorMessage(inferenceResult.reason)}`,
            );
          })();
    const onchain =
      onchainResult.status === "fulfilled"
        ? onchainResult.value
        : { vaultBalance: 0n, recentEvents: [] };
    const storage =
      storageResult.status === "fulfilled"
        ? storageResult.value
        : { rootHash: strategy.modelDataRoot, size: 0 };

    const recommendation = parseRecommendation(rawModelOutput);

    const execution =
      recommendation.action === "hold"
        ? undefined
        : await this.settleOnChain(strategy, recommendation.action).catch(
            (err) =>
              ({
                txHash: "0x" as `0x${string}`,
                action: recommendation.action,
                target: (this.addresses?.vault ?? "0x") as `0x${string}`,
                success: false,
                result:
                  `0x${extractErrorMessage(err).slice(0, 128)}` as `0x${string}`,
              }) satisfies NonNullable<TickResult["execution"]>,
          );

    const result: TickResult = {
      recommendation,
      rawModelOutput,
      onchain,
      storage,
      execution,
      durationMs: Date.now() - start,
    };

    if (onChunk) {
      onChunk({ type: "complete", result });
    }

    return result;
  }

  /** Settles only when executionPlan is present (target/value/data/merkleProof); without one, explicit skip — inference alone never spends vault funds. */
  private async settleOnChain(
    strategy: StrategySpec,
    action: string,
  ): Promise<NonNullable<TickResult["execution"]>> {
    const vaultAddr = this.addresses?.vault;
    if (!vaultAddr) {
      throw new Error("No vault address configured for on-chain settlement");
    }

    const vaultStrategy = await readVaultStrategy(
      this.provider,
      vaultAddr,
      strategy.agentTokenId,
    );
    const vaultStrategyRoot = vaultStrategy.root;

    const plan = strategy.executionPlan;
    if (
      !plan ||
      !plan.target ||
      !Array.isArray(plan.merkleProof) ||
      plan.merkleProof.length === 0
    ) {
      log.info("settleOnChain skipped (no executionPlan / Merkle proof)", {
        action,
        tokenId: strategy.agentTokenId.toString(),
        root: vaultStrategyRoot,
      });
      return {
        status: "skipped",
        reason: settlementSkipReason(vaultStrategyRoot),
      };
    }

    if (
      vaultStrategyRoot === ZERO_DATA_ROOT ||
      BigInt(vaultStrategyRoot) === 0n
    ) {
      return {
        status: "skipped",
        reason: "no strategy root set on vault",
      };
    }

    const vaultTc = this.getVaultContract("write");
    const tx = await vaultTc.contract.execute(
      strategy.agentTokenId,
      plan.target,
      BigInt(plan.value ?? 0),
      plan.data ?? "0x",
      plan.merkleProof,
    );
    const receipt = await tx.wait();
    log.info("settleOnChain executed", {
      action,
      tokenId: strategy.agentTokenId.toString(),
      txHash: tx.hash,
      status: receipt?.status,
    });
    return {
      status: receipt?.status === 1 ? "executed" : "failed",
      txHash: tx.hash as `0x${string}`,
      action,
      target: plan.target as `0x${string}`,
      success: receipt?.status === 1,
      result: "0x" as `0x${string}`,
    };
  }

  private async resolveVaultAbiVariant(): Promise<VaultAbiVariant> {
    const vaultAddr = this.addresses?.vault;
    if (!vaultAddr) return "current";
    this.vaultAbiVariant ??= await detectVaultAbiVariant(
      this.provider,
      vaultAddr,
    );
    return this.vaultAbiVariant;
  }

  private getVaultContract(
    mode: "read" | "write",
    readAbi: typeof VAULT_ABI | typeof VAULT_ABI_LEGACY = VAULT_ABI,
  ): TypedContract<StrategyVaultMethods> {
    const vaultAddr = this.addresses?.vault;
    if (!vaultAddr) {
      throw new Error("Vault address not configured");
    }
    if (mode === "read") {
      this.vaultReadTc ??= new TypedContract<StrategyVaultMethods>(
        vaultAddr,
        readAbi,
        this.provider,
      );
      return this.vaultReadTc;
    }
    this.vaultWriteTc ??= new TypedContract<StrategyVaultMethods>(
      vaultAddr,
      VAULT_ABI,
      this.signer,
    );
    return this.vaultWriteTc;
  }

  private chatParams(
    model: string,
    messages: Array<{ role: "system" | "user"; content: string }>,
  ) {
    return {
      model,
      messages,
      response_format: { type: "json_object" as const },
      ...({
        // 0G router extension: suppress reasoning tokens so JSON output stays deterministic for parsing
        chat_template_kwargs: { enable_thinking: false },
      } satisfies OgChatParams),
    };
  }

  private async runInference(
    strategy: StrategySpec,
    signal: MarketSignal,
    onchainPromise: Promise<TickResult["onchain"]>,
    onChunk?: StreamCallback,
  ): Promise<string> {
    const onchain = await onchainPromise;
    const userPrompt =
      `Vault balance: ${onchain.vaultBalance.toString()}\n` +
      `Recent events: ${JSON.stringify(onchain.recentEvents)}\n` +
      `Market signal: ${JSON.stringify(signal.payload)}\n` +
      `Provide a JSON recommendation: {"action":"act|hold","confidence":number,"reason":"…"}`;
    const messages = [
      { role: "system" as const, content: strategy.systemPrompt },
      { role: "user" as const, content: userPrompt },
    ];

    const client = await this.getClient(strategy.computeModel);
    if (onChunk) {
      const { data: stream } = await client.chat.completions
        .create({
          ...this.chatParams(strategy.computeModel, messages),
          stream: true,
        })
        .withResponse();
      let full = "";
      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content ?? "";
        if (delta) {
          full += delta;
          onChunk({
            type: "token",
            content: delta,
            index: full.length - delta.length,
          });
        }
      }
      return full;
    }

    const { data: completion } = await client.chat.completions
      .create(this.chatParams(strategy.computeModel, messages))
      .withResponse();
    return completion.choices?.[0]?.message?.content ?? "";
  }

  private async fetchOnchainState(
    strategy: StrategySpec,
  ): Promise<TickResult["onchain"]> {
    const vaultAddr = this.addresses?.vault;
    if (!vaultAddr) return { vaultBalance: 0n, recentEvents: [] };
    const vaultVariant = await this.resolveVaultAbiVariant();
    const readAbi = vaultAbiFor(vaultVariant);
    const vaultTc = this.getVaultContract("read", readAbi);
    const tokenId = strategy.agentTokenId;
    if (!vaultTc.raw.filters?.StrategySet || !vaultTc.raw.filters?.Deposited)
      return { vaultBalance: 0n, recentEvents: [] };
    const rawBalance = await vaultTc.contract.balanceOf(tokenId);
    const vaultBalance = rawBalance ?? 0n;

    const latest = await this.provider.getBlockNumber();
    const fromBlock = Math.max(
      0,
      latest - getRuntimeConfig().orchestratorEventScanBlocks,
    );
    const strategyFilter = vaultTc.raw.filters.StrategySet(tokenId);
    const depositFilter = vaultTc.raw.filters.Deposited(tokenId);
    const strategyEvent = vaultTc.iface.getEvent(EVENT_NAMES.StrategySet);
    const depositEvent = vaultTc.iface.getEvent(EVENT_NAMES.Deposited);
    if (!strategyEvent || !depositEvent)
      return { vaultBalance: 0n, recentEvents: [] };
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
        let name: (typeof EVENT_NAMES)[keyof typeof EVENT_NAMES];
        if (topic0 === strategyTopic) {
          name = EVENT_NAMES.StrategySet;
        } else if (topic0 === depositTopic) {
          name = EVENT_NAMES.Deposited;
        } else {
          name = EVENT_NAMES.Unknown;
        }
        return {
          blockNumber: BigInt(log.blockNumber),
          txHash: log.transactionHash as `0x${string}`,
          name,
        };
      });
    return { vaultBalance, recentEvents };
  }
}

export function settlementSkipReason(root: string): string {
  if (root === ZERO_DATA_ROOT) {
    return "no strategy set on vault";
  }
  return "settlement requires an off-chain Merkle proof producer (not available)";
}

export function parseRecommendation(
  rawModelOutput: string,
): TickResult["recommendation"] {
  try {
    const parsed = JSON.parse(rawModelOutput.trim());
    return RecommendationSchema.parse(parsed) as TickResult["recommendation"];
  } catch {
    log.warn("unparseable model output", {
      output: rawModelOutput.slice(0, 200),
    });
    return {
      action: "hold",
      reason: `Model output not parseable as JSON: ${rawModelOutput.slice(0, 80)}…`,
    };
  }
}
