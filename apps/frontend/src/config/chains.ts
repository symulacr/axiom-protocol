// Axiom Protocol — 0G chain definitions for wagmi v2.
//
// We use viem's `defineChain` to register 0G's two networks as custom chains.
// `defineChain` is the canonical way to add a chain that is not in viem's
// built-in `viem/chains` list. Source: wagmi v2 chains guide
//   https://wagmi.sh/core/chains
// and the viem `defineChain` reference:
//   https://viem.sh/docs/chains/defining-chains
//
// Network facts (chainId, RPC, explorer, native currency) are taken from the
// 0G developer documentation:
//   Testnet overview: https://docs.0g.ai/developer-hub/testnet/testnet-overview
//   Mainnet overview:  https://docs.0g.ai/concepts/overview
//   AI context (chain address table):
//     https://docs.0g.ai/ai-context
//   Chainlist entry for 0G Galileo (chainId 16602):
//     https://chainlist.org/chain/16602
//
// 0G native gas token ("OG", 18 decimals) is the same on testnet and mainnet
// per the 0G docs. Testnet chainId 16602 in hex is 0x40DA; mainnet chainId
// 16661 is 0x4115. These are the values MetaMask expects when calling
// `wallet_addEthereumChain`.

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
