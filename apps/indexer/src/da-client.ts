import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Path to the vendored disperser.proto. */
const PROTO_PATH = join(__dirname, "disperser.proto");

/** Maximum blob size per 0G DA spec: 31744 KiB. */
const MAX_BLOB_SIZE_BYTES = 31_744 * 1024; // 32,505,856 bytes

/** Default deadline for DisperseBlob calls (60 seconds). */
const DEFAULT_DISPERSE_DEADLINE_MS = 60_000;
/** Default deadline for status/retrieve calls (30 seconds). */
const DEFAULT_STATUS_DEADLINE_MS = 30_000;

/** Blob processing status. Maps 1:1 to proto BlobStatus enum. */
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
  /** Hex request ID (unique per request, usable with GetBlobStatus). */
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
  constructor(grpcUrl: string, channelOptions?: grpc.ChannelOptions) {
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
      options?: grpc.ChannelOptions,
    ) => grpc.Client;

    const credentials = this.loadCredentials();
    this.client = new Disperser(grpcUrl, credentials, {
      // Reconnect backoff bounds (library handles actual retry loop)
      "grpc.initial_reconnect_backoff_ms": 1_000,
      "grpc.max_reconnect_backoff_ms": 60_000,
      // Keepalive pings to detect dead connections
      "grpc.keepalive_time_ms": 10_000,
      "grpc.keepalive_timeout_ms": 5_000,
      "grpc.keepalive_permit_without_calls": 1,
      // Enable automatic retry for UNAVAILABLE etc.
      "grpc.enable_retries": 1,
      // Message size limits (64 MiB — covers max 31 MiB blob + metadata)
      "grpc.max_send_message_length": 64 * 1024 * 1024,
      "grpc.max_receive_message_length": 64 * 1024 * 1024,
      // Caller overrides
      ...channelOptions,
    });
  }

  private loadCredentials(): grpc.ChannelCredentials {
    const caCertPath = process.env["DA_GRPC_CA_CERT"];
    if (caCertPath) {
      try {
        const caCert = readFileSync(caCertPath);
        return grpc.credentials.createSsl(caCert);
      } catch (err) {
        process.stderr.write(JSON.stringify({
          level: "fatal",
          msg: "Failed to load DA gRPC TLS CA cert",
          path: caCertPath,
          err: err instanceof Error ? err.message : String(err),
        }) + "\n");
        process.exit(1);
      }
    }
    if (process.env["DA_GRPC_TLS_ENABLED"] === "1" || process.env["DA_GRPC_TLS_ENABLED"] === "true") {
      return grpc.credentials.createSsl();
    }
    return grpc.credentials.createInsecure();
  }

  /** Whether the gRPC channel is currently in READY state. */
  get connected(): boolean {
    // getConnectivityState is available on grpc.Client
    const state = this.client.getConnectivityState(false) as grpc.connectivityState;
    return state === grpc.connectivityState.READY;
  }

  /** Submit a blob to the 0G DA network (async; returns on acceptance). */
  disperseBlob(data: Uint8Array, timeoutMs = DEFAULT_DISPERSE_DEADLINE_MS): Promise<DisperseBlobResult> {
    if (data.byteLength > MAX_BLOB_SIZE_BYTES) {
      return Promise.reject(
        new RangeError(
          `Blob size ${data.byteLength} exceeds max ${MAX_BLOB_SIZE_BYTES} bytes (${MAX_BLOB_SIZE_BYTES / 1024 / 1024} MiB)`,
        ),
      );
    }
    return new Promise((resolve, reject) => {
      const deadline = new Date(Date.now() + timeoutMs);
      this.client["DisperseBlob"](
        { data },
        { deadline },
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
  getBlobStatus(requestIdHex: string, timeoutMs = DEFAULT_STATUS_DEADLINE_MS): Promise<BlobStatusResult> {
    const requestIdBytes = Buffer.from(requestIdHex, "hex");
    const deadline = new Date(Date.now() + timeoutMs);
    return new Promise((resolve, reject) => {
      this.client["GetBlobStatus"](
        { request_id: requestIdBytes },
        { deadline },
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
          // almost-terminal; let callers decide if they need FINALIZED
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
    timeoutMs = DEFAULT_STATUS_DEADLINE_MS,
  ): Promise<RetrieveBlobResult> {
    const deadline = new Date(Date.now() + timeoutMs);
    return new Promise((resolve, reject) => {
      this.client["RetrieveBlob"](
        {
          storage_root: storageRoot,
          epoch: epoch,
          quorum_id: quorumId,
        },
        { deadline },
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
