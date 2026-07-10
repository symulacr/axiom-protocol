import { Router } from "express";
import { z } from "zod";
import { ethers } from "ethers";
import type { ServerConfig } from "../server.js";
import { TTLCache, ser, createLogger, createSkillRouter, cachedJsonGet } from "../skills/shared.js";

const CACHE_TTL_MS = 120_000;
const cache = new TTLCache<unknown>(CACHE_TTL_MS);
const ghGet = cachedJsonGet("https://api.github.com", { ttlMs: CACHE_TTL_MS });
const log = createLogger("oss-forensics");

function ghHeaders(): Record<string, string> {
  const h: Record<string, string> = { Accept: "application/vnd.github+json" };
  const token = process.env.GITHUB_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function ghFetch(path: string): Promise<unknown> {
  return ghGet(`gh:${path}`, path, { headers: ghHeaders() });
}

const investigateSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  bytecode: z.string().optional(),
});

async function investigateRepo(owner: string, repo: string) {
  const info = await ghFetch(`/repos/${owner}/${repo}`);
  const languages = await ghFetch(`/repos/${owner}/${repo}/languages`);
  const contributors = await ghFetch(`/repos/${owner}/${repo}/contributors?per_page=10`);
  return { info, languages, contributors };
}

async function compareBytecode(bytecode: string) {
  const hash = ethers.keccak256(bytecode.startsWith("0x") ? bytecode : `0x${bytecode}`);
  return { bytecodeHash: hash, length: bytecode.length };
}

const commitsSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  sha: z.string().optional(),
  perPage: z.coerce.number().int().min(1).max(100).optional(),
});

async function fetchCommits(owner: string, repo: string, sha?: string, perPage = 30) {
  const q = sha ? `?sha=${sha}&per_page=${perPage}` : `?per_page=${perPage}`;
  const commits = await ghFetch(`/repos/${owner}/${repo}/commits${q}`);
  const list = Array.isArray(commits) ? commits : [];
  const forcePushSuspects: string[] = [];
  for (let i = 1; i < list.length; i++) {
    const curr = list[i] as Record<string, unknown>;
    const prev = list[i - 1] as Record<string, unknown>;
    const currParents = (curr.parents as Array<{ sha: string }>) ?? [];
    const prevSha = (prev as { sha: string }).sha;
    if (currParents.length > 0 && currParents[0]?.sha !== prevSha) {
      forcePushSuspects.push(curr.sha as string);
    }
  }
  return { commits: list, forcePushSuspects };
}

const iocSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  path: z.string().optional(),
});

const IOC_PATTERNS: Record<string, RegExp> = {
  awsAccessKey: /\bAKIA[0-9A-Z]{16}\b/g,
  stripeSecretKey: /\bsk_(?:live|test)_[0-9a-zA-Z]{24,}\b/g,
  githubPat: /\bghp_[0-9a-zA-Z]{36,}\b/g,
  privateKey: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g,
  ipv4: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
  domain: /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|xyz|tk|ru|cn)\b/gi,
};

async function scanIocs(owner: string, repo: string, path?: string) {
  const treePath = path ?? "";
  const tree = await ghFetch(`/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`);
  const entries = ((tree as Record<string, unknown>).tree as Array<Record<string, unknown>>) ?? [];
  const textFiles = entries.filter(
    (e) => e.type === "blob" && /\.(?:js|ts|json|env|yaml|yml|toml|cfg|conf|txt|md)$/i.test(e.path as string),
  );

  const hits: Array<{ file: string; pattern: string; match: string }> = [];
  const limit = path ? 1 : 20; // single file vs sample
  for (const entry of textFiles.slice(0, limit)) {
    const fp = entry.path as string;
    if (treePath && !fp.startsWith(treePath)) continue;
    const key = `blob:${owner}/${repo}/${fp}`;
    let content: string;
    const cached = cache.get(key);
    if (cached) {
      content = cached as string;
    } else {
      const blob = await ghFetch(`/repos/${owner}/${repo}/contents/${fp}`);
      const b64 = (blob as Record<string, unknown>).content as string;
      if (!b64) continue;
      content = Buffer.from(b64, "base64").toString("utf-8");
      cache.set(key, content);
    }
    for (const [patternName, re] of Object.entries(IOC_PATTERNS)) {
      const reInst = new RegExp(re.source, re.flags);
      for (const m of content.matchAll(reInst)) {
        hits.push({ file: fp, pattern: patternName, match: m[0] });
      }
    }
  }
  return { scanned: Math.min(textFiles.length, limit), totalFiles: textFiles.length, hits };
}

const auditSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
});

async function auditDeps(owner: string, repo: string) {
  const deps: Record<string, unknown> = {};
  for (const manifest of ["package.json", "Cargo.toml", "requirements.txt"]) {
    try {
      const key = `dep:${owner}/${repo}/${manifest}`;
      let content: string;
      const cached = cache.get(key);
      if (cached) {
        content = cached as string;
      } else {
        const blob = await ghFetch(`/repos/${owner}/${repo}/contents/${manifest}`);
        const b64 = (blob as Record<string, unknown>).content as string;
        if (!b64) continue;
        content = Buffer.from(b64, "base64").toString("utf-8");
        cache.set(key, content);
      }
    } catch (err) {
      log.warn("auditDeps: failed to read manifest", { err, owner, repo, manifest });
    }
  }

  let storageLayout: unknown = null;
  try {
    const key = `layout:${owner}/${repo}`;
    const cached = cache.get(key);
    if (cached) {
      storageLayout = cached;
    } else {
      const layout = await ghFetch(`/repos/${owner}/${repo}/contents/out`);
      const items = Array.isArray(layout) ? layout : [];
      const slotFile = items.find((i: Record<string, unknown>) =>
        (i.name as string)?.includes("storage-layout"),
      );
      if (slotFile) {
        storageLayout = { found: true, file: (slotFile as Record<string, unknown>).name };
        cache.set(key, storageLayout);
      }
    }
  } catch (err) {
    log.warn("auditDeps: no storage layout dir", { err, owner, repo });
  }

  return { deps, storageLayout };
}

export function createSkillOssForensicsRouter(config: ServerConfig): Router {
  const { router, route } = createSkillRouter(config);

  route({ path: "/v1/skills/oss-forensics/investigate", schema: investigateSchema, description: "GitHub repo forensics + optional keccak256 bytecode comparison" },
    async (parsed) => {
      const base = await investigateRepo(parsed.owner, parsed.repo);
      const bytecode = parsed.bytecode ? await compareBytecode(parsed.bytecode) : null;
      return ser({ ...base, bytecode });
    });

  route({ path: "/v1/skills/oss-forensics/commits", schema: commitsSchema, description: "Commit history with force-push detection" },
    async (parsed) => ser(await fetchCommits(parsed.owner, parsed.repo, parsed.sha, parsed.perPage)));

  route({ path: "/v1/skills/oss-forensics/ioc", schema: iocSchema, description: "IOC regex scan: AWS keys, tokens, private keys, IPs, domains" },
    async (parsed) => ser(await scanIocs(parsed.owner, parsed.repo, parsed.path)));

  route({ path: "/v1/skills/oss-forensics/audit", schema: auditSchema, description: "Dependency manifest audit + storage layout detection" },
    async (parsed) => ser(await auditDeps(parsed.owner, parsed.repo)));

  return router;
}
