











import http from "k6/http";
import { check, sleep } from "k6";

import { targetUrl, SUMMARY_TREND_STATS } from "./_target.js";

export const options = {
  scenarios: {
    constant_100rps: {
      executor: "constant-arrival-rate",
      rate: 100,
      timeUnit: "1s",
      duration: "30s",
      preAllocatedVUs: 100,
      maxVUs: 200,
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<200"],
  },
  summaryTrendStats: SUMMARY_TREND_STATS,
};

const HEALTH_URL = `${targetUrl()}/health`;

export default function () {
  const res = http.get(HEALTH_URL);

  check(res, {
    "status is 200": (r) => r.status === 200,
    "body has ok=true": (r) => {
      try {
        return r.json("ok") === true;
      } catch {
        return false;
      }
    },
  });

  
  
  
  sleep(0.01);
}
