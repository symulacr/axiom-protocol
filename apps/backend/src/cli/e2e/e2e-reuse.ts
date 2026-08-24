import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface E2eReuseSnapshot {
  tokenId: string;
  dataHash: `0x${string}`;
  savedAt: string;
}

const REUSE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../.data/e2e-last.json",
);

export function e2eReuseEnabled(): boolean {
  return process.env.E2E_REUSE_TOKEN === "1";
}

export function loadE2eReuseSnapshot(): E2eReuseSnapshot | null {
  const explicitId = process.env.E2E_REUSE_TOKEN_ID?.trim();
  const explicitHash = process.env.E2E_REUSE_DATA_HASH?.trim() as
    `0x${string}` | undefined;
  if (explicitId && explicitHash?.startsWith("0x")) {
    return { tokenId: explicitId, dataHash: explicitHash, savedAt: "env" };
  }
  if (!existsSync(REUSE_PATH)) return null;
  try {
    const raw = JSON.parse(
      readFileSync(REUSE_PATH, "utf8"),
    ) as E2eReuseSnapshot;
    if (!raw.tokenId || !raw.dataHash?.startsWith("0x")) return null;
    return raw;
  } catch {
    return null;
  }
}

export function saveE2eReuseSnapshot(snap: E2eReuseSnapshot): void {
  mkdirSync(dirname(REUSE_PATH), { recursive: true });
  writeFileSync(REUSE_PATH, `${JSON.stringify(snap, null, 2)}\n`, "utf8");
  console.log(
    `  [Reuse] Saved snapshot tokenId=${snap.tokenId} → ${REUSE_PATH}`,
  );
}

/** Bench CLIs resolve the agent under test as: env override, else last run's tokenId, else token 1. */
export function resolveBenchTokenId(explicit: string | undefined): string {
  if (explicit) return explicit;
  if (existsSync(REUSE_PATH)) {
    const snap = JSON.parse(readFileSync(REUSE_PATH, "utf8")) as {
      tokenId?: string;
    };
    if (snap.tokenId) return snap.tokenId;
  }
  return "1";
}
