import { getChatToolSpec } from "@axiom/config/chat-tools";
import { PAYMENT_PROCESSOR_ABI } from "@axiom/config/abis";
import { ADDRESS_REGEX } from "@axiom/config/types/hex";
import { fetchJson, postJson, resolveTokenId, toolFail } from "../transport.js";
import { encodeFunctionData, parseAbi, parseUnits } from "viem";
import type { ToolRuntime } from "../transport.js";
import type { ToolResult } from "../types.js";

function encodeOnlyResult(
  data: { to: string; data: string; value: string },
  extra?: Record<string, unknown>,
): ToolResult {
  return {
    ok: true as const,
    content: JSON.stringify({
      ok: true,
      encodeOnly: true,
      to: data.to,
      data: data.data,
      value: data.value,
      ...extra,
    }),
  };
}

/** Hard per-call spend caps the LLM cannot talk past: 1000 payment tokens, 1000 native OG (server-mirrored). */
const MAX_CHAT_NATIVE = 1000;

/** Sign+send and append receipt status/block when the transport can wait; otherwise txHash-only fallback. */
async function signAndSendWithReceipt(
  ctx: ToolRuntime,
  calldata: { to: `0x${string}`; data: `0x${string}`; value: bigint },
): Promise<{
  txHash: `0x${string}`;
  receipt?: { status: string; blockNumber: string };
}> {
  const txHash = await ctx.wallet!.signAndSend!(calldata);
  if (!ctx.wallet?.waitForReceipt) return { txHash };
  try {
    const receipt = await ctx.wallet.waitForReceipt(txHash);
    if (!receipt) return { txHash };
    return {
      txHash,
      receipt: {
        status: receipt.status,
        blockNumber: receipt.blockNumber.toString(),
      },
    };
  } catch {
    return { txHash };
  }
}

export async function runEncodeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolRuntime,
): Promise<ToolResult> {
  const spec = getChatToolSpec(name);
  if (!spec) return toolFail(`Unknown encode tool: ${name}`);

  if (spec.requiresWallet && !ctx.wallet?.address) {
    return toolFail("Wallet not connected");
  }

  const tokenId = resolveTokenId(args, ctx);

  if (spec.requiresTokenId && !tokenId) {
    return toolFail("tokenId required");
  }

  switch (name) {
    case "mint_agent":
      return encodeMint(args, ctx);
    case "deposit":
      return encodeVaultOp("deposit", tokenId, args, ctx);
    case "withdraw":
      return encodeVaultOp("withdraw", tokenId, args, ctx);
    case "pay_for_agent":
      return encodePayForAgent(tokenId, args, ctx);
    case "transfer":
      return toolFail(
        "transfer runs in the wallet-signing UI flow — the user must complete the transfer dialog (EIP-712 access proof + iTransferFrom).",
      );
    default:
      return toolFail(`Unhandled encode tool: ${name}`);
  }
}

async function encodeMint(
  args: Record<string, unknown>,
  ctx: ToolRuntime,
): Promise<ToolResult> {
  const to = ctx.wallet?.address;
  if (!to) return toolFail("Wallet not connected");

  if (!args.dataDescription) return toolFail("dataDescription required");
  const name = String(args.dataDescription).trim();
  if (!name) return toolFail("dataDescription required");

  // Hashless mint (P3 §(b) #1-#3): the server derives dataHash + description
  // from the name and marks it seen with the oracle in-process — the client
  // never derives the hash, so UI and chat mints cannot diverge.
  const { ok: httpOk, data } = await postJson<{
    to: string;
    data: string;
    value: string;
  }>(ctx.http, "/v1/agents/mint/encode", { name, to });

  if (!httpOk || !data.to) return toolFail("mint encode fail");

  if (ctx.mode === "encode-only" || !ctx.wallet?.signAndSend) {
    return encodeOnlyResult(data);
  }

  return sendWithReceiptResult(ctx, data, "mint sign failed");
}

/** Shared send leg: sign+send calldata, then shape the ok/receipt envelope wallet-bound tool results use. */
function sendWithReceiptResult(
  ctx: ToolRuntime,
  data: { to: string; data: string; value: string },
  failLabel: string,
  extra?: Record<string, unknown>,
): Promise<ToolResult> {
  const fields = extra ?? {};
  return signAndSendWithReceipt(ctx, {
    to: data.to as `0x${string}`,
    data: data.data as `0x${string}`,
    value: BigInt(data.value || "0"),
  })
    .then(({ txHash, receipt }) => ({
      ok: true as const,
      content: JSON.stringify(
        receipt
          ? {
              ok: true,
              txHash,
              ...fields,
              receiptStatus: receipt.status,
              blockNumber: receipt.blockNumber,
            }
          : { ok: true, txHash, ...fields },
      ),
    }))
    .catch((e: unknown): ToolResult =>
      toolFail(e instanceof Error ? e.message : failLabel),
    );
}

