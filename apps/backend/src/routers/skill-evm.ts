import { Router } from "express";
import { ethers } from "ethers";
import { z } from "zod";
import type { ServerConfig } from "../server.js";
import {
  createSkillRouter,
  cachedJsonGet,
  getSharedProvider,
  ser,
  getLogsChunked,
  createLogger,
} from "../skills/shared.js";
const log = createLogger("skills:evm");

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
  { name: "ethereum", rpc: "https://ethereum-rpc.publicnode.com" },
  { name: "polygon", rpc: "https://polygon-bor-rpc.publicnode.com" },
  { name: "arbitrum", rpc: "https://arb1.arbitrum.io/rpc" },
  { name: "optimism", rpc: "https://mainnet.optimism.io" },
  { name: "base", rpc: "https://mainnet.base.org" },
  { name: "bsc", rpc: "https://bsc-dataseed.binance.org" },
  { name: "avalanche", rpc: "https://api.avax.network/ext/bc/C/rpc" },
  { name: "gnosis", rpc: "https://rpc.gnosischain.com" },
];

const priceGet = cachedJsonGet("https://api.coingecko.com", { ttlMs: 60_000 });

async function fetchPrice(id: string): Promise<number> {
  const j = await priceGet(id, `/api/v3/simple/price?ids=${id}&vs_currencies=usd`) as Record<string, { usd?: number }>;
  return j[id]?.usd ?? 0;
}

export function createSkillEvmRouter(config: ServerConfig): Router {
  const { router, route } = createSkillRouter(config);
  const provider = getSharedProvider();

  const address = z.object({ address: z.string() });
  const token = z.object({ address: z.string(), token: z.string() });

  route(
    { path: "/v1/skills/evm/wallet", schema: address, description: "Query EVM wallet native and ERC-20 balances" },
    async (parsed) => {
      const [native, tokenContract] = await Promise.all([
        provider.getBalance(parsed.address),
        parsed.address
          ? new ethers.Contract(parsed.address, ERC20_ABI, provider)
          : null,
      ]);
      const erc20Balance = tokenContract
        ? await tokenContract.balanceOf!(parsed.address).catch((err) => {
            log.warn("evm wallet balanceOf failed", { err });
            return 0n;
          })
        : 0n;
      return ser({ native, erc20Balance });
    },
  );

  route(
    { path: "/v1/skills/evm/multichain", schema: address, description: "Query wallet balances across multiple EVM chains" },
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
  );

  route(
    { path: "/v1/skills/evm/tx", schema: z.object({ hash: z.string() }), description: "Fetch an EVM transaction and its receipt" },
    async (parsed) => {
      const [tx, receipt] = await Promise.all([
        provider.getTransaction(parsed.hash),
        provider.getTransactionReceipt(parsed.hash),
      ]);
      return ser({ tx, receipt });
    },
  );

  route(
    {
      path: "/v1/skills/evm/token",
      schema: z.object({ address: z.string(), coingeckoId: z.string().optional() }),
      description: "ERC-20 token metadata and price",
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
  );

  route(
    {
      path: "/v1/skills/evm/gas",
      schema: z.object({ gasLimit: z.number().optional() }),
      description: "Estimate EVM gas cost for a transaction",
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
  );

  route(
    {
      path: "/v1/skills/evm/whale",
      schema: z.object({
        token: z.string(),
        minValue: z.string(),
        fromBlock: z.number(),
        toBlock: z.number(),
      }),
      description: "Scan for large (whale) ERC-20 transfers",
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
  );

  route(
    { path: "/v1/skills/evm/contract", schema: address, description: "Inspect contract code and proxy implementation" },
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
  );

  route(
    { path: "/v1/skills/evm/allowance", schema: token, description: "Check ERC-20 allowances for known DEX spenders" },
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
  );

  return router;
}
