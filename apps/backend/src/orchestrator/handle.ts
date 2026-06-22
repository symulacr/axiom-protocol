import type { StrategyRunner } from "./index.js";

export type OrchestratorHandle =
  | { readonly state: "uninitialized" }
  | { readonly state: "ready"; runner: StrategyRunner }
  | { readonly state: "errored"; error: Error };

export function createOrchestratorHandle(): OrchestratorHandle {
  return { state: "uninitialized" };
}

export function getRunnerOrThrow(handle: OrchestratorHandle): StrategyRunner {
  switch (handle.state) {
    case "ready": return handle.runner;
    case "uninitialized": throw new Error("Orchestrator not initialized");
    case "errored": throw new Error(`Orchestrator errored: ${handle.error.message}`);
  }
}
