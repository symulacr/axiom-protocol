import { defineChain } from 'viem';
import { GALILEO_CHAIN_ID, ARISTOTLE_CHAIN_ID, resolveRpcUrl } from "@axiom/config/networks";

export const galileo = defineChain({
  id: GALILEO_CHAIN_ID,
  name: '0G Galileo Testnet',
  nativeCurrency: { name: 'OG', symbol: 'OG', decimals: 18 },
  rpcUrls: {
    default: {
      http: [resolveRpcUrl(GALILEO_CHAIN_ID)],
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

export const aristotle = defineChain({
  id: ARISTOTLE_CHAIN_ID,
  name: '0G Aristotle Mainnet',
  nativeCurrency: { name: 'OG', symbol: 'OG', decimals: 18 },
  rpcUrls: {
    default: {
      http: [resolveRpcUrl(ARISTOTLE_CHAIN_ID)],
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
