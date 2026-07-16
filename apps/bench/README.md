# `@axiom/bench`

k6 load-test scripts and run harness for the Axiom Protocol backend HTTP
API. The k6 binary itself is installed system-wide or via Homebrew; this
package owns the `.js` scripts and the dev tooling (`tsx`, `@types/k6`).

The backend is the **system under test** (SUT). The bench does not need a
`DEPLOYER_PK` — it never signs transactions or uploads to 0G. It only drives
HTTP routes and measures latency / error rate.

## Files

| File                              | Endpoint                          | Profile                          | Threshold                         |
| --------------------------------- | --------------------------------- | -------------------------------- | --------------------------------- |
| `scripts/orchestrator-tick.js`    | `POST /v1/orchestrator/tick`      | 50 RPS, 200 VUs, 60s             | `http_req_failed<0.01`, `p95<2s`  |
| `scripts/health.js`               | `GET  /health`                    | 100 RPS, 100 VUs, 30s            | `http_req_failed<0.01`, `p95<200ms` |
| `scripts/transfer.js`             | `POST /v1/agents/0/transfer`      | 10 RPS, 10 VUs, 30s              | `http_req_failed<0.05`, `p95<3s`  |

## Prerequisites

Install k6. Either of these is fine:

- **macOS** (Homebrew): `brew install k6`
- **Linux** (apt): `sudo apt-key adv --keyserver hurl.it && sudo apt-get install k6` (or use the
  Grafana apt repo: <https://grafana.com/docs/k6/latest/set-up/install-k6/>)
- **Docker**: any Docker daemon will do; we use the official `grafana/k6` image.

`k6` is intentionally **not** an npm dep — it is a native binary, and adding
it to `package.json` would force a fake shim. Install it the way the rest of
the k6 docs assume.

## Environment variables

| Var                   | Default                  | Purpose                                                    |
| --------------------- | ------------------------ | ---------------------------------------------------------- |
| `BENCH_TARGET_URL`    | `http://127.0.0.1:3000`  | Base URL of the running backend (the SUT)                  |
| `BENCH_TEE_SIGNER_PK` | unset                    | If set, the tick script sends a sentinel header so the SUT's signer-oracle path is exercised |

## Run a script

The three equivalent forms below are the k6 canonical invocation patterns
(see [Running k6](https://grafana.com/docs/k6/latest/get-started/running-k6/)):

```bash
# 1. Local k6 binary (preferred for iteration)
cd ~/og
pnpm -F @axiom/bench bench:tick
pnpm -F @axiom/bench bench:health
pnpm -F @axiom/bench bench:transfer

# 2. k6 directly with a custom env var
BENCH_TARGET_URL=http://localhost:3000 k6 run apps/bench/scripts/orchestrator-tick.js

# 3. Docker — pipe the script over stdin, no files mounted
docker run --rm -i grafana/k6 run - < apps/bench/scripts/orchestrator-tick.js
```

`docker run --rm -i grafana/k6 run - < scripts/orchestrator-tick.js` reads
the script from stdin (k6's `-` argument means "read script from stdin" per
[Running k6](https://grafana.com/docs/k6/latest/get-started/running-k6/)),
so no file mount or volume is required. This is the form to use in CI
without installing the binary on the runner.

## Typecheck the package

The k6 scripts are `.js` files, not TypeScript, so `tsc` does not process
them. The package still typechecks so future `.ts` helpers (custom-metric
definitions, response parsers) stay clean:

```bash
cd ~/og/apps/bench
pnpm install
pnpm typecheck
```

## Script conventions

All three scripts follow the same shape — a single `constant-arrival-rate`
executor for fixed RPS, thresholds on the two SLO metrics
(`http_req_failed`, `http_req_duration`), and a per-iteration `check` block
that records per-request outcomes for the end-of-run summary. See
[k6 metrics reference](https://grafana.com/docs/k6/latest/using-k6/metrics/)
for the full list of built-in metrics.

- k6 home: <https://grafana.com/docs/k6/latest/>
- k6/http module: <https://grafana.com/docs/k6/latest/javascript-api/k6-http>
- Constant-arrival-rate executor: <https://grafana.com/docs/k6/latest/using-k6/scenarios/executors/constant-arrival-rate/>
- Thresholds: <https://grafana.com/docs/k6/latest/using-k6/thresholds/>
- Built-in metrics: <https://grafana.com/docs/k6/latest/using-k6/metrics>
