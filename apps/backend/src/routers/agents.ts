import { hexViem, addressViem } from "@axiom/config/types/hex";
import { AGENT_NFT_ABI } from "@axiom/config/abis";
import { z } from "zod";
import type { Express, Request, Response } from "express";
import { ethers } from "ethers";
import type { Hex } from "viem";
import {
  TypedContract,
  type AgentNFTMethods,
} from "@axiom/config/types/contract";
import type { ServerConfig } from "../server.js";
import { sendError, extractErrorMessage, envInt } from "../utils/response.js";
import { TTLCache } from "../utils/response.js";
import { TRANSFER_TOPIC } from "@axiom/config";
import {
  signOwnership,
  transferValidity,
  OracleRequestError,
  type OracleRouteDeps,
} from "../oracle/routes.js";
import { createLogger } from "../utils/logger.js";
import { createRoute } from "./route-factory.js";

const log = createLogger("agents");

const MAX_AGENT_ENUMERATION = 100 as const;
const AGENT_LOG_SCAN_BLOCKS = 50_000;

const mintEncodeSchema = z.object({
  dataDescription: z.string().min(1).max(1024),
  dataHash: hexViem,
  to: addressViem,
});

type MintEncodeBody = z.infer<typeof mintEncodeSchema>;

type AgentNftMintEncodeMethods = {
  mintFee(): Promise<bigint>;
};
import type { Eip712Domain, OwnershipProofInput } from "@axiom/config";
import {
  recoverAccessSigner,
  recoverOwnershipSigner,
  HTTP,
} from "@axiom/config";
import { normalizePubkey64 } from "@axiom/config/crypto/keys";
import { transferBodySchema } from "../route-schemas.js";

function resolveSealedKey(sealedKeyIn: string | undefined): {
  key: `0x${string}`;
  missing: boolean;
} {
  const key = (
    sealedKeyIn && sealedKeyIn.length >= 2
      ? sealedKeyIn
      : "0x" + "00".repeat(32)
  ) as `0x${string}`;
  return { key, missing: !sealedKeyIn || sealedKeyIn.length < 2 };
}

function resolveSealedKeyGuard(
  sealedKeyIn: string | undefined,
  res: Response,
  tokenId: string,
): `0x${string}` | undefined {
  const { key: sealedKeyOrDefault, missing } = resolveSealedKey(sealedKeyIn);
  if (missing) {
    if (process.env.NODE_ENV === "production") {
      sendError(res, HTTP.BAD_REQUEST, "sealedKey is required in production");
      return undefined;
    }
    log.warn(
      "No sealedKey provided, using zero-padded fallback (devnet only)",
      { tokenId },
    );
  }
  return sealedKeyOrDefault;
}

// Verify against the SERVER-CONFIGURED trusted TEE signer (AXIOM_TEE_SIGNER_PK), never the oracle's self-claimed tee.signer: recovering and comparing the actual signer catches a swapped or forged oracle.
export function assertTrustedOracleSigner(
  res: Response,
  signature: Hex,
  input: OwnershipProofInput,
  trustedSigner: Hex,
  domain: Eip712Domain,
): boolean {
  const recovered = recoverOwnershipSigner(signature, input, domain);
  if (recovered.toLowerCase() !== trustedSigner.toLowerCase()) {
    sendError(
      res,
      HTTP.BAD_GATEWAY,
      "oracle ownership signature is not from the configured trusted TEE signer",
      "ORACLE_SIGNATURE_INVALID",
    );
    return false;
  }
  return true;
}

interface OwnershipSignatureRequest {
  dataHash: Hex;
  sealedKey: Hex;
  targetPubkey: Hex;
  to: Hex;
  nft: Hex;
  nonce: Hex;
  validUntil: bigint;
}

// The in-process oracle signs via deps.signer/storage; a client-style oracle
// (e.g. test doubles mirroring the pre-merge HTTP client) exposes signOwnership
// as a method. Prefer the method when present, else the in-process helper.
async function requestOwnershipSignature(
  oracle: OracleRouteDeps,
  args: OwnershipSignatureRequest,
): Promise<{ signature: Hex; signer: Hex }> {
  const client = oracle as unknown as {
    signOwnership?: (
      args: OwnershipSignatureRequest,
    ) => Promise<{ signature: Hex; signer: Hex }>;
  };
  if (typeof client.signOwnership === "function") {
    return client.signOwnership(args);
  }
  return signOwnership(oracle, args);
}

