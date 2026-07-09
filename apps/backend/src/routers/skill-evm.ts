import { Router } from "express";
import { ethers } from "ethers";
import { z } from "zod";
import type { ServerConfig } from "../server.js";
import { createRoute } from "./route-factory.js";
import { getSharedProvider, TTLCache, ser, getLogsChunked, createLogger } from "../skills/shared.js";
const logger = createLogger("skills:evm");

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
];

const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");

const DEX_SPENDERS: Record<string, string> = {
  uniswapV3: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
  sushiswap: "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F",
  oneInch: "0x1111111254fb6c44bAC0beD2854e76F90643097d",
};

const CHAINS: { name: string; rpc: string }[] = [
  { name: "ethereum", rpc: "https://eth.llamarpc.com" },
  { name: "polygon", rpc: "https://polygon-rpc.com" },
  { name: "arbitrum", rpc: "https://arb1.arbitrum.io/rpc" },
  { name: "optimism", rpc: "https://mainnet.optimism.io" },
  { name: "base", rpc: "https://mainnet.base.org" },
  { name: "bsc", rpc: "https://bsc-dataseed.binance.org" },
  { name: "avalanche", rpc: "https://api.avax.network/ext/bc/C/rpc" },
  { name: "gnosis", rpc: "https://rpc.gnosischain.com" },
];

const priceCache = new TTLCache<number>(60_000);

async function fetchPrice(id: string): Promise<number> {
  const cached = priceCache.get(id);
  if (cached !== undefined) return cached;
  const r = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
  );
  const j = (await r.json()) as Record<string, { usd?: number }>;
  const price = j[id]?.usd ?? 0;
  priceCache.set(id, price);
  return price;
}

