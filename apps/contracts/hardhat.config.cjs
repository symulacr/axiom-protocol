/** @type {import('hardhat/config').HardhatUserConfig} */
require('@nomicfoundation/hardhat-toolbox');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

// 0G Galileo Testnet
const OG_GALILEO = {
  url: process.env.OG_RPC_URL || 'https://evmrpc-testnet.0g.ai',
  chainId: 16602,
  accounts: process.env.DEPLOYER_PK ? [process.env.DEPLOYER_PK] : [],
};

// 0G Aristotle Mainnet
const OG_MAINNET = {
  url: process.env.OG_RPC_MAINNET || 'https://evmrpc.0g.ai',
  chainId: 16661,
  accounts: process.env.DEPLOYER_PK ? [process.env.DEPLOYER_PK] : [],
};

module.exports = {
  solidity: {
    version: '0.8.20',
    settings: {
      evmVersion: 'cancun',
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  networks: {
    galileo: OG_GALILEO,
    mainnet: OG_MAINNET,
    hardhat: {
      chainId: 16602,
    },
  },
  etherscan: {
    apiKey: {
      galileo: 'no-api-key-needed',
      mainnet: 'no-api-key-needed',
    },
    customChains: [
      {
        network: 'galileo',
        chainId: 16602,
        urls: {
          apiURL: 'https://chainscan-galileo.0g.ai/open/api',
          browserURL: 'https://chainscan-galileo.0g.ai',
        },
      },
      {
        network: 'mainnet',
        chainId: 16661,
        urls: {
          apiURL: 'https://chainscan.0g.ai/open/api',
          browserURL: 'https://chainscan.0g.ai',
        },
      },
    ],
  },
  typechain: {
    outDir: 'typechain-types',
    target: 'ethers-v6',
  },
  paths: {
    sources: './src',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
};