export function registerAgentRoutes(
  app: Express,
  config: ServerConfig,
  provider: ethers.JsonRpcProvider,
  oracle: OracleRouteDeps,
  eip712Domain: Eip712Domain,
  nftTc: TypedContract<AgentNFTMethods> | null,
): void {
  const agentListTtlMs = envInt("AXIOM_AGENT_LIST_CACHE_MS", 120_000);
  const agentCache = new TTLCache<unknown>(agentListTtlMs);
  const mintStatsCache = new TTLCache<unknown>(60_000);

  // Env-required at boot (backendEnvSchema); a missing PK fails loudly here
  // instead of silently zeroing the signer (audit F3.2/M2).
  const teeSignerPk = config.env?.AXIOM_TEE_SIGNER_PK;
  if (!teeSignerPk) throw new Error("AXIOM_TEE_SIGNER_PK required");
  const trustedSigner = ethers.computeAddress(teeSignerPk) as Hex;

  createRoute(
    app,
    {
      path: "/v1/agents",
      method: "get",
      consumer: "agents",
      description: "List owned agents",
    },
    async (_parsed: unknown, req: Request, res: Response) => {
      const owner =
        typeof req.query.owner === "string"
          ? req.query.owner.toLowerCase()
          : undefined;
      if (!owner || !/^0x[0-9a-f]{40}$/i.test(owner)) {
        sendError(res, HTTP.BAD_REQUEST, "Valid owner address required");
        return;
      }
      res.setHeader("Cache-Control", "public, max-age=120");
      const bypassCache =
        req.query.fresh === "1" ||
        req.query.nocache === "1" ||
        req.get("cache-control")?.includes("no-cache");
      if (!bypassCache) {
        const cached = agentCache.get(owner);
        if (cached) {
          res.json(cached);
          return;
        }
      }
      const nftAddr = config.addresses?.agentNft;
      if (!nftAddr) {
        sendError(
          res,
          HTTP.SERVICE_UNAVAILABLE,
          "Agent NFT address not configured",
        );
        return;
      }
      const iface = new ethers.Interface(AGENT_NFT_ABI);
      const balanceHex = await provider.call({
        to: nftAddr,
        data: iface.encodeFunctionData("balanceOf", [owner]),
      });
      const balance = BigInt(balanceHex);
      if (balance === 0n) {
        res.json({ owner, agents: [] });
        return;
      }
      const paddedOwner = ("0x" +
        "00".repeat(12) +
        owner.slice(2)) as `0x${string}`;
      const latest = await provider.getBlockNumber();
      const fromBlock = Math.max(0, latest - AGENT_LOG_SCAN_BLOCKS);
      let transferLogs = await provider.getLogs({
        address: nftAddr,
        fromBlock,
        toBlock: "latest",
        topics: [TRANSFER_TOPIC, null, paddedOwner],
      });
      if (transferLogs.length === 0) {
        try {
          transferLogs = await provider.getLogs({
            address: nftAddr,
            fromBlock: 0,
            toBlock: "latest",
            topics: [TRANSFER_TOPIC, null, paddedOwner],
          });
        } catch {
          // best-effort: a log fetch failure must not abort the owner lookup
        }
      }
      const seen = new Set<bigint>();
      const uniqueTokenIds: bigint[] = [];
      for (const log of transferLogs) {
        const rawTid = log.topics[3];
        if (!rawTid) continue;
        const tokenId = BigInt(rawTid);
        if (seen.has(tokenId)) continue;
        seen.add(tokenId);
        uniqueTokenIds.push(tokenId);
      }
      const ownerResults = await Promise.all(
        uniqueTokenIds.slice(0, MAX_AGENT_ENUMERATION).map(async (tokenId) => {
          const ownerHex = await provider.call({
            to: nftAddr,
            data: iface.encodeFunctionData("ownerOf", [tokenId]),
          });
          const currentOwner = ethers.getAddress("0x" + ownerHex.slice(26));
          return currentOwner.toLowerCase() === owner
            ? { tokenId: tokenId.toString(), owner }
            : null;
        }),
      );
      const tokens: {
        tokenId: string;
        owner: string;
        dataDescription?: string;
      }[] = ownerResults.filter((t): t is NonNullable<typeof t> => t !== null);
      const metadataResults = await Promise.allSettled(
        tokens.map(async (t) => {
          try {
            const dataHex = await provider.call({
              to: nftAddr,
              data: iface.encodeFunctionData("intelligentDatasOf", [
                BigInt(t.tokenId),
              ]),
            });
            const decoded = iface.decodeFunctionResult(
              "intelligentDatasOf",
              dataHex,
            );
            const datas = decoded[0] as Array<{ dataDescription: string }>;
            return datas[0]?.dataDescription ?? "";
          } catch {
            return "";
          }
        }),
      );
      for (let i = 0; i < tokens.length; i++) {
        const result = metadataResults[i];
        if (result && result.status === "fulfilled") {
          const token = tokens[i];
          if (token) token.dataDescription = String(result.value ?? "");
        }
      }
      const result = { owner, agents: tokens };
      agentCache.set(owner, result);
      res.json(result);
    },
    config,
  );

  createRoute(
    app,
    {
      path: "/v1/agents/stats",
      method: "get",
      consumer: "public-seo-hub",
      description:
        "Real on-chain agent registry stats: distinct mints + latest tokenId (60s cache)",
    },
    async (_parsed: unknown, _req: Request, res: Response) => {
      const nftAddr = config.addresses?.agentNft;
      if (!nftAddr) {
        sendError(
          res,
          HTTP.SERVICE_UNAVAILABLE,
          "Agent NFT address not configured",
        );
        return;
      }
      const cached = mintStatsCache.get("global");
      if (cached) {
        res.json(cached);
        return;
      }
      try {
        // Mints are Transfer logs with the zero address as `from` (topic1).
        const zeroPad = "0x" + "0".repeat(64);
        const latest = await provider.getBlockNumber();
        let fromBlock = Math.max(0, latest - AGENT_LOG_SCAN_BLOCKS);
        let mintLogs = await provider.getLogs({
          address: nftAddr,
          fromBlock,
          toBlock: "latest",
          topics: [TRANSFER_TOPIC, zeroPad],
        });
        if (mintLogs.length === 0 && fromBlock > 0) {
          // Registry older than the scan window — pay for the full range.
          fromBlock = 0;
          mintLogs = await provider.getLogs({
            address: nftAddr,
            fromBlock,
            toBlock: "latest",
            topics: [TRANSFER_TOPIC, zeroPad],
          });
        }
        const tokenIds = new Set<bigint>();
        let latestTokenId = 0n;
        for (const logEntry of mintLogs) {
          const rawTid = logEntry.topics[3];
          if (!rawTid) continue;
          const tokenId = BigInt(rawTid);
          tokenIds.add(tokenId);
          if (tokenId > latestTokenId) latestTokenId = tokenId;
        }
        const stats = {
          totalMinted: tokenIds.size,
          latestTokenId: tokenIds.size > 0 ? latestTokenId.toString() : null,
          scannedFromBlock: fromBlock,
        };
        mintStatsCache.set("global", stats);
        res.json(stats);
      } catch (err) {
        sendError(res, HTTP.BAD_GATEWAY, extractErrorMessage(err));
      }
    },
    config,
  );

  createRoute(
    app,
    {
      path: "/v1/agents/:id/transfer",
      method: "post",
      schema: transferBodySchema,
      requireId: true,
      consumer: "agents",
      description: "Transfer agent ownership",
    },
    async (
      parsed: z.infer<typeof transferBodySchema>,
      _req: Request,
      res: Response,
      helpers,
    ) => {
      try {
        const id = helpers.id;
        if (!id) {
          sendError(res, HTTP.BAD_REQUEST, "Missing id");
          return;
        }
        if (!config.addresses?.agentNft) {
          // missing configured address = deployment-state problem (503 ADDRESS_NOT_CONFIGURED), not an internal 500
          sendError(
            res,
            HTTP.SERVICE_UNAVAILABLE,
            "AgentNFT address not configured",
            "ADDRESS_NOT_CONFIGURED",
          );
          return;
        }
        const nft = config.addresses.agentNft;
        const {
          to,
          receiverPubKey64,
          accessProofNonce,
          dataHash: dataHashIn,
          sealedKey: sealedKeyIn,
          oldDataEncryptionKey,
          sealedDataEncryptionKey,
          oldDataUri,
          accessProof,
        } = parsed;

        let dataHash = dataHashIn;
        if (!dataHash && nftTc) {
          try {
            const datas = await nftTc.contract.intelligentDatasOf(BigInt(id));
            dataHash = (datas as { dataHash: string }[])?.[0]?.dataHash as
              `0x${string}` | undefined;
          } catch (err) {
            log.warn("intelligentDatasOf failed for token", {
              tokenId: id,
              error: extractErrorMessage(err),
            });
          }
        }
        if (!dataHash) {
          sendError(
            res,
            HTTP.BAD_REQUEST,
            "Cannot determine dataHash for token",
          );
          return;
        }

        let pk: `0x${string}`;
        try {
          pk = normalizePubkey64(receiverPubKey64);
        } catch {
          sendError(res, HTTP.BAD_REQUEST, "Invalid receiverPubKey64 hex");
          return;
        }

        // Never accept or forward cleartext DEK — only ECIES-sealed to oracle.
        if (oldDataEncryptionKey && !sealedDataEncryptionKey) {
          sendError(
            res,
            HTTP.BAD_REQUEST,
            "cleartext oldDataEncryptionKey rejected; send sealedDataEncryptionKey (ECIES to oracle pubkey from GET {oracle}/health)",
            "CLEARTEXT_DEK_REJECTED",
          );
          return;
        }
        if (!accessProof) {
          const nonce = BigInt(accessProofNonce ?? 0);
          if (oldDataUri && sealedDataEncryptionKey) {
            const rekey = await transferValidity(oracle, {
              oldDataHash: dataHash,
              oldDataUri,
              targetPubkey64: pk,
              accessProofNonce: nonce.toString(),
              sealedDataEncryptionKey,
              to,
              nft,
            });
            const validUntil = BigInt(
              rekey.validUntil ?? Math.floor(Date.now() / 1000) + 86400,
            );
            res.json({
              ok: true,
              stage: "challenge",
              tokenId: id,
              to,
              dataHash,
              oldDataHash: dataHash,
              newDataHash: rekey.newDataHash,
              newDataUri: rekey.newDataUri,
              targetPubkey: pk,
              accessProofNonce: nonce.toString(),
              validUntil: validUntil.toString(),
              sealedKey: rekey.sealedKey,
              ownershipSignature: rekey.ownershipSignature,
              signer: config.signer.address as `0x${string}`,
              rekeyed: true,
            });
            return;
          }
          const validUntil = BigInt(Math.floor(Date.now() / 1000)) + 86400n;
          const sealedKeyOrDefault = resolveSealedKeyGuard(
            sealedKeyIn,
            res,
            id,
          );
          if (!sealedKeyOrDefault) return;
          // Canonical 32-byte nonce hex: the minimal form can drop to an ODD
          // number of hex chars (top nibble zero, ~1/16 of random nonces),
          // which wallets reject as an invalid `bytes` typed-data value.
          // Padding once here keeps the oracle signature, the receiver's
          // EIP-712 digest and the on-chain bytes identical (P4 live find).
          const nonceHex = ethers.zeroPadValue(
            ethers.toBeHex(nonce),
            32,
          ) as `0x${string}`;
          const tee = await requestOwnershipSignature(oracle, {
            dataHash,
            sealedKey: sealedKeyOrDefault,
            targetPubkey: pk,
            to,
            nft,
            nonce: nonceHex,
            validUntil,
          });
          if (
            !assertTrustedOracleSigner(
              res,
              tee.signature,
              {
                dataHash,
                sealedKey: sealedKeyOrDefault,
                targetPubkey: pk,
                to,
                nft,
                nonce: nonceHex,
                validUntil,
              },
              trustedSigner,
              eip712Domain,
            )
          ) {
            return;
          }
          res.json({
            ok: true,
            stage: "challenge",
            tokenId: id,
            to,
            dataHash,
            targetPubkey: pk,
            accessProofNonce: nonce.toString(),
            validUntil: validUntil.toString(),
            ownershipSignature: tee.signature,
            signer: tee.signer,
          });
          return;
        }

        const nonce = BigInt(accessProof.nonce);
        const validUntil = BigInt(accessProof.validUntil);
        const proofDataHash = accessProof.dataHash;
        const proofTargetPubkey = accessProof.targetPubkey;
        if (proofDataHash.toLowerCase() !== dataHash.toLowerCase()) {
          sendError(res, HTTP.BAD_REQUEST, "accessProof dataHash mismatch");
          return;
        }
        if (proofTargetPubkey.toLowerCase() !== pk.toLowerCase()) {
          sendError(res, HTTP.BAD_REQUEST, "accessProof targetPubkey mismatch");
          return;
        }

        const nonceHex = ethers.zeroPadValue(
          ethers.toBeHex(nonce),
          32,
        ) as `0x${string}`;
        const accessInput = {
          dataHash: proofDataHash,
          targetPubkey: proofTargetPubkey,
          to,
          nft,
          nonce: nonceHex,
          validUntil,
        };
        // A malformed/garbage proof hex throws inside ECDSA recovery — surface a
        // readable 400 instead of an opaque 500 INTERNAL_ERROR.
        let accessSigner: `0x${string}`;
        try {
          accessSigner = recoverAccessSigner(
            accessProof.proof,
            accessInput,
            eip712Domain,
          );
        } catch {
          sendError(
            res,
            HTTP.BAD_REQUEST,
            "accessProof.proof is not a valid signature (recovery failed)",
            "ACCESS_PROOF_INVALID",
          );
          return;
        }
        if (accessSigner.toLowerCase() !== to.toLowerCase()) {
          sendError(
            res,
            400,
            "accessProof signer does not match recipient address",
          );
          return;
        }
        const sealedKeyOrDefault = resolveSealedKeyGuard(sealedKeyIn, res, id);
        if (!sealedKeyOrDefault) return;
        const tee = await requestOwnershipSignature(oracle, {
          dataHash: proofDataHash,
          sealedKey: sealedKeyOrDefault,
          targetPubkey: proofTargetPubkey,
          to,
          nft,
          nonce: nonceHex,
          validUntil,
        });
        if (
          !assertTrustedOracleSigner(
            res,
            tee.signature,
            {
              dataHash: proofDataHash,
              sealedKey: sealedKeyOrDefault,
              targetPubkey: proofTargetPubkey,
              to,
              nft,
              nonce: nonceHex,
              validUntil,
            },
            trustedSigner,
            eip712Domain,
          )
        ) {
          return;
        }
        res.json({
          ok: true,
          stage: "final",
          tokenId: id,
          to,
          accessSigner,
          signer: tee.signer,
          accessProof: {
            dataHash: proofDataHash,
            targetPubkey: proofTargetPubkey,
            nonce: nonceHex,
            proof: accessProof.proof,
            validUntil: validUntil.toString(),
          },
          ownershipProof: {
            oracleType: 0,
            dataHash: proofDataHash,
            sealedKey: sealedKeyOrDefault,
            targetPubkey: proofTargetPubkey,
            nonce: nonceHex,
            proof: tee.signature,
            validUntil: validUntil.toString(),
          },
        });
      } catch (err) {
        if (err instanceof OracleRequestError) {
          sendError(res, err.status, err.message);
          return;
        }
        throw err;
      }
    },
    config,
  );

  createRoute(
    app,
    {
      method: "post",
      path: "/v1/agents/mint/encode",
      schema: mintEncodeSchema,
      requireAddress: "agentNft",
      consumer: "useMintEncode",
      description:
        "Encode AxiomAgentNFT mint transaction (value = on-chain mintFee)",
    },
    async (parsed: MintEncodeBody, _req, res, { config: cfg }) => {
      if (!cfg.addresses?.agentNft) {
        sendError(
          res,
          HTTP.SERVICE_UNAVAILABLE,
          "AgentNFT address not configured",
          "ADDRESS_NOT_CONFIGURED",
        );
        return;
      }
      const nftAddr = cfg.addresses.agentNft;
      const nftTc = new TypedContract<AgentNftMintEncodeMethods>(
        nftAddr,
        AGENT_NFT_ABI,
        provider,
      );
      const mintFee = await nftTc.contract.mintFee();
      const data = nftTc.iface.encodeFunctionData("mint", [
        [
          {
            dataDescription: parsed.dataDescription,
            dataHash: parsed.dataHash,
          },
        ],
        parsed.to,
      ]);
      return { to: nftAddr, data, value: mintFee.toString() };
    },
    config,
  );
}
