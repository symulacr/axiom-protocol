import { runTool } from "@axiom/chat-runtime";
const BASE = "http://127.0.0.1:3100", KEY = "testkey", ADDR = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const ctx: any = {
  mode: "sign", oracleUrl: "http://127.0.0.1:8787",
  http: {
    fetch(path: string, init?: any) {
      const u = path.startsWith("http") ? path : BASE + path;
      const b = init?.body && typeof init.body === "object" && !(init.body instanceof Uint8Array) ? JSON.stringify(init.body) : init?.body;
      console.error(">>> CALL", init?.method, u, "HDRS", JSON.stringify(init?.headers), "BODY", JSON.stringify(b).slice(0, 200));
      return fetch(u, { method: init?.method, headers: { "content-type": "application/json", accept: "application/json", "x-api-key": KEY, ...(init?.headers ?? {}) }, body: b, signal: init?.signal });
    },
  },
  chain: undefined,
  wallet: { address: ADDR.toLowerCase() as `0x${string}` },
  session: { chainId: 16661, walletAddress: ADDR.toLowerCase() as `0x${string}`, lastTokenId: "1", addresses: { vault: "0x3695C527d2973e8699e836204389881f563A130A", agentNft: "0x2467e049c8284D658a64ee5B4b3C9f49E2B6f852" } } },
};
const r = await runTool("mint_agent", { dataDescription: "Test Agent" }, ctx);
console.error("RESULT", JSON.stringify(r).slice(0, 300));
