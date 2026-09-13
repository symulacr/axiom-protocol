# GitHub Support Request — Immediate Garbage Collection of Unreachable Commits

**To:** GitHub Support (<<https://support.github.com/request> — choose "Repositories" → "Removing sensitive data" or general repository issue)
**Repo:** symulacr/axiom-protocol (public)
**Requester:** repo owner (symulacr)

## Subject

Request immediate garbage collection of unreachable commits after force-push (data removal per docs.github.com "Removing sensitive data from a repository")

## Body

Hello GitHub Support,

I force-pushed to `symulacr/axiom-protocol` (public repository) and need the superseded commits purged from GitHub's servers immediately, per your documentation on removing sensitive data from a repository.

**Current default branch tip (should be the only reachable history):**

- `00d71e4f583a` — feat(v3-w9): swap_tokens/borrow as sponsored chat tools + DeFi calldata gate

**Removed commits still fetchable by SHA (please GC these objects):**

- `a1cad46a9ef8d5f1b11d5c393cab2f81e56475ac` — feat(v3-w11): public FE deployment
- `aafd60f743d71c5d7549ec5faa669cfa81b25082` — chore(v3-w11): track contract tests + deploy scripts

I have already:

1. Force-pushed master so these commits are unreachable from all refs (verified via `git ls-remote`).
2. Confirmed no PRs, issues, or events reference the removed SHAs.

Please run server-side garbage collection / remove the unreachable objects, or advise on the fastest way to invalidate direct-SHA access (`https://github.com/symulacr/axiom-protocol/commit/a1cad46...` currently still resolves).

Note: the removed commits contain internal deployment scripts and infrastructure details I do not want publicly retrievable while the repository remains active.

Thank you.

---

## Filing instructions (for the user)

1. Go to <https://support.github.com/request> (logged in as symulacr)
2. Subject: "Request GC of unreachable commits after force-push — symulacr/axiom-protocol"
3. Paste the body above
4. GitHub typically responds in 1–3 business days; after their GC, direct-SHA URLs return 404.

## Before filing — verify these are the right commits to purge

- a1cad46 = FE deploy config + submission URL fixes (vercel.json, FINAL-SUBMISSION.json, proposal-5 edits)
- aafd60f = 11,976 lines: 20 contract test suites (.t.sol) + 16 deploy/ops scripts + .gitignore change

⚠️ IMPORTANT: these commits contain NO secrets (no private keys, no API tokens). They were reverted per your instruction, not for a security leak. If the goal was just removing them from branch history, that is DONE — the support ticket is only for killing the by-SHA access window (30–90 days of GitHub server-side retention).
