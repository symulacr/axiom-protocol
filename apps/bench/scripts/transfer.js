

















import http from "k6/http";
import { check, sleep } from "k6";

import { targetUrl, SUMMARY_TREND_STATS } from "./_target.js";

const TRANSFER_URL = `${targetUrl()}/v1/agents/0/transfer`;





const FAKE_RECEIVER_PUBKEY = "0x" + "ab".repeat(64);

export const options = {
  scenarios: {
    constant_10rps: {
      executor: "constant-arrival-rate",
      rate: 10,
      timeUnit: "1s",
      duration: "30s",
      preAllocatedVUs: 10,
      maxVUs: 20,
    },
  },
  thresholds: {
    
    
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<3000"],
  },
  summaryTrendStats: SUMMARY_TREND_STATS,
};

function buildPayload() {
  return JSON.stringify({
    receiverPubKey64: FAKE_RECEIVER_PUBKEY,
    accessProof: {
      
      
      dataHash: "0x" + "00".repeat(32),
      targetPubkey: FAKE_RECEIVER_PUBKEY,
      nonce: "1",
      proof: "0x",
    },
    ownershipProof: {
      oracleType: 0,
      dataHash: "0x" + "00".repeat(32),
      sealedKey: "0x",
      targetPubkey: FAKE_RECEIVER_PUBKEY,
      nonce: "1",
      proof: "0x",
    },
  });
}

export default function () {
  const res = http.post(TRANSFER_URL, buildPayload(), {
    headers: { "Content-Type": "application/json" },
  });

  
  
  
  check(res, {
    "status is < 500": (r) => r.status < 500,
  });

  sleep(0.1);
}
