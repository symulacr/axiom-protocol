# Deploying `beta.axiom-protocol.xyz` to Vercel

This is the operator runbook for shipping the Axiom Protocol frontend
(a Vite + React 18 SPA) to Vercel as `beta.axiom-protocol.xyz` for the
Wave 10 closed beta. The frontend is a static site only — no Vercel
Functions. The backend, oracle, and broker live on Fly.io and are
reached via the `VITE_BACKEND_URL` env var below.

Canonical references:
- Vercel project configuration (`vercel.json` schema):
  https://vercel.com/docs/project-configuration/vercel-json
- Vercel Vite framework preset (build + output conventions):
  https://vercel.com/docs/frameworks/vite
- Vercel CLI (`vercel deploy` / `vercel --prod`):
  https://vercel.com/docs/cli
- Vercel environment variables (VITE_-prefixed vars are inlined at
  build time by Vite):
  https://vercel.com/docs/environment-variables
- 0G chain ids (used to default the active chain in the dashboard):
  https://docs.0g.ai/ai-context

## 1. Prerequisites (one-time)

- Install the Vercel CLI and log in:
  ```bash
  npm i -g vercel
  vercel login
  ```
- In the Vercel dashboard, create a new project and point it at this
  repo's `apps/frontend` directory. The framework preset auto-detected
  by Vercel should be "Vite"; the `vercel.json` in this folder pins
  it explicitly so the build does not depend on detection.
- Add the `axiom-protocol.xyz` domain (and `beta.axiom-protocol.xyz`
  subdomain) to the project under Settings -> Domains.

## 2. Set the three required environment variables

In Project Settings -> Environment Variables, add these three values
for both **Production** and **Preview** scopes. See
`apps/frontend/.env.vercel.example` for the full list with comments.

| Name                 | Production value                        | Preview value                           |
| -------------------- | --------------------------------------- | --------------------------------------- |
| `VITE_BACKEND_URL`   | `https://api.axiom-protocol.xyz`        | `https://api-preview.axiom-protocol.xyz`|
| `VITE_WC_PROJECT_ID` | WalletConnect Cloud project id          | same value                              |
| `VITE_CHAIN_ID`      | `16661` (Aristotle mainnet)             | `16602` (Galileo testnet)               |

- `VITE_BACKEND_URL` — public URL of the Fly.io-hosted backend. No trailing
  slash. The browser hits `${VITE_BACKEND_URL}/v1/orchestrator/tick` etc.
- `VITE_WC_PROJECT_ID` — WalletConnect Cloud project id from
  https://cloud.walletconnect.com. Without it, WalletConnect-based
  wallets are missing from the RainbowKit modal (MetaMask / Injected
  still work).
- `VITE_CHAIN_ID` — 0G chain id; `16602` = Galileo testnet,
  `16661` = Aristotle mainnet. Picked up by `import.meta.env.VITE_CHAIN_ID`
  in `apps/frontend/src/config/wagmi.ts`.

## 3. Deploy

From the repo root, with `vercel.json` already in `apps/frontend/`:

```bash
# Preview deploy (every push to a non-main branch gets a preview URL).
cd apps/frontend
vercel

# Production deploy to beta.axiom-protocol.xyz.
vercel --prod
```

Or, if you prefer the GitHub integration: push to `main` (or merge the
PR), Vercel picks up the change, runs `pnpm install --frozen-lockfile`
then `pnpm build` (both pinned in `vercel.json`), and publishes the
`dist/` output.

**Expected build time:** 45–90 seconds on a cold cache, 15–30 seconds
on a warm cache. The slow step is `pnpm install`; the `tsc --project
tsconfig.json && vite build` step itself is well under 30 seconds.

## 4. Post-deploy verification

The frontend ships the `HealthBadge` in the header (a small green/red
dot) that pings `${VITE_BACKEND_URL}/v1/health` every 30 s. After deploy,
verify the live site is actually serving the bundle and that the SPA
rewrite works on a hard refresh of a deep link:

```bash
# Root returns the SPA shell (200, HTML, contains the <title>).
curl -fsSI https://beta.axiom-protocol.xyz/

# Deep link serves the SPA shell (no 404 from Vercel; React Router
# takes over after the bundle boots).
curl -fsSI https://beta.axiom-protocol.xyz/agents
curl -fsSI https://beta.axiom-protocol.xyz/market
curl -fsSI https://beta.axiom-protocol.xyz/history
curl -fsSI https://beta.axiom-protocol.xyz/settings

# Bundle assets are reachable and immutable-cached (1y Cache-Control).
curl -fsSI https://beta.axiom-protocol.xyz/assets/$( \
  curl -fsS https://beta.axiom-protocol.xyz/ \
    | grep -oE '/assets/[^"]+\.js' | head -1 | sed 's#/assets/##')
# Expect:  cache-control: public, max-age=31536000, immutable

# Backend health is reachable from the deployed origin (this is what
# the HealthBadge in the header will be polling).
curl -fsS https://api.axiom-protocol.xyz/v1/health
# Expect: {"ok":true,...}
```

Open https://beta.axiom-protocol.xyz/ in a browser:

- The header shows the **green** HealthBadge dot to the right of the
  ConnectButton. A red dot means `${VITE_BACKEND_URL}/v1/health` is not
  reachable — check the env var and the Fly.io backend status.
- ConnectButton opens the RainbowKit modal and lists MetaMask +
  WalletConnect (the WC wallets require `VITE_WC_PROJECT_ID`).
- Navigating to `/agents/1` directly (paste the URL into a new tab)
  loads the AgentDetail page; if the rewrite is missing, Vercel will
  404 on the deep link.

## 5. Rollback

Vercel keeps every deployment. To roll back, go to the project's
Deployments tab, find the last good deploy, and click "Promote to
Production". Alternatively from the CLI:

```bash
vercel rollback
```

## 6. Troubleshooting

- **"Build failed: No Output Directory named 'dist' found"** — Vite
  is not the detected framework, or `buildCommand` is being
  overridden. The `vercel.json` in this folder pins both; if Vercel
  still complains, set "Output Directory" to `dist` manually in
  Project Settings -> General -> Build & Development Settings.
- **HealthBadge is red, but the backend is up** — CORS. The Fly.io
  backend must allow `https://beta.axiom-protocol.xyz` and
  `https://*.vercel.app` as origins. The backend's Express app
  should have `cors({ origin: [/^https:\/\/.*\.vercel\.app$/,
  'https://beta.axiom-protocol.xyz'] })` configured.
- **WC wallets missing from RainbowKit** — `VITE_WC_PROJECT_ID` is
  empty or the default placeholder. Paste the real project id from
  WalletConnect Cloud and redeploy (env var changes require a rebuild
  to take effect because Vite inlines `VITE_*` at build time).
