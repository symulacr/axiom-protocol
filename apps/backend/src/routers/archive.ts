import { Router } from "express";
import { z } from "zod";
import type { ServerConfig } from "../server.js";
import { createRoute } from "./route-factory.js";
import { archiveUrlSchema } from "../route-schemas.js";
import { queryArchive } from "../services/archive.js";

const archiveQuerySchema = z.object({
	intent: z.enum(["lookup", "confirm", "account", "closest"]).default("lookup"),
	url: archiveUrlSchema.optional(),
	handle: z.string().min(1).max(64).optional(),
	limit: z.coerce.number().int().min(1).max(500).optional(),
	timestamp: z.string().optional(),
	fullList: z.boolean().optional(),
});

export function createArchiveRouter(config: ServerConfig): Router {
	const router = Router();

	/* ── Query route ── */

	createRoute(
		router,
		{
			path: "/v1/archive/query",
			method: "post",
			schema: archiveQuerySchema,
			consumer: "chat-runtime",
			description:
				"Unified archive facade (closest-first lookup, confirm, account)",
		},
		async (parsed) => queryArchive(parsed),
		config,
	);

	return router;
}
