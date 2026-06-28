// @fix F2-A3: Add Zod env schema — indexer currently has NO env validation and reads process.env directly
// @audit-ref: V3-A5 confirmed — no indexer-specific schema exists

export { loadEnv, getEnv, getEnvWithAlias } from "@axiom/config/env";
