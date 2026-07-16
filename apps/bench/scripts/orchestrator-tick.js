

























import http from "k6/http";
import { check, sleep } from "k6";

import { targetUrl, SUMMARY_TREND_STATS } from "./_target.js";

const TICK_URL = `${targetUrl()}/v1/orchestrator/tick`;

export const options = {
  scenarios: {
    constant_50rps: {
      executor: "constant-arrival-rate",
      
      
      
      rate: 50,
      timeUnit: "1s",
      duration: "60s",
      preAllocatedVUs: 200,
      maxVUs: 400,
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<2000"],
  },
  summaryTrendStats: SUMMARY_TREND_STATS,
};




function buildPayload(i) {
  return JSON.stringify({
    vault: "0xE3f3Af712B379e2DE19ffB3a7375A15D1FC31979",
    agentNft: "0x5a89B0a41b2d9E7b661d2a4b1b06e43211b59379",
    agentTokenId: "0",
    strategy: "hold",
    signalSource: "manual:bench",
    signalPayload: {
      symbol: "ETH-USD",
      priceE8: 300000000000 + (i % 1000),
      ts: Date.now(),
    },
  });
}

export default function () {
  const headers = { "Content-Type": "application/json" };
  if (__ENV.BENCH_TEE_SIGNER_PK) {
    
    
    
    
    headers["X-Bench-Signer-Pk-Present"] = "1";
  }

  const res = http.post(TICK_URL, buildPayload(__ITER), { headers });

  check(res, {
    "status is 2xx": (r) => r.status >= 200 && r.status < 300,
    "status is 200": (r) => r.status === 200,
    "has result": (r) => {
      try {
        return r.json("ok") === true;
      } catch {
        return false;
      }
    },
  });

  
  
  sleep(0.2);
}
