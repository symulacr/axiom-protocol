import { Router } from "express";
import { z } from "zod";
import type { ServerConfig } from "../server.js";
import { createRoute } from "./route-factory.js";
import {
  createAccountArchiveJob,
  getArchiveJob,
} from "../services/archive-jobs.js";

const archiveJobCreateSchema = z.object({
  handle: z.string().min(1).max(64),
  limit: z.number().int().min(1).max(500).optional(),
});

export function createArchiveJobsRouter(config: ServerConfig): Router {
  const router = Router();

  createRoute(
    router,
    {
      path: "/v1/archive/jobs/account",
      method: "post",
      schema: archiveJobCreateSchema,
      consumer: "chat-runtime",
      description: "Start async account tweet archive job (poll GET /v1/archive/jobs/:id)",
    },
    async (parsed: { handle: string; limit?: number }) => {
      const job = createAccountArchiveJob(parsed.handle, parsed.limit ?? 100);
      return {
        jobId: job.id,
        status: job.status,
        pollUrl: `/v1/archive/jobs/${job.id}`,
      };
    },
    config,
  );

  createRoute(
    router,
    {
      path: "/v1/archive/jobs/:id",
      method: "get",
      consumer: "chat-runtime",
      description: "Poll async archive job status",
    },
    async (_parsed, req) => {
      const id = String(req.params.id ?? "");
      const job = getArchiveJob(id);
      if (!job) return { error: "job not found", jobId: id };
      return {
        jobId: job.id,
        status: job.status,
        handle: job.handle,
        count: job.snapshots?.length,
        snapshots: job.snapshots,
        error: job.error,
        createdAt: job.createdAt,
        finishedAt: job.finishedAt,
      };
    },
    config,
  );

  return router;
}