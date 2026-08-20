/**
 * Axiom Copper Command Deck — typed interface copy.
 * Style reminder: operational, evidence-led, concise; keep copper actions explicit,
 * phosphor states factual, and avoid implying a live wallet or contract call.
 */

export type Locale = "en" | "fr" | "de";
export type CopyFlow =
  "mint" | "payment" | "transfer" | "tick" | "deposit" | "withdraw";

/**
 * Interpolation contract (C-08/C-12): copy NEVER hardcodes a chain name,
 * chain ID or token symbol. Strings that mention them carry `{chainName}` /
 * `{chainId}` / `{nativeSymbol}` placeholders resolved at render time from
 * APP_CHAIN / APP_CHAIN_ID (config/wagmi) or the payment-token hook.
 */
export function interpolate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

export type Copy = {
  localeName: string;
  nav: {
    howItWorks: string;
    connectWallet: string;
    /** Shell navigation labels (sidebar + command palette share these). */
    overview: string;
    agents: string;
    chat: string;
    transactions: string;
    storage: string;
    mint: string;
    payment: string;
    transfer: string;
    tick: string;
    deposit: string;
    withdraw: string;
  };
  /** Shell chrome above/beside the page body (05 FINDING-007). */
  topbar: {
    connected: string;
    notConnected: string;
    operator: string;
    openRail: string;
    network: string;
    oracleLive: string;
    oracleDown: string;
  };
  /** Priority action strip + next-safe-action engine (lib/nextSafeAction). */
  strip: {
    reviewEyebrow: string;
    nextEyebrow: string;
    proofCheckEyebrow: string;
    reviewTitle: (kind: string) => string;
    reviewSummary: string;
    reviewImpact: string;
    fundTitle: (tokenId?: string) => string;
    fundSummary: string;
    fundImpact: string;
    inspectTitle: string;
    inspectSummary: string;
    inspectImpact: string;
    proofReceipt: string;
    proofAgent: string;
    proofRoot: string;
    selectInFlow: string;
    openReview: string;
    whyNow: string;
    seeAllQueue: string;
    prefilledNote: string;
  };
  /** CommandCenter palette (⌘K). */
  command: {
    title: string;
    continueIn: (label: string) => string;
    resumeCurrent: string;
    groupContinue: string;
    groupNextSafeAction: string;
    groupGoTo: string;
    groupRecent: string;
    resultsCount: (count: number) => string;
    placeholder: string;
    emptyTitle: string;
    emptyBody: string;
    hintKeys: string;
  };
  landing: {
    eyebrow: string;
    titleLead: string;
    titleEmphasis: string;
    description: string;
    prototypeNote: string;
    nextSafeAction: string;
    heroTitle: string;
    walletContext: string;
    signatureBoundary: string;
    consoleAccess: string;
    stakingBoundary: string;
    menuGuideHint: string;
    menuDevelopers: string;
    menuDevelopersHint: string;
    stakeTitle: string;
    stripConnectEyebrow: string;
    stripConnectSmall: string;
    stripVerifyEyebrow: string;
    stripVerifySmall: string;
    stripOperateEyebrow: string;
    stripOperateSmall: string;
    stripBoundaryEyebrow: string;
  };
  wallet: {
    connectingTitle: string;
    connectingDescription: string;
    /** Placeholder: `{chainName}` — the TARGET network (APP_CHAIN.name). */
    wrongNetworkTitle: string;
    wrongNetworkDescription: string;
    /** Placeholder: `{chainName}`. */
    switchNetwork: string;
    approveSignature: string;
    rejectSignature: string;
    profileTitle: string;
    profileDescription: string;
    profileHint: string;
    unlockConsole: string;
    rejectedTitle: string;
    rejectedDescription: string;
    retryConnection: string;
    timeoutTitle: string;
    timeoutDescription: string;
  };
  guide: {
    nextStep: string;
    finish: string;
    skip: string;
  };
  /** Recovery404 — says what happened and the safe next step, never what the
   *  page implementation didn't load (02 FINDING-018). */
  notFound: {
    eyebrow: string;
    titleLead: string;
    titleEmphasis: string;
    body: string;
    returnToLanding: string;
    openConsole: string;
    /** document.title for unknown routes. */
    title: string;
  };
  settings: {
    pageEyebrow: string;
    pageTitle: string;
    languageLabel: string;
    languageHint: string;
    localeEnglish: string;
    localeFrench: string;
    localeGerman: string;
    localFixture: string;
    liveWallet: string;
    walletNetwork: string;
    signingContext: string;
    /** Operator profile name editor (03 FINDING-013 — Settings owns renames;
     *  the WalletGate step only ever creates the first value). */
    profileNameLabel: string;
    profileNameSave: string;
    profileNameSaved: string;
    dailyEyebrow: string;
    dailyTitle: string;
    layoutEyebrow: string;
    layoutTitle: string;
    advancedEyebrow: string;
    advancedTitle: string;
    dangerEyebrow: string;
    dangerTitle: string;
    dangerHint: string;
    compactRail: string;
    compactRailHint: string;
    reducedMotion: string;
    reducedMotionHint: string;
    railHidden: string;
    railHiddenHint: string;
    railWidth: string;
    railWidthHint: string;
    density: string;
    densityCalm: string;
    densityDense: string;
    theme: string;
    themeHint: string;
    themeDark: string;
    themeLight: string;
    direction: string;
    directionLtr: string;
    directionRtl: string;
    rowWallet: string;
    rowChain: string;
    rowRpc: string;
    rowConnector: string;
    rowApi: string;
    statusConnected: string;
    statusOffline: string;
    statusSelected: string;
    statusMismatch: string;
    statusChecking: string;
    statusReady: string;
    statusOnline: string;
    shortcutEyebrow: string;
    shortcutTitle: string;
    shortcutHint: string;
    shortcutPalette: string;
    shortcutSurfaces: string;
    shortcutFlows: string;
    diagnosticNote: string;
    replayOnboarding: string;
    resetSurface: string;
    resetConfirmTitle: string;
    resetConfirmBody: string;
    resetConfirmAction: string;
    resetCancel: string;
    reviewStakingBoundary: string;
    lockConsole: string;
  };
  dashboard: {
    eyebrow: string;
    titleLead: string;
    titleEmphasis: string;
    description: string;
    review: (count: number) => string;
    nowReviewEyebrow: string;
    refresh: string;
    managedValue: string;
    agentsOnline: string;
    storageProofs: string;
    liveQueue: string;
    agentRegister: string;
    operatingFleet: string;
    proofLane: string;
    attentionFirst: string;
    allowanceReady: string;
    allowanceDescription: string;
    recentStore: string;
    latestEvidence: string;
    allReceipts: string;
    contextWallet: string;
    contextNetwork: string;
    contextSigner: string;
    contextAttention: string;
    switchRequired: string;
    signerReady: string;
    signerWrong: string;
    noConnector: string;
    attentionCount: (count: number) => string;
    openReviewQueue: string;
    loadingVaults: string;
    agentsScoped: (count: number) => string;
    needReview: (count: number) => string;
    fleetNominal: string;
    eventsIndexed: string;
    /** Live-queue stat subline while the oracle is healthy — describes the
     *  queue, not the plumbing (02 FINDING-010); an outage overrides it. */
    queueAwaiting: string;
    oracleUnreachable: string;
    secondaryTelemetry: string;
    telemetryTitle: string;
    noEvidence: string;
    noEvidenceHint: string;
    registerUnavailable: string;
    noAgents: string;
    noAgentsHint: string;
    mintAgent: string;
    noDescription: string;
    refreshNotice: string;
    agentFundingEyebrow: (tokenId: string) => string;
    paymentAllowanceEyebrow: string;
  };
  /** Live /chat surface (v1 SSE chat). Every rendered string routes through
   *  this section — hardcoded English in ChatPage was the C-11 defect. */
  chat: {
    pageTitle: string;
    /** Placeholder: `{chainName}` — status slot shows the TARGET network. */
    statusOnline: string;
    /** Placeholder: `{chainName}`. */
    statusWrongNetwork: string;
    /** Placeholder: `{chainName}`. */
    wrongNetworkBanner: string;
    newChat: string;
    historyToggle: string;
    emptyTagline: string;
    promptAgents: string;
    promptAgentsHint: string;
    promptMint: string;
    promptMintHint: string;
    promptVault: string;
    /** Placeholder: `{nativeSymbol}`. */
    promptVaultHint: string;
    promptTick: string;
    promptTickHint: string;
    toolsToggle: (count: number) => string;
    toolsBrowse: string;
    toolsHide: string;
    roleYou: string;
    roleAssistant: string;
    roleTool: string;
    toolResultFallback: string;
    questionFallback: string;
    editResend: string;
    regenerate: string;
    regenerateShort: string;
    copyMessage: string;
    copyShort: string;
    /** Inline confirmation after a copy action (every copy confirms — 04
     *  FINDING-006); rendered as the swapped label beside the ✓. */
    copiedMessage: string;
    /** Tool browser: clicking a tool inserts this natural-language prompt
     *  template (trailing space = parameter placeholder), never the raw
     *  snake_case function name (02 FINDING-013). Fallback = tool label. */
    toolPrompts: Record<string, string>;
    discardEditTitle: string;
    keepConversationTitle: string;
    editDiscards: string;
    edit: string;
    cancel: string;
    retry: string;
    dismiss: string;
    assistantResponding: string;
    tickInProgress: string;
    queuedCount: (count: number) => string;
    answerPlaceholder: string;
    placeholder: (assistant: string) => string;
    placeholderStreaming: string;
    send: string;
    queue: string;
    stop: string;
    removeQueued: string;
    routing: string;
    routingHint: string;
    routingAuto: string;
    routingCheapest: string;
    routingVerified: string;
    routingPrivate: string;
    routingPrivateHintOn: string;
    routingPrivateHintOff: string;
    routingChipTitle: string;
    routingSummaryAuto: string;
    routingSummaryCheapest: string;
    routingStatusPinned: (address: string) => string;
    routingStatusCheapest: string;
    routingStatusAuto: string;
    phaseRunning: (names: string, elapsed: number) => string;
    phaseStreaming: (elapsed: number) => string;
    phaseThinking: string;
    phaseWaiting: (elapsed: number) => string;
    historyTitle: string;
    historyNew: string;
    historySearch: string;
    historyEmpty: string;
    historyNoMatch: string;
    historyLoading: string;
    historyRestore: string;
    historyRestoreHint: string;
    historyDelete: (title: string) => string;
    untitledThread: string;
    deletedToast: string;
    undo: string;
    metricsShow: string;
    metricsHide: string;
  };
  storage: {
    eyebrow: string;
    title: string;
    description: string;
    openChat: string;
    adapter: string;
    payload: string;
    fileMeta: string;
    labels: string[];
    note: string;
    provenanceRecord: string;
    whatCanProve: string;
    rootHash: string;
    storageTx: string;
    integrityProof: string;
    encryption: string;
    indexerAge: string;
    download: string;
    available: string;
    notReady: string;
    source: string;
    sourceName: string;
    sourceDescription: string;
    pending: string;
    notIndexed: string;
    fixture: string;
    /** Clear demo banner — the ladder is documentation until a storage
     *  backend exists (03 FINDING-014); no fake progress, no fake hashes. */
    demoNotice: string;
  };
  flows: Record<
    CopyFlow,
    { eyebrow: string; title: string; copy: string; steps: string[] }
  >;
  flowUi: {
    openTransactions: string;
    confirmingReceipt: string;
    ready: string;
    finalEvidence: string;
    inFlight: string;
    simulatedReceipt: string;
    confirmResult: string;
    continueTo: string;
    restart: string;
    simulateReject: string;
    simulateTimeout: string;
    evidenceBoundary: string;
    wallet: string;
    agent: string;
    network: string;
    currentState: string;
    receipt: string;
    awaitingConfirmation: string;
    readyToConfirm: string;
    notCreated: string;
    noLiveCall: string;
    confirming: string;
    /** Proof-timeline step sublabels (C-P2: the ladder localizes with the
     *  steps — these two were the last hardcoded English on flow pages). */
    stepWallet: string;
    stepAuto: string;
  };
  agentDetail: {
    executionSurface: string;
    operatingBalance: string;
    vaultRoute: string;
    dataHash: string;
    overview: string;
    execute: string;
    payments: string;
    activity: string;
    identityProvenance: string;
    agentRecord: string;
    owner: string;
    agentId: string;
    metadataRoot: string;
    lastEvent: string;
    inspectStorageProof: string;
    commandSafeAction: string;
    chooseBoundedOperation: string;
    fundAgent: string;
    depositFunds: string;
    withdrawFunds: string;
    transferProof: string;
    queueTick: string;
    tickQueuedNotice: string;
    commandEvidence: string;
    executeBoundedIntent: string;
    runRecoveryPath: string;
    instruction: string;
    instructionPlaceholder: string;
    instructionHint: string;
    providerRoute: string;
    providerValue: string;
    providerHint: string;
    createTickIntent: string;
    createTickNotice: string;
    cancel: string;
    paymentsActivity: string;
    valueRouteFor: (agent: string) => string;
    token: string;
    allowance: string;
    royalty: string;
    openPaymentFlow: string;
    earnings: string;
    activityFor: (agent: string) => string;
    evidenceTied: string;
  };
  transactions: {
    eyebrow: string;
    title: string;
    description: string;
    refreshState: string;
    refreshNotice: string;
    /** Appended to refreshNotice only when the live event feed is DOWN —
     *  healthy plumbing is never announced (02 FINDING-010). */
    feedDown: string;
    liveQueue: string;
    confirmingNow: string;
    today: string;
    receiptsIndexed: string;
    recovery: string;
    needReview: string;
    confirmedNote: string;
    activitySharedStore: string;
    statefulOperations: string;
    filterAll: string;
    /** Depth-0 review-bucket chip (reverted+rejected+stale) — distinct from
     *  the per-state stale chip (filterStale); they shared one label before. */
    filterReview: string;
    filterStale: string;
    moreFilters: string;
    operation: string;
    hash: string;
    age: string;
    state: string;
    emptyState: string;
    closeReceipt: string;
    transactionHash: string;
    network: string;
    agent: string;
    event: string;
    decodedIndexed: string;
    awaitingFinalEvidence: string;
    openRecovery: string;
    recoveryNotice: string;
    openOperation: string;
  };
  status: Record<string, string>;
  plural: {
    messages: (count: number) => string;
    transactions: (count: number) => string;
    steps: (count: number) => string;
    agents: (count: number) => string;
  };
};

