# CODEBASE_AUDIT_PROTOCOL.md

**Version:** 1.0  
**Date:** 2026-06-28  
**Purpose:** Exhaustive, read-only, multi-wave codebase audit system using 7 specialized agents across 4 progressive waves.

---

## 1. Core Philosophy & Strict Rules

This protocol exists to **force deep, exhaustive, non-superficial analysis** of any codebase. It is designed to prevent shortcuts, superficial reviews, and premature conclusions.

### Non-Negotiable Rules (Must Be Strictly Enforced)

1. **Read-Only Mode (Hard Rule)**
   - **Never modify, edit, delete, or refactor any code** during the audit.
   - The only allowed actions are: reading files, tracing logic, analyzing structure, and generating reports.
   - Any agent that attempts to suggest or perform edits during analysis phases will be considered non-compliant.

2. **Exhaustive Research Mandate**
   - Every agent **must** go deep. Superficial analysis is forbidden.
   - "I could not find" is not acceptable without clear evidence of exhaustive search (grep, AST analysis, multiple tracing paths, cross-file validation).
   - Long-running, rich research is expected and encouraged.

3. **No Shortcuts or Assumptions**
   - Never assume code is dead, duplicated, or unused without proof.
   - Never skip modules, files, or functions because they "look simple".
   - Every claim must be backed by concrete evidence (file paths, line numbers, call chains).

4. **Output Discipline**
   - All findings, traces, and conclusions **must** be written into structured Markdown reports.
   - Reports must be detailed, well-organized, and usable by both humans and other agents.

5. **Shared & Reusable Protocol**
   - This protocol is designed to be reused across any codebase (Python, TypeScript, JavaScript, etc.).
   - Agent roles are generalized so the same structure works for different projects.

---

## 2. Overall Structure: 4 Waves × 7 Agents

The audit runs in **4 progressive waves**. Each wave contains **exactly 7 specialized agents**.

Waves must be executed **sequentially** (Wave 1 → Wave 2 → Wave 3 → Wave 4), because later waves build on the knowledge from earlier waves.

| Wave | Name                              | Focus                              | Depth       | Agents |
|------|-----------------------------------|------------------------------------|-------------|--------|
| 1    | Discovery & Architecture Mapping  | High-level system understanding    | High        | 7      |
| 2    | Flow Tracing & Data Lineage       | Execution paths and data movement  | Medium-Deep | 7      |
| 3    | Dead Code & Technical Debt        | Identification of unused elements  | Deep        | 7      |
| 4    | Duplication, Quality & Opportunities | Logic duplication + improvements | Very Deep   | 7      |

**Total:** 28 specialized analysis tracks across the full audit.

---

## 3. Wave Definitions & Agent Roles

### Wave 1: Discovery & Architecture Mapping

**Goal:** Build a complete high-level understanding of the codebase structure and purpose.

| Agent | Role                              | Key Responsibilities |
|-------|-----------------------------------|----------------------|
| W1-A1 | Entry Points Agent                | Identify all entry points (main scripts, APIs, CLI commands, web servers, notebooks, etc.) |
| W1-A2 | Module Structure Agent            | Map folder hierarchy, module responsibilities, and high-level organization |
| W1-A3 | Dependency Graph Agent            | Build import/dependency relationships (internal + external) |
| W1-A4 | Core Domain Logic Agent           | Identify the main business/domain logic areas of the project |
| W1-A5 | Configuration & Environment Agent | Analyze how configuration, environment variables, and secrets are managed |
| W1-A6 | Technology Stack Agent            | Document languages, frameworks, key libraries, and their usage patterns |
| W1-A7 | Documentation Quality Agent       | Evaluate README, inline comments, docstrings, and overall documentation health |

**Wave 1 Output:** `wave-01-architecture-mapping.md`

---

### Wave 2: Flow Tracing & Data Lineage

**Goal:** Trace how control and data actually flow through the system.

| Agent | Role                              | Key Responsibilities |
|-------|-----------------------------------|----------------------|
| W2-A1 | Request / Job Flow Agent          | Trace complete lifecycle of typical requests or background jobs |
| W2-A2 | Module-to-Function Chain Agent    | Map detailed call chains across module and function boundaries |
| W2-A3 | Data Transformation Agent         | Track how data is created, validated, transformed, and persisted |
| W2-A4 | State Management Agent            | Analyze state handling (in-memory, database, cache, session, etc.) |
| W2-A5 | Error & Exception Flow Agent      | Trace how errors and exceptions are raised, caught, and handled |
| W2-A6 | Async & Side-Effect Agent         | Map asynchronous operations, queues, workers, schedulers, and side effects |
| W2-A7 | External Integration Agent        | Deeply analyze all external API/SDK integrations and their usage quality |

