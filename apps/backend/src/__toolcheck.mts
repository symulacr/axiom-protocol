import { runTool } from "@axiom/chat-runtime";
import { CHAT_TOOL_CATALOG } from "@axiom/config/chat-tools";

const BASE = "http://127.0.0.1:3100";
const API_KEY = "testkey";
const ADDR = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const TOKEN = "1";

// mock http that records status
function makeHttp() {
  return {
    fetch(path: string, init?: any) {
      const url = path.startsWith("http") ? path : `${BASE}${path}`;
      return fetch(url, {
        method: init?.method,
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "x-api-key": API_KEY,
          ...(init?.headers ?? {}),
        },
        body:
          init?.body && typeof init.body === "object" && !(init.body instanceof Uint8Array)
            ? JSON.stringify(init.body)
            : init?.body,
        signal: init?.signal,
      });
    },
  };
}

const ctx: any = {
  mode: "sign",
  oracleUrl: "http://127.0.0.1:8787",
  http: makeHttp(),
  chain: undefined, // force orchestrate tools to hit backend tick
  wallet: { address: ADDR.toLowerCase() as `0x${string}` },
  session: {
    chainId: 16661,
    walletAddress: ADDR.toLowerCase() as `0x${string}`,
    lastTokenId: "1",
    addresses: {
      vault: "0x3695C527d2973e8699e836204389881f563A130A",
      agentNft: "0x2467e049c8284D658a64ee5B4b3C9f49E2B6f852",
    },
  },
};

const argsFor: Record<string, any> = {
  evm_wallet: { address: ADDR },
  evm_multichain: { address: ADDR },
  evm_tx: { hash: "0x" + "a".repeat(64) },
  evm_token: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7" },
  evm_gas: {},
  evm_whale: { token: "0xdAC17F958D2ee523a2206206994597C13D831ec7" },
  evm_contract: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7" },
  evm_allowance: { address: ADDR, token: "0xdAC17F958D2ee523a2206206994597C13D831ec7" },
  unbroker_simulate: { tokenId: TOKEN, to: ADDR },
  unbroker_route: { tokenId: TOKEN, to: ADDR },
  unbroker_analyze: { tokenId: TOKEN, to: ADDR },
  unbroker_execute: { tokenId: TOKEN, to: ADDR },
  stocks_quote: { symbol: "AAPL" },
  stocks_search: { query: "Tesla" },
  stocks_history: { symbol: "AAPL" },
  stocks_compare: { symbols: ["AAPL", "MSFT"] },
  stocks_crypto: { symbol: "BTC-USD" },
  osint_sec_edgar: { cik: "0000320193" },
  osint_usaspending: { filters: { keyword: "defense" } },
  osint_ofac_sdn: { name: "Gazprom" },
  osint_opencorporates: { query: "Acme Corp" },
  osint_entity_resolve: { entities: ["Apple Inc", "Apple Computer"] },
  osint_courtlistener: { query: "fraud" },
  oss_forensics_investigate: { owner: "ethers-io", repo: "ethers.js" },
  oss_forensics_commits: { owner: "ethers-io", repo: "ethers.js" },
  oss_forensics_ioc: { owner: "ethers-io", repo: "ethers.js" },
  oss_forensics_audit: { owner: "ethers-io", repo: "ethers.js" },
  list_my_agents: {},
  vault_balance: { tokenId: TOKEN },
  agent_metadata: { tokenId: TOKEN },
  event_history: { limit: 3 },
  execute_tick: { agentTokenId: TOKEN },
  simulate_tick: { agentTokenId: TOKEN },
  mint_agent: { dataDescription: "Test Agent" },
  deposit: { tokenId: TOKEN, amount: "0.1" },
  withdraw: { tokenId: TOKEN, amount: "0.1" },
  archive_lookup: { url: "example.com" },
  archive_account_tweets: { handle: "0xSero" },
  archive_confirm_deletion: { url: "example.com" },
  ask_user: { question: "Proceed?", options: ["Yes", "No"] },
};

const results: string[] = [];
let failCount = 0;
for (const tool of CHAT_TOOL_CATALOG) {
  const name = tool.name;
  try {
    const r = await runTool(name, argsFor[name] ?? {}, ctx);
    const ok = r.ok;
    if (!ok) failCount++;
    results.push(`${ok ? "OK  " : "FAIL"} ${name}  ${ok ? "" : String(r.content).slice(0, 160)}`);
  } catch (e: any) {
    failCount++;
    results.push(`THROW ${name}  ${String(e?.message ?? e).slice(0, 160)}`);
  }
}
console.log(results.join("\n"));
console.log(`\nTOTAL FAILS: ${failCount} / ${CHAT_TOOL_CATALOG.length}`);