export function createSkillEvmRouter(config: ServerConfig): Router {
  const router = Router();
  const provider = getSharedProvider();

  const address = z.object({ address: z.string() });
  const token = z.object({ address: z.string(), token: z.string() });

  // 1. wallet — native + ERC-20 balance multicall
  createRoute(
    router,
    { method: "post", path: "/v1/skills/evm/wallet", consumer: "chat-runtime", schema: address },
    async (parsed) => {
      const [native, tokenContract] = await Promise.all([
        provider.getBalance(parsed.address),
        parsed.address
          ? new ethers.Contract(parsed.address, ERC20_ABI, provider)
          : null,
      ]);
      const erc20Balance = tokenContract
        ? await tokenContract.balanceOf!(parsed.address).catch((err) => {
            logger.warn("evm wallet balanceOf failed", { err });
            return 0n;
          })
        : 0n;
      return ser({ native, erc20Balance });
    },
    config,
  );

  // 2. multichain — balances across 8 chains
  createRoute(
    router,
    { method: "post", path: "/v1/skills/evm/multichain", consumer: "chat-runtime", schema: address },
    async (parsed) => {
      const results = await Promise.allSettled(
        CHAINS.map(async ({ name, rpc }) => {
          const p = new ethers.JsonRpcProvider(rpc);
          const bal = await p.getBalance(parsed.address);
          return { chain: name, balance: bal.toString() };
        }),
      );
      return ser(
        results.map((r, i) =>
          r.status === "fulfilled"
            ? r.value
            : { chain: CHAINS[i]?.name, error: String(r.reason) },
        ),
      );
    },
    config,
  );

  // 3. tx — getTransaction + receipt
  createRoute(
    router,
    {
      method: "post",
      path: "/v1/skills/evm/tx", consumer: "chat-runtime",
      schema: z.object({ hash: z.string() }),
    },
    async (parsed) => {
      const [tx, receipt] = await Promise.all([
        provider.getTransaction(parsed.hash),
        provider.getTransactionReceipt(parsed.hash),
      ]);
      return ser({ tx, receipt });
    },
    config,
  );

  // 4. token — ERC-20 metadata + CoinGecko price
  createRoute(
    router,
    {
      method: "post",
      path: "/v1/skills/evm/token", consumer: "chat-runtime",
      schema: z.object({ address: z.string(), coingeckoId: z.string().optional() }),
    },
    async (parsed) => {
      const c = new ethers.Contract(parsed.address, ERC20_ABI, provider);
      const [name, symbol, decimals] = await Promise.all([
        c.name!(),
        c.symbol!(),
        c.decimals!(),
      ]);
      const price = parsed.coingeckoId
        ? await fetchPrice(parsed.coingeckoId)
        : null;
      return ser({ name, symbol, decimals, price });
    },
    config,
  );

  // 5. gas — fee data + USD estimate
  createRoute(
    router,
    {
      method: "post",
      path: "/v1/skills/evm/gas", consumer: "chat-runtime",
      schema: z.object({ gasLimit: z.number().optional() }),
    },
    async (parsed) => {
      const feeData = await provider.getFeeData();
      const gasLimit = BigInt(parsed.gasLimit ?? 21_000);
      const gasPrice = feeData.gasPrice ?? 0n;
      const estCostWei = gasPrice * gasLimit;
      const ethPrice = await fetchPrice("ethereum");
      const estCostUsd =
        Number(ethers.formatEther(estCostWei)) * ethPrice;
      return ser({
        gasPrice: gasPrice.toString(),
        maxFeePerGas: feeData.maxFeePerGas?.toString(),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas?.toString(),
        estCostWei: estCostWei.toString(),
        estCostUsd,
      });
    },
    config,
  );

  // 6. whale — Transfer log scan filtered by minValue
  createRoute(
    router,
    {
      method: "post",
      path: "/v1/skills/evm/whale", consumer: "chat-runtime",
      schema: z.object({
        token: z.string(),
        minValue: z.string(),
        fromBlock: z.number(),
        toBlock: z.number(),
      }),
    },
    async (parsed) => {
      const minValue = BigInt(parsed.minValue);
      const transfers: unknown[] = [];
      for await (const logs of getLogsChunked({
        address: parsed.token,
        topics: [TRANSFER_TOPIC],
        fromBlock: parsed.fromBlock,
        toBlock: parsed.toBlock,
      })) {
        for (const log of logs) {
          const value = BigInt(log.data);
          if (value >= minValue) {
            transfers.push({
              from: ethers.getAddress("0x" + (log.topics[1]?.slice(26) ?? "")),
              to: ethers.getAddress("0x" + (log.topics[2]?.slice(26) ?? "")),
              value: value.toString(),
              txHash: log.transactionHash,
              block: parseInt(log.blockNumber, 16),
            });
          }
        }
      }
      return ser({ transfers, count: transfers.length });
    },
    config,
  );

  // 7. contract — getCode + EIP-1967 proxy slot check
  createRoute(
    router,
    { method: "post", path: "/v1/skills/evm/contract", consumer: "chat-runtime", schema: address },
    async (parsed) => {
      const code = await provider.getCode(parsed.address);
      const isContract = code !== "0x";
      let impl: string | null = null;
      if (isContract) {
        const slot = await provider.getStorage(
          parsed.address,
          "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
        );
        const slotBytes = ethers.zeroPadValue(slot, 32);
        if (slotBytes !== ethers.ZeroHash) {
          impl = ethers.getAddress("0x" + slotBytes.slice(26));
        }
      }
      return ser({ isContract, codeLength: (code.length - 2) / 2, proxyImpl: impl });
    },
    config,
  );

  // 8. allowance — ERC-20 allowance for known DEX spenders
  createRoute(
    router,
    { method: "post", path: "/v1/skills/evm/allowance", consumer: "chat-runtime", schema: token },
    async (parsed) => {
      const c = new ethers.Contract(parsed.token, ERC20_ABI, provider);
      const entries = await Promise.all(
        Object.entries(DEX_SPENDERS).map(async ([dex, spender]) => {
          const allowance: bigint = await c.allowance!(parsed.address, spender);
          return { dex, spender, allowance: allowance.toString() };
        }),
      );
      return ser({ allowances: entries });
    },
    config,
  );

  return router;
}
