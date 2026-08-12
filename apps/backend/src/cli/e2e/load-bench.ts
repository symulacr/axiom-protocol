
import WebSocket from "ws";
import { fetchJson } from "../../utils/response.js";
import { resolveE2eComputeModel } from "./fast-path.js";
import { percentile } from "./shared.js";

interface LaneStats {
  lane: string;
  concurrency: number;
  total: number;
  ok: number;
  fail: number;
  reliabilityPct: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  errors: Record<string, number>;
}

type Probe = () => Promise<{ ok: boolean; error?: string }>;

async function runLane(
  lane: string,
  concurrency: number,
  iterations: number,
  probe: Probe,
): Promise<LaneStats> {
  const latencies: number[] = [];
  const errors: Record<string, number> = {};
  let ok = 0;
  let fail = 0;
  let cursor = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const i = cursor++;
      if (i >= iterations) return;
      const t0 = performance.now();
      try {
        const r = await probe();
        const ms = performance.now() - t0;
        latencies.push(ms);
        if (r.ok) ok++;
        else {
          fail++;
          const key = r.error ?? "probe-false";
          errors[key] = (errors[key] ?? 0) + 1;
        }
      } catch (e) {
        fail++;
        latencies.push(performance.now() - t0);
        const key = e instanceof Error ? e.message.slice(0, 80) : String(e);
        errors[key] = (errors[key] ?? 0) + 1;
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  const sorted = [...latencies].sort((a, b) => a - b);
  const total = ok + fail;
  return {
    lane,
    concurrency,
    total,
    ok,
    fail,
    reliabilityPct: total === 0 ? 100 : Math.round((ok / total) * 100),
    p50Ms: Math.round(percentile(sorted, 50)),
    p95Ms: Math.round(percentile(sorted, 95)),
    p99Ms: Math.round(percentile(sorted, 99)),
    maxMs: Math.round(sorted[sorted.length - 1] ?? 0),
    errors,
  };
}

function wsProbe(url: string, timeoutMs: number): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      ws.terminate();
      resolve({ ok: false, error: "ws-timeout" });
    }, timeoutMs);
    ws.once("open", () => {
      clearTimeout(timer);
      ws.close();
      resolve({ ok: true });
    });
    ws.once("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: `ws-${err.message.slice(0, 40)}` });
    });
  });
}

