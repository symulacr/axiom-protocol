// Sealed-DEK custody (proto-hashless-completion.md option C, ADR-004 §2.4):
// tokenId → ECIES-sealed-to-oracle DEK. The server treats the sealed DEK as
// opaque bytes — it is never logged and never decrypted here; only
// transferValidity unseals it, and the row is deleted after a successful re-key.
// File-backed per the event-store pattern (AXIOM_DATA_DIR/.data JSON, atomic
// writes); the DEK registry file never leaves the data dir.
import { existsSync, readFileSync } from "node:fs";
import {
  dataFilePath,
  atomicWriteFileSync,
  backupFileBestEffort,
} from "@axiom/config/path";
import { createLogger } from "../utils/logger.js";
import { extractErrorMessage } from "../utils/response.js";

export interface SealedDekEntry {
  /** Decimal tokenId string (BigInt-normalized). */
  tokenId: string;
  /** ECIES-sealed-to-oracle DEK exactly as the client uploaded it (hex or base64). */
  sealedDek: string;
  uploadedAt: number;
}

const CUSTODY_FILE = "dek-custody.json";

const log = createLogger("dek-custody");

function custodyPaths(): string {
  // Resolved per call so AXIOM_DATA_DIR set after import takes effect (matches EventStore).
  return dataFilePath(CUSTODY_FILE);
}

function loadEntries(file: string): Map<string, SealedDekEntry> {
  try {
    if (!existsSync(file)) return new Map();
    const parsed = JSON.parse(readFileSync(file, "utf-8")) as {
      deks?: unknown;
    };
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.deks)) {
      throw new Error("dek custody file root is missing a deks array");
    }
    const entries = new Map<string, SealedDekEntry>();
    for (const raw of parsed.deks) {
      if (
        !raw ||
        typeof raw !== "object" ||
        typeof (raw as SealedDekEntry).sealedDek !== "string" ||
        (raw as SealedDekEntry).sealedDek.length === 0
      ) {
        continue; // skip malformed rows; custody is best-effort persistence
      }
      const entry = raw as Omit<SealedDekEntry, "tokenId"> & {
        tokenId?: unknown;
      };
      if (typeof entry.tokenId !== "string" || entry.tokenId.length === 0) {
        continue; // skip malformed rows; custody is best-effort persistence
      }
      try {
        entries.set(BigInt(entry.tokenId).toString(), {
          tokenId: BigInt(entry.tokenId).toString(),
          sealedDek: entry.sealedDek,
          uploadedAt:
            typeof entry.uploadedAt === "number" ? entry.uploadedAt : 0,
        });
      } catch {
        continue; // non-numeric token id from a corrupt file
      }
    }
    return entries;
  } catch (err) {
    backupFileBestEffort(file);
    log.warn("dek custody file corrupt or unreadable, starting fresh", {
      error: extractErrorMessage(err),
    });
    return new Map();
  }
}

/**
 * File-backed vault keyed by decimal tokenId string. Writes are atomic
 * tmp+rename; the in-memory map is the read path so lookups never touch disk.
 * Token ids are normalized via BigInt string form so "07", 7 and "7" collide.
 */
export class DekCustodyStore {
  private readonly file: string;
  private entries: Map<string, SealedDekEntry>;

  constructor(file?: string) {
    this.file = file ?? custodyPaths();
    this.entries = loadEntries(this.file);
  }

  persist(entry: SealedDekEntry): void {
    this.entries.set(entry.tokenId, entry);
    this.writeEntries();
  }

  lookup(tokenId: bigint | string): SealedDekEntry | undefined {
    return this.entries.get(BigInt(tokenId).toString());
  }

  /** Removes and persists the deletion; false when no row existed. */
  delete(tokenId: bigint | string): boolean {
    const key = BigInt(tokenId).toString();
    if (!this.entries.has(key)) return false;
    this.entries.delete(key);
    this.writeEntries();
    return true;
  }

  private writeEntries(): void {
    try {
      atomicWriteFileSync(
        this.file,
        JSON.stringify({ deks: [...this.entries.values()] }),
      );
    } catch (err) {
      // Best-effort persistence: a failed write leaves the in-memory row
      // usable for this process; a restart falls back to the last good file.
      log.warn("dek custody persist failed", {
        error: extractErrorMessage(err),
      });
    }
  }
}
