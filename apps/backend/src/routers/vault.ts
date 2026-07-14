import type { Router } from "express";
import { ethers } from "ethers";
import { createRoute } from "./route-factory.js";
import {
  vaultDepositEncodeSchema,
  vaultWithdrawEncodeSchema,
} from "../route-schemas.js";
import { HTTP } from "@axiom/config";
import { sendError } from "../utils/response.js";
import type { ServerConfig } from "../server.js";

export function registerVaultRoutes(
  paymentRouter: Router,
  config: ServerConfig,
): void {
  createRoute(
    paymentRouter,
    {
      path: "/v1/agents/:id/deposit",
      schema: vaultDepositEncodeSchema,
      requireId: true,
      requireAddress: "vault",
      consumer: "chat-runtime",
      description: "Encode vault deposit transaction (value = native OG amount)",
    },
    async (parsed: { amount: string }, _req, _res, { id, config: cfg }) => {
      const vaultAddr = cfg.addresses?.vault;
      if (!vaultAddr) {
        sendError(_res, HTTP.INTERNAL, "vault address not configured", "VAULT_NOT_CONFIGURED");
        return;
      }
      const iface = new ethers.Interface([
        "function deposit(uint256 tokenId) payable",
      ]);
      const data = iface.encodeFunctionData("deposit", [BigInt(id)]);
      const value = ethers.parseEther(parsed.amount);
      return {
        tokenId: id,
        to: vaultAddr,
        data,
        value: value.toString(),
        amount: parsed.amount,
      };
    },
    config,
  );

  createRoute(
    paymentRouter,
    {
      path: "/v1/agents/:id/withdraw",
      schema: vaultWithdrawEncodeSchema,
      requireId: true,
      requireAddress: "vault",
      consumer: "chat-runtime",
      description: "Encode vault withdraw transaction (amount in native OG)",
    },
    async (parsed: { amount: string }, _req, _res, { id, config: cfg }) => {
      const vaultAddr = cfg.addresses?.vault;
      if (!vaultAddr) {
        sendError(_res, HTTP.INTERNAL, "vault address not configured", "VAULT_NOT_CONFIGURED");
        return;
      }
      const iface = new ethers.Interface([
        "function withdraw(uint256 tokenId, uint256 amount)",
      ]);
      const amountWei = ethers.parseEther(parsed.amount);
      const data = iface.encodeFunctionData("withdraw", [BigInt(id), amountWei]);
      return {
        tokenId: id,
        to: vaultAddr,
        data,
        value: "0",
        amount: parsed.amount,
      };
    },
    config,
  );
}