async function encodeVaultOp(
  op: "deposit" | "withdraw",
  tokenId: string,
  args: Record<string, unknown>,
  ctx: ToolRuntime,
): Promise<ToolResult> {
  if (!args.amount) return toolFail("amount required");
  const amount = String(args.amount);
  if (!(Number(amount) <= MAX_CHAT_NATIVE)) {
    return toolFail(
      `amount ${amount} exceeds the chat cap of ${MAX_CHAT_NATIVE} (native OG) — ask the user to use the UI for larger vault operations`,
    );
  }

  const { ok: httpOk, data } = await postJson<{
    to: string;
    data: string;
    value: string;
  }>(ctx.http, `/v1/agents/${tokenId}/${op}`, { amount });
  if (!httpOk || !data.to) return toolFail(`${op} encode fail`);

  if (ctx.mode === "encode-only" || !ctx.wallet?.signAndSend) {
    return encodeOnlyResult(data, { amount });
  }

  return sendWithReceiptResult(ctx, data, `${op} sign failed`, { amount });
}

/** Payment-token decimals from /v1/payment/config, cached per process; Galileo axmUSDC is 18-decimal, not 6. */
let tokenDecimalsCache: number | null = null;

async function resolveTokenDecimals(ctx: ToolRuntime): Promise<number> {
  if (tokenDecimalsCache !== null) return tokenDecimalsCache;
  try {
    const { ok, data } = await fetchJson<{
      paymentTokenDecimals?: number;
    }>(ctx.http, "/v1/payment/config", { method: "GET" });
    if (ok && typeof data.paymentTokenDecimals === "number") {
      tokenDecimalsCache = data.paymentTokenDecimals;
      return tokenDecimalsCache;
    }
  } catch {
    // fall through to the safe default below
  }
  return 18;
}

/** Parse a human-readable token amount ("1.5") to base units at the given decimals, rejecting empty/zero. */
function parseTokenAmount(raw: unknown, decimals: number): bigint | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const wei = parseUnits(raw.trim(), decimals);
  return wei > 0n ? wei : null;
}

function isValidAddress(raw: unknown): raw is `0x${string}` {
  return typeof raw === "string" && ADDRESS_REGEX.test(raw);
}

/** pay_for_agent: payForAgent (creator-only) or payForAgentAndCompute; provider explicit since none exists on-chain. */
async function encodePayForAgent(
  tokenId: string,
  args: Record<string, unknown>,
  ctx: ToolRuntime,
): Promise<ToolResult> {
  const processor = ctx.session.addresses?.paymentProcessor;
  if (!processor) return toolFail("Payment processor address not configured");

  const decimals = await resolveTokenDecimals(ctx);
  const cap = 1000n * 10n ** BigInt(decimals);

  const agentWei = parseTokenAmount(args.agentAmount, decimals);
  if (agentWei === null) {
    return toolFail("agentAmount required and must be greater than zero");
  }
  if (agentWei > cap) {
    return toolFail(
      "agentAmount exceeds the chat cap of 1000 tokens — ask the user to use the UI for larger payments",
    );
  }

  const computeAmount = args.computeAmount;
  const hasCompute =
    computeAmount !== undefined &&
    computeAmount !== null &&
    String(computeAmount).trim() !== "";
  const computeWei = hasCompute
    ? parseTokenAmount(computeAmount, decimals)
    : null;
  if (hasCompute && computeWei === null) {
    return toolFail("computeAmount must be greater than zero");
  }
  if (hasCompute && computeWei !== null && computeWei > cap) {
    return toolFail("computeAmount exceeds the chat cap of 1000 tokens");
  }

  let functionName: "payForAgent" | "payForAgentAndCompute";
  let encodeArgs:
    | readonly [bigint, bigint]
    | readonly [bigint, `0x${string}`, bigint, bigint];
  const extra: Record<string, unknown> = {
    agentAmount: String(args.agentAmount),
  };

  if (!hasCompute) {
    // Creator-only payment (matches the UI PaymentPanel): payForAgent(tokenId, amount)
    functionName = "payForAgent";
    encodeArgs = [BigInt(tokenId), agentWei];
  } else {
    const provider = args.provider;
    if (!isValidAddress(provider)) {
      return toolFail(
        `No registered compute provider for agent ${tokenId} — pass the provider address explicitly.`,
      );
    }
    functionName = "payForAgentAndCompute";
    encodeArgs = [BigInt(tokenId), provider, agentWei, computeWei as bigint];
    extra.computeAmount = String(computeAmount);
    extra.provider = provider;
  }

  const data = encodeFunctionData({
    abi: parseAbi(PAYMENT_PROCESSOR_ABI),
    functionName,
    args: encodeArgs,
  });

  if (ctx.mode === "encode-only" || !ctx.wallet?.signAndSend) {
    return encodeOnlyResult(
      { to: processor, data, value: "0" },
      { tokenId, ...extra },
    );
  }

  return sendWithReceiptResult(
    ctx,
    { to: processor, data, value: "0" },
    "pay sign failed",
    { tokenId, ...extra },
  );
}
