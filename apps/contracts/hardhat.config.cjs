// @ts-check
require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-verify");
const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const galileoRpc =
  process.env.OG_RPC_URL ??
  process.env.AXIOM_EVM_RPC ??
  "https://evmrpc-testnet.0g.ai";
const mainnetRpc =
  process.env.OG_MAINNET_RPC_URL ?? "https://evmrpc.0g.ai";

/** @type {import("hardhat/config").HardhatUserConfig} */
const config = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
      viaIR: true,
    },
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache_hardhat",
    artifacts: "./artifacts",
  },
  networks: {
    galileo: {
      url: galileoRpc,
      chainId: 16602,
    },
    mainnet: {
      url: mainnetRpc,
      chainId: 16661,
    },
  },
};

module.exports = config;