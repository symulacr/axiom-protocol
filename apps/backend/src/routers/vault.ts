import type { Router } from "express";
import { ethers } from "ethers";
import { VAULT_ABI } from "@axiom/config/abis";
import { createRoute } from "./route-factory.js";
import {
  vaultDepositEncodeSchema,
  vaultWithdrawEncodeSchema,
} from "../route-schemas.js";
import type { z } from "zod";
import type { ServerConfig } from "../config-types.js";

type VaultActionRoute = {
  path: string;
  schema: z.ZodType<{ amount: string }>;
  description: string;
  encode: (tokenId: string, amountWei: bigint) => string;
  valueOf: (amountWei: bigint) => string;
};

// Shared ABI source: deposit/withdraw fragments come from @axiom/config/abis, not inline copies.
const VAULT_IFACE = new ethers.Interface(VAULT_ABI);

const VAULT_ACTION_ROUTES: VaultActionRoute[] = [
  {
    path: "/v1/agents/:id/deposit",
    schema: vaultDepositEncodeSchema,
    description: "Encode vault deposit transaction (value = native OG amount)",
    encode: (id) => VAULT_IFACE.encodeFunctionData("deposit", [BigInt(id)]),
    valueOf: (amountWei) => amountWei.toString(),
  },
  {
    path: "/v1/agents/:id/withdraw",
    schema: vaultWithdrawEncodeSchema,
    description: "Encode vault withdraw transaction (amount in native OG)",
    encode: (id, amountWei) =>
      VAULT_IFACE.encodeFunctionData("withdraw", [BigInt(id), amountWei]),
    valueOf: () => "0",
  },
];

export function registerVaultRoutes(
  paymentRouter: Router,
  config: ServerConfig,
): void {
  for (const route of VAULT_ACTION_ROUTES) {
    createRoute(
      paymentRouter,
      {
        path: route.path,
        schema: route.schema,
        requireId: true,
        requireAddress: "vault",
        consumer: "chat-runtime",
        description: route.description,
      },
      (parsed: { amount: string }, _req, _res, { id, config: cfg }) => {
        const vaultAddr = cfg.addresses?.vault as string;
        const amountWei = ethers.parseEther(parsed.amount);
        const data = route.encode(id, amountWei);
        return {
          tokenId: id,
          to: vaultAddr,
          data,
          value: route.valueOf(amountWei),
          amount: parsed.amount,
        };
      },
      config,
    );
  }
}
