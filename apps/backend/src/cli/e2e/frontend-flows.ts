import WebSocket from "ws";
import { fetchJson } from "../../utils/response.js";
import { getStep, postStep, stepResults } from "./http.js";
import { markScenarioCovered } from "./scenarios.js";
import { noteFriction } from "./friction.js";

const ARCHIVE_PROBE_URL = "https://example.com";

async function runRoutesRegistryStep(deps: {
  backendUrl: string;
}): Promise<void> {
  console.log("\n[Frontend] GET /v1/routes");
  const res = await getStep<{ routes?: Array<{ path: string; method?: string }> }>(
    deps.backendUrl,
    10.1,
    "/v1/routes",
    (r, meta) => {
      const routes = r.routes ?? [];
      const count = routes.length;
      const hasTick = routes.some((x) => x.path === "/v1/orchestrator/tick");
      const hasEvents = routes.some((x) => x.path === "/v1/events");
      const hasPerfBatch = routes.some(
        (x) => x.path === "/v1/agents/performance/batch",
      );
      return {
        summary: `routes=${count} tick=${hasTick} events=${hasEvents} perfBatch=${hasPerfBatch}`,
        ok: meta.ok && count >= 10 && hasEvents && hasPerfBatch && hasTick,
      };
    },
  );
  void res;
  markScenarioCovered("api.routes", "routes-registry", { reads: 1 });
}

async function runEventsFeedStep(deps: {
  backendUrl: string;
  tokenId?: string;
}): Promise<void> {
  console.log("\n[Frontend] GET /v1/events (Tick feed)");
  const since = Date.now() - 300_000;
  const path = `/v1/events?eventName=Tick&since=${since}`;
  await getStep<{ events: Array<{ eventName: string; payload?: Record<string, unknown> }> }>(
    deps.backendUrl,
    10.2,
    path,
    (r, meta) => {
      const ticks = r.events ?? [];
      const match = deps.tokenId
        ? ticks.some(
            (e) =>
              String(e.payload?.agentTokenId ?? e.payload?.tokenId ?? "") ===
              deps.tokenId,
          )
        : ticks.length > 0;
      return {
        summary: `events=${ticks.length} tokenMatch=${match}`,
        ok: meta.ok && ticks.length > 0 && (deps.tokenId ? match : true),
      };
    },
  );
  markScenarioCovered("events.feed", "events-feed", { reads: 1 });
}

async function runPerformanceBatchStep(deps: {
  backendUrl: string;
  tokenId: string;
  minTicks?: number;
}): Promise<void> {
  const minTicks = deps.minTicks ?? 1;
  console.log(`\n[Frontend] GET /v1/agents/performance/batch?ids=${deps.tokenId}`);
  const path = `/v1/agents/performance/batch?ids=${deps.tokenId}`;
  await getStep<{
    results: Record<
      string,
      { totalTicks: number; holdCount: number; buyCount: number }
    >;
  }>(deps.backendUrl, 10.3, path, (r, meta) => {
    const m = r.results?.[deps.tokenId];
    const ticks = m?.totalTicks ?? 0;
    return {
      summary: `batch ticks=${ticks} hold=${m?.holdCount ?? 0}`,
      ok: meta.ok && ticks >= minTicks,
    };
  });
  markScenarioCovered("agent.performance-batch", "performance-batch", { reads: 1 });
}

async function runRoyaltyEncodeStep(deps: {
  backendUrl: string;
  tokenId: string;
  bps?: number;
}): Promise<void> {
  const bps = deps.bps ?? 8000;
  console.log(`\n[Frontend] POST /v1/agents/${deps.tokenId}/royalty bps=${bps}`);
  await postStep<{ to: string; data: string; bps: number }>(
    deps.backendUrl,
    10.4,
    `/v1/agents/${deps.tokenId}/royalty`,
    { bps },
    (r) => ({
      summary: `encoded bps=${r.bps} to=${r.to?.slice(0, 10)}… dataLen=${r.data?.length ?? 0}`,
      ok: !!r.to && !!r.data && r.bps === bps,
    }),
  );
  markScenarioCovered("payment.royalty-encode", "royalty-encode", { reads: 1 });
}

