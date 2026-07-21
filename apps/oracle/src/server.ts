import { isHex } from "viem";

import express, {
  type Request,
  type Response,
  type Express,
  type NextFunction,
} from "express";
import helmet from "helmet";
import * as Sentry from "@sentry/node";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { hexToBytes } from "ethereum-cryptography/utils";
import { randomBytes } from "node:crypto";
import { hexlify, isAddress, toBeHex } from "ethers";
import { HTTP } from "@axiom/config";
import { ZodError } from "zod";
import { createApiKeyAuth } from "@axiom/config/middleware/auth";

import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  concatEncrypted,
  parseEncrypted,
} from "@axiom/config/crypto/aes-gcm";
import {
  sealKeyForReceiver,
  unsealKeyForReceiver,
} from "@axiom/config/crypto/keys";
import type { TeeSigner } from "./signer.js";
import type { StorageAdapter } from "@axiom/config/storage/0g";
import {
  transferValiditySchema,
  ownershipBodySchema,
  mintDataHashSchema,
} from "./route-schemas.js";
import type { OracleEnv } from "./env-schema.js";

function logRouteError(route: string, err: unknown): void {
  console.log(
    JSON.stringify({
      level: "error",
      msg: `${route} error`,
      error: err instanceof Error ? err.message : String(err),
      route,
    }),
  );
}

function badRequest(res: Response, message: string): void {
  res.status(HTTP.BAD_REQUEST).json({ error: message });
}

// Caps issued ownership proofs so they cannot be valid far into the future.
const MAX_OWNERSHIP_VALIDITY_SECONDS = 10n * 365n * 24n * 3600n;

export interface ServerConfig {
  signer: TeeSigner;
  storage: StorageAdapter;
  bind: string;
  port: number;
  env?: OracleEnv;
}