const english: Copy = {
  localeName: "English",
  nav: {
    howItWorks: "How Axiom works",
    connectWallet: "Connect wallet",
    overview: "Overview",
    agents: "Agents",
    chat: "Chat",
    transactions: "Transactions",
    storage: "Storage",
    mint: "Mint",
    payment: "Payment",
    transfer: "Transfer",
    tick: "Tick",
    deposit: "Deposit",
    withdraw: "Withdraw",
  },
  topbar: {
    connected: "connected",
    notConnected: "not connected",
    operator: "operator",
    openRail: "Open rail",
    network: "NETWORK",
    oracleLive: "oracle live",
    oracleDown: "oracle down",
  },
  strip: {
    reviewEyebrow: "NOW / NEEDS REVIEW",
    nextEyebrow: "NEXT SAFE ACTION",
    proofCheckEyebrow: "PROOF CHECK",
    reviewTitle: (kind) => `Review ${kind}`,
    reviewSummary: "Recover the existing receipt before retrying.",
    reviewImpact: "No asset movement until you continue.",
    fundTitle: (tokenId) =>
      tokenId ? `Fund agent #${tokenId}` : "Open payment route",
    fundSummary: "Review an exact ERC-20 allowance before any value moves.",
    fundImpact: "Allowance and payment confirm separately.",
    inspectTitle: "Inspect storage root",
    inspectSummary: "Check the indexed root and integrity state.",
    inspectImpact: "Read-only. No wallet request.",
    proofReceipt: "RECEIPT",
    proofAgent: "AGENT",
    proofRoot: "ROOT",
    selectInFlow: "select in flow",
    openReview: "Open review",
    whyNow: "Why now",
    seeAllQueue: "See all queue",
    prefilledNote: "prefilled, not submitted",
  },
  command: {
    title: "Command Center",
    continueIn: (label) => `Continue in ${label}`,
    resumeCurrent: "Resume current surface",
    groupContinue: "Continue",
    groupNextSafeAction: "Next safe action",
    groupGoTo: "Go to",
    groupRecent: "Recent",
    resultsCount: (count) => `${count} actions`,
    placeholder: "Find action, receipt, or route",
    emptyTitle: "No matching destination",
    emptyBody: "Try a route, receipt hash, or the next safe action.",
    hintKeys: "↑↓ move · ↵ open · esc close",
  },
  landing: {
    eyebrow: "AXIOM / VERIFIED OPERATOR CONSOLE",
    titleLead: "Move with",
    titleEmphasis: "evidence.",
    description:
      "Connect a wallet, review the next operator action and keep its proof beside it. Every state is labeled; this prototype never implies a live transaction.",
    prototypeNote:
      "Prototype mode: wallet, network, signature and transaction boundaries are visible before console access.",
    nextSafeAction: "NEXT SAFE ACTION",
    heroTitle: "Verify the operator before the action.",
    walletContext: "Wallet context",
    signatureBoundary: "Signature boundary",
    consoleAccess: "Console access",
    stakingBoundary: "Staking is not part of Axiom yet.",
    menuGuideHint: "Review the wallet and proof boundary",
    menuDevelopers: "Developers",
    menuDevelopersHint: "Inspect the integration boundary",
    stakeTitle: "0G Stake",
    stripConnectEyebrow: "CONNECT",
    stripConnectSmall: "Connector and address",
    stripVerifyEyebrow: "VERIFY",
    stripVerifySmall: "No gas · no custody",
    stripOperateEyebrow: "OPERATE",
    stripOperateSmall: "Receipts beside action",
    stripBoundaryEyebrow: "BOUNDARY",
  },
  wallet: {
    connectingTitle: "Reading wallet context.",
    connectingDescription:
      "Checking the wallet address, connector and target network.",
    wrongNetworkTitle: "Switch to {chainName}.",
    wrongNetworkDescription:
      "The wallet is connected, but it is on a different network. Switch before signing the access message.",
    switchNetwork: "Switch to {chainName}",
    approveSignature: "Approve signature",
    rejectSignature: "Reject signature",
    profileTitle: "Name the local profile.",
    profileDescription:
      "This label helps you recognize the connected wallet in Axiom. You can change it later in Settings.",
    profileHint: "Saved only as a local prototype preference.",
    unlockConsole: "Unlock console",
    rejectedTitle: "Access was not granted.",
    rejectedDescription:
      "The signature was declined, so the console stayed locked. No transaction was sent.",
    retryConnection: "Retry wallet connection",
    timeoutTitle: "No access was granted.",
    timeoutDescription:
      "The wallet or network did not respond in time. Retry the connection or close this panel.",
  },
  guide: {
    nextStep: "Next step",
    finish: "Finish guide",
    skip: "Skip for now",
  },
  notFound: {
    eyebrow: "404 / PAGE NOT FOUND",
    titleLead: "The route",
    titleEmphasis: "drifted.",
    body: "This page doesn't exist. Nothing was loaded and no wallet action was taken.",
    returnToLanding: "Return to landing",
    openConsole: "Open console",
    title: "Page not found",
  },
  settings: {
    pageEyebrow: "CONTROL PLANE / CONFIGURATION",
    pageTitle: "Settings",
    languageLabel: "Interface language",
    languageHint:
      "Changes labels and plural forms without changing the simulated network.",
    localeEnglish: "English",
    localeFrench: "Français",
    localeGerman: "Deutsch",
    localFixture: "local fixture",
    liveWallet: "live wallet",
    walletNetwork: "WALLET & NETWORK",
    signingContext: "Signing context",
    profileNameLabel: "Operator profile name",
    profileNameSave: "Save name",
    profileNameSaved: "Profile name updated.",
    dailyEyebrow: "DISPLAY / PREFERENCES",
    dailyTitle: "Daily preferences",
    layoutEyebrow: "CONSOLE / LAYOUT",
    layoutTitle: "Console layout",
    advancedEyebrow: "ADVANCED / RARELY USED",
    advancedTitle: "Advanced",
    dangerEyebrow: "DANGER ZONE",
    dangerTitle: "Destructive actions",
    dangerHint:
      "Reset wipes the session, every flow draft and all local receipts. Settings survive.",
    compactRail: "Compact command rail",
    compactRailHint: "Keep labels available while giving work more room.",
    reducedMotion: "Reduced motion",
    reducedMotionHint: "Keep status and guide transitions instant.",
    railHidden: "Rail hidden",
    railHiddenHint: "Reopen from the vertical edge control.",
    railWidth: "Rail width",
    railWidthHint: "drag to tune the command surface.",
    density: "Density",
    densityCalm: "Calm",
    densityDense: "Dense",
    theme: "Surface theme",
    themeHint:
      "Keep operational contrast legible in either working environment.",
    themeDark: "Graphite",
    themeLight: "Paper",
    direction: "Direction",
    directionLtr: "LTR / left to right",
    directionRtl: "RTL / right to left",
    rowWallet: "Wallet",
    rowChain: "Chain",
    rowRpc: "RPC",
    rowConnector: "Connector",
    rowApi: "API",
    statusConnected: "Connected",
    statusOffline: "Offline",
    statusSelected: "Selected",
    statusMismatch: "Mismatch",
    statusChecking: "checking",
    statusReady: "Ready",
    statusOnline: "online",
    shortcutEyebrow: "COMMAND CENTER",
    shortcutTitle: "Keyboard map",
    shortcutHint:
      "Fast paths remain visible; they never bypass wallet, network or signature boundaries.",
    shortcutPalette: "Find actions, agents, receipts and routes",
    shortcutSurfaces: "Open core command surfaces",
    shortcutFlows: "Open execution flows",
    diagnosticNote:
      "Session, chain, RPC and preference state are visible before any action is taken.",
    replayOnboarding: "Replay onboarding",
    resetSurface: "Reset surface",
    resetConfirmTitle: "Reset the surface?",
    resetConfirmBody:
      "This signs you out and wipes every flow draft and local receipt. Your settings are kept. There is no undo.",
    resetConfirmAction: "Reset everything",
    resetCancel: "Cancel",
    reviewStakingBoundary: "Review 0G integration boundary",
    lockConsole: "Lock console",
  },
  dashboard: {
    eyebrow: "OVERVIEW / NEXT SAFE ACTION",
    titleLead: "Keep the",
    titleEmphasis: "surface accountable.",
    description:
      "Four agents, one verified signer context and a transaction trail that never turns pending into success.",
    review: (count) =>
      `${count} agent action${count === 1 ? "" : "s"} require${count === 1 ? "s" : ""} attention.`,
    nowReviewEyebrow: "NOW / REVIEW",
    refresh: "Refresh overview",
    managedValue: "Managed value",
    agentsOnline: "Agents online",
    storageProofs: "Storage proofs",
    liveQueue: "Live queue",
    agentRegister: "AGENT REGISTER / 04",
    operatingFleet: "Operating fleet",
    proofLane: "PROOF LANE / 01",
    attentionFirst: "Attention first",
    allowanceReady: "Allowance is ready for review.",
    // One canonical allowance sentence, shared with the strip (02 FINDING-022).
    allowanceDescription:
      "Review an exact ERC-20 allowance before any value moves.",
    recentStore: "RECENT / SHARED STORE",
    latestEvidence: "Latest evidence",
    allReceipts: "All receipts",
    contextWallet: "WALLET CONTEXT",
    contextNetwork: "NETWORK",
    contextSigner: "SIGNER",
    contextAttention: "ATTENTION",
    switchRequired: "switch required",
    signerReady: "Ready to sign",
    signerWrong: "Wrong network",
    noConnector: "no connector",
    attentionCount: (count) =>
      `${count} action${count === 1 ? "" : "s"} need review`,
    openReviewQueue: "Open review queue",
    loadingVaults: "loading vaults…",
    agentsScoped: (count) => `${count} agent${count === 1 ? "" : "s"} scoped`,
    needReview: (count) => `${count} need review`,
    fleetNominal: "fleet nominal",
    eventsIndexed: "events indexed",
    queueAwaiting: "awaiting confirmation",
    oracleUnreachable: "oracle unreachable",
    secondaryTelemetry: "SECONDARY TELEMETRY",
    telemetryTitle: "Telemetry & recent evidence",
    noEvidence: "No evidence yet",
    noEvidenceHint:
      "Mint an agent or run a payment to create the first receipt.",
    registerUnavailable: "Agent register unavailable",
    noAgents: "No agents yet",
    noAgentsHint: "Mint your first agent to start the fleet.",
    mintAgent: "Mint an agent",
    noDescription: "no description",
    refreshNotice: "Overview refreshed from the live indexers.",
    agentFundingEyebrow: (tokenId) => `AGENT #${tokenId} / FUNDING`,
    paymentAllowanceEyebrow: "PAYMENT / ALLOWANCE",
  },
  chat: {
    pageTitle: "Chat",
    statusOnline: "Online · {chainName}",
    statusWrongNetwork: "Switch to {chainName}",
    wrongNetworkBanner: "Wrong network. Switch wallet to {chainName}.",
    newChat: "New chat",
    historyToggle: "History",
    emptyTagline: "Agents · vaults · ticks. Wallet signs on-chain actions.",
    promptAgents: "My agents",
    promptAgentsHint: "What you own",
    promptMint: "Mint agent",
    promptMintHint: "Wallet signs",
    promptVault: "Vault balance",
    promptVaultHint: "{nativeSymbol} holdings",
    promptTick: "Simulate tick",
    promptTickHint: "Safe dry-run first",
    toolsToggle: (count) => `All ${count} tools`,
    toolsBrowse: "browse ▾",
    toolsHide: "hide ▴",
    roleYou: "You",
    roleAssistant: "Assistant",
    roleTool: "Tool",
    toolResultFallback: "Tool result",
    questionFallback: "Question",
    editResend: "Edit and resend",
    regenerate: "Regenerate reply",
    regenerateShort: "Regenerate",
    copyMessage: "Copy message",
    copyShort: "Copy",
    copiedMessage: "Copied",
    toolPrompts: {
      evm_wallet: "Check my wallet balance and network",
      evm_multichain: "Query this address across chains: ",
      evm_tx: "Build and broadcast a transaction to ",
      evm_token: "Check the token balance of ",
      evm_gas: "Estimate current gas prices",
      evm_whale: "Track large wallet movements above ",
      evm_contract: "Call a contract method on ",
      evm_allowance: "Check the token allowance of ",
      stocks_quote: "Get the latest quote for ",
      stocks_search: "Search tickers for ",
      stocks_history: "Show price history for ",
      stocks_compare: "Compare fundamentals for ",
      stocks_crypto: "Get the crypto market data for ",
      osint_sec_edgar: "Search SEC filings for ",
      osint_usaspending: "Look up federal spending for ",
      osint_ofac_sdn: "Check the sanctions status of ",
      osint_opencorporates: "Look up company registration for ",
      osint_entity_resolve: "Resolve entity references for ",
      osint_courtlistener: "Search court opinions for ",
      list_my_agents: "List my agents",
      vault_balance: "Show the vault balance of agent #",
      agent_metadata: "Show the on-chain metadata of agent #",
      event_history: "Show recent on-chain events for agent #",
      execute_tick: "Execute a strategy tick for agent #",
      simulate_tick: "Dry-run a tick for agent #",
      mint_agent: "Mint a new agent named ",
      deposit: "Deposit funds into the vault of agent #",
      withdraw: "Withdraw funds from the vault of agent #",
      pay_for_agent: "Make a payment to agent #",
      transfer: "Transfer agent # to a new owner",
      archive_lookup: "Look up the archived account ",
      archive_account_tweets: "Show archived tweets from ",
      archive_confirm_deletion: "Confirm deletion of the archived snapshot ",
    },
    discardEditTitle: "Discard the messages after this one and edit",
    keepConversationTitle: "Keep the conversation",
    editDiscards: "Edit discards the rest",
    edit: "Edit",
    cancel: "Cancel",
    retry: "Retry",
    dismiss: "Dismiss",
    assistantResponding: "Assistant is responding",
    tickInProgress: "Tick in progress…",
    queuedCount: (count) => `${count} queued`,
    answerPlaceholder: "Type your answer…",
    placeholder: (assistant) => `Message ${assistant}…`,
    placeholderStreaming: "Queue a follow-up…",
    send: "Send",
    queue: "Queue",
    stop: "Stop",
    removeQueued: "Remove queued message",
    routing: "Routing",
    routingHint: "This conversation only",
    routingAuto: "Auto (fastest)",
    routingCheapest: "Lowest cost",
    routingVerified: "Verified providers only (TEE)",
    routingPrivate: "Private (sealed enclave)",
    routingPrivateHintOn:
      "Sealed enclave inference (prompts never leave the enclave)",
    routingPrivateHintOff: "No sealed-enclave provider serves this model",
    routingChipTitle:
      "Provider routing — change how this conversation is served",
    routingSummaryAuto: "Auto",
    routingSummaryCheapest: "Lowest cost",
    routingStatusPinned: (address) =>
      `Pinned to ${address} — every turn is served by this provider.`,
    routingStatusCheapest:
      "Lowest-cost provider first; the serving provider may change between turns.",
    routingStatusAuto:
      "Fastest provider first; turns stay on one provider so follow-ups are quicker.",
    phaseRunning: (names, elapsed) => `Running ${names}… (${elapsed}s)`,
    phaseStreaming: (elapsed) => `Streaming response… (${elapsed}s)`,
    phaseThinking: "Thinking…",
    phaseWaiting: (elapsed) => `Waiting for model response… (${elapsed}s)`,
    historyTitle: "Chats",
    historyNew: "New",
    historySearch: "Search chats…",
    historyEmpty: "No history yet. Send a message.",
    historyNoMatch: "No matching chats.",
    historyLoading: "Loading server history…",
    historyRestore: "Restore server history",
    historyRestoreHint:
      "Sign a wallet message to load this wallet's server-saved transcripts. No transaction is sent.",
    historyDelete: (title) => `Delete chat: ${title}`,
    untitledThread: "New chat",
    deletedToast: "Chat deleted",
    undo: "Undo",
    metricsShow: "metrics",
    metricsHide: "hide metrics",
  },
  storage: {
    eyebrow: "DATA PROVENANCE / 0G",
    title: "Store the payload, then verify its proof.",
    description:
      "Encryption, root hash, storage transaction, integrity proof and index availability remain separate.",
    openChat: "Open chat transcript",
    adapter: "0G STORAGE ADAPTER",
    payload: "Agent metadata payload",
    fileMeta: "18.4 KB · AES-GCM encrypted · 4 tags",
    labels: [
      "Payload ready",
      "Encrypted",
      "Root hashed",
      "Published",
      "Proof verified",
      "Available",
    ],
    note: "Available appears only after root hash, storage tx, proof and index state are present.",
    provenanceRecord: "PROVENANCE RECORD",
    whatCanProve: "What the UI can prove",
    rootHash: "Root hash",
    storageTx: "Storage tx",
    integrityProof: "Integrity proof",
    encryption: "Encryption",
    indexerAge: "Indexer age",
    download: "Download",
    available: "available",
    notReady: "not ready",
    source: "SOURCE",
    sourceName: "0G Storage SDK / Indexer",
    sourceDescription:
      "Demo mirrors the adapter shape; replication and pinning are not claimed.",
    pending: "pending",
    notIndexed: "not indexed",
    fixture: "demo / not live",
    demoNotice:
      "Demo pipeline — no storage backend is connected yet. The stages below are what a real upload will expose; no state is produced or persisted here.",
  },
  flows: {
    mint: {
      eyebrow: "MINT / PROVENANCE BOUNDARY",
      title: "Mint an agent",
      copy: "Name → hash → oracle acknowledgement → receipt.",
      steps: ["Metadata hash", "Oracle acknowledgement", "Receipt indexed"],
    },
    payment: {
      eyebrow: "PAYMENT / ALLOWANCE ROUTE",
      title: "Fund with context",
      copy: "Token, exact allowance, fee, royalty and event decoding stay visible before completion.",
      steps: [
        "Exact allowance",
        "Approval / payment boundary",
        "Receipt indexed",
      ],
    },
    transfer: {
      eyebrow: "TRANSFER / SIGNED PROOF",
      title: "Transfer with evidence",
      copy: "Challenge → signature → finalization → on-chain receipt. Expiration never disappears.",
      steps: ["Recipient challenge", "Signature boundary", "Receipt indexed"],
    },
    tick: {
      eyebrow: "ORCHESTRATOR / STREAM",
      title: "Run the next tick",
      copy: "Intent → provider → stream → result → event or transaction → recovery.",
      steps: ["Bounded instruction", "Provider route", "Event indexed"],
    },
    deposit: {
      eyebrow: "VAULT / DEPOSIT ROUTE",
      title: "Deposit into the vault",
      copy: "Amount → review → wallet boundary → on-chain receipt. The vault balance stays visible before value moves.",
      steps: ["Amount + balance", "Wallet boundary", "Receipt indexed"],
    },
    withdraw: {
      eyebrow: "VAULT / WITHDRAW ROUTE",
      title: "Withdraw from the vault",
      copy: "Amount → review → wallet boundary → on-chain receipt. The remaining balance is shown before you sign.",
      steps: ["Balance checked", "Wallet boundary", "Receipt indexed"],
    },
  },
  flowUi: {
    openTransactions: "Open transaction center",
    confirmingReceipt: "Confirming receipt…",
    ready: "READY",
    finalEvidence: "FINAL EVIDENCE",
    inFlight: "IN FLIGHT",
    simulatedReceipt: "simulated receipt",
    confirmResult: "Confirm simulated result",
    continueTo: "Continue to",
    restart: "Start this flow again",
    simulateReject: "Simulate reject",
    simulateTimeout: "Simulate timeout",
    evidenceBoundary: "EVIDENCE BOUNDARY",
    wallet: "Wallet",
    agent: "Agent",
    network: "Network",
    currentState: "Current state",
    receipt: "Receipt",
    awaitingConfirmation: "awaiting confirmation",
    readyToConfirm: "ready to confirm",
    notCreated: "not created",
    noLiveCall: "fixture / no live call",
    confirming: "CONFIRMING",
    stepWallet: "Wallet boundary",
    stepAuto: "Observed automatically",
  },
  agentDetail: {
    executionSurface: "operator-controlled execution surface.",
    operatingBalance: "OPERATING BALANCE",
    vaultRoute: "vault route · {chainName}",
    dataHash: "Metadata hash",
    overview: "Overview",
    execute: "Execute",
    payments: "Payments",
    activity: "Activity",
    identityProvenance: "IDENTITY / PROVENANCE",
    agentRecord: "Agent record",
    owner: "Owner",
    agentId: "Agent ID",
    metadataRoot: "Metadata hash",
    lastEvent: "Last event",
    inspectStorageProof: "Inspect storage proof",
    commandSafeAction: "COMMAND / SAFE ACTION",
    chooseBoundedOperation: "Choose a bounded operation.",
    fundAgent: "Fund agent",
    depositFunds: "Deposit to vault",
    withdrawFunds: "Withdraw from vault",
    transferProof: "Transfer proof",
    queueTick: "Queue tick",
    tickQueuedNotice: "Tick request queued in the shared prototype store.",
    commandEvidence:
      "Every action opens its own evidence model and returns to Activity with a receipt.",
    executeBoundedIntent: "EXECUTE / BOUNDED INTENT",
    runRecoveryPath: "Run an operation with a recovery path.",
    instruction: "Instruction",
    instructionPlaceholder: "Evaluate current route",
    instructionHint: "Simulated command; no live provider call.",
    providerRoute: "Provider route",
    providerValue: "Axiom orchestrator",
    providerHint: "Fixture route selected from Settings.",
    createTickIntent: "Create tick intent",
    createTickNotice: "Instruction created. Open Tick to inspect the stream.",
    cancel: "Cancel",
    paymentsActivity: "PAYMENTS / ACTIVITY",
    valueRouteFor: (agent) => `Value route for ${agent}`,
    token: "TOKEN",
    allowance: "ALLOWANCE",
    royalty: "ROYALTY",
    openPaymentFlow: "Open payment flow",
    earnings: "Earnings",
    activityFor: (agent) => `ACTIVITY / ${agent.toUpperCase()}`,
    evidenceTied: "Evidence tied to this agent",
  },
  transactions: {
    eyebrow: "OPERATIONS / RECEIPTS",
    title: "Transaction center",
    description: "Every signature has a state, a source and a recovery path.",
    refreshState: "Refresh state",
    refreshNotice: "Receipt index revalidated. Pending states remain pending.",
    feedDown: "Live event feed offline — polling instead.",
    liveQueue: "LIVE QUEUE",
    confirmingNow: "confirming now",
    today: "TODAY",
    receiptsIndexed: "receipts indexed",
    recovery: "RECOVERY",
    needReview: "need review",
    confirmedNote:
      "Confirmed means receipt observed and event decoded. Pending never collapses into success.",
    activitySharedStore: "ACTIVITY / SHARED STORE",
    statefulOperations: "Stateful operations",
    filterAll: "All",
    filterReview: "Needs review",
    filterStale: "Stale",
    moreFilters: "More filters",
    operation: "OPERATION",
    hash: "HASH",
    age: "AGE",
    state: "STATE",
    emptyState:
      "No receipts match this state. The shared store has no hidden items.",
    closeReceipt: "Close receipt",
    transactionHash: "Transaction hash",
    network: "Network",
    agent: "Agent",
    event: "Event",
    decodedIndexed: "decoded + indexed",
    awaitingFinalEvidence: "awaiting final evidence",
    openRecovery: "Open recovery",
    recoveryNotice: "Recovery opened. Operation returned to Ready.",
    openOperation: "Open operation",
  },
  status: {
    ready: "Ready to start",
    approval: "Approval requested",
    signing: "Signature requested",
    submitted: "Submitted",
    confirming: "Confirming",
    confirmed: "Confirmed",
    reverted: "Reverted",
    rejected: "Rejected",
    stale: "Needs review",
  },
  plural: {
    messages: (count) => `${count} message${count === 1 ? "" : "s"}`,
    transactions: (count) => `${count} transaction${count === 1 ? "" : "s"}`,
    steps: (count) => `${count} step${count === 1 ? "" : "s"}`,
    agents: (count) => `${count} agent${count === 1 ? "" : "s"}`,
  },
};

