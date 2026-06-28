import type { Wallet } from "ethers";
import { AbiCoder, FetchRequest, JsonRpcProvider, keccak256, type TransactionReceipt, type TransactionResponse } from "ethers";
import { TypedContract } from "@axiom/config/types/contract";
import type { TickResult } from "@axiom/config/types/orchestrator";
import type OpenAI from "openai";
import { ZeroGStorage, type Encryption } from "@axiom/config/storage/0g";
import { createRouterClient } from "../compute/router.js";
import { verifyTeeResponse } from "../compute/tee-verifier.js";
import { DefaultSignerOracleClient } from "../oracle/client.js";
import { pickOGNetwork, GALILEO_CHAIN_ID } from "@axiom/config/networks";
import { VAULT_ABI } from "@axiom/config/abis";
import { createLogger } from "../utils/logger.js";

const log = createLogger("orchestrator");
// Local contract types (avoid shared contract-types.ts drift).
type StrategyVaultMethods = {
  balanceOf(tokenId: bigint): Promise<bigint>;
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

export type { TickResult };

export type StreamCallback = (
  chunk: { type: 'token'; content: string; index: number }
  | { type: 'complete'; result: TickResult }
  | { type: 'error'; error: string },
) => void;

export interface OrchestratorConfig {
  evmRpc: string;
  signer: Wallet;
  oracleBaseUrl: string;
  addresses?: {
    vault?: `0x${string}`;
  };
  /** EIP-155 chain id (default 16602 = Galileo testnet). */
  chainId?: number;
  /** API key for oracle authenticated endpoints (sent as x-api-key header). */
  apiKey?: string;
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
    const chainId = config.chainId ?? GALILEO_CHAIN_ID;
    this.chainId = chainId;
    const fetchReq = new FetchRequest(config.evmRpc);
    fetchReq.timeout = 10_000;
    this.provider = new JsonRpcProvider(fetchReq, chainId, { staticNetwork: true });
    this.addresses = config.addresses;
    this.signer = config.signer;
    const network = pickOGNetwork(chainId);
    if (!network) throw new Error(`Unsupported chainId ${chainId}`);
    this.storage = new ZeroGStorage({ indexerRpc: network.storageRpc, evmRpc: config.evmRpc, signer: config.signer });
    // OpenAI client is lazily created — createRouterClient() only called on first
    // actual tick request, so missing compute credentials don't crash the server.
    this.oracle = new DefaultSignerOracleClient({ baseUrl: config.oracleBaseUrl, apiKey: config.apiKey });
  }

  private async getClient(model?: string): Promise<OpenAI> {
    if (!this.openai) {
      this.openai = await createRouterClient(model);
    }
    return this.openai;
  }

  /** Run a single strategy tick: fan out to compute, on-chain reads, and storage. */
  async runTick(strategy: StrategySpec, signal: MarketSignal, onChunk?: StreamCallback): Promise<TickResult> {
    const start = Date.now();

    const [rawModelOutput, onchain, storage] = await Promise.all([
      this.runInference(strategy, signal, onChunk),
      this.fetchOnchainState(strategy),
      strategy.modelDataRoot === ("0x" + "0".repeat(64))
        ? { rootHash: strategy.modelDataRoot, size: 0 }
        : this.fetchStoragePeek(strategy),
    ] as const);

    // Optional TEE response verification — fire-and-forget, never blocks the tick.
    if (process.env.AXIOM_COMPUTE_VERIFY_TEE === "true") {
      this.verifyTeeAsync(rawModelOutput).catch((err) =>
        log.warn("TEE verification threw unexpectedly", { error: err instanceof Error ? err.message : String(err) }),
      );
    }

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

    const result: TickResult = {
      recommendation,
      rawModelOutput,
      onchain,
      storage,
      execution,
      durationMs: Date.now() - start,
    };

    if (onChunk) {
      onChunk({ type: 'complete', result });
    }

    return result;
  }

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
      log.warn("unparseable model output", { output: rawModelOutput.slice(0, 200) });
      return { action: "hold", reason: `Model output not parseable as JSON: ${rawModelOutput.slice(0, 80)}…` };
    }
  }

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

  /**
   * Fire-and-forget TEE verification after a compute response.
   * Decodes the provider address from AXIOM_COMPUTE_DIRECT_KEY when available.
   */
  private async verifyTeeAsync(rawModelOutput: string): Promise<void> {
    const directKey = process.env.AXIOM_COMPUTE_DIRECT_KEY;
    let providerAddress: string | undefined;

    if (directKey) {
      // Decode provider address from the direct key token (app-sk-* format).
      if (directKey.startsWith("app-sk-")) {
        try {
          const b64 = directKey.slice("app-sk-".length);
          const decoded = Buffer.from(b64, "base64").toString("utf-8");
          const pipeIdx = decoded.lastIndexOf("|");
          if (pipeIdx !== -1) {
            const payload = JSON.parse(decoded.slice(0, pipeIdx));
            providerAddress = payload.provider ?? payload.providerAddress;
          }
        } catch {
          log.warn("TEE verification: cannot decode AXIOM_COMPUTE_DIRECT_KEY");
        }
      }
    }

    if (!providerAddress) {
      log.info("TEE verification skipped: no provider address available "
        + "(set AXIOM_COMPUTE_DIRECT_KEY with an app-sk-* token, or check chatId availability)");
      return;
    }

    const result = await verifyTeeResponse(
      this.chainId,
      this.signer,
      providerAddress,
      rawModelOutput,
    );

    log.info("TEE verification", {
      providerAddress,
      result,
      verified: result === true ? "yes" : result === false ? "no" : "skipped",
    });
  }

  private async runInference(strategy: StrategySpec, signal: MarketSignal, onChunk?: StreamCallback): Promise<string> {
    const userPrompt = `Vault state: ${JSON.stringify(signal.payload)}\n` +
      `Provide a JSON recommendation: {"action":"buy|sell|hold","amount":number,"reason":"…"}`;
    const messages = [
      { role: "system" as const, content: strategy.systemPrompt },
      { role: "user" as const, content: userPrompt },
    ];

    if (onChunk) {
      // Streaming path: emit tokens as they arrive from OpenAI.
      // response_format with stream: true would return 400 from OpenAI,
      // so we rely on the system prompt asking for JSON output —
      // parseRecommendation handles malformed JSON gracefully.
      const client = await this.getClient(strategy.computeModel);
      const stream = await client.chat.completions.create({
        model: strategy.computeModel,
        messages,
        stream: true,
      });
      let full = '';
      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content ?? '';
        if (delta) {
          full += delta;
          onChunk({ type: 'token', content: delta, index: full.length - delta.length });
        }
      }
      return full;
    }

    // Non-streaming path: preserves response_format for JSON reliability.
    const completion = await (await this.getClient(strategy.computeModel)).chat.completions.create({
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
        const name = topic0 === strategyTopic ? "StrategySet" : topic0 === depositTopic ? "Deposited" : "Unknown";
        return {
          blockNumber: BigInt(log.blockNumber),
          txHash: log.transactionHash as `0x${string}`,
          name,
        };
      });
    return { vaultBalance, recentEvents };
  }

  /**
   * Peek at the stored model data on 0G.
   * NOTE: modelDataRoot is always the zero-hash in current production usage
   * (see server.ts where StrategySpec.modelDataRoot is set to zero-hash).
   * The storage download path below is dead code until modelDataRoot is
   * populated with a real root hash (e.g. after on-chain model registration).
   */
  private async fetchStoragePeek(strategy: StrategySpec): Promise<TickResult["storage"]> {
    if (strategy.modelDataRoot === ("0x" + "0".repeat(64))) {
      return { rootHash: strategy.modelDataRoot, size: 0 };
    }
    // ECIES-encrypted blobs skipped in devnet (no receiver key). AES-256 uses symmetric key.
    const opts = strategy.modelEncryption?.type === "aes256"
      ? { symmetricKey: strategy.modelEncryption.key, withProof: true }
      : { withProof: true };
    const blob = await this.storage.downloadWithOpts(strategy.modelDataRoot, opts);
    return { rootHash: strategy.modelDataRoot, size: blob.size };
  }
}
