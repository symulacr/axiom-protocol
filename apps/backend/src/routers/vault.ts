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
import { HTTP } from "@axiom/config";
import { sendError } from "../utils/response.js";
import type { ServerConfig } from "../server.js";

/** Resolve the configured vault address or emit a 500 and return undefined. */
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
	createRoute(
		paymentRouter,
		{
			path: "/v1/agents/:id/deposit",
			schema: vaultDepositEncodeSchema,
			requireId: true,
			requireAddress: "vault",
			consumer: "chat-runtime",
			description:
				"Encode vault deposit transaction (value = native OG amount)",
		},
		async (parsed: { amount: string }, _req, _res, { id, config: cfg }) => {
			const vaultAddr = requireVaultAddress(cfg, _res);
			if (!vaultAddr) return;
			const data = VAULT_DEPOSIT_IFACE.encodeFunctionData("deposit", [
				BigInt(id),
			]);
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
			const vaultAddr = requireVaultAddress(cfg, _res);
			if (!vaultAddr) return;
			const amountWei = ethers.parseEther(parsed.amount);
			const data = VAULT_WITHDRAW_IFACE.encodeFunctionData("withdraw", [
				BigInt(id),
				amountWei,
			]);
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
