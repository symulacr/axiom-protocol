# W3 report — hero copy single-line + closing CTA + calm copy pass

Branch: hoplite/plan-003-landing. Files touched: `apps/frontend/src/lib/copy.ts`, `apps/frontend/src/pages/LandingPage.tsx`. Nothing else touched (no index.css, no fx/, no hooks/).

## Copy diffs (before → after)

### English `landing:`

- `titleLead` + `titleEmphasis` merged into `title`:
  - before: `titleLead: "Own an AI agent."` + `titleEmphasis: "Keep every action accountable."`
  - after: `title: "Ownable AI agents, on 0G."`
- `description`:
  - before: "Mint an agent with a bounded vault. It works inside rules you set."
  - after: "Mint an agent with a bounded vault. It runs only inside rules you set, and every action leaves an on-chain receipt."
- principle bodies:
  - shield: "An on-chain vault with a daily limit. No off-chain guardrails." → "An on-chain vault with a daily limit. Nothing can spend past it — not even us."
  - receipt: "Every signature indexes as a receipt: agent, block, outcome." → "Every signature is indexed as a receipt: which agent, which block, what happened."
  - wallet: "Connect the wallet you already use. No accounts, no emails." → "Connect the wallet you already have. No accounts, no emails, no passwords."
- principle `link`:
  - shield: "Read the spec" — kept (route `developers` exists in routeRegistry.ts:35)
  - receipt: "How receipts work" — kept (route `proofs` exists, routeRegistry.ts:29)
  - wallet: "Wallet options" → `""` (no wallet route exists; routeRegistry routes are "agents", "payments", "proofs", "storage", "developers")
- new `closingCta`: "Mint your first agent."

### French `landing:`

- before: `titleLead: "Possédez des agents IA"` + `titleEmphasis: "qui travaillent pour vous."`
- after: `title: "Des agents IA que vous possédez, sur 0G."`
- `description`: "Mintez un agent sur 0G, mettez vos fonds au travail et gardez le contrôle." → "Mintez un agent avec un coffre plafonné. Il ne s'exécute que dans les règles que vous fixez, et chaque action laisse un reçu on-chain."
- bodies: shield → "Un coffre on-chain avec une limite quotidienne. Rien ne peut dépenser au-delà — nous non plus."; receipt → "Chaque signature est indexée en reçu : quel agent, quel bloc, que s'est-il passé."; wallet → "Connectez le wallet que vous avez déjà. Pas de comptes, pas d'emails, pas de mots de passe."
- wallet `link`: "Options de wallet" → `""` (same no-route reason as en)
- new `closingCta`: "Mintez votre premier agent."

### German `landing:`

- before: `titleLead: "Eigene KI-Agents,"` + `titleEmphasis: "die für dich arbeiten."`
- after: `title: "Eigene KI-Agenten, auf 0G."`
- `description`: "Minte einen Agent auf 0G, lass deine Mittel arbeiten und behalte die Kontrolle." → "Mint einen Agenten mit einem begrenzten Tresor. Er läuft nur innerhalb deiner Regeln, und jede Aktion hinterlässt einen On-Chain-Beleg."
- bodies: shield → "Ein on-chain Tresor mit täglichem Limit. Nichts kann darüber hinaus ausgeben — wir auch nicht."; receipt → "Jede Signatur wird als Beleg indexiert: welcher Agent, welcher Block, was passiert ist."; wallet → "Verbinde das Wallet, das du schon hast. Keine Accounts, keine E-Mails, keine Passwörter."
- wallet `link`: "Wallet-Optionen" → `""`
- new `closingCta`: "Minte deinen ersten Agenten."

### Type interface (~line 115)

`titleLead: string; titleEmphasis: string;` → `title: string;` plus new `closingCta: string;`. Note: `titleLead`/`titleEmphasis` still exist in `notFound` and `lockedHero` blocks — those are separate keys and were deliberately left untouched.

## LandingPage.tsx structure diff

- h1: two-part `<span>{titleLead}</span><br /><i>{titleEmphasis}</i>` → `<h1>{copy.landing.title}</h1>` (line ~161).
- Hero button-row unchanged: Connect wallet (primary, `wallet-cta wallet-cta-hero`) + "How it works" ghost. No other CTAs added.
- Principles cards: `<a className="p-link">` now conditional-rendered with `{p.link !== "" && (...)}`. `PRINCIPLE_HREFS` kept as-is; index mapping still holds for the two rendered links.
- How section: untouched (3 steps).
- New closing CTA section between how-section and footer: `<section className="scroll-section closing-cta">` containing one Button (same primary style/className as hero Connect), label `copy.landing.closingCta`, `onClick={onConnect}`.
- Footer: untouched.

## CSS note

`closing-cta` class has no rules in index.css. The section inherits `.scroll-section` spacing, and the button reuses existing `wallet-cta wallet-cta-hero` styles, so no new CSS was added. If a designer wants the closing CTA centered or padded differently, that needs an index.css rule (out of my file scope).

## Verification (run by me)

- `cd /home/eya/og/apps/frontend && bunx tsc --noEmit` → exit 0, clean.
- `grep -n "titleLead|titleEmphasis" src/pages/LandingPage.tsx` → 0 matches.
- Did not run lint/build/tests, did not commit, did not touch .env, per task constraints.