const french: Copy = {
  localeName: "Français",
  nav: {
    howItWorks: "Comprendre Axiom",
    connectWallet: "Connecter le wallet",
    overview: "Vue d’ensemble",
    agents: "Agents",
    chat: "Chat",
    transactions: "Transactions",
    storage: "Storage",
    mint: "Mint",
    payment: "Paiement",
    transfer: "Transfert",
    tick: "Tick",
    deposit: "Dépôt",
    withdraw: "Retrait",
  },
  topbar: {
    connected: "connecté",
    notConnected: "non connecté",
    operator: "opérateur",
    openRail: "Ouvrir le rail",
    network: "RÉSEAU",
    oracleLive: "oracle actif",
    oracleDown: "oracle coupé",
  },
  strip: {
    reviewEyebrow: "MAINTENANT / À EXAMINER",
    nextEyebrow: "PROCHAINE ACTION SÛRE",
    proofCheckEyebrow: "VÉRIFICATION DE PREUVE",
    reviewTitle: (kind) => `Examiner ${kind}`,
    reviewSummary: "Récupérez le reçu existant avant de réessayer.",
    reviewImpact: "Aucun mouvement d’actifs avant votre reprise.",
    fundTitle: (tokenId) =>
      tokenId ? `Financer l’agent #${tokenId}` : "Ouvrir la route de paiement",
    fundSummary:
      "Examinez une approbation ERC-20 exacte avant tout mouvement de valeur.",
    fundImpact: "Approbation et paiement se confirment séparément.",
    inspectTitle: "Inspecter la racine Storage",
    inspectSummary: "Vérifiez la racine indexée et l’état d’intégrité.",
    inspectImpact: "Lecture seule. Aucune requête wallet.",
    proofReceipt: "REÇU",
    proofAgent: "AGENT",
    proofRoot: "RACINE",
    selectInFlow: "à choisir dans le flow",
    openReview: "Ouvrir la revue",
    whyNow: "Pourquoi maintenant",
    seeAllQueue: "Voir toute la file",
    prefilledNote: "prérempli, non soumis",
  },
  command: {
    title: "Centre de commande",
    continueIn: (label) => `Continuer dans ${label}`,
    resumeCurrent: "Reprendre la surface courante",
    groupContinue: "Continuer",
    groupNextSafeAction: "Prochaine action sûre",
    groupGoTo: "Aller à",
    groupRecent: "Récent",
    resultsCount: (count) => `${count} actions`,
    placeholder: "Chercher une action, un reçu ou une route",
    emptyTitle: "Aucune destination correspondante",
    emptyBody:
      "Essayez une route, un hash de reçu ou la prochaine action sûre.",
    hintKeys: "↑↓ naviguer · ↵ ouvrir · esc fermer",
  },
  landing: {
    eyebrow: "AXIOM / CONSOLE OPÉRATEUR VÉRIFIÉE",
    titleLead: "Avancez avec",
    titleEmphasis: "des preuves.",
    description:
      "Connectez un wallet, examinez la prochaine action opérateur et gardez sa preuve à côté. Chaque état est explicite ; ce prototype ne simule jamais une transaction réelle.",
    prototypeNote:
      "Mode prototype : wallet, réseau, signature et limites transactionnelles sont visibles avant l’accès à la console.",
    nextSafeAction: "PROCHAINE ACTION SÛRE",
    heroTitle: "Vérifiez l’opérateur avant l’action.",
    walletContext: "Contexte wallet",
    signatureBoundary: "Limite de signature",
    consoleAccess: "Accès console",
    stakingBoundary: "Le staking ne fait pas encore partie d’Axiom.",
    menuGuideHint: "Revoir la limite wallet et de preuve",
    menuDevelopers: "Développeurs",
    menuDevelopersHint: "Inspecter la limite d’intégration",
    stakeTitle: "0G Stake",
    stripConnectEyebrow: "CONNECTER",
    stripConnectSmall: "Connecteur et adresse",
    stripVerifyEyebrow: "VÉRIFIER",
    stripVerifySmall: "Sans gas · sans garde",
    stripOperateEyebrow: "OPÉRER",
    stripOperateSmall: "Reçus à côté de l’action",
    stripBoundaryEyebrow: "LIMITE",
  },
  wallet: {
    connectingTitle: "Lecture du contexte wallet.",
    connectingDescription:
      "Vérification de l’adresse, du connecteur et du réseau cible.",
    wrongNetworkTitle: "Passez sur {chainName}.",
    wrongNetworkDescription:
      "Le wallet est connecté, mais utilise un autre réseau. Changez de réseau avant de signer le message d’accès.",
    switchNetwork: "Passer sur {chainName}",
    approveSignature: "Approuver la signature",
    rejectSignature: "Refuser la signature",
    profileTitle: "Nommez le profil local.",
    profileDescription:
      "Ce libellé aide à reconnaître le wallet connecté dans Axiom. Vous pourrez le modifier dans Settings.",
    profileHint: "Enregistré uniquement comme préférence locale du prototype.",
    unlockConsole: "Déverrouiller la console",
    rejectedTitle: "Accès non accordé.",
    rejectedDescription:
      "La signature a été refusée ; la console reste verrouillée. Aucune transaction n’a été envoyée.",
    retryConnection: "Réessayer la connexion wallet",
    timeoutTitle: "Accès non accordé.",
    timeoutDescription:
      "Le wallet ou le réseau n’a pas répondu à temps. Réessayez ou fermez ce panneau.",
  },
  guide: {
    nextStep: "Étape suivante",
    finish: "Terminer le guide",
    skip: "Passer pour l’instant",
  },
  notFound: {
    eyebrow: "404 / PAGE INTROUVABLE",
    titleLead: "La route",
    titleEmphasis: "s’est égarée.",
    body: "Cette page n’existe pas. Rien n’a été chargé et aucune action wallet n’a été effectuée.",
    returnToLanding: "Retour à l’accueil",
    openConsole: "Ouvrir la console",
    title: "Page introuvable",
  },
  settings: {
    pageEyebrow: "PLAN DE CONTRÔLE / CONFIGURATION",
    pageTitle: "Paramètres",
    languageLabel: "Langue de l’interface",
    languageHint:
      "Modifie les libellés et les pluriels sans changer le réseau simulé.",
    localeEnglish: "English",
    localeFrench: "Français",
    localeGerman: "Deutsch",
    localFixture: "fixture locale",
    liveWallet: "wallet actif",
    walletNetwork: "WALLET & RÉSEAU",
    signingContext: "Contexte de signature",
    profileNameLabel: "Nom du profil opérateur",
    profileNameSave: "Enregistrer",
    profileNameSaved: "Nom du profil mis à jour.",
    dailyEyebrow: "AFFICHAGE / PRÉFÉRENCES",
    dailyTitle: "Préférences quotidiennes",
    layoutEyebrow: "CONSOLE / DISPOSITION",
    layoutTitle: "Disposition de la console",
    advancedEyebrow: "AVANCÉ / RAREMENT UTILISÉ",
    advancedTitle: "Avancé",
    dangerEyebrow: "ZONE DANGEREUSE",
    dangerTitle: "Actions destructrices",
    dangerHint:
      "La réinitialisation efface la session, tous les brouillons de flow et les reçus locaux. Les paramètres sont conservés.",
    compactRail: "Rail de commande compact",
    compactRailHint:
      "Gardez les libellés visibles tout en libérant de l’espace.",
    reducedMotion: "Motion réduite",
    reducedMotionHint:
      "Rendez les transitions d’état et du guide instantanées.",
    railHidden: "Rail masqué",
    railHiddenHint: "Rouvrez-le depuis le contrôle vertical latéral.",
    railWidth: "Largeur du rail",
    railWidthHint: "faites glisser pour régler la surface de commande.",
    density: "Densité",
    densityCalm: "Calme",
    densityDense: "Dense",
    theme: "Thème de surface",
    themeHint:
      "Préserve un contraste opérateur lisible dans chaque environnement de travail.",
    themeDark: "Graphite",
    themeLight: "Papier",
    direction: "Direction",
    directionLtr: "LTR / gauche à droite",
    directionRtl: "RTL / droite à gauche",
    rowWallet: "Wallet",
    rowChain: "Chaîne",
    rowRpc: "RPC",
    rowConnector: "Connecteur",
    rowApi: "API",
    statusConnected: "Connecté",
    statusOffline: "Hors ligne",
    statusSelected: "Sélectionnée",
    statusMismatch: "Discordance",
    statusChecking: "vérification",
    statusReady: "Prêt",
    statusOnline: "en ligne",
    shortcutEyebrow: "CENTRE DE COMMANDE",
    shortcutTitle: "Carte clavier",
    shortcutHint:
      "Les raccourcis restent visibles ; ils ne contournent jamais les limites wallet, réseau ou signature.",
    shortcutPalette: "Chercher actions, agents, reçus et routes",
    shortcutSurfaces: "Ouvrir les surfaces de commande",
    shortcutFlows: "Ouvrir les flows d’exécution",
    diagnosticNote:
      "Session, chaîne, RPC et préférences sont visibles avant toute action.",
    replayOnboarding: "Rejouer l’onboarding",
    resetSurface: "Réinitialiser la surface",
    resetConfirmTitle: "Réinitialiser la surface ?",
    resetConfirmBody:
      "Cette action vous déconnecte et efface tous les brouillons de flow et les reçus locaux. Vos paramètres sont conservés. Aucune annulation possible.",
    resetConfirmAction: "Tout réinitialiser",
    resetCancel: "Annuler",
    reviewStakingBoundary: "Revoir la limite d’intégration 0G",
    lockConsole: "Verrouiller la console",
  },
  dashboard: {
    eyebrow: "VUE D’ENSEMBLE / PROCHAINE ACTION SÛRE",
    titleLead: "Gardez la",
    titleEmphasis: "surface traçable.",
    description:
      "Quatre agents, un contexte de signature vérifié et une piste transactionnelle qui ne transforme jamais l’attente en succès.",
    review: (count) =>
      `${count} action${count > 1 ? "s" : ""} agent${count > 1 ? "s" : ""} ${count > 1 ? "nécessitent" : "nécessite"} votre attention.`,
    nowReviewEyebrow: "MAINTENANT / REVUE",
    refresh: "Actualiser la vue",
    managedValue: "Valeur gérée",
    agentsOnline: "Agents en ligne",
    storageProofs: "Preuves Storage",
    liveQueue: "File active",
    agentRegister: "REGISTRE AGENTS / 04",
    operatingFleet: "Flotte active",
    proofLane: "COULOIR DE PREUVE / 01",
    attentionFirst: "Attention d’abord",
    allowanceReady: "L’approbation est prête à être revue.",
    allowanceDescription:
      "Examinez une approbation ERC-20 exacte avant tout mouvement de valeur.",
    recentStore: "RÉCENT / STORE PARTAGÉ",
    latestEvidence: "Dernières preuves",
    allReceipts: "Tous les reçus",
    contextWallet: "CONTEXTE WALLET",
    contextNetwork: "RÉSEAU",
    contextSigner: "SIGNATAIRE",
    contextAttention: "ATTENTION",
    switchRequired: "changement requis",
    signerReady: "Prêt à signer",
    signerWrong: "Mauvais réseau",
    noConnector: "aucun connecteur",
    attentionCount: (count) =>
      `${count} action${count > 1 ? "s" : ""} à examiner`,
    openReviewQueue: "Ouvrir la file de revue",
    loadingVaults: "chargement des vaults…",
    agentsScoped: (count) =>
      `${count} agent${count > 1 ? "s" : ""} suivi${count > 1 ? "s" : ""}`,
    needReview: (count) => `${count} à examiner`,
    fleetNominal: "flotte nominale",
    eventsIndexed: "événements indexés",
    queueAwaiting: "confirmation en attente",
    oracleUnreachable: "oracle injoignable",
    secondaryTelemetry: "TÉLÉMÉTRIE SECONDAIRE",
    telemetryTitle: "Télémétrie et preuves récentes",
    noEvidence: "Pas encore de preuve",
    noEvidenceHint:
      "Mintez un agent ou lancez un paiement pour créer le premier reçu.",
    registerUnavailable: "Registre d’agents indisponible",
    noAgents: "Pas encore d’agent",
    noAgentsHint: "Mintez votre premier agent pour démarrer la flotte.",
    mintAgent: "Minter un agent",
    noDescription: "sans description",
    refreshNotice: "Vue d’ensemble actualisée depuis les indexeurs live.",
    agentFundingEyebrow: (tokenId) => `AGENT #${tokenId} / FINANCEMENT`,
    paymentAllowanceEyebrow: "PAIEMENT / APPROBATION",
  },
  chat: {
    pageTitle: "Chat",
    statusOnline: "En ligne · {chainName}",
    statusWrongNetwork: "Passer sur {chainName}",
    wrongNetworkBanner: "Mauvais réseau. Basculez le wallet sur {chainName}.",
    newChat: "Nouveau chat",
    historyToggle: "Historique",
    emptyTagline:
      "Agents · vaults · ticks. Le wallet signe les actions on-chain.",
    promptAgents: "Mes agents",
    promptAgentsHint: "Ce que vous possédez",
    promptMint: "Minter un agent",
    promptMintHint: "Le wallet signe",
    promptVault: "Solde du vault",
    promptVaultHint: "Avoirs en {nativeSymbol}",
    promptTick: "Simuler un tick",
    promptTickHint: "Essai à blanc d’abord",
    toolsToggle: (count) => `Les ${count} outils`,
    toolsBrowse: "parcourir ▾",
    toolsHide: "masquer ▴",
    roleYou: "Vous",
    roleAssistant: "Assistant",
    roleTool: "Outil",
    toolResultFallback: "Résultat d’outil",
    questionFallback: "Question",
    editResend: "Modifier et renvoyer",
    regenerate: "Régénérer la réponse",
    regenerateShort: "Régénérer",
    copyMessage: "Copier le message",
    copyShort: "Copier",
    copiedMessage: "Copié",
    toolPrompts: {
      evm_wallet: "Vérifie le solde et le réseau de mon wallet",
      evm_multichain: "Interroge cette adresse sur plusieurs chaînes : ",
      evm_tx: "Construis et diffuse une transaction vers ",
      evm_token: "Vérifie le solde du token ",
      evm_gas: "Estime les prix du gas actuels",
      evm_whale: "Suis les gros mouvements de wallet au-dessus de ",
      evm_contract: "Appelle une méthode du contrat ",
      evm_allowance: "Vérifie l’approbation du token ",
      stocks_quote: "Donne la dernière cotation de ",
      stocks_search: "Recherche des tickers pour ",
      stocks_history: "Montre l’historique des prix de ",
      stocks_compare: "Compare les fondamentaux de ",
      stocks_crypto: "Donne les données de marché crypto de ",
      osint_sec_edgar: "Recherche des dépôts SEC pour ",
      osint_usaspending: "Recherche les dépenses fédérales pour ",
      osint_ofac_sdn: "Vérifie le statut de sanctions de ",
      osint_opencorporates: "Recherche l’immatriculation de ",
      osint_entity_resolve: "Résous les références d’entité pour ",
      osint_courtlistener: "Recherche des décisions de justice pour ",
      list_my_agents: "Liste mes agents",
      vault_balance: "Montre le solde du vault de l’agent #",
      agent_metadata: "Montre les métadonnées on-chain de l’agent #",
      event_history: "Montre les événements on-chain récents de l’agent #",
      execute_tick: "Exécute un tick de stratégie pour l’agent #",
      simulate_tick: "Simule un tick à blanc pour l’agent #",
      mint_agent: "Minte un nouvel agent nommé ",
      deposit: "Dépose des fonds dans le vault de l’agent #",
      withdraw: "Retire des fonds du vault de l’agent #",
      pay_for_agent: "Effectue un paiement à l’agent #",
      transfer: "Transfère l’agent # à un nouveau propriétaire",
      archive_lookup: "Recherche le compte archivé ",
      archive_account_tweets: "Montre les tweets archivés de ",
      archive_confirm_deletion: "Confirme la suppression du snapshot archivé ",
    },
    discardEditTitle: "Abandonner les messages suivants et modifier",
    keepConversationTitle: "Conserver la conversation",
    editDiscards: "Modifier abandonne la suite",
    edit: "Modifier",
    cancel: "Annuler",
    retry: "Réessayer",
    dismiss: "Fermer",
    assistantResponding: "L’assistant répond",
    tickInProgress: "Tick en cours…",
    queuedCount: (count) => `${count} en file`,
    answerPlaceholder: "Saisissez votre réponse…",
    placeholder: (assistant) => `Message à ${assistant}…`,
    placeholderStreaming: "Mettre une réponse en file…",
    send: "Envoyer",
    queue: "En file",
    stop: "Stop",
    removeQueued: "Retirer le message en file",
    routing: "Routage",
    routingHint: "Cette conversation uniquement",
    routingAuto: "Auto (le plus rapide)",
    routingCheapest: "Coût le plus bas",
    routingVerified: "Fournisseurs vérifiés uniquement (TEE)",
    routingPrivate: "Privé (enclave scellée)",
    routingPrivateHintOn:
      "Inférence en enclave scellée (les prompts ne quittent jamais l’enclave)",
    routingPrivateHintOff:
      "Aucun fournisseur à enclave scellée ne sert ce modèle",
    routingChipTitle:
      "Routage fournisseur — changez comment cette conversation est servie",
    routingSummaryAuto: "Auto",
    routingSummaryCheapest: "Coût le plus bas",
    routingStatusPinned: (address) =>
      `Épinglé à ${address} — chaque tour est servi par ce fournisseur.`,
    routingStatusCheapest:
      "Fournisseur le moins cher d’abord ; le fournisseur peut changer entre les tours.",
    routingStatusAuto:
      "Fournisseur le plus rapide d’abord ; les tours restent sur un même fournisseur pour des suivis plus rapides.",
    phaseRunning: (names, elapsed) => `Exécution de ${names}… (${elapsed} s)`,
    phaseStreaming: (elapsed) => `Réponse en flux… (${elapsed} s)`,
    phaseThinking: "Réflexion…",
    phaseWaiting: (elapsed) =>
      `En attente de la réponse du modèle… (${elapsed} s)`,
    historyTitle: "Chats",
    historyNew: "Nouveau",
    historySearch: "Rechercher des chats…",
    historyEmpty: "Pas encore d’historique. Envoyez un message.",
    historyNoMatch: "Aucun chat correspondant.",
    historyLoading: "Chargement de l’historique serveur…",
    historyRestore: "Restaurer l’historique serveur",
    historyRestoreHint:
      "Signez un message wallet pour charger les transcripts de ce wallet. Aucune transaction n’est envoyée.",
    historyDelete: (title) => `Supprimer le chat : ${title}`,
    untitledThread: "Nouveau chat",
    deletedToast: "Chat supprimé",
    undo: "Annuler",
    metricsShow: "métriques",
    metricsHide: "masquer les métriques",
  },
  storage: {
    eyebrow: "PROVENANCE DES DONNÉES / 0G",
    title: "Stockez le payload, puis vérifiez sa preuve.",
    description:
      "Chiffrement, root hash, transaction Storage, preuve d’intégrité et disponibilité de l’index restent séparés.",
    openChat: "Ouvrir le transcript Chat",
    adapter: "ADAPTATEUR 0G STORAGE",
    payload: "Payload de métadonnées agent",
    fileMeta: "18,4 Ko · chiffré AES-GCM · 4 tags",
    labels: [
      "Payload prêt",
      "Chiffré",
      "Root hash calculé",
      "Publié",
      "Preuve vérifiée",
      "Disponible",
    ],
    note: "Disponible uniquement après présence du root hash, de la transaction Storage, de la preuve et de l’index.",
    provenanceRecord: "REGISTRE DE PROVENANCE",
    whatCanProve: "Ce que l’interface peut prouver",
    rootHash: "Root hash",
    storageTx: "Transaction Storage",
    integrityProof: "Preuve d’intégrité",
    encryption: "Chiffrement",
    indexerAge: "Âge de l’index",
    download: "Téléchargement",
    available: "disponible",
    notReady: "pas prêt",
    source: "SOURCE",
    sourceName: "SDK 0G Storage / Indexer",
    sourceDescription:
      "La démo reprend la forme de l’adaptateur ; aucune réplication ni pinning n’est revendiquée.",
    pending: "en attente",
    notIndexed: "non indexé",
    fixture: "démo / non live",
    demoNotice:
      "Pipeline de démonstration — aucun backend Storage n’est connecté. Les étapes ci-dessous sont celles qu’un upload réel exposera ; aucun état n’est produit ni persisté ici.",
  },
  flows: {
    mint: {
      eyebrow: "MINT / LIMITE DE PROVENANCE",
      title: "Créer un agent",
      copy: "Nom → hash → accord de l’oracle → reçu.",
      steps: ["Hash de métadonnées", "Accord de l’oracle", "Reçu indexé"],
    },
    payment: {
      eyebrow: "PAIEMENT / ROUTE D’APPROBATION",
      title: "Financer avec contexte",
      copy: "Token, approbation exacte, frais, royalty et événements restent visibles avant la fin.",
      steps: [
        "Approbation exacte",
        "Limite approbation / paiement",
        "Reçu indexé",
      ],
    },
    transfer: {
      eyebrow: "TRANSFERT / PREUVE SIGNÉE",
      title: "Transférer avec preuve",
      copy: "Challenge → signature → finalisation → reçu on-chain. L’expiration reste visible.",
      steps: [
        "Challenge du destinataire",
        "Limite de signature",
        "Reçu indexé",
      ],
    },
    tick: {
      eyebrow: "ORCHESTRATEUR / FLUX",
      title: "Lancer le prochain tick",
      copy: "Intention → fournisseur → flux → résultat → événement ou transaction → récupération.",
      steps: ["Instruction bornée", "Route fournisseur", "Événement indexé"],
    },
    deposit: {
      eyebrow: "VAULT / ROUTE DE DÉPÔT",
      title: "Déposer dans le vault",
      copy: "Montant → revue → limite wallet → reçu on-chain. Le solde du vault reste visible avant le transfert.",
      steps: ["Montant + solde", "Limite wallet", "Reçu indexé"],
    },
    withdraw: {
      eyebrow: "VAULT / ROUTE DE RETRAIT",
      title: "Retirer du vault",
      copy: "Montant → revue → limite wallet → reçu on-chain. Le solde restant est affiché avant la signature.",
      steps: ["Solde vérifié", "Limite wallet", "Reçu indexé"],
    },
  },
  flowUi: {
    openTransactions: "Ouvrir le centre transactionnel",
    confirmingReceipt: "Confirmation du reçu…",
    ready: "PRÊT",
    finalEvidence: "PREUVE FINALE",
    inFlight: "EN COURS",
    simulatedReceipt: "reçu simulé",
    confirmResult: "Confirmer le résultat simulé",
    continueTo: "Continuer vers",
    restart: "Recommencer ce flow",
    simulateReject: "Simuler un rejet",
    simulateTimeout: "Simuler un timeout",
    evidenceBoundary: "LIMITE DE PREUVE",
    wallet: "Wallet",
    agent: "Agent",
    network: "Réseau",
    currentState: "État actuel",
    receipt: "Reçu",
    awaitingConfirmation: "confirmation en attente",
    readyToConfirm: "prêt à confirmer",
    notCreated: "non créé",
    noLiveCall: "fixture / aucun appel réel",
    confirming: "CONFIRMATION",
    stepWallet: "Limite wallet",
    stepAuto: "Observé automatiquement",
  },
  agentDetail: {
    executionSurface: "surface d’exécution contrôlée par l’opérateur.",
    operatingBalance: "SOLDE D’EXPLOITATION",
    vaultRoute: "route du vault · {chainName}",
    dataHash: "Hash de métadonnées",
    overview: "Vue d’ensemble",
    execute: "Exécuter",
    payments: "Paiements",
    activity: "Activité",
    identityProvenance: "IDENTITÉ / PROVENANCE",
    agentRecord: "Fiche agent",
    owner: "Propriétaire",
    agentId: "ID agent",
    metadataRoot: "Hash de métadonnées",
    lastEvent: "Dernier événement",
    inspectStorageProof: "Examiner la preuve Storage",
    commandSafeAction: "COMMANDE / ACTION SÛRE",
    chooseBoundedOperation: "Choisissez une opération bornée.",
    fundAgent: "Financer l’agent",
    depositFunds: "Déposer dans le vault",
    withdrawFunds: "Retirer du vault",
    transferProof: "Transférer la preuve",
    queueTick: "Mettre le tick en file",
    tickQueuedNotice:
      "Demande de tick mise en file dans le store partagé du prototype.",
    commandEvidence:
      "Chaque action ouvre son propre modèle de preuve et revient à l’activité avec un reçu.",
    executeBoundedIntent: "EXÉCUTER / INTENTION BORNÉE",
    runRecoveryPath: "Lancez une opération avec un chemin de récupération.",
    instruction: "Instruction",
    instructionPlaceholder: "Évaluer la route courante",
    instructionHint: "Commande simulée ; aucun appel fournisseur réel.",
    providerRoute: "Route fournisseur",
    providerValue: "Orchestrateur Axiom",
    providerHint: "Route fixture sélectionnée dans Settings.",
    createTickIntent: "Créer l’intention de tick",
    createTickNotice: "Instruction créée. Ouvrez Tick pour inspecter le flux.",
    cancel: "Annuler",
    paymentsActivity: "PAIEMENTS / ACTIVITÉ",
    valueRouteFor: (agent) => `Route de valeur pour ${agent}`,
    token: "TOKEN",
    allowance: "APPROBATION",
    royalty: "ROYALTY",
    openPaymentFlow: "Ouvrir le flow de paiement",
    earnings: "Gains",
    activityFor: (agent) => `ACTIVITÉ / ${agent.toUpperCase()}`,
    evidenceTied: "Preuves liées à cet agent",
  },
  transactions: {
    eyebrow: "OPÉRATIONS / REÇUS",
    title: "Centre transactionnel",
    description:
      "Chaque signature possède un état, une source et un chemin de récupération.",
    refreshState: "Actualiser l’état",
    refreshNotice:
      "Index des reçus revérifié. Les états en attente le restent.",
    feedDown:
      "Flux d’événements live hors ligne — interrogation périodique à la place.",
    liveQueue: "FILE ACTIVE",
    confirmingNow: "en confirmation",
    today: "AUJOURD’HUI",
    receiptsIndexed: "reçus indexés",
    recovery: "RÉCUPÉRATION",
    needReview: "à examiner",
    confirmedNote:
      "Confirmé signifie que le reçu a été observé et l’événement décodé. Une attente ne devient jamais un succès.",
    activitySharedStore: "ACTIVITÉ / STORE PARTAGÉ",
    statefulOperations: "Opérations avec état",
    filterAll: "Tout",
    filterReview: "À examiner",
    filterStale: "Obsolète",
    moreFilters: "Plus de filtres",
    operation: "OPÉRATION",
    hash: "HASH",
    age: "ÂGE",
    state: "ÉTAT",
    emptyState:
      "Aucun reçu ne correspond à cet état. Le store partagé ne masque aucun élément.",
    closeReceipt: "Fermer le reçu",
    transactionHash: "Hash de transaction",
    network: "Réseau",
    agent: "Agent",
    event: "Événement",
    decodedIndexed: "décodé + indexé",
    awaitingFinalEvidence: "preuve finale en attente",
    openRecovery: "Ouvrir la récupération",
    recoveryNotice: "Récupération ouverte. L’opération revient à Prêt.",
    openOperation: "Ouvrir l’opération",
  },
  status: {
    ready: "Prêt à démarrer",
    approval: "Approbation demandée",
    signing: "Signature demandée",
    submitted: "Envoyée",
    confirming: "Confirmation en cours",
    confirmed: "Confirmée",
    reverted: "Annulée",
    rejected: "Refusée",
    stale: "À vérifier",
  },
  plural: {
    messages: (count) => `${count} message${count > 1 ? "s" : ""}`,
    transactions: (count) => `${count} transaction${count > 1 ? "s" : ""}`,
    steps: (count) => `${count} étape${count > 1 ? "s" : ""}`,
    agents: (count) =>
      `${count} action${count > 1 ? "s" : ""} agent${count > 1 ? "s" : ""}`,
  },
};

