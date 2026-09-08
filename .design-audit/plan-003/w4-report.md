# W4 report — consistent 1.5px-stroke icon set on the landing page

Branch: hoplite/plan-003-landing · Scope: `apps/frontend/src/pages/LandingPage.tsx` (PrincipleIcon lives here, not in a separate registry file).

## Icon inventory and decisions

| Icon | Where rendered | Carries meaning? | Decision | strokeWidth 1.5 set at |
| --- | --- | --- | --- | --- |
| Wallet | nav connect button (LandingPage.tsx:109) | yes (Connect CTA affordance) | keep | call site |
| Menu | hamburger trigger (:119) | yes (menu affordance, aria-labelled) | keep | call site |
| CircleHelp + Globe2 | mobile menu items, rendered as `Icon` dispatch (:147) | yes (label each menu entry) | keep | call site, on the shared `<Icon size={16} strokeWidth={1.5} />` (covers both) |
| Wallet | hero Connect CTA (:169) | yes | keep | call site |
| CircleHelp | hero "How it works" ghost CTA (:176) | yes | keep | call site |
| ShieldCheck / FileCheck2 / CreditCard | principle cards via `PrincipleIcon` (:40-42) | yes (visual key per principle) | keep | registry level: a single `common = { size: 18, strokeWidth: 1.5, "aria-hidden": true }` spread inside `PrincipleIcon`, so all three call sites are covered in one place |
| ArrowRight | principle p-links (:208) | yes (affordance on links) | keep | call site |
| Wallet | closing CTA (:247) | yes | keep | call site |
| ReceiptSeal | — | — | zero usage on the landing page, confirmed by grep (only hit is its own definition in `src/components/fx/ReceiptSeal.tsx`; out of scope, file left untouched) | n/a |

No icon on the page was decorative-only duplication of adjacent text; all seven usages were kept. Sizes unchanged (14–18px range as found). No deletions.

## Why call sites rather than changing the default

Icons come from the local lucide-compatible subset `src/components/axiom/icons.tsx`, whose `createLucideIcon` hardcodes `strokeWidth={2}` before `{...props}`. Changing the global default would alter icon weight app-wide (console pages too), which is out of scope, so 1.5 is applied only on landing-page usage. The one exception is `PrincipleIcon`, defined inside LandingPage.tsx itself; setting it there once is the registry-level normalization the task asked for.

## Verification

- `cd /home/eya/og/apps/frontend && bunx tsc --noEmit` → exit 0, clean.
- Grep evidence above: every icon element in LandingPage.tsx (`:40-42` via `common`, `:109`, `:119`, `:147`, `:169`, `:176`, `:208`, `:247`) carries `strokeWidth={1.5}`. There are no other icon renderings on the page; `Logo` is its own component and untouched.
- Files not touched: copy.ts, index.css, fx/, hooks/, ReceiptSeal.tsx. No lint/build/tests run, no git add/commit, .env untouched.
