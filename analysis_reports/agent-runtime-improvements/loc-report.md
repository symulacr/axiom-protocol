# LOC Report — Agent/Tool/Skill Runtime Improvements

## Totals

| Measure | Lines |
|---|---|
| Baseline (pre-effort, commit `d4fd5fa95`) | 3149 |
| After 21-issue pass (`789f82a03`) | ~2612 |
| Final (this change) | 2756 |
| **Net reduction vs baseline** | **393** |

**Net reduction ≥ 100: PASS (393).**

The baseline is the pre-effort state of the target code files (before the 21-issue
fix pass). The earlier pass removed ~277 lines (catalog compaction + executor
tightening). This change *adds* capability (ask-user tool, structured continue,
capability surfacing, sealedKey dedup) — +144 lines over the earlier pass — while
still netting **−393 lines vs the original baseline**, comfortably above the ≥100 bar.

## Per-file delta (baseline → final)

| file | before | after | delta |
|---|---:|---:|---:|
| run-tool.ts | 32 | 35 | +3 |
| executors/skill.ts | 59 | 91 | +32 |
| executors/encode.ts | 130 | 136 | +6 |
| executors/read.ts | 104 | 108 | +4 |
| executors/archive.ts | 118 | 120 | +2 |
| executors/ask.ts | 0 | 48 | +48 (new) |
| parallel.ts | 40 | 30 | −10 |
| session.ts | 151 | 181 | +30 |
| prompt.ts | 41 | 59 | +18 |
| transport.ts | 55 | 55 | 0 |
| format.ts | 147 | 167 | +20 |
| index.ts | 15 | 22 | +7 |
| types.ts | 26 | 26 | 0 |
| config/chat-tools.ts | 740 | 145 | −595 |
| routers/agents.ts | 385 | 390 | +5 |
| ChatPage.tsx | 1025 | 1062 | +37 |
| chat/tools.ts | 81 | 81 | 0 |
| **TOTAL** | **3149** | **2756** | **−393** |

The dominant reduction is `config/chat-tools.ts` (−595), delivered by the prior
catalog-compaction pass. This change's additions (ask-user executor, autonomy/
compaction helpers, capability surfacing, sealedKey helper) are concentrated and
unit-tested; the only deletion in this change is the `sealedKey` dedup (+5 net,
agents.ts) plus the moved summarizer (frontend −17, runtime +30).

## Excluded from the delta

The inventory (`issue-inventory.md`), `loc-report.md`, `ask-user-research.md`, and
`tools-skills-inventory.md` are markdown evidence and are excluded from the LOC
delta, per the plan.