async function runEventStreamStep(deps: {
  backendUrl: string;
  topics?: string[];
  timeoutMs?: number;
}): Promise<void> {
  const topics = deps.topics ?? ["Tick"];
  const timeoutMs = deps.timeoutMs ?? 8000;
  console.log(`\n[Frontend] WS /v1/stream topics=${topics.join(",")}`);

  const httpBase = deps.backendUrl.replace(/\/+$/, "");
  const wsBase = httpBase.replace(/^http/, "ws");
  const url = new URL(`${wsBase}/v1/stream`);
  for (const t of topics) url.searchParams.append("topic", t);
  // WS upgrade auth is token-based (?token=), not header — mirror the backend's setupWebSocketServer.
  const apiKey = process.env.AXIOM_API_KEY ?? "";
  if (apiKey) url.searchParams.append("token", apiKey);

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`WS /v1/stream: no hello within ${timeoutMs}ms`));
    }, timeoutMs);

    const ws = new WebSocket(url.toString());
    let hello = false;

    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    ws.on("message", (raw) => {
      try {
        const data = JSON.parse(String(raw)) as { topic?: string; payload?: unknown };
        if (data.topic === "hello") {
          hello = true;
          clearTimeout(timer);
          ws.close();
          resolve();
        }
      } catch { /* ignore */ }
    });

    ws.on("close", () => {
      if (!hello) {
        clearTimeout(timer);
        reject(new Error("WS closed before hello"));
      }
    });
  });

  stepResults.push({
    step: 10.5,
    name: "WS /v1/stream",
    ok: true,
    summary: `hello topics=${topics.join(",")}`,
  });
  markScenarioCovered("api.stream", "event-stream", { reads: 1 });
}

async function runArchiveProbeStep(deps: {
  backendUrl: string;
}): Promise<void> {
  console.log("\n[Frontend] POST /v1/archive/query (closest, example.com)");
  const archiveApiKey = process.env.AXIOM_API_KEY ?? "";
  const { data, ok, status } = await fetchJson<{
    url: string;
    snapshot: { snapshotUrl?: string } | null;
  }>(`${deps.backendUrl}/v1/archive/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(archiveApiKey ? { "x-api-key": archiveApiKey } : {}),
    },
    body: JSON.stringify({ intent: "closest", url: ARCHIVE_PROBE_URL }),
  });
  const stepOk = ok && data.url === ARCHIVE_PROBE_URL;
  console.log(
    `          snapshot=${data.snapshot ? "yes" : "null"} status=${status}`,
  );
  stepResults.push({
    step: 10.6,
    name: "/v1/archive/closest",
    ok: stepOk,
    summary: `snapshot=${data.snapshot ? "found" : "null"}`,
  });
  if (!stepOk) {
    throw new Error(`archive closest failed (status=${status})`);
  }
  noteFriction({
    id: "archive-snapshots-slow",
    severity: "info",
    category: "ux",
    message: "E2E uses /archive/closest; /archive/snapshots (CDX) omitted — often >20s",
    suggestion: "Run snapshots in dedicated slow integration job or E2E_ARCHIVE_CDX=1",
  });
  markScenarioCovered("archive.closest", "archive-closest", { reads: 1 });
}

export async function runFrontendPostTickBundle(deps: {
  backendUrl: string;
  tokenId: string;
  minTicks: number;
}): Promise<void> {
  await Promise.all([
    runRoutesRegistryStep({ backendUrl: deps.backendUrl }),
    runEventsFeedStep({ backendUrl: deps.backendUrl, tokenId: deps.tokenId }),
    runPerformanceBatchStep({
      backendUrl: deps.backendUrl,
      tokenId: deps.tokenId,
      minTicks: deps.minTicks,
    }),
    runRoyaltyEncodeStep({ backendUrl: deps.backendUrl, tokenId: deps.tokenId }),
    runEventStreamStep({ backendUrl: deps.backendUrl }),
    runArchiveProbeStep({ backendUrl: deps.backendUrl }),
  ]);
}