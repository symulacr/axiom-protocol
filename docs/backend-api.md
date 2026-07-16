# Backend API (code-derived)

See also `GET /v1/routes` at runtime when the server is up.

## Route registration (grep)

```
apps/backend/src/server.ts:39:import { registerAgentRoutes } from "./routers/agents.js";
apps/backend/src/server.ts:40:import { registerEventRoutes } from "./routers/events.js";
apps/backend/src/server.ts:41:import { registerVaultRoutes } from "./routers/vault.js";
apps/backend/src/server.ts:42:import { registerPerformanceRoutes } from "./routers/performance.js";
apps/backend/src/server.ts:43:import { registerOrchestratorRoutes } from "./routers/orchestrator.js";
apps/backend/src/server.ts:73:  { method: "GET", path: "/v1/compute/providers", consumer: "useCompute", description: "List compute providers" },
apps/backend/src/server.ts:74:  { method: "POST", path: "/v1/chat/completions", consumer: "chat-runtime", description: "Stream chat completions" },
apps/backend/src/server.ts:75:  { method: "GET", path: "/v1/routes", consumer: "meta", description: "List mounted routes" },
apps/backend/src/server.ts:78:  { method: "GET", path: "/v1/stream", consumer: "ws", description: "WebSocket event stream (upgrade)" },
apps/backend/src/server.ts:135:  app.use(express.json({ limit: "2mb" }));
apps/backend/src/server.ts:136:  app.use(
apps/backend/src/server.ts:149:  app.use((req, res, next) => {
apps/backend/src/server.ts:156:  app.use((req, res, next) => {
apps/backend/src/server.ts:170:  app.use(
apps/backend/src/server.ts:185:  app.use(
apps/backend/src/server.ts:192:  app.use(
apps/backend/src/server.ts:204:  app.use(
apps/backend/src/server.ts:300:  registerHealthRoutes(app, config, provider, oracle);
apps/backend/src/server.ts:301:  registerComputeRoutes(app, config);
apps/backend/src/server.ts:303:  registerChatRoutes(app, config);
apps/backend/src/server.ts:305:  registerAgentRoutes(app, config, provider, oracle, eip712Domain, nftTc);
apps/backend/src/server.ts:306:  registerMintEncodeRoutes(app, config, provider);
apps/backend/src/server.ts:307:  registerEventRoutes(app, config, getEventStore());
apps/backend/src/server.ts:308:  registerPerformanceRoutes(app, config, getEventStore());
apps/backend/src/server.ts:309:  registerOrchestratorRoutes(app, config, getOrCreateOrchestrator, ogChainId);
apps/backend/src/server.ts:310:  registerArchiveRoutes(app, config);
apps/backend/src/server.ts:311:  registerSkillRoutes(app, config);
apps/backend/src/server.ts:312:  registerMetaRoutes(app, config, ogChainId, startedAt);
apps/backend/src/server.ts:314:  registerPaymentRoutes(app, config, nftTc, provider, getPayment);
apps/backend/src/server.ts:325:    log.info(`Axiom backend v${PKG_VERSION} — ${REGISTERED_ROUTES.length} routes mounted, WS /v1/stream`);
apps/backend/src/server.ts:336:function registerHealthRoutes(
apps/backend/src/server.ts:342:  app.use(
apps/backend/src/server.ts:352:function registerComputeRoutes(app: Express, config: ServerConfig): void {
apps/backend/src/server.ts:353:  app.get(
apps/backend/src/server.ts:354:    "/v1/compute/providers",
apps/backend/src/server.ts:422:  app.get(
apps/backend/src/server.ts:423:    "/v1/config",
apps/backend/src/server.ts:436:function registerChatRoutes(app: Express, config: ServerConfig): void {
apps/backend/src/server.ts:437:  app.post(
apps/backend/src/server.ts:438:    "/v1/chat/completions",
apps/backend/src/server.ts:513:function registerMintEncodeRoutes(
apps/backend/src/server.ts:518:  app.use(createMintEncodeRouter(config, provider));
apps/backend/src/server.ts:521:function registerArchiveRoutes(app: Express, config: ServerConfig): void {
apps/backend/src/server.ts:522:  app.use(createArchiveQueryRouter(config));
apps/backend/src/server.ts:523:  app.use(createArchiveJobsRouter(config));
apps/backend/src/server.ts:526:function registerSkillRoutes(app: Express, config: ServerConfig): void {
apps/backend/src/server.ts:527:  app.use(createSkillRouters(config));
apps/backend/src/server.ts:530:function registerMetaRoutes(
apps/backend/src/server.ts:536:  app.get("/v1/routes", (_req: Request, res: Response) => {
apps/backend/src/server.ts:550:function registerPaymentRoutes(
apps/backend/src/server.ts:561:      path: "/v1/agents/:id/earnings",
apps/backend/src/server.ts:589:      path: "/v1/agents/:id/royalty",
apps/backend/src/server.ts:613:      path: "/v1/payment/config",
apps/backend/src/server.ts:642:      path: "/v1/vaults/:id/execute",
apps/backend/src/server.ts:680:  registerVaultRoutes(paymentRouter, config);
apps/backend/src/server.ts:685:      path: "/v1/agents/:id/metadata",
apps/backend/src/server.ts:712:  app.use(paymentRouter);
apps/backend/src/server.ts:716:  app.use((req: Request, res: Response) => {
apps/backend/src/server.ts:717:    if (req.path.startsWith("/v1/") || req.path.startsWith("/health")) {
apps/backend/src/server.ts:727:  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
apps/backend/src/server.ts:768:    if (url.pathname !== "/v1/stream") {
apps/backend/src/skills/routers.test.ts:19:  app.use(express.json());
apps/backend/src/skills/routers.test.ts:20:  app.use(createSkillRouters(config));
apps/backend/src/skills/routers.test.ts:24:test("registers all 27 skill routes under /v1/skills/", () => {
apps/backend/src/skills/routers.test.ts:26:  const skills = REGISTERED_ROUTES.filter((r) => r.path.startsWith("/v1/skills/"));
apps/backend/src/skills/routers.test.ts:34:    "/v1/skills/evm/wallet",
apps/backend/src/skills/routers.test.ts:35:    "/v1/skills/evm/whale",
apps/backend/src/skills/routers.test.ts:36:    "/v1/skills/stocks/quote",
apps/backend/src/skills/routers.test.ts:37:    "/v1/skills/osint/sec_edgar",
apps/backend/src/skills/routers.test.ts:38:    "/v1/skills/unbroker/analyze",
apps/backend/src/skills/routers.test.ts:39:    "/v1/skills/oss-forensics/investigate",
apps/backend/src/skills/routers.test.ts:40:    "/v1/skills/oss-forensics/audit",
apps/backend/src/skills/routers.test.ts:53:      `http://127.0.0.1:${addr.port}/v1/skills/oss-forensics/investigate`,
apps/backend/src/routers/agents.test.ts:12:import { assertTrustedOracleSigner, registerAgentRoutes } from "./agents.js";
apps/backend/src/routers/agents.test.ts:120:// Build a real express app through registerAgentRoutes with a mocked oracle
apps/backend/src/routers/agents.test.ts:166:  } as unknown as Parameters<typeof registerAgentRoutes>[3];
apps/backend/src/routers/agents.test.ts:169:  app.use(express.json());
apps/backend/src/routers/agents.test.ts:170:  registerAgentRoutes(
apps/backend/src/routers/agents.test.ts:173:    {} as unknown as Parameters<typeof registerAgentRoutes>[2],
apps/backend/src/routers/agents.test.ts:188:test("POST /v1/agents/:id/transfer rejects a malicious oracle (non-trusted signer) with 502", async () => {
apps/backend/src/routers/agents.test.ts:195:    const res = await fetch(`http://127.0.0.1:${addr.port}/v1/agents/1/transfer`, {
apps/backend/src/routers/agents.test.ts:212:test("POST /v1/agents/:id/transfer accepts a legitimate oracle signing with the trusted key", async () => {
apps/backend/src/routers/agents.test.ts:219:    const res = await fetch(`http://127.0.0.1:${addr.port}/v1/agents/1/transfer`, {
apps/backend/src/skills/routers.ts:65:// Every skill route is wired through `skill(...)` + `registerSkillRoutes(...)`.
apps/backend/src/skills/routers.ts:97:function registerSkillRoutes(
apps/backend/src/skills/routers.ts:146:  const resp = await fetch(`${YAHOO_BASE}/v1/test/getcrumb`, {
apps/backend/src/skills/routers.ts:473:  registerSkillRoutes(route, [
apps/backend/src/skills/routers.ts:475:    skill("/v1/skills/evm/wallet", address, "Query EVM wallet native and ERC-20 balances",
apps/backend/src/skills/routers.ts:491:    skill("/v1/skills/evm/multichain", address, "Query wallet balances across multiple EVM chains",
apps/backend/src/skills/routers.ts:508:    skill("/v1/skills/evm/tx", z.object({ hash: z.string() }), "Fetch an EVM transaction and its receipt",
apps/backend/src/skills/routers.ts:516:    skill("/v1/skills/evm/token",
apps/backend/src/skills/routers.ts:531:    skill("/v1/skills/evm/gas",
apps/backend/src/skills/routers.ts:550:    skill("/v1/skills/evm/whale", whaleSchema, "Scan for large (whale) ERC-20 transfers",
apps/backend/src/skills/routers.ts:575:    skill("/v1/skills/evm/contract", address, "Inspect contract code and proxy implementation",
apps/backend/src/skills/routers.ts:592:    skill("/v1/skills/evm/allowance", token, "Check ERC-20 allowances for known DEX spenders",
apps/backend/src/skills/routers.ts:605:    skill("/v1/skills/stocks/quote", symbolSchema, "Real-time stock quote",
apps/backend/src/skills/routers.ts:610:    skill("/v1/skills/stocks/search", searchSchema, "Yahoo Finance symbol search",
apps/backend/src/skills/routers.ts:612:        const data = await yahooFetch<YahooSearchResponse>(`/v1/finance/search`, { q: parsed.query, quotesCount: "8", newsCount: "0" });
apps/backend/src/skills/routers.ts:615:    skill("/v1/skills/stocks/history", historySchema, "Historical price data",
apps/backend/src/skills/routers.ts:627:    skill("/v1/skills/stocks/compare", compareSchema, "Compare multiple stock quotes",
apps/backend/src/skills/routers.ts:635:    skill("/v1/skills/stocks/crypto", cryptoSchema, "Crypto pair quote (e.g. BTC-USD)",
apps/backend/src/skills/routers.ts:642:    skill("/v1/skills/osint/sec_edgar", cikSchema, "SEC EDGAR company submissions lookup",
apps/backend/src/skills/routers.ts:647:    skill("/v1/skills/osint/usaspending", usaspendingSchema, "USASpending.gov federal award search",
apps/backend/src/skills/routers.ts:660:    skill("/v1/skills/osint/ofac_sdn", ofacSchema, "OFAC SDN list name search",
apps/backend/src/skills/routers.ts:666:    skill("/v1/skills/osint/opencorporates", opencorpSchema, "OpenCorporates company search",
apps/backend/src/skills/routers.ts:671:    skill("/v1/skills/osint/entity_resolve", entitySchema, "Resolve whether entity names refer to the same company",
apps/backend/src/skills/routers.ts:683:    skill("/v1/skills/osint/courtlistener", courtSchema, "CourtListener opinions and RECAP search",
apps/backend/src/skills/routers.ts:692:    skill("/v1/skills/unbroker/simulate", unbrokerSchema, "Simulate an ERC-7857 transfer without sending",
apps/backend/src/skills/routers.ts:708:    skill("/v1/skills/unbroker/route", unbrokerSchema, "Compare transfer path options",
apps/backend/src/skills/routers.ts:717:    skill("/v1/skills/unbroker/analyze", unbrokerAnalyzeSchema, "Validate transfer proof and compute safety score",
apps/backend/src/skills/routers.ts:739:    skill("/v1/skills/unbroker/execute", unbrokerSchema, "Execute verified transfer",
apps/backend/src/skills/routers.ts:745:    skill("/v1/skills/oss-forensics/investigate", investigateSchema, "GitHub repo forensics + optional keccak256 bytecode comparison",
apps/backend/src/skills/routers.ts:751:    skill("/v1/skills/oss-forensics/commits", commitsSchema, "Commit history with force-push detection",
apps/backend/src/skills/routers.ts:753:    skill("/v1/skills/oss-forensics/ioc", iocSchema, "IOC regex scan: AWS keys, tokens, private keys, IPs, domains",
apps/backend/src/skills/routers.ts:755:    skill("/v1/skills/oss-forensics/audit", auditSchema, "Dependency manifest audit + storage layout detection",
apps/backend/src/routers/mint-encode.ts:32:      path: "/v1/agents/mint/encode",
apps/backend/src/routers/events.ts:64:        "unauthorized: POST /v1/events requires the dedicated indexer API key",
apps/backend/src/routers/events.ts:70:export function registerEventRoutes(
apps/backend/src/routers/events.ts:79:      path: "/v1/events",
apps/backend/src/routers/events.ts:117:      path: "/v1/events",
```
