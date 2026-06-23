// Axiom Protocol — 0G chain definitions for wagmi v2.
// Uses viem's `defineChain` to register Galileo testnet (16602) and
// Aristotle mainnet (16661) as custom chains.

import { defineChain } from 'viem';

/**
 * 0G Galileo Testnet.
 *
 * chainId 16602 (0x40DA), native gas token "OG" (18 decimals). The default
 * HTTP RPC and the block explorer URL are taken verbatim from the 0G
 * testnet overview docs.
 */
export const galileo = defineChain({
  id: 16602,
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

/**
 * 0G Aristotle Mainnet.
 *
 * chainId 16661 (0x4115), native gas token "OG" (18 decimals). The default
 * HTTP RPC and the block explorer URL are taken verbatim from the 0G
 * mainnet overview docs.
 */
export const aristotle = defineChain({
  id: 16661,
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
