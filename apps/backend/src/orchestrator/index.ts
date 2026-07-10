import type { Wallet } from "ethers";
import {
  AbiCoder,
  JsonRpcProvider,
  keccak256,
  type TransactionReceipt,
  type TransactionResponse,
} from "ethers";
import { TypedContract } from "@axiom/config/types/contract";
import type { TickResult } from "@axiom/config/types/orchestrator";
import type OpenAI from "openai";
import { ZeroGStorage, type Encryption } from "@axiom/config/storage/0g";
import {
  clientChatIdMap,
  createRouterClient,
  setClientChatId,
} from "../compute/router.js";
import { createStaticProvider, resolveChainId } from "../compute/broker.js";
import {
  discoverProviders,
  selectProvider,
} from "../compute/provider-discovery.js";
import { verifyTeeResponse } from "../compute/tee-verifier.js";
import { DefaultSignerOracleClient } from "../oracle/client.js";
import { pickOGNetwork } from "@axiom/config/networks";
import { VAULT_ABI, VAULT_ABI_LEGACY } from "@axiom/config/abis";
import {
  detectVaultAbiVariant,
  vaultAbiFor,
  readVaultStrategy,
  type VaultAbiVariant,
} from "../vault-compat.js";
import { ZERO_DATA_ROOT } from "../utils/constants.js";
import { createLogger } from "../utils/logger.js";
import { extractErrorMessage } from "../utils/response.js";

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

