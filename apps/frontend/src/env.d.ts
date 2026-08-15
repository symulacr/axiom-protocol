
interface ImportMetaEnv {
  readonly VITE_WALLETCONNECT_PROJECT_ID?: string;
  readonly VITE_BACKEND_URL?: string;
  readonly VITE_API_KEY?: string;
  readonly VITE_ORACLE_URL?: string;
  readonly VITE_CHAT_MODEL?: string;
  readonly VITE_CHAIN_ID?: string;
  readonly VITE_EVM_RPC?: string;
  readonly VITE_AGENT_NFT_ADDRESS?: string;
  readonly VITE_STRATEGY_VAULT_ADDRESS?: string;
  readonly VITE_TEE_VERIFIER_ADDRESS?: string;
  readonly VITE_PAYMENT_PROCESSOR_ADDRESS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
