import { getChatToolSpec } from "@axiom/config/chat-tools";
import { toolFail, type ToolRuntime } from "./transport.js";
import type { ToolResult } from "./types.js";
import { runReadTool } from "./executors/read.js";
import { runEncodeTool } from "./executors/encode.js";
import { runOrchestrateTool } from "./executors/orchestrate.js";
import { runArchiveTool } from "./executors/archive.js";
import { runSkillTool } from "./executors/skill.js";
import { runAskTool } from "./executors/ask.js";

export async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolRuntime,
): Promise<ToolResult> {
  const spec = getChatToolSpec(name);
  if (!spec) return toolFail(`Unknown tool: ${name}`);
  switch (spec.class) {
    case "read":
      return runReadTool(name, args, ctx);
    case "encode":
      return runEncodeTool(name, args, ctx);
    case "orchestrate":
      return runOrchestrateTool(name, args, ctx);
    case "archive":
      return runArchiveTool(name, args, ctx);
    case "ask":
      return runAskTool(name, args, ctx);
    case "skill":
      return runSkillTool(name, args, ctx);
    default:
      return toolFail(`Unhandled class: ${spec.class}`);
  }
}
