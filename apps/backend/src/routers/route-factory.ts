import type { Request, Response, NextFunction, Router, Express } from "express";
import { HTTP } from "@axiom/config";
import type { ServerConfig } from "../server.js";
import type { z } from "zod";
import { broadcast } from "../ws/broadcaster.js";
import { sendError } from "../utils/response.js";

interface RouteRegistration {
	method: "GET" | "POST" | "DELETE" | "PUT";
	path: string;
	consumer?: string;
	description?: string;
}

export const REGISTERED_ROUTES: RouteRegistration[] = [];

type AddressKey = keyof NonNullable<ServerConfig["addresses"]>;
export type RouteHandler<T> = (
	parsed: T,
	req: Request,
	res: Response,
	helpers: { id: string; config: ServerConfig },
) => Promise<unknown>;
export interface RouteOptions<S extends z.ZodTypeAny | undefined = undefined> {
	path: string;
	method?: "get" | "post";
	schema?: S;
	requireId?: boolean;
	requireAddress?: AddressKey;
	broadcast?: string;
	consumer?: string;
	description?: string;
}

export function createRoute<S extends z.ZodTypeAny | undefined = undefined>(
	app: Router | Express,
	opts: RouteOptions<S>,
	handler: RouteHandler<S extends z.ZodTypeAny ? z.infer<S> : unknown>,
	config: ServerConfig,
): void {
	const method = opts.method ?? "post";
	const routeFn = method === "get" ? app.get.bind(app) : app.post.bind(app);
	REGISTERED_ROUTES.push({
		method: method.toUpperCase() as "GET" | "POST",
		path: opts.path,
		consumer: opts.consumer,
		description: opts.description,
	});
	routeFn(
		opts.path,
		async (req: Request, res: Response, next: NextFunction) => {
			try {
				if (opts.requireId) {
					const idParam =
						typeof req.params.id === "string" ? req.params.id : null;
					if (!idParam) {
						sendError(res, HTTP.BAD_REQUEST, "Missing id");
						return;
					}
					if (!/^\d+$/.test(idParam)) {
						sendError(res, HTTP.BAD_REQUEST, "Invalid id: must be numeric");
						return;
					}
				}
				if (opts.requireAddress && !config.addresses?.[opts.requireAddress]) {
					sendError(
						res,
						HTTP.SERVICE_UNAVAILABLE,
						`${opts.requireAddress} address not configured`,
						"ADDRESS_NOT_CONFIGURED",
					);
					return;
				}
				const raw = method === "get" ? req.query : (req.body ?? req.query);
				const parsed = opts.schema ? opts.schema.parse(raw) : undefined;
				const id = req.params.id ?? "";
				const result = await handler(
					parsed as S extends z.ZodTypeAny ? z.infer<S> : undefined,
					req,
					res,
					{ id, config },
				);
				if (opts.broadcast && result) {
					broadcast(opts.broadcast, result);
				}
				if (!res.headersSent) {
					res.json(result ?? { ok: true });
				}
			} catch (err) {
				next(err);
			}
		},
	);
}