export interface StrategySpec {
  agentTokenId: bigint;
  agentNft: `0x${string}`;
  vault: `0x${string}`;
  computeModel: string;
  systemPrompt: string;
  modelDataRoot: `0x${string}`;
  modelEncryption: Encryption | undefined;
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
  private readonly storage: ZeroGStorage;
  private openai: OpenAI | null = null;
  private openaiModel: string | undefined;
  private readonly oracle: DefaultSignerOracleClient;
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
    this.storage = new ZeroGStorage({
      indexerRpc: network.storageRpc,
      evmRpc: config.evmRpc,
      signer: config.signer,
    });
    this.oracle = new DefaultSignerOracleClient({
      baseUrl: config.oracleBaseUrl,
      apiKey: config.apiKey,
    });
  }

  private async getClient(model?: string): Promise<OpenAI> {
    if (this.openai && this.openaiModel === model) {
      return this.openai;
    }
    this.openai = await createRouterClient(model, { signer: this.signer });
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
    const inferenceTask = skipInference
      ? Promise.resolve(
          JSON.stringify({
            action: "hold",
            reason: "E2E mock tick (compute inference skipped)",
          }),
        )
      : this.runInference(strategy, signal, onChunk);

    const [inferenceResult, onchainResult, storageResult] =
      await Promise.allSettled([
        inferenceTask,
        this.fetchOnchainState(strategy),
        strategy.modelDataRoot === ZERO_DATA_ROOT
          ? Promise.resolve({ rootHash: strategy.modelDataRoot, size: 0 })
          : this.fetchStoragePeek(strategy),
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

    if (process.env.AXIOM_COMPUTE_VERIFY_TEE === "true") {
      try {
        await this.verifyTeeAsync(rawModelOutput, strategy.computeModel);
      } catch (err) {
        log.warn("TEE verification failed (best-effort, tick continues)", {
          error: extractErrorMessage(err),
        });
      }
    }

    const recommendation = this.parseRecommendation(rawModelOutput);

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

  private parseRecommendation(
    rawModelOutput: string,
  ): TickResult["recommendation"] {
    try {
      const parsed = JSON.parse(
        rawModelOutput.trim(),
      ) as TickResult["recommendation"];
      const action =
        parsed.action === "buy" ||
        parsed.action === "sell" ||
        parsed.action === "hold"
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
      return {
        action,
        amount,
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

  private async settleOnChain(
    strategy: StrategySpec,
    action: string,
  ): Promise<NonNullable<TickResult["execution"]>> {
    const vaultAddr = this.addresses?.vault;
    if (!vaultAddr) {
      throw new Error("No vault address configured for on-chain settlement");
    }

    const target = vaultAddr;
    const value = 0n;
    const data = "0x";
    log.info("settleOnChain called", {
      action,
      tokenId: strategy.agentTokenId.toString(),
    });
    const innerHash = keccak256(data);
    const _actionHash = keccak256(
      AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "bytes32"],
        [target, value, innerHash],
      ),
    );
    const proof: `0x${string}`[] = [];

    const strat = await readVaultStrategy(this.provider, vaultAddr, strategy.agentTokenId);
    if (strat.root === '0x0000000000000000000000000000000000000000000000000000000000000000') {
      log.warn('settleOnChain skipped: no strategy set on vault', { tokenId: strategy.agentTokenId.toString() });
      return { status: 'skipped', reason: 'no strategy set on vault' };
    }
    const vaultTc = this.getVaultContract("write");
    const tx = await vaultTc.contract.execute(
      strategy.agentTokenId,
      target,
      value,
      data,
      proof,
    );
    const receipt: TransactionReceipt | null = await tx.wait();
    if (!receipt) {
      throw new Error(`vault.execute() tx ${tx.hash} returned no receipt`);
    }

    const executedEvent = vaultTc.iface.getEvent("Executed");
    let result: `0x${string}` | undefined;
    const success = receipt.status === 1;
    if (executedEvent) {
      const executedLog = receipt.logs.find(
        (log) => log.topics[0] === executedEvent.topicHash,
      );
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

  private async verifyTeeAsync(
    rawModelOutput: string,
    computeModel: string,
  ): Promise<void> {
    let providerAddress: string | undefined;
    try {
      const services = await discoverProviders(this.evmRpc, this.chainId);
      providerAddress = selectProvider(services, {
        model: computeModel,
      })?.provider;
    } catch (err) {
      const msg = extractErrorMessage(err);
      log.info("TEE verification: provider discovery failed", { error: msg });
      throw new Error(`TEE verification: provider discovery failed: ${msg}`, { cause: err });
    }

    if (!providerAddress) {
      throw new Error("TEE verification failed: no provider on chain");
    }

    const chatId = this.openai ? clientChatIdMap.get(this.openai) : undefined;
    const result = await verifyTeeResponse(
      this.chainId,
      this.signer,
      providerAddress,
      rawModelOutput,
      chatId,
    );

    log.info("TEE verification", {
      providerAddress,
      result,
      verified: result === true ? "yes" : result === false ? "no" : "skipped",
    });

    if (result === false) {
      throw new Error(
        `TEE response verification failed for provider ${providerAddress}`,
      );
    }
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
    onChunk?: StreamCallback,
  ): Promise<string> {
    const userPrompt =
      `Vault state: ${JSON.stringify(signal.payload)}\n` +
      `Provide a JSON recommendation: {"action":"buy|sell|hold","amount":number,"reason":"…"}`;
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
    if (this.vaultReadTc) this.vaultReadTc = null;
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
        const name =
          topic0 === strategyTopic
            ? "StrategySet"
            : topic0 === depositTopic
              ? "Deposited"
              : "Unknown";
        return {
          blockNumber: BigInt(log.blockNumber),
          txHash: log.transactionHash as `0x${string}`,
          name,
        };
      });
    return { vaultBalance, recentEvents };
  }

  private async fetchStoragePeek(
    strategy: StrategySpec,
  ): Promise<TickResult["storage"]> {
    if (strategy.modelDataRoot === ZERO_DATA_ROOT) {
      return { rootHash: strategy.modelDataRoot, size: 0 };
    }
    const opts =
      strategy.modelEncryption?.type === "aes256"
        ? { symmetricKey: strategy.modelEncryption.key, withProof: true }
        : { withProof: true };
    const blob = await this.storage.downloadWithOpts(
      strategy.modelDataRoot,
      opts,
    );
    return { rootHash: strategy.modelDataRoot, size: blob.size };
  }
}