**Wave 2 Output:** `wave-02-flow-tracing.md`

---

### Wave 3: Dead Code & Technical Debt Detection

**Goal:** Exhaustively identify all dead, unused, or unreachable code at every level.

| Agent | Role                              | Key Responsibilities |
|-------|-----------------------------------|----------------------|
| W3-A1 | Dead Files & Modules Agent        | Identify completely unused files and modules |
| W3-A2 | Dead Functions & Methods Agent    | Find functions and methods that are never called anywhere |
| W3-A3 | Dead Classes & Components Agent   | Locate unused classes, components, or service classes |
| W3-A4 | Dead Variables & Constants Agent  | Detect unused variables, constants, and configuration values |
| W3-A5 | Dead Imports & Dependencies Agent | Find unused imports and unnecessary external dependencies |
| W3-A6 | Unreachable Code Paths Agent      | Identify code behind conditions that can never evaluate to true |
| W3-A7 | Legacy & Commented Code Agent     | Catalog old, commented-out, deprecated, or abandoned code blocks |

**Wave 3 Output:** `wave-03-dead-code-inventory.md`

---

### Wave 4: Duplication, Quality & Refactoring Opportunities

**Goal:** Find duplicated logic and surface high-value improvement opportunities (while remaining read-only).

| Agent | Role                              | Key Responsibilities |
|-------|-----------------------------------|----------------------|
| W4-A1 | Logic Duplication Agent           | Detect identical or near-identical logic implemented in multiple locations |
| W4-A2 | Module Responsibility Overlap Agent | Identify overlapping or duplicated responsibilities between modules |
| W4-A3 | Integration Quality Agent         | Evaluate how well external SDKs/APIs are integrated (wrapper anti-patterns, etc.) |
| W4-A4 | Code Smells & Anti-Patterns Agent | Catalog common code smells, god classes, tight coupling, and poor design patterns |
| W4-A5 | Documentation & Observability Agent | Assess missing documentation, poor naming, and lack of logging/monitoring |
| W4-A6 | Complexity & Maintainability Agent | Measure and report on cyclomatic complexity, function length, and testability issues |
| W4-A7 | Refactoring Opportunity Agent     | Synthesize findings into concrete, prioritized recommendations (no code changes) |

**Wave 4 Output:** `wave-04-duplication-and-opportunities.md`

---

## 4. Strict Output Requirements

All agents **must** produce reports in Markdown format with the following standards:

- Use clear headings (`##`, `###`)
- Include file paths and line numbers whenever referencing code
- Use tables for structured data (e.g., lists of dead functions, duplication instances)
- Provide evidence for every claim
- End each wave report with a **Summary** and **Key Findings** section
- Use consistent naming: `wave-XX-name.md`

**Final Consolidated Report** (after all 4 waves):
- `FINAL_AUDIT_REPORT.md` — Executive summary + cross-wave insights + prioritized action list

---

## 5. Execution Guidelines (For All Agents)

- Work **exhaustively**. Do not stop at the first few findings.
- Use multiple discovery methods: file system traversal, grep, AST parsing (when available), import analysis, and cross-referencing.
- When tracing, follow both **forward** (what this calls) and **backward** (what calls this) directions.
- If something is unclear, investigate further instead of making assumptions.
- Document **uncertainties** honestly rather than guessing.
- Prioritize depth over speed. Long-running rich research is the expected behavior.

---

## 6. Final Deliverables

After completing all 4 waves, the following files must exist:

1. `wave-01-architecture-mapping.md`
2. `wave-02-flow-tracing.md`
3. `wave-03-dead-code-inventory.md`
4. `wave-04-duplication-and-opportunities.md`
5. `FINAL_AUDIT_REPORT.md` (consolidated executive summary)

All reports must be saved in the same directory as this protocol file or in a dedicated `audit-reports/` folder.

---

## 7. Protocol Enforcement Notes

This protocol is intentionally **strict** to counteract the common tendency of AI agents (and humans) to perform shallow analysis.

- Agents are expected to **challenge** their own initial conclusions.
- "Looks like it might be dead code" is not sufficient — proof via exhaustive tracing is required.
- The goal is not speed. The goal is **truthful, deep understanding** of the codebase.

---

**End of Protocol**

*This file is the single source of truth for the 7×4 Wave Codebase Audit methodology. It should not be modified during an active audit.*
