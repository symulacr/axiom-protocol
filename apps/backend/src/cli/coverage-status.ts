import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const COVERAGE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../.coverage",
);

const MANIFEST_FILES: Record<string, string> = {
  coverage: join(COVERAGE_DIR, "manifest.json"),
  "chat-runtime": join(COVERAGE_DIR, "chat-runtime-manifest.json"),
  "frontend-prod": join(COVERAGE_DIR, "frontend-prod-manifest.json"),
};

type TaskStatus = "pending" | "in_progress" | "done" | "blocked" | "skipped";

type GateStatus = "pending" | "partial" | "met";

interface Manifest {
  version: number;
  plan: string;
  window: { start: string; end: string };
  updatedAt: string;
  currentDay?: number;
  currentPhase?: string;
  currentWave?: string;
  waves?: Array<{
    id: string;
    name: string;
    status: string;
    checkpoint?: string;
    dependsWave?: string;
    agents: Array<{
      id: string;
      role: string;
      status: string;
      tasks: string[];
      fileOwnership: string[];
      prompt?: string;
    }>;
  }>;
  summary: {
    tasksTotal: number;
    tasksDone: number;
    tasksInProgress: number;
    tasksBlocked: number;
    gatesTotal: number;
    gatesMet: number;
  };
  gates: Array<{
    id: string;
    label: string;
    target: string;
    status: GateStatus;
    evidence: string | null;
  }>;
  phases: Array<{
    id: string;
    name: string;
    day: string | number;
    status: string;
  }>;
  blockers: Array<{
    id: string;
    text: string;
    mitigation: string;
    status: "open" | "resolved";
  }>;
  discoveries: Array<{
    id: string;
    topic: string;
    day: number;
    status: string;
  }>;
  tasks: Array<{
    id: string;
    day: number;
    phase: string;
    priority: string;
    title: string;
    status: TaskStatus;
    acceptance: string;
    command: string | null;
    notes: string | null;
    completedAt: string | null;
  }>;
}

function resolveManifestKey(args: string[]): {
  key: string;
  rest: string[];
} {
  const idx = args.indexOf("--manifest");
  if (idx === -1) return { key: "coverage", rest: args };
  const key = args[idx + 1] ?? "coverage";
  const rest = [...args.slice(0, idx), ...args.slice(idx + 2)];
  return { key, rest };
}

function manifestPath(key: string): string {
  const path = MANIFEST_FILES[key];
  if (!path) {
    throw new Error(
      `Unknown manifest "${key}" — use: ${Object.keys(MANIFEST_FILES).join(", ")}`,
    );
  }
  return path;
}

function loadManifest(key: string): Manifest {
  const raw = readFileSync(manifestPath(key), "utf8");
  return JSON.parse(raw) as Manifest;
}

function isWaveManifest(m: Manifest): boolean {
  return (
    m.plan === "CHAT-RUNTIME-PLAN.md" ||
    m.plan === "FRONTEND-PROD-MANIFEST.md" ||
    Boolean(m.currentWave && m.waves?.length)
  );
}

function manifestTitle(m: Manifest): string {
  if (m.plan === "CHAT-RUNTIME-PLAN.md") return "Chat Runtime — Status";
  if (m.plan === "FRONTEND-PROD-MANIFEST.md") return "Frontend Prod — Status";
  return "Coverage Week — Status";
}

function taskScope(m: Manifest, t: Manifest["tasks"][number]): boolean {
  if (isWaveManifest(m)) return true;
  return (t.day ?? 0) >= 1;
}

/** Shared renderer for "current phase"/"today" remaining-task lists. */
function printRemainingTasks(header: string, tasks: Manifest["tasks"]): void {
  if (tasks.length === 0) return;
  console.log(`\n  ${header} — remaining:`);
  for (const t of tasks) {
    const mark =
      t.status === "in_progress" ? "…" : t.status === "blocked" ? "✗" : " ";
    console.log(`  [${mark}] ${t.id} ${t.title}`);
    if (t.command) console.log(`      $ ${t.command}`);
  }
}

function recomputeSummary(m: Manifest): void {
  const scoped = m.tasks.filter((t) => taskScope(m, t));
  m.summary.tasksTotal = scoped.length;
  m.summary.tasksDone = scoped.filter((t) => t.status === "done").length;
  m.summary.tasksInProgress = scoped.filter(
    (t) => t.status === "in_progress",
  ).length;
  m.summary.tasksBlocked = scoped.filter((t) => t.status === "blocked").length;
  m.summary.gatesTotal = m.gates.length;
  m.summary.gatesMet = m.gates.filter((g) => g.status === "met").length;
  if (m.waves?.length) {
    const summary = m.summary as Manifest["summary"] & {
      wavesTotal?: number;
      wavesDone?: number;
    };
    summary.wavesTotal = m.waves.length;
    summary.wavesDone = m.waves.filter((w) => w.status === "done").length;
  }
  m.updatedAt = new Date().toISOString();
}

