import { getChatToolSpec } from "@axiom/config/chat-tools";
import { PAYMENT_PROCESSOR_ABI } from "@axiom/config/abis";
import { ADDRESS_REGEX } from "@axiom/config/types/hex";
import { fetchJson, resolveTokenId, toolFail } from "../transport.js";
import {
  encodeFunctionData,
  keccak256,
  parseAbi,
  parseUnits,
  toHex,
} from "viem";
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

/** Hard per-call spend caps the LLM cannot talk its way past: 1000 payment
 *  tokens for pay_for_agent (scaled by resolved decimals inside
 *  encodePayForAgent), 1000 native OG for vault deposit/withdraw (the vault
 *  routes enforce the same 1000 cap server-side via route-schemas.ts). */
const MAX_CHAT_NATIVE = 1000;

/** Sign+send, then wait for the receipt when the transport supports it (the
 *  transport owns the ~60s ceiling). Appends receipt confirmation to the tool
 *  result (receiptStatus + blockNumber) so formatToolResult can tell the LLM
 *  "confirmed"/"failed" instead of a bare hash; a transport without receipt
 *  support (or a wait timeout) falls back to txHash-only — never breaks. */
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
      return {
        ok: false as const,
        content: JSON.stringify({ error: `Unhandled encode tool: ${name}` }),
      };
  }
}

async function encodeMint(
  args: Record<string, unknown>,
  ctx: ToolRuntime,
): Promise<ToolResult> {
  const to = ctx.wallet?.address;
  if (!to) return toolFail("Wallet not connected");

  if (!args.dataDescription) return toolFail("dataDescription required");
  // dataHash must match the UI mint wizard: keccak256(toHex(trimmed description)); the oracle signs only hashes it has seen, so both mint paths MUST derive identically — until upload, this name hash stands in for the payload's 0G Merkle root.
  const description = String(args.dataDescription).trim();
  // dataHash omitted → name-derived placeholder keeps first-time mints working; real sealed data attaches later via update().
  const dataHash =
    typeof args.dataHash === "string" && args.dataHash.length > 0
      ? String(args.dataHash)
      : keccak256(toHex(description));

  const body = {
    dataDescription: description,
    dataHash,
    to,
  };

  const { ok: httpOk, data } = await fetchJson<{
    to: string;
    data: string;
    value: string;
  }>(ctx.http, "/v1/agents/mint/encode", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!httpOk || !data.to) return toolFail("mint encode fail");

  try {
    await registerDataHashWithOracle(ctx, dataHash, to);
  } catch (e) {
    return toolFail(
      e instanceof Error ? e.message : "oracle registration failed",
    );
  }

  if (ctx.mode === "encode-only" || !ctx.wallet?.signAndSend) {
    return encodeOnlyResult(data);
  }

  return sendWithReceiptResult(ctx, data, "mint sign failed");
}

/** Shared send leg for encode tools: sign+send calldata, then shape the
 *  ok/receipt JSON envelope every wallet-bound tool result uses (extra keys
 *  merge into both the receipt and txHash-only variants). */
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

  const { ok: httpOk, data } = await fetchJson<{
    to: string;
    data: string;
    value: string;
  }>(ctx.http, `/v1/agents/${tokenId}/${op}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ amount }),
  });

  if (!httpOk || !data.to) return toolFail(`${op} encode fail`);

  if (ctx.mode === "encode-only" || !ctx.wallet?.signAndSend) {
    return encodeOnlyResult(data, { amount });
  }

  return sendWithReceiptResult(ctx, data, `${op} sign failed`, { amount });
}

/** Payment token decimals resolved from the backend's /v1/payment/config
 *  (which reads them from the token contract) — cached per process. Galileo's
 *  axmUSDC is 18-decimal; hardcoding 6 mis-scales every payment 1e12. */
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
  return 6;
}

/** Parse a human-readable token amount ("1.5") to base units at the given
 *  decimals, rejecting empty/zero. */
function parseTokenAmount(raw: unknown, decimals: number): bigint | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const wei = parseUnits(raw.trim(), decimals);
  return wei > 0n ? wei : null;
}

function isValidAddress(raw: unknown): raw is `0x${string}` {
  return typeof raw === "string" && ADDRESS_REGEX.test(raw);
}

/** pay_for_agent: creator payment via payForAgent (computeAmount omitted) or
 *  creator + compute provider via payForAgentAndCompute (computeAmount > 0,
 *  provider required — the agent's provider must be passed explicitly since no
 *  per-agent provider registry exists on-chain). Encodes AxiomPaymentProcessor
 *  calldata directly (no backend route), signs with receipt-wait when available. */
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

async function registerDataHashWithOracle(
  ctx: ToolRuntime,
  dataHash: string,
  to: string,
): Promise<void> {
  const oracleUrl = ctx.oracleUrl;
  if (!oracleUrl) return;

  const url = `${oracleUrl.replace(/\/$/, "")}/v1/agents/mint`;
  // Fatal like the UI wizard: a chat-minted agent whose hash was never seen by
  // the oracle becomes un-transferable ("Unknown dataHash" at transfer time).
  const { ok } = await fetchJson<{ ok?: boolean }>(ctx.http, url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dataHash, to }),
  });
  if (!ok) {
    throw new Error(
      `oracle registration failed for dataHash=${dataHash} (mint aborted)`,
    );
  }
}
