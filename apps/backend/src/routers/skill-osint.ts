import { Router } from "express";
import { z } from "zod";
import type { ServerConfig } from "../server.js";
import {
  createSkillRouter,
  cachedJsonGet,
  ser,
} from "../skills/shared.js";

const cachedGet = cachedJsonGet("", {
  headers: { "User-Agent": "AxiomAgent/1.0", Accept: "application/json" },
  ttlMs: 5 * 60 * 1000,
});

async function cachedFetch(key: string, url: string, init?: RequestInit): Promise<unknown> {
  return cachedGet(key, url, { ...init, signal: init?.signal ?? AbortSignal.timeout(15_000) });
}

function tokenScore(a: string, b: string): number {
  const tokA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const tokB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
  if (tokA.size === 0 || tokB.size === 0) return 0;
  let overlap = 0;
  for (const t of tokA) if (tokB.has(t)) overlap++;
  return overlap / Math.max(tokA.size, tokB.size);
}

const cikSchema = z.object({ cik: z.string().min(1).max(12) });
const usaspendingSchema = z.object({
  filters: z.record(z.string(), z.unknown()),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
const ofacSchema = z.object({ name: z.string().min(1).max(200) });
const opencorpSchema = z.object({
  jurisdiction: z.string().min(2).max(5).default("us"),
  query: z.string().min(1).max(200),
});
const entitySchema = z.object({
  entities: z.array(z.string().min(1)).min(2).max(20),
});
const courtSchema = z.object({
  query: z.string().min(1).max(200),
  type: z.enum(["o", "r"]).optional(), // opinions / recap
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

export function createSkillOsintRouter(config: ServerConfig): Router {
  const { router, route } = createSkillRouter(config);

  route(
    { path: "/v1/skills/osint/sec_edgar", schema: cikSchema, description: "SEC EDGAR company submissions lookup" },
    async (parsed: z.infer<typeof cikSchema>) => {
      const cik = parsed.cik.padStart(10, "0");
      return cachedFetch(`edgar:${cik}`, `https://data.sec.gov/submissions/CIK${cik}.json`);
    },
  );

  route(
    { path: "/v1/skills/osint/usaspending", schema: usaspendingSchema, description: "USASpending.gov federal award search" },
    async (parsed: z.infer<typeof usaspendingSchema>) => {
      return cachedFetch(`spend:${JSON.stringify(parsed.filters)}`, "https://api.usaspending.gov/api/v2/search/spending_by_award/", {
        method: "POST",
        body: JSON.stringify({
          filters: parsed.filters,
          fields: ["Award ID", "Recipient Name", "Award Amount", "Award Type"],
          limit: parsed.limit ?? 10,
          sort: "Award Amount",
          order: "desc",
        }),
      });
    },
  );

  route(
    { path: "/v1/skills/osint/ofac_sdn", schema: ofacSchema, description: "OFAC SDN list name search" },
    async (parsed: z.infer<typeof ofacSchema>) => {
      const q = encodeURIComponent(parsed.name);
      return cachedFetch(`ofac:${parsed.name}`, `https://sanctionssearch.ofac.treas.gov/Details.aspx?id=0&name=${q}&program=SDN`);
    },
  );

  route(
    { path: "/v1/skills/osint/opencorporates", schema: opencorpSchema, description: "OpenCorporates company search" },
    async (parsed: z.infer<typeof opencorpSchema>) => {
      const q = encodeURIComponent(parsed.query);
      return cachedFetch(`ocorp:${parsed.jurisdiction}:${parsed.query}`, `https://api.opencorporates.com/v0.4/companies/search?q=${q}&jurisdiction_code=${parsed.jurisdiction}`);
    },
  );

  route(
    { path: "/v1/skills/osint/entity_resolve", schema: entitySchema, description: "Resolve whether entity names refer to the same company" },
    async (parsed: z.infer<typeof entitySchema>) => {
      const { entities } = parsed;
      const scores: Array<{ pair: [string, string]; score: number }> = [];
      for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
          scores.push({ pair: [entities[i]!, entities[j]!], score: tokenScore(entities[i]!, entities[j]!) });
        }
      }
      scores.sort((a, b) => b.score - a.score);
      return ser({ matches: scores });
    },
  );

  route(
    { path: "/v1/skills/osint/courtlistener", schema: courtSchema, description: "CourtListener opinions and RECAP search" },
    async (parsed: z.infer<typeof courtSchema>) => {
      const q = encodeURIComponent(parsed.query);
      const type = parsed.type ?? "o";
      const endpoint = type === "o" ? "search" : "recap";
      return cachedFetch(`court:${type}:${parsed.query}`, `https://www.courtlistener.com/api/rest/v3/${endpoint}/?q=${q}&page_size=${parsed.limit ?? 10}`);
    },
  );

  return router;
}