function buildLanes(deps: {
  backendUrl: string;
  tokenId: string;
}): Array<{ name: string; probe: Probe }> {
  const base = deps.backendUrl.replace(/\/$/, "");
  const since = Date.now() - 600_000;
  return [
    {
      name: "health",
      probe: async () => {
        const { ok, data } = await fetchJson<{ ok?: boolean }>(`${base}/health`);
        return { ok: ok && data.ok === true, error: ok ? undefined : "health-not-ok" };
      },
    },
    {
      name: "health-live",
      probe: async () => {
        const { ok, data } = await fetchJson<{ ok?: boolean; live?: boolean }>(
          `${base}/health/live`,
        );
        return {
          ok: ok && data.ok === true && data.live === true,
          error: ok ? "health-live-not-ok" : "health-live-http",
        };
      },
    },
    {
      name: "routes",
      probe: async () => {
        const { ok, data } = await fetchJson<{ routes?: unknown[] }>(`${base}/v1/routes`);
        return {
          ok: ok && (data.routes?.length ?? 0) >= 5,
          error: ok ? "routes-empty" : "routes-http",
        };
      },
    },
    {
      name: "events",
      probe: async () => {
        const { ok } = await fetchJson(
          `${base}/v1/events?eventName=Tick&since=${since}&limit=20`,
        );
        return { ok, error: ok ? undefined : "events-http" };
      },
    },
    {
      name: "perf-batch",
      probe: async () => {
        const { ok, data } = await fetchJson<{
          results?: Record<string, { totalTicks: number }>;
        }>(`${base}/v1/agents/performance/batch?ids=${deps.tokenId}`);
        const ticks = data.results?.[deps.tokenId]?.totalTicks ?? 0;
        return { ok: ok && ticks >= 0, error: ok ? undefined : "perf-http" };
      },
    },
    {
      name: "payment-config",
      probe: async () => {
        const { ok, data } = await fetchJson<{ paymentToken?: string }>(
          `${base}/v1/payment/config`,
        );
        return {
          ok: ok && !!data.paymentToken,
          error: ok ? "config-missing" : "config-http",
        };
      },
    },
    {
      name: "compute-providers",
      probe: async () => {
        const { ok, data } = await fetchJson<{ services?: unknown[] }>(
          `${base}/v1/compute/providers`,
        );
        return {
          ok: ok && (data.services?.length ?? 0) > 0,
          error: ok ? "providers-empty" : "providers-http",
        };
      },
    },
    {
      name: "mixed-read-burst",
      probe: async () => {
        const results = await Promise.all([
          fetchJson(`${base}/health`),
          fetchJson(`${base}/v1/routes`),
          fetchJson(`${base}/v1/payment/config`),
          fetchJson(`${base}/v1/events?limit=5`),
        ]);
        const allOk = results.every((r) => r.ok);
        return { ok: allOk, error: allOk ? undefined : "mixed-read-fail" };
      },
    },
    {
      name: "ws-stream",
      probe: async () => {
        const wsUrl = base.replace(/^http/, "ws") + "/v1/stream";
        return wsProbe(wsUrl, 5_000);
      },
    },
    {
      name: "chat-smoke",
      probe: async () => {
        if (process.env.LOAD_BENCH_CHAT === "0") {
          return { ok: true };
        }
        try {
          const model = await resolveE2eComputeModel(base);
          const res = await fetch(`${base}/v1/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              messages: [{ role: "user", content: "Reply: ok" }],
              max_tokens: 8,
            }),
            signal: AbortSignal.timeout(45_000),
          });
          if (!res.ok) {
            const text = await res.text();
            return { ok: false, error: `chat-${res.status}:${text.slice(0, 40)}` };
          }
          const reader = res.body?.getReader();
          if (!reader) return { ok: false, error: "chat-no-body" };
          let chunks = 0;
          const decoder = new TextDecoder();
          let buffer = "";
          const deadline = Date.now() + 40_000;
          while (Date.now() < deadline) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            if (buffer.includes("[DONE]")) break;
            chunks += buffer.split("\n").filter((l) => l.startsWith("data: ")).length;
            buffer = buffer.slice(-200);
          }
          return { ok: chunks > 0, error: chunks > 0 ? undefined : "chat-no-chunks" };
        } catch (e) {
          return {
            ok: false,
            error: e instanceof Error ? e.message.slice(0, 60) : "chat-fail",
          };
        }
      },
    },
  ];
}

const CHAT_SMOKE_ONLY_C1 = "chat-smoke";

export async function runAxiomCoreLoadBench(deps: {
  backendUrl: string;
  tokenId: string;
  concurrencies?: number[];
  iterationsPerLane?: number;
}): Promise<LaneStats[]> {
  const concurrencies = deps.concurrencies ?? [1, 5, 10, 20];
  const iterations = deps.iterationsPerLane ?? 40;
  const lanes = buildLanes(deps);
  const all: LaneStats[] = [];

  console.log("\n============================================");
  console.log("  Axiom Core — parallel load bench");
  console.log("============================================");
  console.log(`  Backend: ${deps.backendUrl}`);
  console.log(`  tokenId: ${deps.tokenId}`);
  console.log(`  iterations/lane: ${iterations}`);
  console.log(`  concurrencies: ${concurrencies.join(", ")}\n`);

  for (const c of concurrencies) {
    console.log(`  --- concurrency=${c} ---`);
    if (c > 1) {
      await new Promise((r) => setTimeout(r, 1_500));
    }
    const activeLanes = lanes.filter(
      (lane) => c === 1 || lane.name !== CHAT_SMOKE_ONLY_C1,
    );
    const batch = await Promise.all(
      activeLanes.map((lane) => runLane(lane.name, c, iterations, lane.probe)),
    );
    for (const s of batch) {
      all.push(s);
      const errSummary =
        Object.keys(s.errors).length === 0
          ? ""
          : ` errors=${JSON.stringify(s.errors)}`;
      console.log(
        `  ${s.lane.padEnd(18)} rel=${String(s.reliabilityPct).padStart(3)}%  ` +
          `ok=${s.ok}/${s.total}  p50=${s.p50Ms}ms p95=${s.p95Ms}ms p99=${s.p99Ms}ms max=${s.maxMs}ms${errSummary}`,
      );
    }
    console.log("");
  }

  const worst = [...all].sort((a, b) => a.reliabilityPct - b.reliabilityPct)[0];
  const best = [...all].sort((a, b) => b.reliabilityPct - a.reliabilityPct)[0];
  console.log("  Summary:");
  if (best) {
    console.log(
      `  Best:  ${best.lane} @ c=${best.concurrency} → ${best.reliabilityPct}% (p95 ${best.p95Ms}ms)`,
    );
  }
  if (worst && worst.reliabilityPct < 100) {
    console.log(
      `  Worst: ${worst.lane} @ c=${worst.concurrency} → ${worst.reliabilityPct}% (p95 ${worst.p95Ms}ms)`,
    );
  }
  const sub100 = all.filter((s) => s.reliabilityPct < 100);
  if (sub100.length === 0) {
    console.log("  All lanes 100% reliable across tested concurrencies.");
  } else {
    console.log(`  ${sub100.length} lane×concurrency combos below 100% — review errors above.`);
  }
  console.log("");

  return all;
}