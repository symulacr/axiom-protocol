const VAULT_DEPOSIT_IFACE = new ethers.Interface([
  "function deposit(uint256 tokenId) payable",
]);
const VAULT_WITHDRAW_IFACE = new ethers.Interface([
  "function withdraw(uint256 tokenId, uint256 amount)",
]);

import type { Router, Response } from "express";
import { ethers } from "ethers";
import { createRoute } from "./route-factory.js";
import {
  vaultDepositEncodeSchema,
  vaultWithdrawEncodeSchema,
} from "../route-schemas.js";
import type { z } from "zod";
import { HTTP } from "@axiom/config";
import { sendError } from "../utils/response.js";
import type { ServerConfig } from "../server.js";

type VaultActionRoute = {
  path: string;
  schema: z.ZodType<{ amount: string }>;
  description: string;
  encode: (tokenId: string, amountWei: bigint) => string;
  valueOf: (amountWei: bigint) => string;
};

const VAULT_ACTION_ROUTES: VaultActionRoute[] = [
  {
    path: "/v1/agents/:id/deposit",
    schema: vaultDepositEncodeSchema,
    description: "Encode vault deposit transaction (value = native OG amount)",
    encode: (id) =>
      VAULT_DEPOSIT_IFACE.encodeFunctionData("deposit", [BigInt(id)]),
    valueOf: (amountWei) => amountWei.toString(),
  },
  {
    path: "/v1/agents/:id/withdraw",
    schema: vaultWithdrawEncodeSchema,
    description: "Encode vault withdraw transaction (amount in native OG)",
    encode: (id, amountWei) =>
      VAULT_WITHDRAW_IFACE.encodeFunctionData("withdraw", [
        BigInt(id),
        amountWei,
      ]),
    valueOf: () => "0",
  },
];

function requireVaultAddress(
  cfg: ServerConfig,
  res: Response,
): string | undefined {
  const vaultAddr = cfg.addresses?.vault;
  if (!vaultAddr) {
    sendError(
      res,
      HTTP.INTERNAL,
      "vault address not configured",
      "VAULT_NOT_CONFIGURED",
    );
    return undefined;
  }
  return vaultAddr;
}

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
        const vaultAddr = requireVaultAddress(cfg, _res);
        if (!vaultAddr) return;
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
