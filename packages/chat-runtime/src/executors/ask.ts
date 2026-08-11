import type { ToolResult } from "../types.js";
import { toolFail, type ToolRuntime } from "../transport.js";

interface AskUserPrompt {
	question: string;
	options: string[];
	multiSelect: boolean;
	selectable: true;
}

const MAX_OPTIONS = 4;
const MAX_LABEL = 80;

// internal — used by runAskTool
function buildAskUserPrompt(args: Record<string, unknown>): AskUserPrompt {
	const question =
		typeof args.question === "string" ? args.question.trim() : "";
	if (!question) throw new Error("ask_user requires a 'question'");
	const raw = Array.isArray(args.options) ? args.options : [];
	const options = raw
		.map((o): string => {
			if (typeof o === "string") return o;
			if (o && typeof o === "object") {
				return String((o as { label?: unknown }).label ?? "");
			}
			return "";
		})
		.map((o) => o.trim())
		.filter(Boolean)
		.slice(0, MAX_OPTIONS)
		.map((o) => (o.length > MAX_LABEL ? o.slice(0, MAX_LABEL) + "…" : o));
	return {
		question,
		options,
		multiSelect: args.multiSelect === true,
		selectable: true,
	};
}

export async function runAskTool(
	_name: string,
	args: Record<string, unknown>,
	_ctx: ToolRuntime,
): Promise<ToolResult> {
	try {
		return {
			ok: true,
			content: JSON.stringify({ ask: true, ...buildAskUserPrompt(args) }),
		};
	} catch (err) {
		return toolFail(err instanceof Error ? err.message : String(err));
	}
}

export function isAskUserResult(result: ToolResult): boolean {
	if (!result.ok) return false;
	try {
		return (JSON.parse(result.content) as Record<string, unknown>).ask === true;
	} catch {
		return false;
	}
}
