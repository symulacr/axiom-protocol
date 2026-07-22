











export const DEFAULT_TARGET_URL = "http://127.0.0.1:3000";

export function targetUrl() {
  return __ENV.BENCH_TARGET_URL || DEFAULT_TARGET_URL;
}


export const SUMMARY_TREND_STATS = ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"];

export function isStatus2xx(r) {
  return r.status >= 200 && r.status < 300;
}
