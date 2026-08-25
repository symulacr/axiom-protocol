import type { Express, Request, Response } from "express";
import { z } from "zod";
import { ethers } from "ethers";
import type { ServerConfig } from "../config-types.js";
import { HTTP } from "@axiom/config/constants";
import {
  resolveChatModel,
  resolveContextWindow,
} from "@axiom/config/chat-tools";
import { getComputeBaseUrl } from "../providers.js";
import { TTLCache } from "../utils/response.js";
import { createRoute } from "./route-factory.js";
import { routeMeta } from "./shared.js";

// Map the router's provider verifiability value (TeeTLS/TeeML/private) to the
// X-0G-Provider-Trust-Mode vocabulary (standard|verified|private).
function trustModeFromVerifiability(
  verifiability: unknown,
): "standard" | "verified" | "private" {
  const v =
    typeof verifiability === "string" ? verifiability.toLowerCase() : "";
  if (v.includes("private")) return "private";
  if (v.includes("tee")) return "verified";
  return "standard";
}

export function registerComputeRoutes(
  app: Express,
  config: ServerConfig,
  ogChainId: number,
): void {
  const modelsCache = new TTLCache<Record<string, unknown>[]>(60_000);
  const routerDataSchema = z.object({
    data: z.array(z.record(z.string(), z.unknown())),
  });

  /** GET a compute-router endpoint with the shared 10s timeout; null = non-2xx. */
  async function fetchRouterEndpoint(
    path: string,
    requestId?: string,
  ): Promise<unknown> {
    const resp = await fetch(`${getComputeBaseUrl()}${path}`, {
      ...(requestId ? { headers: { "X-Request-ID": requestId } } : {}),
      signal: AbortSignal.timeout(10_000),
    });
    return resp.ok ? await resp.json() : null;
  }

  async function fetchRouterModels(
    requestId?: string,
  ): Promise<Record<string, unknown>[]> {
    const cached = modelsCache.get("models");
    if (cached) return cached;
    const raw = await fetchRouterEndpoint("/models", requestId);
    if (raw === null) return [];
    const parsed = routerDataSchema.parse(raw);
    modelsCache.set("models", parsed.data);
    return parsed.data;
  }

  async function fetchModelWindows(): Promise<Record<string, number>> {
    try {
      const models = await fetchRouterModels();
      return Object.fromEntries(
        models.flatMap((m) => {
          const id = String(m.id ?? "");
          const cw = m.context_window;
          return id && typeof cw === "number" ? [[id, cw]] : [];
        }),
      );
    } catch {
      return {};
    }
  }

  // Passthrough to the router's provider discovery (real addresses + latency/pricing/TEE info).
  // Router model ids are versioned (e.g. deepseek-v4-flash-0731), so an exact model_id query is
  // attempted first and falls back to listing all providers and filtering locally by exact/prefix.
  const providersCache = new TTLCache<Record<string, unknown>[]>(60_000);
  async function fetchRouterProviders(
    model: string,
  ): Promise<Record<string, unknown>[]> {
    const cacheKey = `providers:${model}`;
    const cached = providersCache.get(cacheKey);
    if (cached) return cached;
    const fetchAll = async (qs: string): Promise<Record<string, unknown>[]> => {
      const raw = await fetchRouterEndpoint(`/providers${qs}`);
      if (raw === null) return [];
      const parsed = routerDataSchema.safeParse(raw);
      return parsed.success ? parsed.data.data : [];
    };
    let providers = await fetchAll(`?model_id=${encodeURIComponent(model)}`);
    if (providers.length === 0) providers = await fetchAll("");
    // Router rows carry BOTH the versioned upstream id (model_id, e.g.
    // "qwen/qwen2.5-omni-7b") and the catalog id (canonical_id, e.g.
    // "qwen2.5-omni") — and the router's own ?model_id filter is loose
    // (it can return unrelated rows), so always filter locally on both.
    providers = providers.filter((p) =>
      [p.model_id, p.canonical_id].some((id) =>
        String(id ?? "").startsWith(model),
      ),
    );
    providersCache.set(cacheKey, providers);
    return providers;
  }

  createRoute(
    app,
    routeMeta(
      "/v1/compute/providers",
      "useCompute",
      "List compute providers (router models + deterministic pseudo-addresses)",
      { method: "get" },
    ),
    async (_parsed: unknown, req: Request, res: Response) => {
      const routerBaseUrl = getComputeBaseUrl();
      // ?model=<id> → real provider discovery passthrough (address/latency/pricing/TEE info)
      const model =
        typeof req.query?.model === "string" ? req.query.model : undefined;
      if (model) {
        const providers = await fetchRouterProviders(model);
        if (providers.length === 0)
          return void res.status(HTTP.BAD_GATEWAY).json({
            error: `Compute router returned no providers for model: ${model}`,
            code: "UPSTREAM_ERROR",
          });
        res.json({
          services: providers.map((p: Record<string, unknown>) => ({
            ...p,
            model: String(p.model_id ?? ""),
            endpoint: routerBaseUrl,
            trust_mode: trustModeFromVerifiability(p.verifiability),
          })),
        });
        return;
      }
      const models = await fetchRouterModels();
      if (models.length === 0)
        return void res.status(HTTP.BAD_GATEWAY).json({
          error: "Compute router returned no models",
          code: "UPSTREAM_ERROR",
        });
      const services = models.map((m: Record<string, unknown>) => {
        const id = String(m.id ?? "");
        const address = ethers
          .keccak256(ethers.toUtf8Bytes(`model:${id}`))
          .slice(0, 42) as `0x${string}`;
        const pricingRaw = m.pricing;
        const price =
          pricingRaw && typeof pricingRaw === "object" && "prompt" in pricingRaw
            ? String((pricingRaw as Record<string, unknown>).prompt ?? "")
            : undefined;
        return { address, model: id, endpoint: routerBaseUrl, price };
      });
      res.json({ services });
    },
    config,
  );

  createRoute(
    app,
    routeMeta("/v1/config", "config", "Backend configuration", {
      method: "get",
    }),
    async (_parsed: unknown, _req: Request, res: Response) => {
      const model = resolveChatModel(
        config.env?.AXIOM_COMPUTE_MODEL,
        ogChainId,
      );
      const windows = await fetchModelWindows();
      res.json({
        model,
        assistantName: "Axiom",
        contextWindow: resolveContextWindow(model, windows),
      });
    },
    config,
  );
}