export function startServer(config: ServerConfig): {
  app: Express;
  httpServer: import("node:http").Server;
} {
  const app = express();
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: [
            "'self'",
            config.env?.AXIOM_FRONTEND_URL ?? "http://localhost:5173",
          ],
        },
      },
    }),
  );
  app.use(
    cors({ origin: config.env?.AXIOM_FRONTEND_URL ?? "http://localhost:5173" }),
  );
  app.use(rateLimit({ windowMs: 60_000, max: 100 }));
  app.use(express.json({ limit: "1mb" }));
  app.use(createApiKeyAuth(config.env?.AXIOM_API_KEY, ["/health"], process.env.AXIOM_DISABLE_AUTH === "true", process.env.AXIOM_CLIENT_API_KEY));
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
      const {
        oldDataHash,
        oldDataUri,
        targetPubkey64,
        accessProofNonce,
        ownershipProofNonce,
        oldDataEncryptionKey,
        to: toIn,
        nft: nftIn,
      } = transferValiditySchema.parse(req.body);

      if (!oldDataHash || !oldDataUri || !targetPubkey64) {
        return badRequest(res, "Missing required field");
      }
      if (targetPubkey64.length !== 130) {
        return badRequest(
          res,
          "targetPubkey64 must be 64 bytes (128 hex chars)",
        );
      }
      // Bind URI to claimed hash (storage root identity).
      const normHash = String(oldDataHash).toLowerCase().replace(/^0x/, "");
      const normUri = String(oldDataUri).toLowerCase().replace(/^0x/, "");
      if (normHash !== normUri) {
        return badRequest(
          res,
          "oldDataUri must equal oldDataHash (blob root binding)",
        );
      }

      const sealedDek = (req.body as { sealedDataEncryptionKey?: string })
        ?.sealedDataEncryptionKey;
      const allowCleartext =
        process.env.AXIOM_ALLOW_CLEARTEXT_DEK === "true" &&
        process.env.NODE_ENV !== "production";

      let oldDataKey: Buffer;
      if (typeof sealedDek === "string" && sealedDek.length > 0) {
        // ECIES-sealed DEK to the TEE/oracle private key (preferred).
        const sealedBytes = Buffer.from(
          sealedDek.startsWith("0x") ? sealedDek.slice(2) : sealedDek,
          sealedDek.startsWith("0x") ? "hex" : "base64",
        );
        const opened = unsealKeyForReceiver(
          signer.privateKeyBytes,
          new Uint8Array(sealedBytes),
        );
        oldDataKey = Buffer.from(opened);
      } else if (oldDataEncryptionKey && allowCleartext) {
        oldDataKey = Buffer.from(oldDataEncryptionKey, "base64");
      } else if (oldDataEncryptionKey && !allowCleartext) {
        return badRequest(
          res,
          "cleartext oldDataEncryptionKey rejected; send sealedDataEncryptionKey (ECIES to oracle pubkey from GET /health)",
        );
      } else {
        return badRequest(
          res,
          "sealedDataEncryptionKey is required (ECIES-seal the 32-byte DEK to oracle uncompressed pubkey)",
        );
      }

      const oldBlob = await Promise.race([
        storage.download(oldDataUri as `0x${string}`),
        new Promise<Uint8Array>((_, reject) =>
          setTimeout(
            () => reject(new Error("storage.download timed out after 20000ms")),
            20_000,
          ),
        ),
      ]);
      const oldEnc = parseEncrypted(oldBlob);

      if (oldDataKey.length !== 32) {
        res.status(HTTP.BAD_REQUEST).json({
          error: "data encryption key must be 32 bytes after unseal",
        });
        return;
      }
      const oldPlaintext = aesGcmDecrypt(oldDataKey, oldEnc);

      const newDataKey = new Uint8Array(randomBytes(32));
      const newEnc = aesGcmEncrypt(newDataKey, oldPlaintext);
      const newBlob = concatEncrypted(newEnc);
      const { rootHash: newDataHash } = await storage.upload(newBlob);
      storage.markDataHashSeen(newDataHash);

      const targetPubkeyBytes = hexToBytes(targetPubkey64 as `0x${string}`);
      const sealedKey = sealKeyForReceiver(targetPubkeyBytes, newDataKey);

      const defaultValidUntil = BigInt(Math.floor(Date.now() / 1000)) + 86400n;
      const ownershipSignature = signer.signOwnership({
        dataHash: oldDataHash as `0x${string}`,
        sealedKey: hexlify(sealedKey) as `0x${string}`,
        targetPubkey: targetPubkey64 as `0x${string}`,
        to: toIn as `0x${string}`,
        nft: nftIn as `0x${string}`,
        nonce: toBeHex(BigInt(ownershipProofNonce ?? accessProofNonce ?? 0)) as `0x${string}`,
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
      logRouteError("/v1/transfer-validity", err);
      res.status(HTTP.INTERNAL).json({ error: "Transfer validity check failed" });
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

  app.post(
    "/v1/ownership",
    async (
      req: Request<Record<string, never>, unknown, OwnershipRequestBody>,
      res: Response,
    ) => {
      try {
        let parsedBody;
        try {
          parsedBody = ownershipBodySchema.parse(req.body);
        } catch (err) {
          if (err instanceof ZodError) {
            res
              .status(HTTP.BAD_REQUEST)
              .json({ error: err.issues[0]?.message ?? "Validation error" });
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
          return badRequest(res, "Missing required field");
        }

        if (!storage.hasSeenDataHash(dataHash as `0x${string}`)) {
          res.status(HTTP.BAD_REQUEST).json({
            error: `Unknown dataHash: not previously seen by oracle. POST {dataHash} to /v1/agents/mint first.`,
            dataHash,
          });
          return;
        }

        if (!toIn || !isAddress(toIn)) {
          return badRequest(
            res,
            "'to' address is required and must be a valid non-zero address",
          );
        }
        if (!nftIn || !isAddress(nftIn)) {
          return badRequest(
            res,
            "'nft' address is required and must be a valid non-zero address",
          );
        }

        const defaultValidUntil =
          BigInt(Math.floor(Date.now() / 1000)) + 86400n;
        let validUntil = defaultValidUntil;
        if (rawValidUntil !== undefined) {
          let parsed: bigint | null = null;
          if (typeof rawValidUntil === "bigint") {
            parsed = rawValidUntil;
          } else if (typeof rawValidUntil === "number") {
            if (
              Number.isFinite(rawValidUntil) &&
              Number.isInteger(rawValidUntil) &&
              rawValidUntil > 0
            ) {
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
            return badRequest(res, "Invalid validUntil");
          }
          const maxValidUntil =
            BigInt(Math.floor(Date.now() / 1000)) +
            MAX_OWNERSHIP_VALIDITY_SECONDS;
          validUntil = parsed > maxValidUntil ? maxValidUntil : parsed;
        }

        const ownershipSignature = signer.signOwnership({
          dataHash: dataHash as `0x${string}`,
          sealedKey: sealedKey as `0x${string}`,
          targetPubkey: targetPubkey as `0x${string}`,
          to: toIn as `0x${string}`,
          nft: nftIn as `0x${string}`,
          nonce: toBeHex(BigInt(nonce ?? 0)) as `0x${string}`,
          validUntil,
        });
        res.json({
          signature: ownershipSignature,
          signer: signer.address,
          validUntil: validUntil.toString(),
        });
      } catch (err) {
        logRouteError("/v1/ownership", err);
        res.status(HTTP.INTERNAL).json({ error: "Internal server error" });
      }
    },
  );

  app.post("/v1/agents/mint", (req: Request, res: Response) => {
    try {
      const { dataHash } = mintDataHashSchema.parse(req.body);
      if (!/^0x[0-9a-fA-F]{64}$/.test(dataHash)) {
        return badRequest(
          res,
          "dataHash must be a 32-byte hex string (0x + 64 hex chars)",
        );
      }
      storage.markDataHashSeen(dataHash as `0x${string}`);
      res.json({ ok: true, dataHash, seen: true });
    } catch (err) {
      if (err instanceof ZodError) {
        res
          .status(HTTP.BAD_REQUEST)
          .json({ error: err.issues[0]?.message ?? "Validation error" });
        return;
      }
      throw err;
    }
  });
  Sentry.setupExpressErrorHandler(app);

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : String(err);
    console.log(
      JSON.stringify({
        level: "error",
        msg: "unhandled middleware error",
        error: err instanceof Error ? err.message : String(err),
        code: "INTERNAL_ERROR",
      }),
    );
    const safeMessage =
      message.length > 200 ? message.slice(0, 200) + "..." : message;
    res.status(HTTP.INTERNAL).json({ error: safeMessage, code: "INTERNAL_ERROR" });
  });
  const httpServer = app.listen(config.port, config.bind, () => {
    console.log(
      JSON.stringify({
        level: "info",
        msg: "oracle listening",
        bind: config.bind,
        port: config.port,
      }),
    );
    console.log(
      JSON.stringify({
        level: "info",
        msg: "TEE signer",
        address: signer.address,
      }),
    );
    console.log(
      JSON.stringify({
        level: "warn",
        msg: "SIMULATED TEE: runs in Node.js with cleartext private key. Not Intel TDX/SEV.",
      }),
    );
  });
  return { app, httpServer };
}
