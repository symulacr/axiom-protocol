import { ethers, type Wallet } from "ethers";
import { ZeroGStorage, pickOGNetwork } from "../storage/0g.js";
import { DefaultSignerOracleClient } from "../oracle/client.js";
import { StrategyRunner } from "../orchestrator/index.js";
import { PaymentProcessorClient } from "../payment/processor.js";
import { getEventStore, type EventStore } from "../events/store.js";
import { TypedContract } from "@axiom/config/types/contract";
import type { BackendEnv } from "../env-schema.js";
import type { AgentNFTMethods, StrategyVaultMethods } from "../contract-types.js";
import { createOrchestratorHandle, type OrchestratorHandle } from "../orchestrator/handle.js";

export interface Container {
  provider: ethers.JsonRpcProvider;
  signer: Wallet;
  storage: ZeroGStorage;
  oracle: DefaultSignerOracleClient;
  eventStore: EventStore;
  orchestratorHandle: OrchestratorHandle;
  getPayment: () => Promise<PaymentProcessorClient>;
}

export function createContainer(env: BackendEnv, addresses?: {
  agentNft?: `0x${string}`;
  vault?: `0x${string}`;
  verifier?: `0x${string}`;
  paymentProcessor?: `0x${string}`;
}): Container {
  const provider = new ethers.JsonRpcProvider(env.AXIOM_EVM_RPC);
  const signer = new ethers.Wallet(env.DEPLOYER_PK, provider);

  const ogNetwork = pickOGNetwork(env.AXIOM_CHAIN_ID);
  const storage = new ZeroGStorage({
    indexerRpc: env.AXIOM_STORAGE_RPC ?? ogNetwork?.storageRpc ?? "https://indexer-storage-testnet-turbo.0g.ai",
    evmRpc: env.AXIOM_EVM_RPC,
    signer,
  });

  const oracle = new DefaultSignerOracleClient({ baseUrl: env.AXIOM_ORACLE_URL, timeoutMs: 10000 });
  const eventStore = getEventStore();

  let orchestratorHandle: OrchestratorHandle = createOrchestratorHandle();
  try {
    const runner = new StrategyRunner({
      evmRpc: env.AXIOM_EVM_RPC,
      signer,
      oracleBaseUrl: env.AXIOM_ORACLE_URL,
      chainId: env.AXIOM_CHAIN_ID,
      addresses,
    });
    orchestratorHandle = { state: "ready", runner };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[container] StrategyRunner init failed (compute degraded): ${message}`);
    orchestratorHandle = { state: "errored", error: err instanceof Error ? err : new Error(String(err)) };
  }

  // PaymentProcessor client: lazily resolved
  let payment: PaymentProcessorClient | null = null;
  async function getPayment(): Promise<PaymentProcessorClient> {
    if (payment) return payment;
    const addr = addresses?.paymentProcessor;
    if (!addr) throw new Error("PaymentProcessor address not configured");
    const stub = new TypedContract<{ paymentToken: () => Promise<string> }>(
      addr, ["function paymentToken() view returns (address)"], provider
    );
    const tokenAddr = await stub.contract.paymentToken();
    payment = new PaymentProcessorClient({
      address: addr, signer, provider, paymentTokenAddress: tokenAddr,
    });
    return payment;
  }

  return {
    provider, signer, storage, oracle, eventStore,
    orchestratorHandle, getPayment,
  };
}
