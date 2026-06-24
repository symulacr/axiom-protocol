import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Path to the vendored disperser.proto. */
const PROTO_PATH = join(__dirname, "disperser.proto");

/** Blob processing status. Maps 1:1 to the proto BlobStatus enum. */
export const BlobStatus = {
  UNKNOWN: 0,
  PROCESSING: 1,
  CONFIRMED: 2,
  FAILED: 3,
  FINALIZED: 4,
  INSUFFICIENT_SIGNATURES: 5,
} as const;

export type BlobStatus = (typeof BlobStatus)[keyof typeof BlobStatus];

export interface DisperseBlobResult {
  /** Hex-encoded request ID (unique per request, usable with GetBlobStatus). */
  requestId: string;
  /** Initial blob status (typically PROCESSING). */
  blobStatus: BlobStatus;
}

export interface BlobInfo {
  storageRoot: Uint8Array;
  epoch: number;
  quorumId: number;
}

export interface BlobStatusResult {
  status: BlobStatus;
  info?: BlobInfo;
}

export interface RetrieveBlobResult {
  data: Uint8Array;
}

/** gRPC client for the 0G DA Disperser service. */
export class DaClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any;

  /** @param grpcUrl Host:port of the 0G DA Client gRPC endpoint. */
  constructor(grpcUrl: string) {
    const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
      keepCase: false,
      longs: Number,
      enums: Number,
      defaults: true,
      oneofs: true,
    });
    const protoDescriptor = grpc.loadPackageDefinition(
      packageDefinition,
    ) as Record<string, unknown>;
    const disperserPackage = protoDescriptor["disperser"] as Record<
      string,
      unknown
    >;
    const Disperser = disperserPackage["Disperser"] as new (
      url: string,
      creds: grpc.ChannelCredentials,
    ) => grpc.Client;

    this.client = new Disperser(grpcUrl, grpc.credentials.createInsecure());
  }

  /** Submit a blob to the 0G DA network (async; returns on acceptance). */
  disperseBlob(data: Uint8Array): Promise<DisperseBlobResult> {
    return new Promise((resolve, reject) => {
      this.client["DisperseBlob"](
        { data },
        (err: grpc.ServiceError | null, response: Record<string, unknown>) => {
          if (err) {
            reject(err);
            return;
          }
          const requestIdBuf = response["request_id"] as Uint8Array;
          resolve({
            requestId: Buffer.from(requestIdBuf).toString("hex"),
            blobStatus: response["result"] as BlobStatus,
          });
        },
      );
    });
  }

  /** Poll the processing status of a previously dispersed blob. */
  getBlobStatus(requestIdHex: string): Promise<BlobStatusResult> {
    const requestIdBytes = Buffer.from(requestIdHex, "hex");
    return new Promise((resolve, reject) => {
      this.client["GetBlobStatus"](
        { request_id: requestIdBytes },
        (err: grpc.ServiceError | null, response: Record<string, unknown>) => {
          if (err) {
            reject(err);
            return;
          }
          const infoRaw = response["info"] as Record<string, unknown> | null;
          const status = response["status"] as BlobStatus;
          let info: BlobInfo | undefined;
          if (infoRaw) {
            const header = infoRaw["blob_header"] as Record<
              string,
              unknown
            >;
            info = {
              storageRoot: header["storage_root"] as Uint8Array,
              epoch: header["epoch"] as number,
              quorumId: header["quorum_id"] as number,
            };
          }
          resolve({ status, info });
        },
      );
    });
  }

  /** Poll until terminal state or timeout. */
  async pollUntilFinalized(
    requestIdHex: string,
    pollIntervalMs = 2_000,
    timeoutMs = 120_000,
  ): Promise<BlobStatusResult> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const result = await this.getBlobStatus(requestIdHex);

      switch (result.status) {
        case BlobStatus.FINALIZED:
        case BlobStatus.FAILED:
        case BlobStatus.INSUFFICIENT_SIGNATURES:
          return result;
        case BlobStatus.CONFIRMED:
          // CONFIRMED is almost-terminal; return it so callers can
          // decide whether they need to wait for FINALIZED.
          return result;
        case BlobStatus.PROCESSING:
        case BlobStatus.UNKNOWN:
          // Still processing — wait and retry.
          await sleep(pollIntervalMs);
          continue;
      }
    }

    throw new Error(
      `Blob ${requestIdHex} did not reach terminal state within ${timeoutMs}ms`,
    );
  }

  /** Retrieve a blob by storage root, epoch, and quorum ID. */
  retrieveBlob(
    storageRoot: Uint8Array,
    epoch: number,
    quorumId: number,
  ): Promise<RetrieveBlobResult> {
    return new Promise((resolve, reject) => {
      this.client["RetrieveBlob"](
        {
          storage_root: storageRoot,
          epoch: epoch,
          quorum_id: quorumId,
        },
        (err: grpc.ServiceError | null, response: Record<string, unknown>) => {
          if (err) {
            reject(err);
            return;
          }
          resolve({ data: response["data"] as Uint8Array });
        },
      );
    });
  }

  /** Wait for the gRPC connection to become ready. */
  async waitForReady(timeoutMs = 30_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const deadline = new Date(Date.now() + timeoutMs);
      this.client.waitForReady(deadline, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /** Close the underlying gRPC connection. */
  close(): void {
    this.client.close();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