const german: Copy = {
  localeName: "Deutsch",
  nav: {
    howItWorks: "So funktioniert Axiom",
    connectWallet: "Wallet verbinden",
    overview: "Übersicht",
    agents: "Agents",
    chat: "Chat",
    transactions: "Transaktionen",
    storage: "Storage",
    mint: "Mint",
    payment: "Zahlung",
    transfer: "Transfer",
    tick: "Tick",
    deposit: "Einzahlen",
    withdraw: "Auszahlen",
  },
  topbar: {
    connected: "verbunden",
    notConnected: "nicht verbunden",
    operator: "Operator",
    openRail: "Leiste öffnen",
    network: "NETZWERK",
    oracleLive: "Oracle live",
    oracleDown: "Oracle down",
  },
  strip: {
    reviewEyebrow: "JETZT / PRÜFUNG NÖTIG",
    nextEyebrow: "NÄCHSTE SICHERE AKTION",
    proofCheckEyebrow: "BELEGPPRÜFUNG",
    reviewTitle: (kind) => `${kind} prüfen`,
    reviewSummary:
      "Stelle den vorhandenen Beleg wieder her, bevor du es erneut versuchst.",
    reviewImpact: "Keine Vermögensbewegung, bis du fortfährst.",
    fundTitle: (tokenId) =>
      tokenId ? `Agent #${tokenId} finanzieren` : "Zahlungsroute öffnen",
    fundSummary: "Prüfe eine exakte ERC-20-Freigabe, bevor Wert fließt.",
    fundImpact: "Freigabe und Zahlung werden getrennt bestätigt.",
    inspectTitle: "Storage-Root prüfen",
    inspectSummary: "Prüfe den indexierten Root und den Integritätsstatus.",
    inspectImpact: "Nur lesend. Keine Wallet-Anfrage.",
    proofReceipt: "BELEG",
    proofAgent: "AGENT",
    proofRoot: "ROOT",
    selectInFlow: "im Flow wählen",
    openReview: "Prüfung öffnen",
    whyNow: "Warum jetzt",
    seeAllQueue: "Ganze Warteschlange ansehen",
    prefilledNote: "vorbefüllt, nicht abgesendet",
  },
  command: {
    title: "Command Center",
    continueIn: (label) => `Weiter in ${label}`,
    resumeCurrent: "Aktuelle Oberfläche fortsetzen",
    groupContinue: "Fortsetzen",
    groupNextSafeAction: "Nächste sichere Aktion",
    groupGoTo: "Gehe zu",
    groupRecent: "Zuletzt",
    resultsCount: (count) => `${count} Aktionen`,
    placeholder: "Aktion, Beleg oder Route suchen",
    emptyTitle: "Kein passendes Ziel",
    emptyBody:
      "Versuche eine Route, einen Beleg-Hash oder die nächste sichere Aktion.",
    hintKeys: "↑↓ bewegen · ↵ öffnen · esc schließen",
  },
  landing: {
    eyebrow: "AXIOM / VERIFIZIERTE OPERATOR-KONSOLE",
    titleLead: "Handle mit",
    titleEmphasis: "Belegen.",
    description:
      "Verbinde ein Wallet, prüfe die nächste Operator-Aktion und halte den Nachweis daneben. Jeder Status ist sichtbar; dieser Prototyp behauptet keine echte Transaktion.",
    prototypeNote:
      "Prototyp-Modus: Wallet, Netzwerk, Signatur und Transaktionsgrenzen sind vor dem Konsolenzugriff sichtbar.",
    nextSafeAction: "NÄCHSTE SICHERE AKTION",
    heroTitle: "Prüfe den Operator vor der Aktion.",
    walletContext: "Wallet-Kontext",
    signatureBoundary: "Signaturgrenze",
    consoleAccess: "Konsolenzugriff",
    stakingBoundary: "Staking gehört noch nicht zu Axiom.",
    menuGuideHint: "Wallet- und Beleggrenze prüfen",
    menuDevelopers: "Entwickler",
    menuDevelopersHint: "Integrationsgrenze prüfen",
    stakeTitle: "0G Stake",
    stripConnectEyebrow: "VERBINDEN",
    stripConnectSmall: "Connector und Adresse",
    stripVerifyEyebrow: "PRÜFEN",
    stripVerifySmall: "Kein Gas · keine Verwahrung",
    stripOperateEyebrow: "STEUERN",
    stripOperateSmall: "Belege neben der Aktion",
    stripBoundaryEyebrow: "GRENZE",
  },
  wallet: {
    connectingTitle: "Wallet-Kontext wird gelesen.",
    connectingDescription:
      "Adresse, Connector und Zielnetzwerk werden geprüft.",
    wrongNetworkTitle: "Zu {chainName} wechseln.",
    wrongNetworkDescription:
      "Das Wallet ist verbunden, verwendet aber ein anderes Netzwerk. Wechsle vor der Signatur der Zugriffsnachricht.",
    switchNetwork: "Zu {chainName} wechseln",
    approveSignature: "Signatur bestätigen",
    rejectSignature: "Signatur ablehnen",
    profileTitle: "Lokales Profil benennen.",
    profileDescription:
      "Dieses Label hilft dir, das verbundene Wallet in Axiom zu erkennen. Du kannst es später in Settings ändern.",
    profileHint: "Nur als lokale Prototyp-Einstellung gespeichert.",
    unlockConsole: "Konsole entsperren",
    rejectedTitle: "Zugriff nicht gewährt.",
    rejectedDescription:
      "Die Signatur wurde abgelehnt; die Konsole bleibt gesperrt. Es wurde keine Transaktion gesendet.",
    retryConnection: "Wallet-Verbindung erneut versuchen",
    timeoutTitle: "Zugriff nicht gewährt.",
    timeoutDescription:
      "Wallet oder Netzwerk haben nicht rechtzeitig geantwortet. Versuche es erneut oder schließe dieses Panel.",
  },
  guide: {
    nextStep: "Nächster Schritt",
    finish: "Guide beenden",
    skip: "Jetzt überspringen",
  },
  notFound: {
    eyebrow: "404 / SEITE NICHT GEFUNDEN",
    titleLead: "Diese Route",
    titleEmphasis: "treibt davon.",
    body: "Diese Seite existiert nicht. Es wurde nichts geladen und keine Wallet-Aktion ausgeführt.",
    returnToLanding: "Zurück zur Startseite",
    openConsole: "Konsole öffnen",
    title: "Seite nicht gefunden",
  },
  settings: {
    pageEyebrow: "KONTROLLEBENE / KONFIGURATION",
    pageTitle: "Einstellungen",
    languageLabel: "Sprache der Oberfläche",
    languageHint:
      "Ändert Beschriftungen und Pluralformen, nicht das simulierte Netzwerk.",
    localeEnglish: "English",
    localeFrench: "Français",
    localeGerman: "Deutsch",
    localFixture: "lokale Fixture",
    liveWallet: "Live-Wallet",
    walletNetwork: "WALLET & NETZWERK",
    signingContext: "Signaturkontext",
    profileNameLabel: "Name des Operator-Profils",
    profileNameSave: "Namen speichern",
    profileNameSaved: "Profilname aktualisiert.",
    dailyEyebrow: "ANZEIGE / PRÄFERENZEN",
    dailyTitle: "Tägliche Präferenzen",
    layoutEyebrow: "KONSOLE / LAYOUT",
    layoutTitle: "Konsolen-Layout",
    advancedEyebrow: "ERWEITERT / SELTEN GENUTZT",
    advancedTitle: "Erweitert",
    dangerEyebrow: "GEFAHRENZONE",
    dangerTitle: "Destruktive Aktionen",
    dangerHint:
      "Zurücksetzen löscht die Session, alle Flow-Entwürfe und alle lokalen Belege. Einstellungen bleiben erhalten.",
    compactRail: "Kompakte Befehlsleiste",
    compactRailHint:
      "Beschriftungen sichtbar halten und mehr Arbeitsraum schaffen.",
    reducedMotion: "Reduzierte Bewegung",
    reducedMotionHint: "Status- und Guide-Übergänge sofort halten.",
    railHidden: "Leiste ausgeblendet",
    railHiddenHint: "Über die vertikale Kante wieder öffnen.",
    railWidth: "Leistenbreite",
    railWidthHint: "ziehen, um die Befehlsoberfläche einzustellen.",
    density: "Dichte",
    densityCalm: "Ruhig",
    densityDense: "Dicht",
    theme: "Oberflächenthema",
    themeHint: "Sichert lesbaren Bedienkontrast in jeder Arbeitsumgebung.",
    themeDark: "Graphit",
    themeLight: "Papier",
    direction: "Richtung",
    directionLtr: "LTR / links nach rechts",
    directionRtl: "RTL / rechts nach links",
    rowWallet: "Wallet",
    rowChain: "Chain",
    rowRpc: "RPC",
    rowConnector: "Connector",
    rowApi: "API",
    statusConnected: "Verbunden",
    statusOffline: "Offline",
    statusSelected: "Ausgewählt",
    statusMismatch: "Abweichung",
    statusChecking: "wird geprüft",
    statusReady: "Bereit",
    statusOnline: "online",
    shortcutEyebrow: "COMMAND CENTER",
    shortcutTitle: "Tastaturbelegung",
    shortcutHint:
      "Schnellpfade bleiben sichtbar; sie umgehen nie Wallet-, Netzwerk- oder Signaturgrenzen.",
    shortcutPalette: "Aktionen, Agents, Belege und Routen suchen",
    shortcutSurfaces: "Zentrale Befehlsoberflächen öffnen",
    shortcutFlows: "Ausführungs-Flows öffnen",
    diagnosticNote:
      "Session, Chain, RPC und Einstellungen sind vor jeder Aktion sichtbar.",
    replayOnboarding: "Onboarding wiederholen",
    resetSurface: "Oberfläche zurücksetzen",
    resetConfirmTitle: "Oberfläche zurücksetzen?",
    resetConfirmBody:
      "Dies meldet Sie ab und löscht alle Flow-Entwürfe und lokalen Belege. Ihre Einstellungen bleiben erhalten. Kein Rückgängigmachen.",
    resetConfirmAction: "Alles zurücksetzen",
    resetCancel: "Abbrechen",
    reviewStakingBoundary: "0G-Integrationsgrenze prüfen",
    lockConsole: "Konsole sperren",
  },
  dashboard: {
    eyebrow: "ÜBERSICHT / NÄCHSTE SICHERE AKTION",
    titleLead: "Halte die",
    titleEmphasis: "Oberfläche prüfbar.",
    description:
      "Vier Agents, ein verifizierter Signaturkontext und eine Transaktionsspur, die „ausstehend“ nie als Erfolg ausgibt.",
    review: (count) =>
      `${count} Agentenaktion${count === 1 ? "" : "en"} erfordern Aufmerksamkeit.`,
    nowReviewEyebrow: "JETZT / PRÜFUNG",
    refresh: "Übersicht aktualisieren",
    managedValue: "Verwalteter Wert",
    agentsOnline: "Agents online",
    storageProofs: "Storage-Beweise",
    liveQueue: "Aktive Warteschlange",
    agentRegister: "AGENTENREGISTER / 04",
    operatingFleet: "Aktive Flotte",
    proofLane: "BEWEIS-SPUR / 01",
    attentionFirst: "Aufmerksamkeit zuerst",
    allowanceReady: "Die Freigabe kann geprüft werden.",
    allowanceDescription:
      "Prüfe eine exakte ERC-20-Freigabe, bevor Wert fließt.",
    recentStore: "AKTUELL / GEMEINSAMER STORE",
    latestEvidence: "Neueste Belege",
    allReceipts: "Alle Belege",
    contextWallet: "WALLET-KONTEXT",
    contextNetwork: "NETZWERK",
    contextSigner: "SIGNIERER",
    contextAttention: "ACHTUNG",
    switchRequired: "Wechsel erforderlich",
    signerReady: "Bereit zum Signieren",
    signerWrong: "Falsches Netzwerk",
    noConnector: "kein Connector",
    attentionCount: (count) =>
      `${count} Aktion${count === 1 ? "" : "en"} prüfen`,
    openReviewQueue: "Prüfungsliste öffnen",
    loadingVaults: "Vaults werden geladen…",
    agentsScoped: (count) => `${count} Agent${count === 1 ? "" : "en"} erfasst`,
    needReview: (count) => `${count} prüfen`,
    fleetNominal: "Flotte nominal",
    eventsIndexed: "Ereignisse indexiert",
    queueAwaiting: "Bestätigung ausstehend",
    oracleUnreachable: "Oracle unerreichbar",
    secondaryTelemetry: "SEKUNDÄRE TELEMETRIE",
    telemetryTitle: "Telemetrie und aktuelle Belege",
    noEvidence: "Noch keine Belege",
    noEvidenceHint:
      "Minte einen Agent oder führe eine Zahlung aus, um den ersten Beleg zu erzeugen.",
    registerUnavailable: "Agentenregister nicht verfügbar",
    noAgents: "Noch keine Agents",
    noAgentsHint: "Minte deinen ersten Agent, um die Flotte zu starten.",
    mintAgent: "Agent minten",
    noDescription: "keine Beschreibung",
    refreshNotice: "Übersicht aus den Live-Indexern aktualisiert.",
    agentFundingEyebrow: (tokenId) => `AGENT #${tokenId} / FINANZIERUNG`,
    paymentAllowanceEyebrow: "ZAHLUNG / FREIGABE",
  },
  chat: {
    pageTitle: "Chat",
    statusOnline: "Online · {chainName}",
    statusWrongNetwork: "Zu {chainName} wechseln",
    wrongNetworkBanner: "Falsches Netzwerk. Wallet zu {chainName} wechseln.",
    newChat: "Neuer Chat",
    historyToggle: "Verlauf",
    emptyTagline:
      "Agents · Vaults · Ticks. Das Wallet signiert On-Chain-Aktionen.",
    promptAgents: "Meine Agents",
    promptAgentsHint: "Was du besitzt",
    promptMint: "Agent minten",
    promptMintHint: "Wallet signiert",
    promptVault: "Vault-Guthaben",
    promptVaultHint: "{nativeSymbol}-Bestände",
    promptTick: "Tick simulieren",
    promptTickHint: "Erst sicher testen",
    toolsToggle: (count) => `Alle ${count} Tools`,
    toolsBrowse: "anzeigen ▾",
    toolsHide: "ausblenden ▴",
    roleYou: "Du",
    roleAssistant: "Assistent",
    roleTool: "Tool",
    toolResultFallback: "Tool-Ergebnis",
    questionFallback: "Frage",
    editResend: "Bearbeiten und erneut senden",
    regenerate: "Antwort neu erzeugen",
    regenerateShort: "Neu erzeugen",
    copyMessage: "Nachricht kopieren",
    copyShort: "Kopieren",
    copiedMessage: "Kopiert",
    toolPrompts: {
      evm_wallet: "Prüfe Guthaben und Netzwerk meines Wallets",
      evm_multichain: "Frage diese Adresse über mehrere Chains ab: ",
      evm_tx: "Erstelle und sende eine Transaktion an ",
      evm_token: "Prüfe das Token-Guthaben von ",
      evm_gas: "Schätze die aktuellen Gaspreise",
      evm_whale: "Verfolge große Wallet-Bewegungen über ",
      evm_contract: "Rufe eine Contract-Methode auf ",
      evm_allowance: "Prüfe die Token-Freigabe von ",
      stocks_quote: "Hole die aktuelle Kursnotierung für ",
      stocks_search: "Suche Ticker für ",
      stocks_history: "Zeige die Kursverläufe von ",
      stocks_compare: "Vergleiche Fundamentaldaten von ",
      stocks_crypto: "Hole die Krypto-Marktdaten für ",
      osint_sec_edgar: "Suche SEC-Filings für ",
      osint_usaspending: "Suche US-Bundesausgaben für ",
      osint_ofac_sdn: "Prüfe den Sanktionsstatus von ",
      osint_opencorporates: "Suche die Firmenregistrierung von ",
      osint_entity_resolve: "Löse Entitätsreferenzen auf für ",
      osint_courtlistener: "Suche Gerichtsentscheidungen für ",
      list_my_agents: "Liste meine Agents auf",
      vault_balance: "Zeige das Vault-Guthaben von Agent #",
      agent_metadata: "Zeige die On-Chain-Metadaten von Agent #",
      event_history: "Zeige die letzten On-Chain-Ereignisse für Agent #",
      execute_tick: "Führe einen Strategie-Tick für Agent # aus",
      simulate_tick: "Teste einen Tick für Agent # trocken",
      mint_agent: "Minte einen neuen Agent namens ",
      deposit: "Zahle Guthaben in den Vault von Agent # ein",
      withdraw: "Zahle Guthaben aus dem Vault von Agent # aus",
      pay_for_agent: "Leiste eine Zahlung an Agent #",
      transfer: "Übertrage Agent # an einen neuen Inhaber",
      archive_lookup: "Suche den archivierten Account ",
      archive_account_tweets: "Zeige archivierte Tweets von ",
      archive_confirm_deletion:
        "Bestätige die Löschung des archivierten Snapshots ",
    },
    discardEditTitle: "Folgende Nachrichten verwerfen und bearbeiten",
    keepConversationTitle: "Unterhaltung behalten",
    editDiscards: "Bearbeiten verwirft den Rest",
    edit: "Bearbeiten",
    cancel: "Abbrechen",
    retry: "Erneut versuchen",
    dismiss: "Schließen",
    assistantResponding: "Der Assistent antwortet",
    tickInProgress: "Tick läuft…",
    queuedCount: (count) => `${count} wartend`,
    answerPlaceholder: "Antwort eingeben…",
    placeholder: (assistant) => `Nachricht an ${assistant}…`,
    placeholderStreaming: "Folgefrage einreihen…",
    send: "Senden",
    queue: "Einreihen",
    stop: "Stopp",
    removeQueued: "Wartende Nachricht entfernen",
    routing: "Routing",
    routingHint: "Nur diese Unterhaltung",
    routingAuto: "Auto (schnellster)",
    routingCheapest: "Günstigster",
    routingVerified: "Nur verifizierte Provider (TEE)",
    routingPrivate: "Privat (versiegelte Enklave)",
    routingPrivateHintOn:
      "Versiegelte Enklaven-Inferenz (Prompts verlassen die Enklave nie)",
    routingPrivateHintOff:
      "Kein Provider mit versiegelter Enklave bedient dieses Modell",
    routingChipTitle:
      "Provider-Routing — ändere, wie diese Unterhaltung bedient wird",
    routingSummaryAuto: "Auto",
    routingSummaryCheapest: "Günstigster",
    routingStatusPinned: (address) =>
      `An ${address} gepinnt — jeder Turn wird von diesem Provider bedient.`,
    routingStatusCheapest:
      "Günstigster Provider zuerst; der bedienende Provider kann zwischen Turns wechseln.",
    routingStatusAuto:
      "Schnellster Provider zuerst; Turns bleiben auf einem Provider, damit Folgefragen schneller sind.",
    phaseRunning: (names, elapsed) => `${names} läuft… (${elapsed} s)`,
    phaseStreaming: (elapsed) => `Antwort wird gestreamt… (${elapsed} s)`,
    phaseThinking: "Denkt nach…",
    phaseWaiting: (elapsed) => `Warte auf Modellantwort… (${elapsed} s)`,
    historyTitle: "Chats",
    historyNew: "Neu",
    historySearch: "Chats suchen…",
    historyEmpty: "Noch kein Verlauf. Sende eine Nachricht.",
    historyNoMatch: "Keine passenden Chats.",
    historyLoading: "Server-Verlauf wird geladen…",
    historyRestore: "Server-Verlauf wiederherstellen",
    historyRestoreHint:
      "Signiere eine Wallet-Nachricht, um die serverseitigen Transkripte dieses Wallets zu laden. Es wird keine Transaktion gesendet.",
    historyDelete: (title) => `Chat löschen: ${title}`,
    untitledThread: "Neuer Chat",
    deletedToast: "Chat gelöscht",
    undo: "Rückgängig",
    metricsShow: "Metriken",
    metricsHide: "Metriken ausblenden",
  },
  storage: {
    eyebrow: "DATENPROVENIENZ / 0G",
    title: "Payload speichern, dann den Beleg prüfen.",
    description:
      "Verschlüsselung, Root-Hash, Storage-Transaktion, Integritätsnachweis und Index-Verfügbarkeit bleiben getrennt.",
    openChat: "Chat-Transkript öffnen",
    adapter: "0G-STORAGE-ADAPTER",
    payload: "Agenten-Metadaten-Payload",
    fileMeta: "18,4 KB · AES-GCM-verschlüsselt · 4 Tags",
    labels: [
      "Payload bereit",
      "Verschlüsselt",
      "Root-Hash erstellt",
      "Veröffentlicht",
      "Beleg geprüft",
      "Verfügbar",
    ],
    note: "Verfügbar erst, wenn Root-Hash, Storage-Transaktion, Beleg und Index vorhanden sind.",
    provenanceRecord: "PROVENIENZ-REGISTER",
    whatCanProve: "Was die Oberfläche belegen kann",
    rootHash: "Root-Hash",
    storageTx: "Storage-Transaktion",
    integrityProof: "Integritätsnachweis",
    encryption: "Verschlüsselung",
    indexerAge: "Indexer-Alter",
    download: "Download",
    available: "verfügbar",
    notReady: "nicht bereit",
    source: "QUELLE",
    sourceName: "0G-Storage-SDK / Indexer",
    sourceDescription:
      "Die Demo bildet die Adapterform ab; Replikation und Pinning werden nicht behauptet.",
    pending: "ausstehend",
    notIndexed: "nicht indexiert",
    fixture: "Demo / nicht live",
    demoNotice:
      "Demo-Pipeline — es ist noch kein Storage-Backend verbunden. Die Stufen unten zeigen, was ein echter Upload ausgeben wird; hier wird kein Zustand erzeugt oder gespeichert.",
  },
  flows: {
    mint: {
      eyebrow: "MINT / PROVENANCE-GRENZE",
      title: "Agent minten",
      copy: "Name → Hash → Oracle-Bestätigung → Beleg.",
      steps: ["Metadaten-Hash", "Oracle-Bestätigung", "Beleg indexiert"],
    },
    payment: {
      eyebrow: "PAYMENT / FREIGABE-ROUTE",
      title: "Mit Kontext finanzieren",
      copy: "Token, exakte Freigabe, Gebühr, Royalty und Ereignisse bleiben sichtbar.",
      steps: [
        "Exakte Freigabe",
        "Freigabe- / Zahlungsgrenze",
        "Beleg indexiert",
      ],
    },
    transfer: {
      eyebrow: "TRANSFER / SIGNIERTER BELEG",
      title: "Mit Nachweis übertragen",
      copy: "Challenge → Signatur → Abschluss → On-Chain-Beleg. Der Ablauf bleibt nachvollziehbar.",
      steps: ["Empfänger-Challenge", "Signaturgrenze", "Beleg indexiert"],
    },
    tick: {
      eyebrow: "ORCHESTRATOR / STREAM",
      title: "Nächsten Tick ausführen",
      copy: "Absicht → Provider → Stream → Ergebnis → Ereignis oder Transaktion → Recovery.",
      steps: ["Begrenzte Anweisung", "Provider-Route", "Ereignis indexiert"],
    },
    deposit: {
      eyebrow: "VAULT / EINZAHLUNGSROUTE",
      title: "In den Vault einzahlen",
      copy: "Betrag → Prüfung → Wallet-Grenze → On-Chain-Beleg. Der Vault-Stand bleibt sichtbar, bevor Wert fließt.",
      steps: ["Betrag + Guthaben", "Wallet-Grenze", "Beleg indexiert"],
    },
    withdraw: {
      eyebrow: "VAULT / AUSZAHLUNGSROUTE",
      title: "Aus dem Vault auszahlen",
      copy: "Betrag → Prüfung → Wallet-Grenze → On-Chain-Beleg. Der Reststand wird vor dem Signieren gezeigt.",
      steps: ["Guthaben geprüft", "Wallet-Grenze", "Beleg indexiert"],
    },
  },
  flowUi: {
    openTransactions: "Transaktionszentrum öffnen",
    confirmingReceipt: "Beleg wird bestätigt…",
    ready: "BEREIT",
    finalEvidence: "FINALER NACHWEIS",
    inFlight: "IN ARBEIT",
    simulatedReceipt: "simulierter Beleg",
    confirmResult: "Simuliertes Ergebnis bestätigen",
    continueTo: "Weiter zu",
    restart: "Diesen Flow neu starten",
    simulateReject: "Ablehnung simulieren",
    simulateTimeout: "Timeout simulieren",
    evidenceBoundary: "BELEG-GRENZE",
    wallet: "Wallet",
    agent: "Agent",
    network: "Netzwerk",
    currentState: "Aktueller Status",
    receipt: "Beleg",
    awaitingConfirmation: "Bestätigung ausstehend",
    readyToConfirm: "bereit zur Bestätigung",
    notCreated: "nicht erstellt",
    noLiveCall: "Fixture / kein Live-Aufruf",
    confirming: "BESTÄTIGUNG",
    stepWallet: "Wallet-Grenze",
    stepAuto: "Automatisch beobachtet",
  },
  agentDetail: {
    executionSurface: "operatorgesteuerte Ausführungsoberfläche.",
    operatingBalance: "BETRIEBSGUTHABEN",
    vaultRoute: "Vault-Route · {chainName}",
    dataHash: "Metadaten-Hash",
    overview: "Übersicht",
    execute: "Ausführen",
    payments: "Zahlungen",
    activity: "Aktivität",
    identityProvenance: "IDENTITÄT / PROVENIENZ",
    agentRecord: "Agentenakte",
    owner: "Inhaber",
    agentId: "Agent-ID",
    metadataRoot: "Metadaten-Hash",
    lastEvent: "Letztes Ereignis",
    inspectStorageProof: "Storage-Beleg prüfen",
    commandSafeAction: "BEFEHL / SICHERE AKTION",
    chooseBoundedOperation: "Wähle eine begrenzte Operation.",
    fundAgent: "Agent finanzieren",
    depositFunds: "In Vault einzahlen",
    withdrawFunds: "Aus Vault auszahlen",
    transferProof: "Nachweis übertragen",
    queueTick: "Tick einreihen",
    tickQueuedNotice:
      "Tick-Anfrage wurde im gemeinsamen Prototyp-Store eingereiht.",
    commandEvidence:
      "Jede Aktion öffnet ihr eigenes Belegmodell und kehrt mit einem Beleg zu Aktivität zurück.",
    executeBoundedIntent: "AUSFÜHREN / BEGRENZTE ABSICHT",
    runRecoveryPath: "Führe eine Operation mit Wiederherstellungspfad aus.",
    instruction: "Anweisung",
    instructionPlaceholder: "Aktuelle Route auswerten",
    instructionHint: "Simulierter Befehl; kein Live-Provider-Aufruf.",
    providerRoute: "Provider-Route",
    providerValue: "Axiom-Orchestrator",
    providerHint: "In Settings ausgewählte Fixture-Route.",
    createTickIntent: "Tick-Absicht erstellen",
    createTickNotice:
      "Anweisung erstellt. Öffne Tick, um den Stream zu prüfen.",
    cancel: "Abbrechen",
    paymentsActivity: "ZAHLUNGEN / AKTIVITÄT",
    valueRouteFor: (agent) => `Wert-Route für ${agent}`,
    token: "TOKEN",
    allowance: "FREIGABE",
    royalty: "ROYALTY",
    openPaymentFlow: "Zahlungsflow öffnen",
    earnings: "Erträge",
    activityFor: (agent) => `AKTIVITÄT / ${agent.toUpperCase()}`,
    evidenceTied: "Belege zu diesem Agenten",
  },
  transactions: {
    eyebrow: "OPERATIONEN / BELEGE",
    title: "Transaktionszentrum",
    description:
      "Jede Signatur hat einen Status, eine Quelle und einen Wiederherstellungspfad.",
    refreshState: "Status aktualisieren",
    refreshNotice:
      "Belegindex erneut geprüft. Ausstehende Status bleiben ausstehend.",
    feedDown: "Live-Ereignisfeed offline — Polling stattdessen.",
    liveQueue: "AKTIVE WARTESCHLANGE",
    confirmingNow: "wird bestätigt",
    today: "HEUTE",
    receiptsIndexed: "Belege indexiert",
    recovery: "WIEDERHERSTELLUNG",
    needReview: "prüfen",
    confirmedNote:
      "Bestätigt bedeutet: Beleg wurde beobachtet und Ereignis dekodiert. Ausstehend wird nie zu Erfolg.",
    activitySharedStore: "AKTIVITÄT / GEMEINSAMER STORE",
    statefulOperations: "Zustandsbehaftete Operationen",
    filterAll: "Alle",
    filterReview: "Zur Prüfung",
    filterStale: "Veraltet",
    moreFilters: "Mehr Filter",
    operation: "OPERATION",
    hash: "HASH",
    age: "ALTER",
    state: "STATUS",
    emptyState:
      "Keine Belege passen zu diesem Status. Der gemeinsame Store verbirgt keine Elemente.",
    closeReceipt: "Beleg schließen",
    transactionHash: "Transaktions-Hash",
    network: "Netzwerk",
    agent: "Agent",
    event: "Ereignis",
    decodedIndexed: "dekodiert + indexiert",
    awaitingFinalEvidence: "finaler Beleg ausstehend",
    openRecovery: "Wiederherstellung öffnen",
    recoveryNotice: "Wiederherstellung geöffnet. Operation ist wieder bereit.",
    openOperation: "Operation öffnen",
  },
  status: {
    ready: "Bereit zum Start",
    approval: "Freigabe angefordert",
    signing: "Signatur angefordert",
    submitted: "Übermittelt",
    confirming: "Wird bestätigt",
    confirmed: "Bestätigt",
    reverted: "Zurückgesetzt",
    rejected: "Abgelehnt",
    stale: "Prüfung nötig",
  },
  plural: {
    messages: (count) => `${count} Nachricht${count === 1 ? "" : "en"}`,
    transactions: (count) => `${count} Transaktion${count === 1 ? "" : "en"}`,
    steps: (count) => `${count} Schritt${count === 1 ? "" : "e"}`,
    agents: (count) => `${count} Agentenaktion${count === 1 ? "" : "en"}`,
  },
};

export const copyByLocale: Record<Locale, Copy> = {
  en: english,
  fr: french,
  de: german,
};

export function getCopy(locale: Locale = "en"): Copy {
  const copy = copyByLocale[locale] ?? english;
  // Défense supplémentaire : ces libellés restent sémantiques, jamais séquentiels.
  const withoutSequence = (value: string) =>
    value.replace(/\s*\/\s*0\d+\s*$/, "");
  return {
    ...copy,
    dashboard: {
      ...copy.dashboard,
      agentRegister: withoutSequence(copy.dashboard.agentRegister),
      proofLane: withoutSequence(copy.dashboard.proofLane),
    },
  };
}

export function formatCount(
  locale: Locale,
  count: number,
  kind: keyof Copy["plural"],
): string {
  return getCopy(locale).plural[kind](count);
}
