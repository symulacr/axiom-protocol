import { rename, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { getEnv } from "@axiom/config/env";

function getCheckpointFile(chainId: bigint): string {
  const dataDir = getEnv("AXIOM_DATA_DIR") || "data";
  const checkpointDir = join(dataDir, "checkpoints");
  return join(checkpointDir, `checkpoint-${chainId}.json`);
}

export async function loadCheckpoint(
  chainId: bigint,
): Promise<number | null> {
  const checkpointFile = getCheckpointFile(chainId);
  try {
    const data = await Bun.file(checkpointFile).text();
    const parsed = JSON.parse(data);
    if (
      typeof parsed.nextBlock === "number" &&
      Number.isInteger(parsed.nextBlock) &&
      parsed.nextBlock > 0
    ) {
      return parsed.nextBlock;
    }
  } catch (err) {
    console.warn("[watcher] failed to load checkpoint:", err);
  }
  return null;
}

export async function saveCheckpoint(
  chainId: bigint,
  nextBlock: number,
): Promise<void> {
  const checkpointFile = getCheckpointFile(chainId);
  const tmp = checkpointFile + ".tmp";
  try {
    await mkdir(dirname(checkpointFile), { recursive: true });
    // Bun.write uses the fastest syscall; rename/mkdir stay node:fs/promises
    // (Bun docs route directory ops to node:fs).
    await Bun.write(tmp, JSON.stringify({ nextBlock, updatedAt: Date.now() }));
    await rename(tmp, checkpointFile);
  } catch (err) {
    console.error("[watcher] failed to save checkpoint:", err);
  }
}
