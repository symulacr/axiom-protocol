import type { Wallet } from "ethers";

import type { StorageAdapter } from "@axiom/config/storage/0g";
import type { BackendEnv } from "./env-schema.js";

/** Shared server wiring contract — imported by routers, skills, services, MCP. */
export interface ServerConfig {
  bind: string;
  port: number;
  evmRpc: string;
  signer: Wallet;
  /** Optional 0G storage for chat-transcript persistence AND the in-process oracle; null/undefined disables both (oracle falls back to InMemoryStorage). */
  chatStorage?: StorageAdapter | null;
  addresses?: {
    agentNft: `0x${string}`;
    vault: `0x${string}`;
    verifier: `0x${string}`;
    paymentProcessor?: `0x${string}`;
  };
  env?: BackendEnv;
}

export type AddressKey = keyof NonNullable<ServerConfig["addresses"]>;
