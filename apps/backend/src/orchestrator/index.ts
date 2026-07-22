import type { Wallet } from "ethers";
import {
  Contract,
  JsonRpcProvider,
  type Provider,
  type TransactionResponse,
} from "ethers";
import { TypedContract } from "@axiom/config/types/contract";
import type { TickResult } from "@axiom/config/types/orchestrator";
import type OpenAI from "openai";
import {
  createRouterClient,
  setClientChatId,
  createStaticProvider,
  resolveChainId,
} from "../compute/index.js";
import { pickOGNetwork } from "@axiom/config/networks";
import { EVENT_NAMES } from "@axiom/config";
import { VAULT_ABI, VAULT_ABI_LEGACY } from "@axiom/config/abis";
import { createLogger } from "../utils/logger.js";
import { extractErrorMessage } from "../utils/response.js";

export type VaultAbiVariant = "legacy" | "current";

const variantCache = new Map<string, VaultAbiVariant>();

const STRATEGY_OF_CURRENT = [
  "function strategyOf(uint256) view returns (bytes32, uint256, uint256, uint64, uint64)",
] as const;

const STRATEGY_OF_LEGACY = [
  "function strategyOf(uint256) view returns (bytes32, uint256, uint256, uint64)",
] as const;

export async function detectVaultAbiVariant(
  provider: Provider,
  vaultAddress: string,
): Promise<VaultAbiVariant> {
  const key = vaultAddress.toLowerCase();
  const cached = variantCache.get(key);
  if (cached) return cached;

  const currentProbe = new Contract(vaultAddress, STRATEGY_OF_CURRENT, provider);
  const currentStrategyOf = currentProbe.getFunction("strategyOf");
  try {
    await currentStrategyOf.staticCall(0n);
    variantCache.set(key, "current");
    return "current";
  } catch {
    const legacyProbe = new Contract(vaultAddress, STRATEGY_OF_LEGACY, provider);
    await legacyProbe.getFunction("strategyOf").staticCall(0n);
    variantCache.set(key, "legacy");
    return "legacy";
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
  const [root, dailyLimit, , , validUntilDay] = await vault
    .getFunction("strategyOf")(tokenId);
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

export interface VaultExecutionPlan {
  target: `0x${string}`;
  value?: string | number | bigint;
  data?: `0x${string}`;
  /** Merkle proof of keccak256(abi.encode(target, value, keccak256(data))) */
  merkleProof: `0x${string}`[];
}

export interface StrategySpec {
  agentTokenId: bigint;
  agentNft: `0x${string}`;
  vault: `0x${string}`;
  computeModel: string;
  systemPrompt: string;
  modelDataRoot: `0x${string}`;
  /** When set and action is act, vault.execute is invoked with this plan */
  executionPlan?: VaultExecutionPlan;
}

export type { TickResult };

export type StreamCallback = (
  chunk:
    | { type: "token"; content: string; index: number }
    | { type: "complete"; result: TickResult }
    | { type: "error"; error: string },
) => void;

export interface OrchestratorConfig {
  evmRpc: string;
  signer: Wallet;
  oracleBaseUrl: string;
  addresses?: {
    vault?: `0x${string}`;
  };
  chainId?: number;
  apiKey?: string;
}

export class StrategyRunner {
  private openai: OpenAI | null = null;
  private openaiModel: string | undefined;
  private readonly chainId: number;
  private readonly provider: JsonRpcProvider;
  private readonly evmRpc: string;
  private readonly addresses: OrchestratorConfig["addresses"];

  private readonly signer: Wallet;
  private vaultReadTc: TypedContract<StrategyVaultMethods> | null = null;
  private vaultWriteTc: TypedContract<StrategyVaultMethods> | null = null;
  private vaultAbiVariant: VaultAbiVariant | null = null;

  constructor(config: OrchestratorConfig) {
    const chainId = resolveChainId(config.chainId);
    this.chainId = chainId;
    this.provider = createStaticProvider(config.evmRpc, chainId, {
      timeoutMs: 10_000,
    });
    this.evmRpc = config.evmRpc;
    this.addresses = config.addresses;
    this.signer = config.signer;
    const network = pickOGNetwork(chainId);
    if (!network) throw new Error(`Unsupported chainId ${chainId}`);
    // network held for type narrowing (used implicitly by guard)
  }

  private async getClient(model?: string): Promise<OpenAI> {
    if (this.openai && this.openaiModel === model) {
      return this.openai;
    }
    this.openai = await createRouterClient(model, {
      timeout: undefined,
    });
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

    const [inferenceResult, onchainResult, storageResult] =
      await Promise.allSettled([
        inferenceTask,
        onchainTask,
        Promise.resolve({ rootHash: strategy.modelDataRoot, size: 0 }),
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
            (err) => {
              return {
                txHash: "0x" as `0x${string}`,
                action: recommendation.action,
                target: (this.addresses?.vault ?? "0x") as `0x${string}`,
                success: false,
                result:
                  `0x${extractErrorMessage(err).slice(0, 128)}` as `0x${string}`,
              } satisfies NonNullable<TickResult["execution"]>;
            },
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

  /**
   * On-chain settlement: executes vault action when strategy.executionPlan is
   * provided (target, value, data, merkleProof). Without a plan, returns an
   * explicit skip — inference alone never spends vault funds.
   */
  private async settleOnChain(
    strategy: StrategySpec,
    action: string,
  ): Promise<NonNullable<TickResult["execution"]>> {
    const vaultAddr = this.addresses?.vault;
    if (!vaultAddr) {
      throw new Error("No vault address configured for on-chain settlement");
    }

    const strat = await readVaultStrategy(
      this.provider,
      vaultAddr,
      strategy.agentTokenId,
    );

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
        root: strat.root,
      });
      return {
        status: "skipped",
        reason: settlementSkipReason(strat.root),
      };
    }

    if (strat.root === "0x" + "0".repeat(64) || BigInt(strat.root) === 0n) {
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
    if (this.vaultAbiVariant) return this.vaultAbiVariant;
    this.vaultAbiVariant = await detectVaultAbiVariant(this.provider, vaultAddr);
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


  private captureChatIdFromResponse(
    client: OpenAI,
    response: { headers?: unknown } | undefined,
  ): void {
    const headers = response?.headers;
    if (!headers) return;
    let chatId: string | undefined;
    if (typeof (headers as Headers).get === "function") {
      const h = headers as Headers;
      chatId = h.get("x-chat-id") ?? h.get("chat-id") ?? undefined;
    } else if (typeof headers === "object") {
      const rec = headers as Record<string, string | string[] | undefined>;
      const pick = (key: string) => {
        const val = rec[key] ?? rec[key.toLowerCase()];
        return typeof val === "string"
          ? val
          : Array.isArray(val)
            ? val[0]
            : undefined;
      };
      chatId = pick("x-chat-id") ?? pick("chat-id");
    }
    if (chatId) {
      setClientChatId(client, chatId);
    }
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

    if (onChunk) {
      const client = await this.getClient(strategy.computeModel);
      const { data: stream, response } = await client.chat.completions
        .create({
          model: strategy.computeModel,
          messages,
          stream: true,
        })
        .withResponse();
      this.captureChatIdFromResponse(client, response);
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

    const client = await this.getClient(strategy.computeModel);
    const { data: completion, response } = await client.chat.completions
      .create({
        model: strategy.computeModel,
        messages,
        response_format: { type: "json_object" },
      })
      .withResponse();
    this.captureChatIdFromResponse(client, response);
    return completion.choices?.[0]?.message?.content ?? "";
  }

  private async fetchOnchainState(
    strategy: StrategySpec,
  ): Promise<TickResult["onchain"]> {
    const vaultAddr = this.addresses?.vault;
    if (!vaultAddr) {
      return { vaultBalance: 0n, recentEvents: [] };
    }
    const vaultVariant = await this.resolveVaultAbiVariant();
    const readAbi = vaultAbiFor(vaultVariant);
    const vaultTc = this.getVaultContract("read", readAbi);
    const tokenId = strategy.agentTokenId;
    if (!vaultTc.raw.filters?.StrategySet || !vaultTc.raw.filters?.Deposited) {
      return { vaultBalance: 0n, recentEvents: [] };
    }
    const rawBalance = await vaultTc.contract.balanceOf(tokenId);
    const vaultBalance = rawBalance ?? 0n;

    const latest = await this.provider.getBlockNumber();
    const fromBlock = Math.max(0, latest - 2000);
    const strategyFilter = vaultTc.raw.filters.StrategySet(tokenId);
    const depositFilter = vaultTc.raw.filters.Deposited(tokenId);
    const strategyEvent = vaultTc.iface.getEvent(EVENT_NAMES.StrategySet);
    const depositEvent = vaultTc.iface.getEvent(EVENT_NAMES.Deposited);
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
        const name =
          topic0 === strategyTopic
            ? EVENT_NAMES.StrategySet
            : topic0 === depositTopic
              ? EVENT_NAMES.Deposited
              : EVENT_NAMES.Unknown;
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
  if (root === "0x0000000000000000000000000000000000000000000000000000000000000000") {
    return "no strategy set on vault";
  }
  return "settlement requires an off-chain Merkle proof producer (not available)";
}

export function parseRecommendation(
  rawModelOutput: string,
): TickResult["recommendation"] {
  try {
    const parsed = JSON.parse(
      rawModelOutput.trim(),
    ) as TickResult["recommendation"];
    const action =
      parsed.action === "act" || parsed.action === "hold"
        ? parsed.action
        : "hold";
    const rawAmount =
      typeof parsed.amount === "number" ? parsed.amount : undefined;
    const amount =
      rawAmount !== undefined &&
      Number.isFinite(rawAmount) &&
      rawAmount >= 0 &&
      rawAmount <= 1e18
        ? rawAmount
        : undefined;
    const rawConfidence = typeof parsed.confidence === "number" ? parsed.confidence : undefined;
    const confidence =
      rawConfidence !== undefined && Number.isFinite(rawConfidence)
        ? Math.min(1, Math.max(0, rawConfidence))
        : undefined;
    return {
      action,
      amount,
      confidence,
      reason:
        typeof parsed.reason === "string"
          ? parsed.reason
          : "no reason provided",
    };
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