function saveManifest(key: string, m: Manifest): void {
  recomputeSummary(m);
  writeFileSync(manifestPath(key), `${JSON.stringify(m, null, 2)}\n`, "utf8");
}

function printDashboard(key: string, m: Manifest): void {
  recomputeSummary(m);
  const pct =
    m.summary.tasksTotal > 0
      ? Math.round((m.summary.tasksDone / m.summary.tasksTotal) * 100)
      : 0;

  const title = manifestTitle(m);
  const cursor = isWaveManifest(m)
    ? `Wave ${m.currentWave ?? m.currentPhase ?? "?"}`
    : `Day ${m.currentDay ?? "?"}`;

  console.log("\n============================================");
  console.log(`  ${title}`);
  console.log(`  ${m.window.start} → ${m.window.end}  ·  ${cursor}`);
  console.log("============================================");
  console.log(
    `  Tasks: ${m.summary.tasksDone}/${m.summary.tasksTotal} done (${pct}%)` +
      `  |  in_progress: ${m.summary.tasksInProgress}` +
      `  |  blocked: ${m.summary.tasksBlocked}`,
  );
  console.log(
    `  Gates: ${m.summary.gatesMet}/${m.summary.gatesTotal} met` +
      `  |  updated: ${m.updatedAt.slice(0, 19)}`,
  );

  const openBlockers = m.blockers.filter((b) => b.status === "open");
  if (openBlockers.length > 0) {
    console.log("\n  Blockers:");
    for (const b of openBlockers) {
      console.log(`  ⚠ ${b.id}: ${b.text}`);
      console.log(`    → ${b.mitigation}`);
    }
  }

  console.log("\n  Gates:");
  for (const g of m.gates) {
    const icon = g.status === "met" ? "✓" : g.status === "partial" ? "◐" : "○";
    console.log(`  ${icon} ${g.id}: ${g.label} [${g.status}]`);
    if (g.evidence) console.log(`      ${g.evidence}`);
  }

  const inProgress = m.tasks.filter(
    (t) => t.status === "in_progress" && taskScope(m, t),
  );
  if (inProgress.length > 0) {
    console.log("\n  In progress:");
    for (const t of inProgress) {
      console.log(`  → ${t.id} ${t.title}`);
    }
  }

  const blocked = m.tasks.filter(
    (t) => t.status === "blocked" && taskScope(m, t),
  );
  if (blocked.length > 0) {
    console.log("\n  Blocked:");
    for (const t of blocked) {
      console.log(`  ✗ ${t.id} ${t.title}`);
      if (t.notes) console.log(`      ${t.notes}`);
    }
  }

  if (isWaveManifest(m) && m.waves?.length) {
    const summary = m.summary as { wavesTotal?: number; wavesDone?: number };
    if (summary.wavesTotal) {
      console.log(
        `  Waves: ${summary.wavesDone ?? 0}/${summary.wavesTotal} done`,
      );
    }
    const wave = m.waves.find((w) => w.id === m.currentWave);
    if (wave) {
      console.log(`\n  Current wave ${wave.id}: ${wave.name} [${wave.status}]`);
      if (wave.checkpoint) console.log(`  Checkpoint: ${wave.checkpoint}`);
      console.log("  Agents (spawn in parallel — disjoint files):");
      for (const a of wave.agents) {
        const icon =
          a.status === "done" ? "✓" : a.status === "in_progress" ? "…" : "○";
        const files = a.fileOwnership.length
          ? a.fileOwnership.join(", ")
          : "(run only)";
        console.log(`  ${icon} ${a.id} [${a.role}] tasks=${a.tasks.join(",")}`);
        console.log(`      files: ${files}`);
        if (a.prompt && a.status !== "done") {
          console.log(`      → ${a.prompt}`);
        }
      }
    }
  } else if (isWaveManifest(m) && m.currentPhase) {
    const phaseTasks = m.tasks.filter(
      (t) =>
        (t as { phase?: string }).phase === m.currentPhase &&
        t.status !== "done",
    );
    printRemainingTasks(`Current phase (${m.currentPhase})`, phaseTasks);
  } else if (m.currentDay) {
    const dayTasks = m.tasks.filter(
      (t) => t.day === m.currentDay && t.status !== "done",
    );
    printRemainingTasks(`Today (Day ${m.currentDay})`, dayTasks);
  }

  const manifestFile =
    key === "chat-runtime"
      ? "chat-runtime-manifest.json"
      : key === "frontend-prod"
        ? "frontend-prod-manifest.json"
        : "manifest.json";
  console.log(`\n  Manifest: apps/backend/.coverage/${manifestFile}`);
  console.log(`  Plan:     apps/backend/${m.plan}`);
  console.log("");
}

