import { isHex } from "viem";

import express, { type Request, type Response, type Express, type NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { hexToBytes } from "ethereum-cryptography/utils";
import { hexlify, isAddress } from "ethers";
import { randomBytes } from "node:crypto";
import { ZodError } from "zod";
import { createApiKeyAuth } from "@axiom/config/middleware/auth";

import { aesGcmDecrypt, aesGcmEncrypt, concatEncrypted, parseEncrypted } from "./crypto/aes-gcm.js";
import { sealKeyForReceiver } from "./crypto/ecies.js";
import type { TeeSigner } from "./signer.js";
import type { StorageAdapter } from "./storage.js";
import {
  transferValiditySchema,
  ownershipBodySchema,
  mintDataHashSchema,
} from "./route-schemas.js";
import type { OracleEnv } from "./env-schema.js";

export interface ServerConfig {
  signer: TeeSigner;
  storage: StorageAdapter;
  bind: string;
  port: number;
  env?: OracleEnv;
}

export function startServer(config: ServerConfig): Express {
  const app = express();
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'", config.env?.AXIOM_FRONTEND_URL ?? 'http://localhost:5173'],
      },
    },
  }));
  app.use(cors({ origin: config.env?.AXIOM_FRONTEND_URL ?? 'http://localhost:5173' }));
  // Optional API key auth — skip if AXIOM_API_KEY is not set (local dev)
  app.use(createApiKeyAuth(config.env?.AXIOM_API_KEY));
  app.use(rateLimit({ windowMs: 60_000, max: 100 }));
  app.use(express.json({ limit: "1mb" }));
  const { signer, storage } = config;

  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      ok: true,
      signer: signer.address,
      uncompressedPubkey: hexlify(signer.uncompressedPubkey),
      version: "0.1.0",
    });
  });

  app.post("/v1/transfer-validity", async (req: Request, res: Response) => {
    try {
      const { oldDataHash, oldDataUri, targetPubkey64, accessProofNonce, ownershipProofNonce, oldDataEncryptionKey, to: toIn, nft: nftIn } = transferValiditySchema.parse(req.body);

      if (!oldDataHash || !oldDataUri || !targetPubkey64) {
        res.status(400).json({ error: "Missing required field" });
        return;
      }
      if (targetPubkey64.length !== 130) {
        res.status(400).json({ error: "targetPubkey64 must be 64 bytes (128 hex chars)" });
        return;
      }
      if (!oldDataEncryptionKey) {
        res.status(400).json({ error: "oldDataEncryptionKey (base64) is required for devnet shortcut" });
        return;
      }
      if (!toIn || !isAddress(toIn)) {
        res.status(400).json({ error: "'to' address is required and must be a valid non-zero address" });
        return;
      }
      if (!nftIn || !isAddress(nftIn)) {
        res.status(400).json({ error: "'nft' address is required and must be a valid non-zero address" });
        return;
      }

      const oldBlob = await storage.download(oldDataUri as `0x${string}`);
      const oldEnc = parseEncrypted(oldBlob);

      const oldDataKey = Buffer.from(oldDataEncryptionKey, "base64");
      if (oldDataKey.length !== 32) {
        res.status(400).json({ error: "oldDataEncryptionKey must be 32 bytes (base64-encoded)" });
        return;
      }
      const oldPlaintext = aesGcmDecrypt(oldDataKey, oldEnc);

      const newDataKey = new Uint8Array(randomBytes(32));
      const newEnc = aesGcmEncrypt(newDataKey, oldPlaintext);
      const newBlob = concatEncrypted(newEnc);
      const { rootHash: newDataHash } = await storage.upload(newBlob);
      // Auto-register the uploaded dataHash so /v1/ownership succeeds without a separate round trip.
      storage.markDataHashSeen(newDataHash);

      const targetPubkeyBytes = hexToBytes(targetPubkey64 as `0x${string}`);
      const sealedKey = sealKeyForReceiver(targetPubkeyBytes, newDataKey);

      // validUntil = now + 1 day.
      const defaultValidUntil = BigInt(Math.floor(Date.now() / 1000)) + 86400n;
      const ownershipSignature = signer.signOwnership({
        dataHash: oldDataHash as `0x${string}`,
        sealedKey: hexlify(sealedKey) as `0x${string}`,
        targetPubkey: targetPubkey64 as `0x${string}`,
        to: toIn as `0x${string}`,
        nft: nftIn as `0x${string}`,
        nonce: BigInt(ownershipProofNonce ?? accessProofNonce ?? 0),
        validUntil: defaultValidUntil,
      });

      res.json({
        newDataUri: newDataHash,
        newDataHash: newDataHash as `0x${string}`,
        sealedKey: hexlify(sealedKey) as `0x${string}`,
        ownershipSignature,
        accessProofNonce: accessProofNonce ?? 0,
        ownershipProofNonce: ownershipProofNonce ?? accessProofNonce ?? 0,
        validUntil: defaultValidUntil.toString(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[oracle] /v1/transfer-validity error:", err);
      res.status(500).json({ error: "Transfer validity check failed" });
    }
  });

  interface OwnershipRequestBody {
    dataHash: string;
    targetPubkey: string;
    sealedKey: string;
    nonce: string | number;
    to: string;
    nft: string;
    validUntil?: string | number;
  }

  app.post("/v1/ownership", async (req: Request<Record<string, never>, unknown, OwnershipRequestBody>, res: Response) => {
    let parsedBody;
    try {
      parsedBody = ownershipBodySchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        res.status(400).json({ error: err.issues[0]?.message ?? "Validation error" });
        return;
      }
      throw err;
    }

    const {
      dataHash,
      targetPubkey,
      sealedKey,
      nonce,
      to: toIn,
      nft: nftIn,
      validUntil: rawValidUntil,
    } = parsedBody;
    if (!dataHash || !targetPubkey || !sealedKey) {
      res.status(400).json({ error: "Missing required field" });
      return;
    }

    // Block signatures for unseen dataHashes (storage+chain binding).
    if (!storage.hasSeenDataHash(dataHash as `0x${string}`)) {
      res.status(400).json({
        error: `Unknown dataHash: not previously seen by oracle. POST {dataHash} to /v1/agents/mint first.`,
        dataHash,
      });
      return;
    }

    if (!toIn || !isAddress(toIn)) {
      res.status(400).json({ error: "'to' address is required and must be a valid non-zero address" });
      return;
    }
    if (!nftIn || !isAddress(nftIn)) {
      res.status(400).json({ error: "'nft' address is required and must be a valid non-zero address" });
      return;
    }

    // Parse caller-supplied deadline, falling back to now + 1 day.
    const defaultValidUntil = BigInt(Math.floor(Date.now() / 1000)) + 86400n;
    let validUntil = defaultValidUntil;
    if (rawValidUntil !== undefined) {
      let parsed: bigint | null = null;
      if (typeof rawValidUntil === "bigint") {
        parsed = rawValidUntil;
      } else if (typeof rawValidUntil === "number") {
        if (Number.isFinite(rawValidUntil) && Number.isInteger(rawValidUntil) && rawValidUntil > 0) {
          parsed = BigInt(rawValidUntil);
        }
      } else if (typeof rawValidUntil === "string") {
        if (isHex(rawValidUntil)) {
          try {
            parsed = BigInt(rawValidUntil);
          } catch {
            parsed = null;
          }
        } else if (/^\d+$/.test(rawValidUntil)) {
          try {
            parsed = BigInt(rawValidUntil);
          } catch {
            parsed = null;
          }
        }
      }
      if (parsed === null) {
        res.status(400).json({ error: "Invalid validUntil" });
        return;
      }
      validUntil = parsed;
    }

    const ownershipSignature = signer.signOwnership({
      dataHash: dataHash as `0x${string}`,
      sealedKey: sealedKey as `0x${string}`,
      targetPubkey: targetPubkey as `0x${string}`,
      to: toIn as `0x${string}`,
      nft: nftIn as `0x${string}`,
      nonce: BigInt(nonce ?? 0),
      validUntil,
    });
    res.json({
      signature: ownershipSignature,
      signer: signer.address,
      validUntil: validUntil.toString(),
    });
  });

  // Explicit data hash registration route (called by backend after storage upload).
  app.post("/v1/agents/mint", (req: Request, res: Response) => {
    const { dataHash } = mintDataHashSchema.parse(req.body);
    if (!/^0x[0-9a-fA-F]{64}$/.test(dataHash)) {
      res.status(400).json({ error: "dataHash must be a 32-byte hex string (0x + 64 hex chars)" });
      return;
    }
    storage.markDataHashSeen(dataHash as `0x${string}`);
    res.json({ ok: true, dataHash, seen: true });
  });

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[oracle] error:", err);
    // Sanitize: never leak internal details
    const safeMessage = message.length > 200 ? message.slice(0, 200) + "..." : message;
    res.status(500).json({ error: safeMessage, code: "INTERNAL_ERROR" });
  });

  app.listen(config.port, config.bind, () => {
    console.log(`[oracle] listening on http://${config.bind}:${config.port}`);
    console.log(`[oracle] TEE signer: ${signer.address}`);
    console.log("[oracle] \u26A0 SIMULATED TEE: runs in Node.js with cleartext private key. Not Intel TDX/SEV.");
  });

  return app;
}
