# Subagent Revival Protocol (standing rule, 2026-08-25)

## On any subagent failure/stop

1. NEVER leave a failed subagent idle. Diagnose within the same turn: check `git status`, its report/output files, and its token stats (from the failure payload).
2. Choose the revival lane by what survived on disk:
   - **Finished edits, uncommitted** → coordinator verifies + commits the work directly. No respawn.
   - **Partial edits / incremental report exists** → resume the SAME agent via `resume_from` (keeps its transcript) OR respawn with a brief that points at the on-disk partial state to continue from.
   - **Nothing persisted** (fresh spawn died early) → respawn fresh with the same brief, PLUS: (a) order incremental report writing, (b) order small edit increments early, (c) keep the brief compact — huge transcripts re-sent every turn are what triggers `inference idle timeout` (observed: 9.7M cumulative input tokens before stall).
3. One lane per file-ownership scope. Never run a resumed agent AND a fresh respawn on the same files — that is the only real conflict risk. The failed original stays dead once its replacement owns the scope.

## Conflict hardening (always, when spawning multi-agent)

- Disjoint file-ownership scopes declared in every brief ("you own X, do NOT touch Y — agent Z owns it").
- Fixed contract shapes agreed up-front so concurrent FE/BE agents code against the same interface.
- Every executor writes its report file INCREMENTALLY (edit → append), so any death leaves recoverable state.
- Timed state checks while lanes run; revive immediately on failure or stall (no output progress).