function findTask(m: Manifest, id: string) {
  const t = m.tasks.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown task: ${id}`);
  return t;
}

function mustFind<T extends { id: string }>(
  list: T[] | undefined,
  id: string,
  what: string,
): T {
  const hit = list?.find((x) => x.id === id);
  if (!hit) throw new Error(`Unknown ${what}: ${id}`);
  return hit;
}

function main(): void {
  const rawArgs = process.argv.slice(2);
  const { key, rest: args } = resolveManifestKey(rawArgs);
  const m = loadManifest(key);

  if (args.length === 0) {
    printDashboard(key, m);
    return;
  }

  const [cmd, arg1, ...rest] = args;

  switch (cmd) {
    case "done": {
      const t = findTask(m, arg1!);
      t.status = "done";
      t.completedAt = new Date().toISOString().slice(0, 10);
      if (rest.length > 0) t.notes = rest.join(" ");
      console.log(`✓ ${t.id} marked done`);
      break;
    }
    case "progress": {
      const t = findTask(m, arg1!);
      t.status = "in_progress";
      console.log(`… ${t.id} in progress`);
      break;
    }
    case "block": {
      const t = findTask(m, arg1!);
      t.status = "blocked";
      if (rest.length > 0) t.notes = rest.join(" ");
      console.log(`✗ ${t.id} blocked`);
      break;
    }
    case "skip": {
      const t = findTask(m, arg1!);
      t.status = "skipped";
      console.log(`− ${t.id} skipped`);
      break;
    }
    case "day": {
      const d = Number.parseInt(arg1!, 10);
      if (!Number.isFinite(d) || d < 1 || d > 7) {
        throw new Error("day must be 1–7");
      }
      m.currentDay = d;
      console.log(`Current day → ${d}`);
      break;
    }
    case "phase": {
      m.currentPhase = arg1!;
      console.log(`Current phase → ${arg1}`);
      break;
    }
    case "wave": {
      if (!m.waves?.length) throw new Error("Manifest has no waves");
      const w = mustFind(m.waves, arg1!, "wave");
      m.currentWave = arg1!;
      if (rest[0] === "active" || rest[0] === "done") w.status = rest[0];
      console.log(`Current wave → ${arg1} (${w.name})`);
      break;
    }
    case "agent": {
      if (!m.waves?.length) throw new Error("Manifest has no waves");
      const [waveId, agentId, agentStatus] = [arg1, rest[0], rest[1]];
      const w = mustFind(m.waves, waveId!, "wave");
      const a = mustFind(w.agents, agentId!, "agent");
      if (agentStatus === "done" || agentStatus === "in_progress") {
        a.status = agentStatus;
      }
      console.log(`Agent ${agentId} → ${a.status}`);
      break;
    }
    case "resolve": {
      const b = mustFind(m.blockers, arg1!, "blocker");
      b.status = "resolved";
      console.log(`✓ Blocker ${b.id} resolved`);
      break;
    }
    case "gate": {
      const g = mustFind(m.gates, arg1!, "gate");
      const status = rest[0] as GateStatus;
      if (!["pending", "partial", "met"].includes(status)) {
        throw new Error("gate status must be pending|partial|met");
      }
      g.status = status;
      if (rest.length > 1) g.evidence = rest.slice(1).join(" ");
      console.log(`Gate ${g.id} → ${status}`);
      break;
    }
    case "discovery": {
      const d = mustFind(m.discoveries, arg1!, "discovery");
      d.status = rest[0] ?? "done";
      console.log(`Discovery ${d.id} → ${d.status}`);
      break;
    }
    default:
      console.error(`Unknown command: ${cmd}`);
      console.error(
        "Usage: coverage-status [--manifest coverage|chat-runtime|frontend-prod] [done|progress|block|skip|day|phase|wave|agent|resolve|gate|discovery] <id> [notes…]",
      );
      process.exit(1);
  }

  saveManifest(key, m);
  printDashboard(key, m);
}

main();
