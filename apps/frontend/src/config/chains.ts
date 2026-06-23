// Axiom Protocol — 0G chain definitions for wagmi v2.

import { defineChain } from 'viem';
import { GALILEO_CHAIN_ID, ARISTOTLE_CHAIN_ID } from "@axiom/config/networks";

/** 0G Galileo Testnet (chainId 16602). */
export const galileo = defineChain({
  id: GALILEO_CHAIN_ID,
  name: '0G Galileo Testnet',
  nativeCurrency: { name: 'OG', symbol: 'OG', decimals: 18 },
  rpcUrls: {
    default: {
      http: ['https://evmrpc-testnet.0g.ai'],
    },
  },
  blockExplorers: {
    default: {
      name: '0G Explorer',
      url: 'https://chainscan-galileo.0g.ai',
    },
  },
  testnet: true,
});

/** 0G Aristotle Mainnet (chainId 16661). */
export const aristotle = defineChain({
  id: ARISTOTLE_CHAIN_ID,
  name: '0G Aristotle Mainnet',
  nativeCurrency: { name: 'OG', symbol: 'OG', decimals: 18 },
  rpcUrls: {
    default: {
      http: ['https://evmrpc.0g.ai'],
    },
  },
  blockExplorers: {
    default: {
      name: '0G Explorer',
      url: 'https://chainscan.0g.ai',
    },
  },
  testnet: false,
});
