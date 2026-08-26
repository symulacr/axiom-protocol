/**
 * Axiom Copper Command Deck — typed interface copy.
 * Style reminder: operational, evidence-led, concise; keep copper actions explicit,
 * phosphor states factual, and avoid implying a live wallet or contract call.
 */

export type Locale = "en" | "fr" | "de";
type CopyFlow =
  "mint" | "payment" | "transfer" | "tick" | "deposit" | "withdraw";

/**
 * Interpolation contract: copy NEVER hardcodes a chain name,
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
  /** Shell chrome above/beside the page body. */
  topbar: {
    connected: string;
    notConnected: string;
    operator: string;
    openRail: string;
    oracleLive: string;
    oracleDown: string;
  };
  /** Priority action strip + next-safe-action engine (lib/nextSafeAction). */
  strip: {
    reviewTitle: (kind: string) => string;
    reviewSummary: string;
    reviewImpact: string;
    fundTitle: (tokenId?: string) => string;
    fundSummary: string;
    fundImpact: string;
    proofReceipt: string;
    proofAgent: string;
    openReview: string;
    whyNow: string;
    seeAllQueue: string;
    prefilledNote: string;
  };
  /** CommandCenter palette (⌘K). */
  command: {
    title: string;
    groupNextSafeAction: string;
    groupGoTo: string;
    groupRecent: string;
    resultsCount: (count: number) => string;
    placeholder: string;
    emptyTitle: string;
    emptyBody: string;
    hintKeys: string;
  };
  /** Accessible names for icon-only shell/chrome controls (C-I18N residual:
   * visible text was localized in row 7; these thread the same locales
   * through the aria-labels). */
  a11y: {
    primaryNav: string;
    openNav: string;
    closeNav: string;
    collapseSidebar: string;
    hideSidebar: string;
    resizeSidebar: string;
    openCommand: string;
    closeCommand: string;
    chatThreads: string;
    chatInput: string;
    txConfirmations: string;
    closeNotification: string;
    closeOnboarding: string;
    explorePublicPaths: string;
    walletAccess: string;
    closeWalletAccess: string;
    /** U27: skip-to-content link in AppShell. */
    skipToContent: string;
  };
  landing: {
    titleLead: string;
    titleEmphasis: string;
    description: string;
    nextSafeAction: string;
    signatureBoundary: string;
    consoleAccess: string;
    menuGuideHint: string;
    menuDevelopers: string;
    menuDevelopersHint: string;
    /** U21: signed-out escape hatch straight into the public /chat surface. */
    tryAssistant: string;
    stripVerifySmall: string;
    stripOperateSmall: string;
  };
  wallet: {
    /** Placeholder: `{chainName}` — the TARGET network (APP_CHAIN.name). */
    wrongNetworkTitle: string;
    wrongNetworkDescription: string;
    /** Placeholder: `{chainName}`. */
    switchNetwork: string;
    networkMismatch: string;
    /** Placeholders: `{chainId}`, then `{chainName}` + `{chainId}`. */
    connectedChain: string;
    requiredChain: string;
    profileHint: string;
    /** Gate headline (WalletGate connect panel). */
    gateTitle: string;
    /** Gate art emphasis line ("One session."). */
    gateSessionLine: string;
    /** Conflict chooser (mounted only when >1 injected wallet is installed). */
    connectTitle: string;
    browserWalletLabel: string;
    browserWalletHint: string;
    walletConnectLabel: string;
    walletConnectHint: string;
    /** Secondary CTA under the direct-connect primary. */
    useMobileWallet: string;
    /** Shown when no injected provider announced via EIP-6963. */
    noWalletDetected: string;
  };
  guide: {
    nextStep: string;
    finish: string;
    skip: string;
    step1Title: string;
    step1Body: string;
    openOverview: string;
    step2Title: string;
    step2Body: string;
    openTransactions: string;
    step4Title: string;
    step4Body: string;
    openSettings: string;
  };
  staking: {
    lede: string;
    body: string;
    openVault: string;
    reviewEvidence: string;
  };
  /** Recovery404 — says what happened and the safe next step, never what the
   * page implementation didn't load. */
  notFound: {
    titleLead: string;
    titleEmphasis: string;
    body: string;
    returnToLanding: string;
    openConsole: string;
    /** document.title for unknown routes. */
    title: string;
  };
  /** ErrorBoundary fallback chrome (localized like every other surface —
   * the raw error text itself still routes through humanizeError). */
  errorBoundary: {
    networkTitle: string;
    genericTitle: string;
    networkBody: string;
    retry: string;
    reload: string;
  };
  settings: {
    pageTitle: string;
    languageLabel: string;
    /** Page lede — describes the whole surface, not one control. */
    pageDescription: string;
    localeEnglish: string;
    localeFrench: string;
    localeGerman: string;
    liveWallet: string;
    signingContext: string;
    /** Operator profile name editor (03 — Settings owns renames;
     * the WalletGate step only ever creates the first value). */
    profileNameLabel: string;
    profileNameSave: string;
    profileNameSaved: string;
    dailyTitle: string;
    layoutTitle: string;
    advancedTitle: string;
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
    shortcutTitle: string;
    shortcutHint: string;
    shortcutPalette: string;
    shortcutSurfaces: string;
    shortcutFlows: string;
    replayOnboarding: string;
    resetSurface: string;
    resetConfirmTitle: string;
    resetConfirmBody: string;
    resetConfirmAction: string;
    resetCancel: string;
    lockConsole: string;
  };
  dashboard: {
    titleLead: string;
    titleEmphasis: string;
    review: (count: number) => string;
    refresh: string;
    managedValue: string;
    agentsOnline: string;
    /** U8: stat labels say whose numbers they are (scoped via isOwnEvent). */
    myEventsSeen: string;
    pendingMine: string;
    operatingFleet: string;
    attentionFirst: string;
    allowanceReady: string;
    latestEvidence: string;
    allReceipts: string;
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
     * queue, not the plumbing; an outage overrides it. */
    queueAwaiting: string;
    oracleUnreachable: string;
    telemetryTitle: string;
    noEvidence: string;
    noEvidenceHint: string;
    registerUnavailable: string;
    noAgents: string;
    noAgentsHint: string;
    mintAgent: string;
    noDescription: string;
    refreshNotice: string;
    /** Proof-card category line above the allowance headline. */
    agentFundingLabel: (tokenId: string) => string;
  };
  /** Live /chat surface (v1 SSE chat). Every rendered string routes through
   * this section — hardcoded English in ChatPage was the defect. */
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
    /** Full no-parameter intent sent when a depth-0 prompt card is clicked
     * (U16); the visible card label stays short. */
    promptAgentsIntent: string;
    promptMintIntent: string;
    promptVaultIntent: string;
    promptTickIntent: string;
    toolsToggle: (count: number) => string;
    toolsBrowse: string;
    toolsHide: string;
    roleYou: string;
    roleAssistant: string;
    roleTool: string;
    toolResultFallback: string;
    /** EncodePreviewCard (chat path) — the raw-calldata panel stays a
     * documented chat-path exception; these strings at least localize its
     * chrome and label the raw payload clearly. */
    encodeTitle: string;
    encodeSubmitted: string;
    encodeRawData: string;
    encodeSign: string;
    questionFallback: string;
    editResend: string;
    regenerate: string;
    regenerateShort: string;
    copyMessage: string;
    copyShort: string;
    /** Inline confirmation after a copy action (every copy confirms — 04
     * ); rendered as the swapped label beside the ✓. */
    copiedMessage: string;
    /** Tool browser: clicking a tool inserts this natural-language prompt
     * template (trailing space = parameter placeholder), never the raw
     * snake_case function name. Fallback = tool label. */
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
    /** the tx-mined confirmation row is ONE
     * localized string, not glyph-joined label spans. */
    txMined: (
      tokenId: string | null,
      event: string | null,
      block: number | null,
    ) => string;
    historyTitle: string;
    historyNew: string;
    historySearch: string;
    historyEmpty: string;
    historyNoMatch: string;
    historyLoading: string;
    historyRestore: string;
    historyRestoreHint: string;
    /** U25: explanatory line rendered beside the restore CTA when the rail is empty. */
    historyOnChainNote: string;
    historyDelete: (title: string) => string;
    untitledThread: string;
    deletedToast: string;
    undo: string;
    metricsShow: string;
    metricsHide: string;
  };
  storage: {
    title: string;
    description: string;
    openChat: string;
    payload: string;
    /** Disclosure title under the payload panel head — must not repeat the
     * panel h2. */
    fileSteps: string;
    fileMeta: string;
    labels: string[];
    note: string;
    whatCanProve: string;
    rootHash: string;
    storageTx: string;
    integrityProof: string;
    encryption: string;
    indexerAge: string;
    download: string;
    available: string;
    notReady: string;
    sourceName: string;
    sourceDescription: string;
    pending: string;
    notIndexed: string;
    /** Clear demo banner — the ladder is documentation until a storage
     * backend exists; no fake progress, no fake hashes. */
  };
  flows: Record<
    CopyFlow,
    {
      title: string;
      copy: string;
      steps: string[];
      /** canonical receipt name — MUST equal copy.nav[kind] (naming
       * contract, one name per destination); guarded in copy.test.ts. */
      receiptKind: string;
      /** Review-sheet EFFECT row. */
      consequence: string;
      /** Review-sheet proof line. */
      proofLine: string;
      /** Evidence-aside h2. */
      contextTitle: string;
      /** Primary field label + hint (flow form body). */
      fieldLabel: string;
      fieldHint: string;
      /** Receipt-row detail template ({name}/{amount}/{agent}/{recipient}/
       * {symbol}/{action}/{reason} resolved at render time). */
      detail: string;
      /** Submit-success notice template ({name}/{agent}). */
      notice: string;
    }
  >;
  flowUi: {
    openTransactions: string;
    restart: string;
    simulateReject: string;
    simulateTimeout: string;
    wallet: string;
    agent: string;
    network: string;
    receipt: string;
    /** Proof-timeline step sublabels (C-: the ladder localizes with the
     * steps — these two were the last hardcoded English on flow pages). */
    stepWallet: string;
    stepAuto: string;
    /** receiver co-sign step (cross-party transfer): the recipient's
     * wallet must sign the acceptance before the sender submits. */
    coSignTitle: string;
    coSignBody: (receiver: string) => string;
    coSignAction: string;
    coSignNote: string;
    /** Honest blocker when the connected wallet cannot expose the receiver
     * account — no futile retry, just the two real remedies. */
    coSignBlockedTitle: string;
    coSignBlockedBody: (receiver: string) => string;
    /** flow-body i18n — shared chrome of the six flow pages, the review
     * sheet and the receipt panel (field labels, review rows, receipt
     * headings/bodies, notices, boundary fact rows). */
    stageTitle: string;
    reviewOpenLabel: string;
    detailsEditable: string;
    /** Placeholder: {chainId}. */
    chainLive: string;
    reviewAction: string;
    agentLabel: string;
    agentA11y: string;
    agentSelectPlaceholder: string;
    noAgentsOption: string;
    agentOption: (id: string) => string;
    agentHint: string;
    errAmountPositive: string;
    errExceedsVault: string;
    errInvalidAmount: string;
    errNameLength: string;
    errRecipientAddress: string;
    errRecipientKey: string;
    /** U10: shape-aware variant fired when the paste is a 42-char address. */
    errRecipientKeyIsAddress: string;
    /** U11: expanding 3-step walkthrough under the recipient-key field. */
    transferKeyWalkthroughTitle: string;
    transferKeyWalkthroughSteps: string[];
    errInstruction: string;
    errSelectAgent: string;
    intentFund: string;
    intentProof: string;
    intentBounded: string;
    intentRecovery: string;
    intentReceipt: string;
    /** Visually hidden label for the tick token stream. */
    streamLabel: string;
    cancelStream: string;
    receiptHeadingConfirmed: string;
    receiptHeadingReverted: string;
    receiptHeadingStale: string;
    receiptHeadingConfirming: string;
    receiptOverlayConfirmed: string;
    receiptOverlayReverted: string;
    receiptOverlayStale: string;
    receiptOverlayConfirming: string;
    receiptBodyConfirmed: string;
    receiptBodyReverted: string;
    /** Placeholder: {seconds}. */
    receiptBodyStale: string;
    receiptBodyConfirming: string;
    copyReceiptAction: string;
    openReceiptAction: string;
    startAnotherAction: string;
    receiptCopiedNotice: string;
    vaultBalanceAfter: string;
    exceedsBalance: string;
    /** Placeholders: {amount}, {symbol}. */
    vaultedHint: string;
    /** Placeholders: {amount}, {symbol}. */
    allowanceNote: string;
    liveRouteNote: string;
    simulateRejectedError: string;
    simulateTimeoutError: string;
    tickActed: string;
    tickHeld: string;
    allowanceKind: string;
    /** Placeholders: {amount}, {symbol}. */
    allowanceDetail: string;
    approveSentNotice: string;
    allowanceCoveredNotice: string;
    /** Placeholder: {kind} — the localized flow receiptKind. */
    reviewTitle: string;
    closeReviewA11y: string;
    factAgent: string;
    factAmount: string;
    factRecipient: string;
    factName: string;
    factInstruction: string;
    factNetwork: string;
    factBoundary: string;
    /** Placeholders: {chainName}, {chainId}. */
    networkFact: string;
    primarySign: string;
    primaryApprove: string;
    primaryContinuePayment: string;
    /** Placeholders: {amount}, {symbol}. */
    payCta: string;
    resumeReview: string;
    restartApproval: string;
    editDetails: string;
    awaitingWallet: string;
    submitTransfer: string;
    reviewDisclaimer: string;
    confirmOne: string;
    confirmTwo: string;
    confirmTwoApprovePay: string;
    confirmOneAllowance: string;
    confirmChecking: string;
    confirmReceiverThenSubmit: string;
    transferKeyLabel: string;
    transferKeyHint: string;
    transferAgentTitle: (id: string) => string;
    /** cross-wallet handoff — sender side (review-sheet co-sign step). */
    handoffTitle: string;
    handoffBody: string;
    handoffCopyLink: string;
    handoffLinkCopied: string;
    handoffPasteLabel: string;
    handoffPasteHint: string;
    handoffApply: string;
    handoffAppliedTitle: string;
    handoffAppliedNote: string;
    /** Placeholder: {receiver}. */
    handoffReceivedNotice: string;
    /** receiver page (/transfer/co-sign) — public, wallet-gated only by
     * the acceptance signature itself. */
    receiveTitle: string;
    receiveLede: string;
    /** Bare visit without ?data= — orientation for the receiver, not an error. */
    receiveNoLinkTitle: string;
    receiveNoLinkBody: string;
    receiveBadTitle: string;
    receiveBadBody: string;
    receiveAgent: string;
    receiveSender: string;
    receiveReceiver: string;
    receiveExpiry: string;
    receiveNetwork: string;
    receiveExpiredTitle: string;
    receiveExpiredBody: string;
    /** Placeholder: {chainId}. */
    receiveWrongChain: string;
    receiveConnect: string;
    receiveAcceptTitle: string;
    /** Placeholder: {receiver}. */
    receiveAcceptBody: string;
    receiveSign: string;
    receiveSigning: string;
    /** Placeholders: {connected}, {receiver}. */
    receiveWrongAccount: string;
    receiveDoneTitle: string;
    receiveDoneBody: string;
    receiveCopyCode: string;
    receiveCodeCopied: string;
    receiveDoneSameBrowser: string;
    /** U26: co-sign done-state presents a one-piece claim token + URL; the raw signature hides behind "Advanced". */
    claimTokenLabel: string;
    claimUrlLabel: string;
    claimRawToggle: string;
  };
  agentDetail: {
    operatingBalance: string;
    vaultRoute: string;
    noStrategy: string;
    dataHash: string;
    overview: string;
    execute: string;
    payments: string;
    activity: string;
    agentRecord: string;
    owner: string;
    agentId: string;
    metadataRoot: string;
    lastEvent: string;
    inspectStorageProof: string;
    chooseBoundedOperation: string;
    fundAgent: string;
    depositFunds: string;
    withdrawFunds: string;
    transferProof: string;
    queueTick: string;
    commandEvidence: string;
    runRecoveryPath: string;
    instruction: string;
    instructionPlaceholder: string;
    instructionHint: string;
    providerRoute: string;
    providerValue: string;
    providerHint: string;
    createTickIntent: string;
    cancel: string;
    valueRouteFor: (agent: string) => string;
    token: string;
    royalty: string;
    openPaymentFlow: string;
    earnings: string;
    evidenceTied: string;
  };
  transactions: {
    title: string;
    description: string;
    refreshState: string;
    refreshNotice: string;
    /** Appended to refreshNotice only when the live event feed is DOWN —
     * healthy plumbing is never announced. */
    feedDown: string;
    confirmingNow: string;
    needReview: string;
    confirmedNote: string;
    statefulOperations: string;
    filterAll: string;
    /** Depth-0 review-bucket chip (reverted+rejected+stale) — distinct from
     * the per-state stale chip (filterStale); they shared one label before. */
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
    /** U20: demoted drawer button — keeps the same go() destination but stops pre-filling a fresh draft as the primary action. */
    runAnother: string;
    /** drawer head: the drawer no longer repeats
     * the row's kind/detail/pill — it leads with its own title. */
    drawerTitle: string;
    proofTitle: string;
  };
  status: Record<string, string>;
};

/** Flow receipt-notice tails: the four submitted-flow notices differ only
 * by their verb head per locale (tick reports {outcome}, so it opts out). */
const enFlowNotice = (head: string): string =>
  `${head} Receipt added to the transaction center.`;

/** Count-suffix helpers: locales differ only in plural threshold/suffix;
 * keeps count-template entries on one line. */
const enS = (count: number) => (count === 1 ? "" : "s");
const frS = (count: number) => (count > 1 ? "s" : "");
const deS = (count: number) => (count === 1 ? "" : "en");

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
    tick: "Run agent task",
    deposit: "Deposit",
    withdraw: "Withdraw",
  },
  topbar: {
    connected: "connected",
    notConnected: "not connected",
    operator: "You",
    openRail: "Show sidebar",
    oracleLive: "online",
    oracleDown: "services degraded",
  },
  strip: {
    reviewTitle: (kind) => `Review ${kind}`,
    reviewSummary: "Recover the existing receipt before retrying.",
    reviewImpact: "No asset movement until you continue.",
    fundTitle: (tokenId) =>
      tokenId ? `Fund agent #${tokenId}` : "Open payment route",
    fundSummary: "Review an exact ERC-20 allowance before any value moves.",
    fundImpact: "Allowance and payment confirm separately.",
    proofReceipt: "Receipt",
    proofAgent: "Agent",
    openReview: "Open review",
    whyNow: "Why now",
    seeAllQueue: "See all queue",
    prefilledNote: "prefilled, not submitted",
  },
  command: {
    title: "Command Center",
    groupNextSafeAction: "Next safe action",
    groupGoTo: "Go to",
    groupRecent: "Recent",
    resultsCount: (count) => `${count} results`,
    placeholder: "Find action, receipt, or route",
    emptyTitle: "No matching destination",
    emptyBody: "Try a route, receipt hash, or the next safe action.",
    hintKeys: "↑↓ move · ↵ open · esc close",
  },
  a11y: {
    primaryNav: "Primary navigation",
    openNav: "Open primary navigation",
    closeNav: "Close navigation",
    collapseSidebar: "Collapse sidebar",
    hideSidebar: "Hide sidebar",
    resizeSidebar: "Resize sidebar",
    openCommand: "Open Command Center",
    closeCommand: "Close Command Center",
    chatThreads: "Chat threads",
    chatInput: "Chat input",
    txConfirmations: "Transaction confirmations",
    closeNotification: "Close notification",
    closeOnboarding: "Close onboarding",
    explorePublicPaths: "Explore public paths",
    walletAccess: "Axiom wallet access",
    closeWalletAccess: "Close wallet access",
    skipToContent: "Skip to content",
  },
  landing: {
    titleLead: "Move with",
    titleEmphasis: "evidence.",
    description:
      "Connect a wallet, act, and keep a receipt beside every action. Flows are real on the connected testnet.",
    nextSafeAction: "Next safe action",
    signatureBoundary: "Receipts for every signature",
    consoleAccess: "Console access",
    menuGuideHint: "How signing and receipts work",
    menuDevelopers: "Developers",
    menuDevelopersHint: "APIs and tools",
    tryAssistant: "Try the assistant — no wallet",
    stripVerifySmall: "No gas · no custody",
    stripOperateSmall: "Receipts beside action",
  },
  wallet: {
    wrongNetworkTitle: "Switch to {chainName}.",
    wrongNetworkDescription: "Your wallet is on another network.",
    switchNetwork: "Switch to {chainName}",
    networkMismatch: "Network mismatch",
    connectedChain: "Connected: chain {chainId}",
    requiredChain: "Required: {chainName} · chain {chainId}",
    profileHint: "Stored on this device only.",
    gateTitle: "Start here.",
    gateSessionLine: "One session.",
    connectTitle: "Choose a wallet.",
    browserWalletLabel: "Browser wallet",
    browserWalletHint: "MetaMask and other injected wallets",
    walletConnectLabel: "WalletConnect",
    walletConnectHint: "Scan the QR code or open your wallet app",
    useMobileWallet: "Use mobile wallet",
    noWalletDetected:
      "No browser wallet detected. Install one, or use a mobile wallet.",
  },
  guide: {
    nextStep: "Next step",
    finish: "Finish guide",
    skip: "Skip for now",
    step1Title: "Start with the next safe action.",
    step1Body: "Your next action sits in the copper strip at the top.",
    openOverview: "Open overview",
    step2Title: "Every signature gets a receipt.",
    step2Body:
      "Each step keeps its own state, so you always know what is left.",
    openTransactions: "Open transactions",
    step4Title: "Tune the surface to your work.",
    step4Body:
      "Resize or collapse the rail, choose reduced motion and reopen this guide from Settings.",
    openSettings: "Open settings",
  },
  staking: {
    lede: "Staking isn\u0027t part of Axiom.",
    body: "Axiom covers vaults, payments, transfers and storage. It does not cover validator delegation or rewards.",
    openVault: "Open the vault",
    reviewEvidence: "Review receipts",
  },
  notFound: {
    titleLead: "The route",
    titleEmphasis: "drifted.",
    body: "This page doesn't exist. Nothing was loaded and no wallet action was taken.",
    returnToLanding: "Return to landing",
    openConsole: "Open the app",
    title: "Page not found",
  },
  errorBoundary: {
    networkTitle: "Connection problem",
    genericTitle: "Something went wrong",
    networkBody:
      "Unable to load this section. Retry, or check your connection if it keeps failing.",
    retry: "Try again",
    reload: "Reload page",
  },
  settings: {
    pageTitle: "Settings",
    languageLabel: "Interface language",
    pageDescription: "Session, network and display preferences for this app.",
    localeEnglish: "English",
    localeFrench: "Français",
    localeGerman: "Deutsch",
    liveWallet: "live wallet",
    signingContext: "Signing context",
    profileNameLabel: "Operator profile name",
    profileNameSave: "Save name",
    profileNameSaved: "Profile name updated.",
    dailyTitle: "Daily preferences",
    layoutTitle: "Layout",
    advancedTitle: "Advanced",
    dangerTitle: "Destructive actions",
    dangerHint: "Wipes session, drafts and receipts. Settings survive.",
    compactRail: "Compact sidebar",
    compactRailHint: "Keep labels available while giving work more room.",
    reducedMotion: "Reduced motion",
    reducedMotionHint: "Keep status and guide transitions instant.",
    railHidden: "Rail hidden",
    railHiddenHint: "Reopen from the vertical edge control.",
    railWidth: "Rail width",
    railWidthHint: "drag to resize the sidebar.",
    density: "Density",
    densityCalm: "Calm",
    densityDense: "Dense",
    theme: "Surface theme",
    themeHint: "Contrast stays legible in both themes.",
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
    shortcutTitle: "Keyboard map",
    shortcutHint: "Shortcuts navigate; they never sign.",
    shortcutPalette: "Find actions, agents, receipts and routes",
    shortcutSurfaces: "Open main areas",
    shortcutFlows: "Open execution flows",
    replayOnboarding: "Replay onboarding",
    resetSurface: "Reset surface",
    resetConfirmTitle: "Reset the surface?",
    resetConfirmBody: "Signs you out and wipes drafts and receipts. No undo.",
    resetConfirmAction: "Reset everything",
    resetCancel: "Cancel",
    lockConsole: "Sign out",
  },
  dashboard: {
    titleLead: "Keep the",
    titleEmphasis: "receipts.",
    review: (count) =>
      `${count} agent${enS(count)} need${count === 1 ? "s" : ""} review.`,
    refresh: "Refresh overview",
    managedValue: "Managed value",
    agentsOnline: "Agents online",
    myEventsSeen: "My events seen",
    pendingMine: "My pending operations",
    operatingFleet: "Operating fleet",
    attentionFirst: "Attention first",
    allowanceReady: "Allowance is ready for review.",
    // One canonical allowance sentence, shared with the strip.
    latestEvidence: "Latest receipts",
    allReceipts: "All receipts",
    switchRequired: "switch required",
    signerReady: "Ready to sign",
    signerWrong: "Wrong network",
    noConnector: "no connector",
    attentionCount: (count) => `${count} receipt${enS(count)} need review`,
    openReviewQueue: "Open review queue",
    loadingVaults: "loading vaults…",
    agentsScoped: (count) => `${count} agent${count === 1 ? "" : "s"} scoped`,
    needReview: (count) => `${count} need review`,
    fleetNominal: "fleet nominal",
    eventsIndexed: "events indexed",
    queueAwaiting: "awaiting confirmation",
    oracleUnreachable: "status checks failing",
    telemetryTitle: "Recent activity",
    noEvidence: "Nothing here yet",
    noEvidenceHint: "Mint an agent to create the first receipt.",
    registerUnavailable: "Agent register unavailable",
    noAgents: "No agents yet",
    noAgentsHint: "Mint your first agent to start the fleet.",
    mintAgent: "Mint an agent",
    noDescription: "no description",
    refreshNotice: "Overview refreshed.",
    agentFundingLabel: (tokenId) => `Agent #${tokenId} funding`,
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
    promptAgentsIntent: "List my agents and their vault balances",
    promptMintIntent: "Help me mint a new agent",
    promptVaultIntent: "Show the vault balances of my agents",
    promptTickIntent: "Dry-run a strategy tick for one of my agents",
    toolsToggle: (count) => `All ${count} tools`,
    toolsBrowse: "browse ▾",
    toolsHide: "hide ▴",
    roleYou: "You",
    roleAssistant: "Assistant",
    roleTool: "Tool",
    toolResultFallback: "Tool result",
    encodeTitle: "Sign this transaction",
    encodeSubmitted: "Submitted, awaiting confirmation",
    encodeRawData: "raw contract payload (developer view)",
    encodeSign: "Sign in wallet",
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
      osint_company_search: "Look up company registration for ",
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
    routingVerified: "Verified providers only",
    routingPrivate: "Private providers (extra isolation)",
    routingPrivateHintOn:
      "TEE-isolated inference — prompts never leave the provider's enclave",
    routingPrivateHintOff: "No TEE provider serves this model",
    routingChipTitle:
      "Provider routing. Change how this conversation is served",
    routingSummaryAuto: "Auto",
    routingSummaryCheapest: "Lowest cost",
    routingStatusPinned: (address) =>
      `Pinned to ${address}. Every turn is served by this provider.`,
    routingStatusCheapest: "Cheapest first; may change between turns.",
    routingStatusAuto: "Fastest provider; follow-ups stay on it.",
    phaseRunning: (names, elapsed) => `Running ${names}… (${elapsed}s)`,
    phaseStreaming: (elapsed) => `Streaming response… (${elapsed}s)`,
    phaseThinking: "Thinking…",
    phaseWaiting: (elapsed) => `Waiting for model response… (${elapsed}s)`,
    txMined: (tokenId, event, block) =>
      `tx mined${tokenId ? ` · agent #${tokenId}` : ""}${event ? ` · ${event}` : ""}${block ? ` · block ${block}` : ""}`,
    historyTitle: "Chats",
    historyNew: "New",
    historySearch: "Search chats…",
    historyEmpty: "No history yet. Send a message.",
    historyNoMatch: "No matching chats.",
    historyLoading: "Loading server history…",
    historyRestore: "Restore server history",
    historyRestoreHint: "One free signature loads your saved chats.",
    historyOnChainNote:
      "Your chats are saved on-chain — restore them (1 signature)",
    historyDelete: (title) => `Delete chat: ${title}`,
    untitledThread: "New chat",
    deletedToast: "Chat deleted",
    undo: "Undo",
    metricsShow: "Metrics",
    metricsHide: "Hide metrics",
  },
  storage: {
    title: "Store the payload, then verify its proof.",
    description: "Each storage step is proven separately.",
    openChat: "Open chat transcript",
    payload: "Agent metadata payload",
    fileSteps: "File & steps",
    fileMeta: "18.4 KB · AES-GCM encrypted · 4 tags",
    labels: [
      "Payload ready",
      "Encrypted",
      "Root hashed",
      "Published",
      "Proof verified",
      "Available",
    ],
    note: "Available lights up once the steps above complete.",
    whatCanProve: "What the UI can prove",
    rootHash: "Root hash",
    storageTx: "Storage tx",
    integrityProof: "Integrity proof",
    encryption: "Encryption",
    indexerAge: "Indexer age",
    download: "Download",
    available: "available",
    notReady: "not ready",
    sourceName: "0G Storage SDK / Indexer",
    sourceDescription: "Each storage step is proven separately.",
    pending: "pending",
    notIndexed: "not indexed",
  },
  flows: {
    mint: {
      title: "Mint an agent",
      copy: "Name → hash → registration → receipt.",
      steps: ["Preparing identity", "Confirming uniqueness", "Receipt indexed"],
      receiptKind: "Mint",
      consequence: "Create an agent identity after confirmation.",
      proofLine: "Records the metadata hash and its on-chain registration.",
      contextTitle: "Identity before ownership.",
      fieldLabel: "Agent name",
      fieldHint: "Metadata hash is derived and shown in review.",
      detail: "{name} · registered on-chain",
      notice: enFlowNotice("Mint submitted for {name}."),
    },
    payment: {
      title: "Fund with context",
      copy: "Allowance, fees and events are visible before you pay.",
      steps: [
        "Spending limit",
        "Approval / payment boundary",
        "Receipt indexed",
      ],
      receiptKind: "Payment",
      consequence: "Fund the selected agent with the reviewed amount.",
      proofLine: "Bounds the allowance; payment confirms separately.",
      contextTitle: "Allowance before value.",
      fieldLabel: "Amount",
      fieldHint: "Exact allowance is shown in review.",
      detail: "{amount} → agent #{agent}",
      notice: enFlowNotice("Payment submitted for agent #{agent}."),
    },
    transfer: {
      title: "Transfer with evidence",
      copy: "Challenge → signature → finalization → on-chain receipt. Expiration never disappears.",
      steps: ["Recipient challenge", "Signature step", "Receipt indexed"],
      receiptKind: "Transfer",
      consequence: "Send the reviewed transfer to this recipient.",
      proofLine: "Binds the recipient challenge and expiry.",
      contextTitle: "Check, then sign.",
      fieldLabel: "Recipient",
      fieldHint: "Expiry and recipient appear in review.",
      detail: "agent #{agent} → {recipient}",
      notice: "Transfer submitted for agent #{agent}. Proof receipt added.",
    },
    tick: {
      title: "Run the next tick",
      copy: "Intent → provider → stream → result → event or transaction → recovery.",
      steps: ["Bounded instruction", "Provider route", "Event indexed"],
      receiptKind: "Run agent task",
      consequence: "Launch one cancellable task.",
      proofLine: "Records the provider route and execution evidence.",
      contextTitle: "Stream before result.",
      fieldLabel: "Instruction",
      fieldHint: "Cancellable; streamed tokens appear below.",
      detail: "{action} · {reason}",
      notice: "Tick {outcome} for agent #{agent}. Stream receipt indexed.",
    },
    deposit: {
      title: "Deposit into the vault",
      copy: "Amount → review → receipt. Balance shown before you sign.",
      steps: ["Amount + balance", "Wallet confirmation", "Receipt indexed"],
      receiptKind: "Deposit",
      consequence: "Move the reviewed amount into this agent's vault.",
      proofLine:
        "Encodes via the vault relay; value equals the reviewed amount.",
      contextTitle: "Review before value moves.",
      fieldLabel: "Amount",
      fieldHint: "The resulting vault balance appears in review.",
      detail: "{amount} {symbol} into agent #{agent}",
      notice: enFlowNotice("Deposit submitted for agent #{agent}."),
    },
    withdraw: {
      title: "Withdraw from the vault",
      copy: "Amount → review → receipt. Remaining balance before you sign.",
      steps: ["Balance checked", "Wallet confirmation", "Receipt indexed"],
      receiptKind: "Withdraw",
      consequence: "Move the reviewed amount out of this agent's vault.",
      proofLine:
        "Encodes via the vault relay; the remaining balance is shown above.",
      contextTitle: "Balance before withdrawal.",
      fieldLabel: "Amount",
      fieldHint: "The resulting vault balance appears in review.",
      detail: "{amount} {symbol} from agent #{agent}",
      notice: enFlowNotice("Withdrawal submitted for agent #{agent}."),
    },
  },
  flowUi: {
    openTransactions: "Open transaction center",
    restart: "Start this flow again",
    simulateReject: "Simulate reject",
    simulateTimeout: "Simulate timeout",
    wallet: "Wallet",
    agent: "Agent",
    network: "Network",
    receipt: "Receipt",
    stepWallet: "Your wallet",
    stepAuto: "Observed automatically",
    coSignTitle: "Receiver co-sign required",
    coSignBody: (receiver) =>
      `The receiver's wallet (${receiver}) signs first. You stay as sender.`,
    coSignAction: "Sign as receiver",
    coSignNote: "Then you submit from your wallet.",
    coSignBlockedTitle: "Receiver account not available",
    coSignBlockedBody: (receiver) =>
      `Can't sign for ${receiver} here. Add that account, or have the receiver accept themselves.`,
    stageTitle: "Review before you act.",
    reviewOpenLabel: "Review open",
    detailsEditable: "Details editable",
    chainLive: "chain {chainId} · live wallet",
    reviewAction: "Review operation",
    agentLabel: "Agent",
    agentA11y: "Target agent",
    agentSelectPlaceholder: "select an agent",
    noAgentsOption: "no agents yet (mint first)",
    agentOption: (id) => `Agent #${id}`,
    agentHint: "The agent whose vault or record this operation targets.",
    errAmountPositive: "Enter an amount above zero.",
    errExceedsVault: "Amount exceeds the vault balance.",
    errInvalidAmount: "Enter a valid amount.",
    errNameLength: "Use 2–80 characters.",
    errRecipientAddress: "Recipient must be a valid 0x address.",
    errRecipientKey: "Recipient public key must be 64 bytes of hex (0x…).",
    errRecipientKeyIsAddress:
      "This looks like an Ethereum address (42 chars) — a transfer needs the receiver's public key (132 chars). See “How to get it” below.",
    transferKeyWalkthroughTitle: "How to get it",
    transferKeyWalkthroughSteps: [
      "The receiver opens their wallet and picks the account that will hold the agent",
      "They open the account details and choose “Export public key”",
      "Paste the copied key here",
    ],
    errInstruction: "Describe the instruction.",
    errSelectAgent: "Select an agent first.",
    intentFund: "Agent selected. Review the exact allowance.",
    intentProof: "Transfer selected. Review the recipient details.",
    intentBounded: "Instruction selected. Streaming stays cancellable.",
    intentRecovery: "Recovering an existing receipt. No duplicate operation.",
    intentReceipt: "Linked to an indexed receipt.",
    streamLabel: "Streamed tokens",
    cancelStream: "Cancel stream",
    receiptHeadingConfirmed: "Receipt ready.",
    receiptHeadingReverted: "Reverted on-chain.",
    receiptHeadingStale: "Confirmation unknown.",
    receiptHeadingConfirming: "Submitted, confirming…",
    receiptOverlayConfirmed: "Receipt indexed",
    receiptOverlayReverted: "Reverted",
    receiptOverlayStale: "Check explorer",
    receiptOverlayConfirming: "Confirming on-chain",
    receiptBodyConfirmed: "Proof and event indexed in the transaction center.",
    receiptBodyReverted:
      "Reverted on-chain. The transaction center row offers recovery.",
    receiptBodyStale:
      "No confirmation after {seconds}s. Check the explorer; the row is marked Needs review.",
    receiptBodyConfirming: "Submitted, awaiting on-chain confirmation.",
    copyReceiptAction: "Copy receipt",
    openReceiptAction: "Open receipt",
    startAnotherAction: "Start another",
    receiptCopiedNotice: "Receipt identifier copied.",
    vaultBalanceAfter: "Vault balance after",
    exceedsBalance: "exceeds balance",
    vaultedHint:
      "In vault: {amount} {symbol}. The resulting balance appears in review.",
    allowanceNote:
      "Current allowance: {amount} {symbol} (exact-amount approval only, never infinite).",
    liveRouteNote: "",
    simulateRejectedError: "Signature rejected. Reviewed details are saved.",
    simulateTimeoutError: "Confirmation expired. Resume from review.",
    tickActed: "acted",
    tickHeld: "held",
    allowanceKind: "Allowance approval",
    allowanceDetail: "{amount} {symbol} → spending limit (step 1)",
    approveSentNotice: "Allowance approved on-chain. Now sign the payment.",
    allowanceCoveredNotice:
      "The allowance already covers this amount, so no approval transaction is needed.",
    reviewTitle: "Review operation.",
    closeReviewA11y: "Close review and edit operation details",
    factAgent: "Target agent",
    factAmount: "Amount",
    factRecipient: "Recipient",
    factName: "Agent name",
    factInstruction: "Instruction",
    factNetwork: "Network",
    factBoundary: "Limit",
    networkFact: "{chainName} · chain {chainId}",
    primarySign: "Sign & execute",
    primaryApprove: "Approve spending limit",
    primaryContinuePayment: "Continue to payment",
    payCta: "Pay {amount} {symbol}",
    resumeReview: "Resume review",
    restartApproval: "Restart approval review",
    editDetails: "Edit details",
    awaitingWallet: "Awaiting wallet",
    submitTransfer: "Submit transfer",
    reviewDisclaimer: "Nothing is submitted until you confirm in the wallet.",
    confirmOne: "1 wallet confirmation required",
    confirmTwo: "2 wallet confirmations required",
    confirmTwoApprovePay: "2 wallet confirmations required (approve, then pay)",
    confirmOneAllowance:
      "1 wallet confirmation required (allowance sufficient)",
    confirmChecking: "Up to 2 wallet confirmations (checking allowance…)",
    confirmReceiverThenSubmit:
      "2 wallet confirmations (receiver signs, then you submit)",
    transferKeyLabel: "Recipient public key",
    transferKeyHint: "64-byte hex (0x…), the new owner's encryption key.",
    transferAgentTitle: (id) => `Transfer agent #${id}`,
    handoffTitle: "Receiver on another device?",
    handoffBody:
      "Send the link. They sign; paste their code here, then you submit.",
    handoffCopyLink: "Copy acceptance link",
    handoffLinkCopied: "Acceptance link copied. Send it to the receiver.",
    handoffPasteLabel: "Acceptance code",
    handoffPasteHint: "The code the receiver's wallet produced (0x…).",
    handoffApply: "Apply acceptance",
    handoffAppliedTitle: "Receiver acceptance applied",
    handoffAppliedNote: "Verified. Submit from your wallet to finish.",
    handoffReceivedNotice: "Receiver acceptance received from this browser.",
    receiveTitle: "Accept a transfer",
    receiveLede:
      "Someone is sending you an agent. Review, then sign to accept.",
    receiveNoLinkTitle: "Nothing to accept yet",
    receiveNoLinkBody:
      "This page is where you accept an agent someone sent you. Open the acceptance link they shared, or ask them for a fresh one from their transfer review.",
    receiveBadTitle: "This acceptance link is not usable",
    receiveBadBody: "Link damaged. Ask the sender for a new one.",
    receiveAgent: "Agent",
    receiveSender: "Sender",
    receiveReceiver: "Receiver (you)",
    receiveExpiry: "Acceptance valid until",
    receiveNetwork: "Network",
    receiveExpiredTitle: "Acceptance expired",
    receiveExpiredBody: "Link expired. Ask the sender to restart the transfer.",
    receiveWrongChain:
      "Your wallet is on a different network. The acceptance is bound to chain {chainId}.",
    receiveConnect: "Connect wallet",
    receiveAcceptTitle: "Review, then sign to accept.",
    receiveAcceptBody:
      "Your wallet ({receiver}) signs the acceptance. The sender submits the transfer afterward. Nothing moves on-chain until then.",
    receiveSign: "Sign acceptance",
    receiveSigning: "Waiting for signature…",
    receiveWrongAccount: "Wrong account. This acceptance needs {receiver}.",
    receiveDoneTitle: "Acceptance signed",
    receiveDoneBody:
      "Copy the code and send it to the sender. Nothing has moved on-chain yet.",
    receiveCopyCode: "Copy acceptance code",
    receiveCodeCopied: "Acceptance code copied.",
    receiveDoneSameBrowser: "Sent to the sender's tab automatically.",
    claimTokenLabel: "Claim token",
    claimUrlLabel: "Claim link",
    claimRawToggle: "Advanced — raw signature",
  },
  agentDetail: {
    operatingBalance: "Operating balance",
    vaultRoute: "vault route · {chainName}",
    noStrategy: "no strategy bound",
    dataHash: "Metadata hash",
    overview: "Overview",
    execute: "Execute",
    payments: "Payments",
    activity: "Activity",
    agentRecord: "Agent record",
    owner: "Owner",
    agentId: "Agent ID",
    metadataRoot: "Metadata hash",
    lastEvent: "Last event",
    inspectStorageProof: "Inspect storage proof",
    chooseBoundedOperation: "Choose an operation.",
    fundAgent: "Fund agent",
    depositFunds: "Deposit to vault",
    withdrawFunds: "Withdraw from vault",
    transferProof: "Transfer",
    queueTick: "Queue tick",
    commandEvidence: "Every action returns here with a receipt.",
    runRecoveryPath: "Run an operation with a recovery path.",
    instruction: "Instruction",
    instructionPlaceholder: "Evaluate current route",
    instructionHint: "Streams below; cancellable.",
    providerRoute: "Provider route",
    providerValue: "Axiom orchestrator",
    providerHint: "",
    createTickIntent: "Create tick intent",
    cancel: "Cancel",
    valueRouteFor: (agent) => `Value route for ${agent}`,
    token: "Token",
    royalty: "Royalty",
    openPaymentFlow: "Open payment flow",
    earnings: "Earnings",
    evidenceTied: "Receipts for this agent",
  },
  transactions: {
    title: "Transaction center",
    description: "Every signature has a state, a source and a recovery path.",
    refreshState: "Refresh state",
    refreshNotice: "Receipt index revalidated. Pending states remain pending.",
    feedDown: "Live event feed offline, polling instead.",
    confirmingNow: "confirming now",
    needReview: "need review",
    confirmedNote: "Confirmed = observed on-chain. Pending stays pending.",
    statefulOperations: "Stateful operations",
    filterAll: "All",
    filterReview: "Needs review",
    filterStale: "Stale",
    moreFilters: "More filters",
    operation: "Operation",
    hash: "Hash",
    age: "Age",
    state: "State",
    emptyState: "No receipts match this filter.",
    closeReceipt: "Close receipt",
    transactionHash: "Transaction hash",
    network: "Network",
    agent: "Agent",
    event: "Event",
    decodedIndexed: "decoded + indexed",
    awaitingFinalEvidence: "awaiting final confirmation",
    openRecovery: "Open recovery",
    recoveryNotice: "Recovery opened. Operation returned to Ready.",
    runAnother: "Run another like this",
    drawerTitle: "Receipt detail",
    proofTitle: "Technical details",
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
};

const frFlowNotice = (head: string): string =>
  `${head} Reçu ajouté au centre transactionnel.`;

const french: Copy = {
  localeName: "Français",
  nav: {
    ...english.nav,
    howItWorks: "Comprendre Axiom",
    connectWallet: "Connecter le wallet",
    overview: "Vue d’ensemble",
    payment: "Paiement",
    transfer: "Transfert",
    deposit: "Dépôt",
    withdraw: "Retrait",
  },
  topbar: {
    connected: "connecté",
    notConnected: "non connecté",
    operator: "Vous",
    openRail: "Afficher la barre latérale",
    oracleLive: "en ligne",
    oracleDown: "services dégradés",
  },
  strip: {
    ...english.strip,
    reviewTitle: (kind) => `Examiner ${kind}`,
    reviewSummary: "Récupérez le reçu existant avant de réessayer.",
    reviewImpact: "Aucun mouvement d’actifs avant votre reprise.",
    fundTitle: (tokenId) =>
      tokenId ? `Financer l’agent #${tokenId}` : "Ouvrir la route de paiement",
    fundSummary:
      "Examinez une approbation ERC-20 exacte avant tout mouvement de valeur.",
    fundImpact: "Approbation et paiement se confirment séparément.",
    proofReceipt: "Reçu",
    openReview: "Ouvrir la revue",
    whyNow: "Pourquoi maintenant",
    seeAllQueue: "Voir toute la file",
    prefilledNote: "prérempli, non soumis",
  },
  command: {
    title: "Centre de commande",
    groupNextSafeAction: "Prochaine action sûre",
    groupGoTo: "Aller à",
    groupRecent: "Récent",
    resultsCount: (count) => `${count} résultat${count > 1 ? "s" : ""}`,
    placeholder: "Chercher une action, un reçu ou une route",
    emptyTitle: "Aucune destination correspondante",
    emptyBody:
      "Essayez une route, un hash de reçu ou la prochaine action sûre.",
    hintKeys: "↑↓ naviguer · ↵ ouvrir · esc fermer",
  },
  a11y: {
    primaryNav: "Navigation principale",
    openNav: "Ouvrir la navigation principale",
    closeNav: "Fermer la navigation",
    collapseSidebar: "Replier la barre latérale",
    hideSidebar: "Masquer la barre latérale",
    resizeSidebar: "Redimensionner la barre latérale",
    openCommand: "Ouvrir le centre de commande",
    closeCommand: "Fermer le centre de commande",
    chatThreads: "Fils de discussion",
    chatInput: "Saisie du chat",
    txConfirmations: "Confirmations de transaction",
    closeNotification: "Fermer la notification",
    closeOnboarding: "Fermer le guide",
    explorePublicPaths: "Explorer les parcours publics",
    walletAccess: "Accès wallet Axiom",
    closeWalletAccess: "Fermer l’accès wallet",
    skipToContent: "Aller au contenu",
  },
  landing: {
    ...english.landing,
    titleLead: "Avancez avec",
    titleEmphasis: "des preuves.",
    description:
      "Connectez un wallet, agissez, et gardez un reçu à côté de chaque action. Les flows sont réels sur le testnet connecté.",
    nextSafeAction: "Prochaine action sûre",
    signatureBoundary: "Un reçu pour chaque signature",
    consoleAccess: "Accès console",
    tryAssistant: "Essayer l’assistant — sans wallet",
    menuGuideHint: "Comment fonctionnent signatures et reçus",
    menuDevelopers: "Développeurs",
    menuDevelopersHint: "Inspecter la limite d’intégration",
    stripVerifySmall: "Sans gas · sans garde",
    stripOperateSmall: "Reçus à côté de l’action",
  },
  wallet: {
    wrongNetworkTitle: "Passez sur {chainName}.",
    wrongNetworkDescription:
      "Le wallet est connecté, mais utilise un autre réseau. Changez de réseau avant de signer le message d’accès.",
    switchNetwork: "Passer sur {chainName}",
    networkMismatch: "Mauvais réseau",
    connectedChain: "Connecté : chaîne {chainId}",
    requiredChain: "Requis : {chainName} · chaîne {chainId}",
    profileHint: "Enregistré uniquement sur cet appareil.",
    gateTitle: "Commencez ici.",
    gateSessionLine: "Une session.",
    connectTitle: "Choisissez un wallet.",
    browserWalletLabel: "Wallet du navigateur",
    browserWalletHint: "MetaMask et autres wallets injectés",
    walletConnectLabel: "WalletConnect",
    walletConnectHint: "Scannez le QR code ou ouvrez votre app wallet",
    useMobileWallet: "Utiliser un wallet mobile",
    noWalletDetected:
      "Aucun wallet de navigateur détecté. Installez-en un ou utilisez un wallet mobile.",
  },
  guide: {
    nextStep: "Étape suivante",
    finish: "Terminer le guide",
    skip: "Passer pour l’instant",
    step1Title: "Commencez par la prochaine action sûre.",
    step1Body:
      "Votre prochaine action se trouve dans la bande cuivrée en haut.",
    openOverview: "Ouvrir la vue d’ensemble",
    step2Title: "Chaque signature a son reçu.",
    step2Body:
      "Chaque étape garde son état : vous savez toujours ce qu’il reste.",
    openTransactions: "Ouvrir les transactions",
    step4Title: "Ajustez la surface à votre travail.",
    step4Body:
      "Redimensionnez le rail, activez la motion réduite, rouvrez ce guide depuis les réglages.",
    openSettings: "Ouvrir les réglages",
  },
  staking: {
    lede: "Le staking ne fait pas partie d’Axiom.",
    body: "Axiom couvre coffres, paiements, transferts et stockage. Ni la délégation de validateurs ni les récompenses.",
    openVault: "Ouvrir le coffre",
    reviewEvidence: "Revoir les reçus",
  },
  notFound: {
    titleLead: "La route",
    titleEmphasis: "s’est égarée.",
    body: "Cette page n’existe pas. Rien n’a été chargé et aucune action wallet n’a été effectuée.",
    returnToLanding: "Retour à l’accueil",
    openConsole: "Ouvrir l’app",
    title: "Page introuvable",
  },
  errorBoundary: {
    networkTitle: "Problème de connexion",
    genericTitle: "Une erreur est survenue",
    networkBody:
      "Impossible de charger cette section. Réessayez, ou vérifiez votre connexion si l’erreur persiste.",
    retry: "Réessayer",
    reload: "Recharger la page",
  },
  settings: {
    ...english.settings,
    pageTitle: "Paramètres",
    languageLabel: "Langue de l’interface",
    pageDescription: "Session, réseau et préférences d’affichage de cette app.",
    liveWallet: "wallet actif",
    signingContext: "Contexte de signature",
    profileNameLabel: "Nom du profil opérateur",
    profileNameSave: "Enregistrer",
    profileNameSaved: "Nom du profil mis à jour.",
    dailyTitle: "Préférences quotidiennes",
    layoutTitle: "Disposition",
    advancedTitle: "Avancé",
    dangerTitle: "Actions destructrices",
    dangerHint:
      "La réinitialisation efface la session, tous les brouillons de flow et les reçus locaux. Les paramètres sont conservés.",
    compactRail: "Barre latérale compacte",
    compactRailHint:
      "Gardez les libellés visibles tout en libérant de l’espace.",
    reducedMotion: "Motion réduite",
    reducedMotionHint:
      "Rendez les transitions d’état et du guide instantanées.",
    railHidden: "Rail masqué",
    railHiddenHint: "Rouvrez-le depuis le contrôle vertical latéral.",
    railWidth: "Largeur du rail",
    railWidthHint: "faites glisser pour régler la largeur.",
    density: "Densité",
    densityCalm: "Calme",
    theme: "Thème de surface",
    themeHint:
      "Préserve un contraste opérateur lisible dans chaque environnement de travail.",
    themeLight: "Papier",
    directionLtr: "LTR / gauche à droite",
    directionRtl: "RTL / droite à gauche",
    rowChain: "Chaîne",
    rowConnector: "Connecteur",
    statusConnected: "Connecté",
    statusOffline: "Hors ligne",
    statusSelected: "Sélectionnée",
    statusMismatch: "Discordance",
    statusChecking: "vérification",
    statusReady: "Prêt",
    statusOnline: "en ligne",
    shortcutTitle: "Carte clavier",
    shortcutHint:
      "Les raccourcis restent visibles ; ils ne contournent jamais les limites wallet, réseau ou signature.",
    shortcutPalette: "Chercher actions, agents, reçus et routes",
    shortcutSurfaces: "Ouvrir les zones principales",
    shortcutFlows: "Ouvrir les flows d’exécution",
    replayOnboarding: "Rejouer l’onboarding",
    resetSurface: "Réinitialiser la surface",
    resetConfirmTitle: "Réinitialiser la surface ?",
    resetConfirmBody:
      "Cette action vous déconnecte et efface tous les brouillons de flow et les reçus locaux. Vos paramètres sont conservés. Aucune annulation possible.",
    resetConfirmAction: "Tout réinitialiser",
    resetCancel: "Annuler",
    lockConsole: "Se déconnecter",
  },
  dashboard: {
    titleLead: "Gardez les",
    titleEmphasis: "reçus.",
    review: (count) => `${count} agent${count > 1 ? "s" : ""} à revoir.`,
    refresh: "Actualiser la vue",
    managedValue: "Valeur gérée",
    agentsOnline: "Agents en ligne",
    myEventsSeen: "Mes événements vus",
    pendingMine: "Mes opérations en cours",
    operatingFleet: "Flotte active",
    attentionFirst: "Attention d’abord",
    allowanceReady: "L’approbation est prête à être revue.",
    latestEvidence: "Derniers reçus",
    allReceipts: "Tous les reçus",
    switchRequired: "changement requis",
    signerReady: "Prêt à signer",
    signerWrong: "Mauvais réseau",
    noConnector: "aucun connecteur",
    attentionCount: (count) => `${count} action${frS(count)} à examiner`,
    openReviewQueue: "Ouvrir la file de revue",
    loadingVaults: "chargement des vaults…",
    agentsScoped: (count) => `${count} agent${frS(count)} suivi${frS(count)}`,
    needReview: (count) => `${count} à examiner`,
    fleetNominal: "flotte nominale",
    eventsIndexed: "événements indexés",
    queueAwaiting: "confirmation en attente",
    oracleUnreachable: "vérifications en échec",
    telemetryTitle: "Activité récente",
    noEvidence: "Rien ici pour l’instant",
    noEvidenceHint:
      "Mintez un agent ou lancez un paiement pour créer le premier reçu.",
    registerUnavailable: "Registre d’agents indisponible",
    noAgents: "Pas encore d’agent",
    noAgentsHint: "Mintez votre premier agent pour démarrer la flotte.",
    mintAgent: "Minter un agent",
    noDescription: "sans description",
    refreshNotice: "Vue d’ensemble actualisée depuis les indexeurs live.",
    agentFundingLabel: (tokenId) => `Financement de l’agent #${tokenId}`,
  },
  chat: {
    ...english.chat,
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
    promptAgentsIntent: "Liste mes agents et les soldes de leurs vaults",
    promptMintIntent: "Aide-moi à minter un nouvel agent",
    promptVaultIntent: "Montre les soldes de vault de mes agents",
    promptTickIntent:
      "Simule à blanc un tick de stratégie pour un de mes agents",
    toolsToggle: (count) => `Les ${count} outils`,
    toolsBrowse: "parcourir ▾",
    toolsHide: "masquer ▴",
    roleYou: "Vous",
    roleTool: "Outil",
    toolResultFallback: "Résultat d’outil",
    encodeTitle: "Signer cette transaction",
    encodeSubmitted: "Soumis, en attente de confirmation",
    encodeRawData: "charge de contrat brute (vue développeur)",
    encodeSign: "Signer dans le wallet",
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
      osint_company_search: "Recherche l’immatriculation de ",
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
    removeQueued: "Retirer le message en file",
    routing: "Routage",
    routingHint: "Cette conversation uniquement",
    routingAuto: "Auto (le plus rapide)",
    routingCheapest: "Coût le plus bas",
    routingVerified: "Fournisseurs vérifiés uniquement",
    routingPrivate: "Fournisseurs privés (isolation supplémentaire)",
    routingPrivateHintOn:
      "Inférence isolée en TEE — les prompts ne quittent jamais l’enclave du fournisseur",
    routingPrivateHintOff: "Aucun fournisseur TEE ne sert ce modèle",
    routingChipTitle:
      "Routage fournisseur. Changez comment cette conversation est servie",
    routingSummaryCheapest: "Coût le plus bas",
    routingStatusPinned: (address) =>
      `Épinglé à ${address}. Chaque tour est servi par ce fournisseur.`,
    routingStatusCheapest:
      "Fournisseur le moins cher d’abord ; le fournisseur peut changer entre les tours.",
    routingStatusAuto:
      "Fournisseur le plus rapide d’abord ; les tours restent sur un même fournisseur pour des suivis plus rapides.",
    phaseRunning: (names, elapsed) => `Exécution de ${names}… (${elapsed} s)`,
    phaseStreaming: (elapsed) => `Réponse en flux… (${elapsed} s)`,
    phaseThinking: "Réflexion…",
    phaseWaiting: (elapsed) =>
      `En attente de la réponse du modèle… (${elapsed} s)`,
    txMined: (tokenId, event, block) =>
      `tx miné${tokenId ? ` · agent #${tokenId}` : ""}${event ? ` · ${event}` : ""}${block ? ` · bloc ${block}` : ""}`,
    historyNew: "Nouveau",
    historySearch: "Rechercher des chats…",
    historyEmpty: "Pas encore d’historique. Envoyez un message.",
    historyNoMatch: "Aucun chat correspondant.",
    historyLoading: "Chargement de l’historique serveur…",
    historyRestore: "Restaurer l’historique serveur",
    historyRestoreHint:
      "Signez un message wallet pour charger les transcripts de ce wallet. Aucune transaction n’est envoyée.",
    historyOnChainNote:
      "Vos chats sont sauvegardés on-chain — restaurez-les (1 signature)",
    historyDelete: (title) => `Supprimer le chat : ${title}`,
    untitledThread: "Nouveau chat",
    deletedToast: "Chat supprimé",
    undo: "Annuler",
    metricsShow: "métriques",
    metricsHide: "masquer les métriques",
  },
  storage: {
    ...english.storage,
    title: "Stockez le payload, puis vérifiez sa preuve.",
    description: "Chaque étape Storage est prouvée séparément.",
    openChat: "Ouvrir le transcript Chat",
    payload: "Payload de métadonnées agent",
    fileSteps: "Fichier et étapes",
    fileMeta: "18,4 Ko · chiffré AES-GCM · 4 tags",
    labels: [
      "Payload prêt",
      "Chiffré",
      "Root hash calculé",
      "Publié",
      "Preuve vérifiée",
      "Disponible",
    ],
    note: "« Disponible » s’allume une fois les étapes ci-dessus terminées.",
    whatCanProve: "Ce que l’interface peut prouver",
    storageTx: "Transaction Storage",
    integrityProof: "Preuve d’intégrité",
    encryption: "Chiffrement",
    indexerAge: "Âge de l’index",
    download: "Téléchargement",
    available: "disponible",
    notReady: "pas prêt",
    sourceName: "SDK 0G Storage / Indexer",
    sourceDescription: "Chaque étape Storage est prouvée séparément.",
    pending: "en attente",
    notIndexed: "non indexé",
  },
  flows: {
    mint: {
      ...english.flows.mint,
      title: "Créer un agent",
      copy: "Nom → hash → enregistrement → reçu.",
      steps: [
        "Préparation de l’identité",
        "Confirmation d’unicité",
        "Reçu indexé",
      ],
      consequence: "Créer l’identité d’un agent après confirmation.",
      proofLine:
        "Enregistre le hash de métadonnées et son inscription on-chain.",
      contextTitle: "L’identité avant la propriété.",
      fieldLabel: "Nom de l’agent",
      fieldHint: "Le hash de métadonnées est dérivé et montré à la revue.",
      detail: "{name} · enregistré on-chain",
      notice: frFlowNotice("Mint soumis pour {name}."),
    },
    payment: {
      ...english.flows.payment,
      title: "Financer avec contexte",
      copy: "Token, approbation exacte, frais, royalty et événements restent visibles avant la fin.",
      steps: ["Limite de dépense", "Approuver, puis payer", "Reçu indexé"],
      receiptKind: "Paiement",
      consequence: "Financer l’agent sélectionné du montant revu.",
      proofLine: "Borne l’approbation ; le paiement se confirme séparément.",
      contextTitle: "L’approbation avant la valeur.",
      fieldLabel: "Montant",
      fieldHint: "L’approbation exacte est montrée à la revue.",
      notice: frFlowNotice("Paiement soumis pour l’agent #{agent}."),
    },
    transfer: {
      ...english.flows.transfer,
      title: "Transférer avec preuve",
      copy: "Challenge → signature → finalisation → reçu on-chain. L’expiration reste visible.",
      steps: ["Challenge du destinataire", "Étape de signature", "Reçu indexé"],
      receiptKind: "Transfert",
      consequence: "Envoyer la preuve revue à ce destinataire.",
      proofLine: "Lie le challenge du destinataire et l’expiration.",
      contextTitle: "Le challenge avant la finalité.",
      fieldLabel: "Destinataire",
      fieldHint: "Le challenge et l’expiration apparaissent à la revue.",
      notice: "Transfert soumis pour l’agent #{agent}. Reçu de preuve ajouté.",
    },
    tick: {
      ...english.flows.tick,
      title: "Lancer le prochain tick",
      copy: "Intention → fournisseur → flux → résultat → événement ou transaction → récupération.",
      steps: ["Instruction bornée", "Route fournisseur", "Événement indexé"],
      consequence: "Lancer une instruction bornée et annulable.",
      proofLine: "Enregistre la route fournisseur et la preuve d’exécution.",
      contextTitle: "Le flux avant le résultat.",
      fieldHint:
        "Bornée et annulable ; les tokens du flux apparaissent ci-dessous.",
      notice: "Tick {outcome} pour l’agent #{agent}. Reçu de flux indexé.",
    },
    deposit: {
      title: "Déposer dans le vault",
      copy: "Montant → revue → limite wallet → reçu on-chain. Le solde du vault reste visible avant le transfert.",
      steps: ["Montant + solde", "Confirmation wallet", "Reçu indexé"],
      receiptKind: "Dépôt",
      consequence: "Déplacer le montant revu vers le vault de cet agent.",
      proofLine:
        "Encodé via le relais du vault ; la valeur égale le montant revu.",
      contextTitle: "La revue avant le mouvement de valeur.",
      fieldLabel: "Montant",
      fieldHint: "Le solde du vault résultant apparaît à la revue.",
      detail: "{amount} {symbol} vers le vault de l’agent #{agent}",
      notice: frFlowNotice("Dépôt soumis pour l’agent #{agent}."),
    },
    withdraw: {
      title: "Retirer du vault",
      copy: "Montant → revue → limite wallet → reçu on-chain. Le solde restant est affiché avant la signature.",
      steps: ["Solde vérifié", "Confirmation wallet", "Reçu indexé"],
      receiptKind: "Retrait",
      consequence: "Déplacer le montant revu hors du vault de cet agent.",
      proofLine:
        "Encodé via le relais du vault ; le solde restant est montré plus haut.",
      contextTitle: "Le solde avant le retrait.",
      fieldLabel: "Montant",
      fieldHint: "Le solde du vault résultant apparaît à la revue.",
      detail: "{amount} {symbol} depuis le vault de l’agent #{agent}",
      notice: frFlowNotice("Retrait soumis pour l’agent #{agent}."),
    },
  },
  flowUi: {
    ...english.flowUi,
    openTransactions: "Ouvrir le centre transactionnel",
    restart: "Recommencer ce flow",
    simulateReject: "Simuler un rejet",
    simulateTimeout: "Simuler un timeout",
    network: "Réseau",
    receipt: "Reçu",
    stepWallet: "Votre wallet",
    stepAuto: "Observé automatiquement",
    coSignTitle: "Co-signature du destinataire requise",
    coSignBody: (receiver) =>
      `Le wallet destinataire (${receiver}) signe d’abord. Vous restez expéditeur.`,
    coSignAction: "Signer comme destinataire",
    coSignNote:
      "Après la signature du destinataire, vous soumettez le transfert depuis votre propre compte.",
    coSignBlockedTitle: "Compte destinataire indisponible",
    coSignBlockedBody: (receiver) =>
      `Impossible de signer pour ${receiver} ici. Ajoutez ce compte, ou laissez le destinataire accepter de son côté.`,
    stageTitle: "Revoyez avant d’agir.",
    reviewOpenLabel: "Revue ouverte",
    detailsEditable: "Détails modifiables",
    chainLive: "chaîne {chainId} · wallet réel",
    reviewAction: "Revoir l’opération",
    agentA11y: "Agent ciblé",
    agentSelectPlaceholder: "choisir un agent",
    noAgentsOption: "aucun agent pour l’instant (créez-en un)",
    agentHint:
      "L’agent dont le vault ou la fiche est visé par cette opération.",
    errAmountPositive: "Saisissez un montant supérieur à zéro.",
    errExceedsVault: "Le montant dépasse le solde du vault.",
    errInvalidAmount: "Saisissez un montant valide.",
    errNameLength: "Utilisez 2 à 80 caractères.",
    errRecipientAddress: "Le destinataire doit être une adresse 0x valide.",
    errRecipientKey:
      "La clé publique du destinataire doit être 64 octets de hex (0x…).",
    errRecipientKeyIsAddress:
      "Ceci ressemble à une adresse Ethereum (42 caractères) — un transfert exige la clé publique du destinataire (132 caractères). Voyez « Comment l’obtenir » ci-dessous.",
    transferKeyWalkthroughTitle: "Comment l’obtenir",
    transferKeyWalkthroughSteps: [
      "Le destinataire ouvre son wallet et choisit le compte qui recevra l’agent",
      "Il ouvre les détails du compte et choisit « Exporter la clé publique »",
      "Collez ici la clé copiée",
    ],
    errInstruction: "Décrivez l’instruction.",
    errSelectAgent: "Choisissez d’abord un agent.",
    intentFund: "Agent sélectionné. Revoyez l’approbation exacte.",
    intentProof: "Transfert sélectionné. Vérifiez les détails du destinataire.",
    intentBounded: "Instruction sélectionnée. Le flux reste annulable.",
    intentRecovery:
      "Récupération d’un reçu existant. Aucune opération en double.",
    intentReceipt: "Lié à un reçu indexé.",
    streamLabel: "Flux de tokens",
    cancelStream: "Annuler le flux",
    receiptHeadingConfirmed: "Reçu prêt.",
    receiptHeadingReverted: "Rejeté on-chain.",
    receiptHeadingStale: "Confirmation inconnue.",
    receiptHeadingConfirming: "Soumis, confirmation…",
    receiptOverlayConfirmed: "Reçu indexé",
    receiptOverlayReverted: "Rejeté",
    receiptOverlayStale: "Vérifier l’explorateur",
    receiptOverlayConfirming: "Confirmation on-chain",
    receiptBodyConfirmed:
      "Preuve et événement indexés dans le centre transactionnel.",
    receiptBodyReverted:
      "Rejeté on-chain. La ligne du centre transactionnel propose une récupération.",
    receiptBodyStale:
      "Aucune confirmation après {seconds} s. Vérifiez l’explorateur ; la ligne est marquée À examiner.",
    receiptBodyConfirming: "Soumis, en attente de confirmation on-chain.",
    copyReceiptAction: "Copier le reçu",
    openReceiptAction: "Ouvrir le reçu",
    startAnotherAction: "Recommencer",
    receiptCopiedNotice: "Identifiant du reçu copié.",
    vaultBalanceAfter: "Solde du vault après",
    exceedsBalance: "dépasse le solde",
    vaultedHint:
      "En vault : {amount} {symbol}. Le solde résultant apparaît à la revue.",
    allowanceNote:
      "Approbation actuelle : {amount} {symbol} (approbation au montant exact, jamais infinie).",
    liveRouteNote:
      "Route réelle : signature wallet et écriture de contrat n’ont lieu qu’après la revue.",
    simulateRejectedError:
      "Signature refusée. Les détails revus sont conservés.",
    simulateTimeoutError: "Confirmation expirée. Reprenez depuis la revue.",
    tickActed: "exécuté",
    tickHeld: "mis en attente",
    allowanceKind: "Approbation",
    allowanceDetail: "{amount} {symbol} → limite de dépense (étape 1)",
    approveSentNotice:
      "Approbation validée on-chain. Signez maintenant le paiement.",
    allowanceCoveredNotice:
      "L’approbation existante couvre ce montant, aucune transaction d’approbation nécessaire.",
    reviewTitle: "Revoir l’opération.",
    closeReviewA11y: "Fermer la revue et modifier les détails de l’opération",
    factAgent: "Agent ciblé",
    factAmount: "Montant",
    factRecipient: "Destinataire",
    factName: "Nom de l’agent",
    factNetwork: "Réseau",
    factBoundary: "Limite",
    networkFact: "{chainName} · chaîne {chainId}",
    primarySign: "Signer et exécuter",
    primaryApprove: "Approuver la limite de dépense",
    primaryContinuePayment: "Continuer vers le paiement",
    payCta: "Payer {amount} {symbol}",
    resumeReview: "Reprendre la revue",
    restartApproval: "Recommencer la revue d’approbation",
    editDetails: "Modifier les détails",
    awaitingWallet: "En attente du wallet",
    submitTransfer: "Soumettre le transfert",
    reviewDisclaimer:
      "Rien n’est soumis avant votre confirmation dans le wallet.",
    confirmOne: "1 confirmation wallet requise",
    confirmTwo: "2 confirmations wallet requises",
    confirmTwoApprovePay:
      "2 confirmations wallet requises (approbation, puis paiement)",
    confirmOneAllowance:
      "1 confirmation wallet requise (approbation suffisante)",
    confirmChecking:
      "Jusqu’à 2 confirmations wallet (vérification de l’approbation…)",
    confirmReceiverThenSubmit:
      "2 confirmations wallet (le destinataire signe, puis vous soumettez)",
    transferKeyLabel: "Clé publique du destinataire",
    transferKeyHint:
      "Hex 64 octets (0x…), la clé de chiffrement du nouveau propriétaire.",
    transferAgentTitle: (id) => `Transférer l’agent #${id}`,
    handoffTitle: "Destinataire sur un autre appareil ?",
    handoffBody:
      "Partagez le lien d’acceptation avec le destinataire. Son wallet signe l’acceptation ; collez ici le code qu’il obtient. Vous gardez la soumission on-chain finale.",
    handoffCopyLink: "Copier le lien d’acceptation",
    handoffLinkCopied: "Lien d’acceptation copié. Envoyez-le au destinataire.",
    handoffPasteLabel: "Code d’acceptation",
    handoffPasteHint: "Le code produit par le wallet du destinataire (0x…).",
    handoffApply: "Appliquer l’acceptation",
    handoffAppliedTitle: "Acceptation du destinataire appliquée",
    handoffAppliedNote:
      "L’acceptation est vérifiée contre l’adresse du destinataire. Soumettez le transfert depuis votre wallet pour terminer.",
    handoffReceivedNotice:
      "Acceptation du destinataire reçue depuis ce navigateur.",
    receiveTitle: "Accepter un transfert",
    receiveLede:
      "Un agent est en cours de transfert vers votre adresse. Revoyez-le, puis signez l’acceptation avec le wallet destinataire.",
    receiveNoLinkTitle: "Rien à accepter pour l’instant",
    receiveNoLinkBody:
      "Cette page sert à accepter un agent qu’on vous a envoyé. Ouvrez le lien d’acceptation partagé par l’expéditeur, ou demandez-lui un nouveau lien depuis sa revue de transfert.",
    receiveBadTitle: "Ce lien d’acceptation est inutilisable",
    receiveBadBody:
      "Le lien est incomplet ou endommagé. Demandez à l’expéditeur un lien frais depuis la revue de transfert.",
    receiveSender: "Expéditeur",
    receiveReceiver: "Destinataire (vous)",
    receiveExpiry: "Acceptation valable jusqu’au",
    receiveNetwork: "Réseau",
    receiveExpiredTitle: "Acceptation expirée",
    receiveExpiredBody:
      "Ce lien d’acceptation a dépassé sa fenêtre de validité. Demandez à l’expéditeur de relancer le transfert pour un lien frais.",
    receiveWrongChain:
      "Votre wallet est sur un autre réseau. L’acceptation est liée à la chaîne {chainId}.",
    receiveConnect: "Connecter le wallet",
    receiveAcceptTitle: "Vérifiez, puis signez pour accepter.",
    receiveAcceptBody:
      "Votre wallet ({receiver}) signe l’acceptation. L’expéditeur soumet ensuite le transfert. Rien ne bouge on-chain d’ici là.",
    receiveSign: "Signer l’acceptation",
    receiveSigning: "En attente de la signature…",
    receiveWrongAccount:
      "Le wallet connecté est {connected}, mais cette acceptation doit être signée par {receiver}. Passez au compte destinataire.",
    receiveDoneTitle: "Acceptation signée",
    receiveDoneBody:
      "Renvoyez le code ci-dessous à l’expéditeur. Il soumet le transfert depuis sa session. Rien n’a bougé on-chain ; cette signature accepte seulement le transfert.",
    receiveCopyCode: "Copier le code d’acceptation",
    receiveCodeCopied: "Code d’acceptation copié.",
    receiveDoneSameBrowser:
      "Appliqué automatiquement à l’onglet de l’expéditeur dans ce navigateur.",
    claimTokenLabel: "Jeton de réclamation",
    claimUrlLabel: "Lien de réclamation",
    claimRawToggle: "Avancé — signature brute",
  },
  agentDetail: {
    ...english.agentDetail,
    operatingBalance: "Solde d’exploitation",
    vaultRoute: "route du vault · {chainName}",
    noStrategy: "aucune stratégie liée",
    dataHash: "Hash de métadonnées",
    overview: "Vue d’ensemble",
    execute: "Exécuter",
    payments: "Paiements",
    activity: "Activité",
    agentRecord: "Fiche agent",
    owner: "Propriétaire",
    agentId: "ID agent",
    metadataRoot: "Hash de métadonnées",
    lastEvent: "Dernier événement",
    inspectStorageProof: "Examiner la preuve Storage",
    chooseBoundedOperation: "Choisissez une opération.",
    fundAgent: "Financer l’agent",
    depositFunds: "Déposer dans le vault",
    withdrawFunds: "Retirer du vault",
    transferProof: "Transférer",
    queueTick: "Mettre le tick en file",
    commandEvidence: "Chaque action revient ici avec un reçu.",
    runRecoveryPath: "Lancez une opération avec un chemin de récupération.",
    instructionPlaceholder: "Évaluer la route courante",
    instructionHint: "Commande simulée ; aucun appel fournisseur réel.",
    providerRoute: "Route fournisseur",
    providerValue: "Orchestrateur Axiom",
    providerHint: "Route de démonstration sélectionnée dans Paramètres.",
    createTickIntent: "Créer l’intention de tick",
    cancel: "Annuler",
    valueRouteFor: (agent) => `Route de valeur pour ${agent}`,
    openPaymentFlow: "Ouvrir le flow de paiement",
    earnings: "Gains",
    evidenceTied: "Reçus liés à cet agent",
  },
  transactions: {
    ...english.transactions,
    title: "Centre transactionnel",
    description:
      "Chaque signature possède un état, une source et un chemin de récupération.",
    refreshState: "Actualiser l’état",
    refreshNotice:
      "Index des reçus revérifié. Les états en attente le restent.",
    feedDown:
      "Flux d’événements live hors ligne, interrogation périodique à la place.",
    confirmingNow: "en confirmation",
    needReview: "à examiner",
    confirmedNote:
      "Confirmé signifie que le reçu a été observé et l’événement décodé. Une attente ne devient jamais un succès.",
    statefulOperations: "Opérations avec état",
    filterAll: "Tout",
    filterReview: "À examiner",
    filterStale: "Obsolète",
    moreFilters: "Plus de filtres",
    operation: "Opération",
    age: "Âge",
    state: "État",
    emptyState:
      "Aucun reçu ne correspond à cet état. Le store partagé ne masque aucun élément.",
    closeReceipt: "Fermer le reçu",
    transactionHash: "Hash de transaction",
    network: "Réseau",
    event: "Événement",
    decodedIndexed: "décodé + indexé",
    awaitingFinalEvidence: "confirmation finale en attente",
    openRecovery: "Ouvrir la récupération",
    recoveryNotice: "Récupération ouverte. L’opération revient à Prêt.",
    runAnother: "Relancer une opération similaire",
    drawerTitle: "Détail du reçu",
    proofTitle: "Détails techniques",
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
};

const deFlowNotice = (head: string): string =>
  `${head} Beleg zum Transaktionszentrum hinzugefügt.`;

const german: Copy = {
  localeName: "Deutsch",
  nav: {
    ...english.nav,
    howItWorks: "So funktioniert Axiom",
    connectWallet: "Wallet verbinden",
    overview: "Übersicht",
    transactions: "Transaktionen",
    payment: "Zahlung",
    deposit: "Einzahlen",
    withdraw: "Auszahlen",
  },
  topbar: {
    connected: "verbunden",
    notConnected: "nicht verbunden",
    operator: "Du",
    openRail: "Seitenleiste zeigen",
    oracleLive: "online",
    oracleDown: "Dienste beeinträchtigt",
  },
  strip: {
    ...english.strip,
    reviewTitle: (kind) => `${kind} prüfen`,
    reviewSummary:
      "Stelle den vorhandenen Beleg wieder her, bevor du es erneut versuchst.",
    reviewImpact: "Keine Vermögensbewegung, bis du fortfährst.",
    fundTitle: (tokenId) =>
      tokenId ? `Agent #${tokenId} finanzieren` : "Zahlungsroute öffnen",
    fundSummary: "Prüfe eine exakte ERC-20-Freigabe, bevor Wert fließt.",
    fundImpact: "Freigabe und Zahlung werden getrennt bestätigt.",
    proofReceipt: "Beleg",
    openReview: "Prüfung öffnen",
    whyNow: "Warum jetzt",
    seeAllQueue: "Ganze Warteschlange ansehen",
    prefilledNote: "vorbefüllt, nicht abgesendet",
  },
  command: {
    ...english.command,
    groupNextSafeAction: "Nächste sichere Aktion",
    groupGoTo: "Gehe zu",
    groupRecent: "Zuletzt",
    resultsCount: (count) => `${count} Ergebnis${count === 1 ? "" : "se"}`,
    placeholder: "Aktion, Beleg oder Route suchen",
    emptyTitle: "Kein passendes Ziel",
    emptyBody:
      "Versuche eine Route, einen Beleg-Hash oder die nächste sichere Aktion.",
    hintKeys: "↑↓ bewegen · ↵ öffnen · esc schließen",
  },
  a11y: {
    primaryNav: "Hauptnavigation",
    openNav: "Hauptnavigation öffnen",
    closeNav: "Navigation schließen",
    collapseSidebar: "Seitenleiste einklappen",
    hideSidebar: "Seitenleiste ausblenden",
    resizeSidebar: "Seitenleiste anpassen",
    openCommand: "Command Center öffnen",
    closeCommand: "Command Center schließen",
    chatThreads: "Chat-Verläufe",
    chatInput: "Chat-Eingabe",
    txConfirmations: "Transaktionsbestätigungen",
    closeNotification: "Benachrichtigung schließen",
    closeOnboarding: "Einführung schließen",
    explorePublicPaths: "Öffentliche Pfade erkunden",
    walletAccess: "Axiom-Wallet-Zugang",
    closeWalletAccess: "Wallet-Zugang schließen",
    skipToContent: "Zum Inhalt springen",
  },
  landing: {
    ...english.landing,
    titleLead: "Handle mit",
    titleEmphasis: "Belegen.",
    description:
      "Verbinde ein Wallet, handle, und halte einen Beleg neben jeder Aktion. Flows sind auf dem verbundenen Testnet echt.",
    nextSafeAction: "Nächste sichere Aktion",
    signatureBoundary: "Ein Beleg für jede Signatur",
    consoleAccess: "Konsolenzugriff",
    tryAssistant: "Assistent testen — ohne Wallet",
    menuGuideHint: "Wie Signatur und Beleg funktionieren",
    menuDevelopers: "Entwickler",
    menuDevelopersHint: "Integrationsgrenze prüfen",
    stripVerifySmall: "Kein Gas · keine Verwahrung",
    stripOperateSmall: "Belege neben der Aktion",
  },
  wallet: {
    wrongNetworkTitle: "Zu {chainName} wechseln.",
    wrongNetworkDescription:
      "Das Wallet ist verbunden, verwendet aber ein anderes Netzwerk. Wechsle vor der Signatur der Zugriffsnachricht.",
    switchNetwork: "Zu {chainName} wechseln",
    networkMismatch: "Falsches Netzwerk",
    connectedChain: "Verbunden: Chain {chainId}",
    requiredChain: "Erforderlich: {chainName} · Chain {chainId}",
    profileHint: "Nur als lokale Prototyp-Einstellung gespeichert.",
    gateTitle: "Hier starten.",
    gateSessionLine: "Eine Sitzung.",
    connectTitle: "Wähle ein Wallet.",
    browserWalletLabel: "Browser-Wallet",
    browserWalletHint: "MetaMask und andere injizierte Wallets",
    walletConnectLabel: "WalletConnect",
    walletConnectHint: "QR-Code scannen oder Wallet-App öffnen",
    useMobileWallet: "Mobile Wallet verwenden",
    noWalletDetected:
      "Keine Browser-Wallet erkannt. Installiere eine oder nutze eine mobile Wallet.",
  },
  guide: {
    nextStep: "Nächster Schritt",
    finish: "Guide beenden",
    skip: "Jetzt überspringen",
    step1Title: "Beginne mit der nächsten sicheren Aktion.",
    step1Body: "Deine nächste Aktion sitzt im Kupferstreifen oben.",
    openOverview: "Übersicht öffnen",
    step2Title: "Jede Signatur bekommt einen Beleg.",
    step2Body:
      "Jede Stufe behält ihren Zustand, du weißt immer, was offen ist.",
    openTransactions: "Transaktionen öffnen",
    step4Title: "Passe die Oberfläche deiner Arbeit an.",
    step4Body:
      "Rail verkleinern, reduzierte Motion wählen, diesen Guide in den Einstellungen neu öffnen.",
    openSettings: "Einstellungen öffnen",
  },
  staking: {
    lede: "Staking ist nicht Teil von Axiom.",
    body: "Axiom deckt Vaults, Zahlungen, Transfers und Storage ab. Keine Validator-Delegation oder Belohnungen.",
    openVault: "Vault öffnen",
    reviewEvidence: "Belege prüfen",
  },
  notFound: {
    titleLead: "Diese Route",
    titleEmphasis: "treibt davon.",
    body: "Diese Seite existiert nicht. Es wurde nichts geladen und keine Wallet-Aktion ausgeführt.",
    returnToLanding: "Zurück zur Startseite",
    openConsole: "App öffnen",
    title: "Seite nicht gefunden",
  },
  errorBoundary: {
    networkTitle: "Verbindungsproblem",
    genericTitle: "Etwas ist schiefgelaufen",
    networkBody:
      "Dieser Abschnitt ließ sich nicht laden. Versuchen Sie es erneut, oder prüfen Sie Ihre Verbindung, wenn der Fehler bestehen bleibt.",
    retry: "Erneut versuchen",
    reload: "Seite neu laden",
  },
  settings: {
    ...english.settings,
    pageTitle: "Einstellungen",
    languageLabel: "Sprache der Oberfläche",
    pageDescription:
      "Sitzungs-, Netzwerk- und Anzeigeeinstellungen dieser App.",
    liveWallet: "Live-Wallet",
    signingContext: "Signaturkontext",
    profileNameLabel: "Name des Operator-Profils",
    profileNameSave: "Namen speichern",
    profileNameSaved: "Profilname aktualisiert.",
    dailyTitle: "Tägliche Präferenzen",
    layoutTitle: "Layout",
    advancedTitle: "Erweitert",
    dangerTitle: "Destruktive Aktionen",
    dangerHint:
      "Zurücksetzen löscht die Session, alle Flow-Entwürfe und alle lokalen Belege. Einstellungen bleiben erhalten.",
    compactRail: "Kompakte Seitenleiste",
    compactRailHint:
      "Beschriftungen sichtbar halten und mehr Arbeitsraum schaffen.",
    reducedMotion: "Reduzierte Bewegung",
    reducedMotionHint: "Status- und Guide-Übergänge sofort halten.",
    railHidden: "Leiste ausgeblendet",
    railHiddenHint: "Über die vertikale Kante wieder öffnen.",
    railWidth: "Leistenbreite",
    railWidthHint: "ziehen, um die Breite einzustellen.",
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
    statusConnected: "Verbunden",
    statusSelected: "Ausgewählt",
    statusMismatch: "Abweichung",
    statusChecking: "wird geprüft",
    statusReady: "Bereit",
    shortcutTitle: "Tastaturbelegung",
    shortcutHint:
      "Schnellpfade bleiben sichtbar; sie umgehen nie Wallet-, Netzwerk- oder Signaturgrenzen.",
    shortcutPalette: "Aktionen, Agents, Belege und Routen suchen",
    shortcutSurfaces: "Hauptbereiche öffnen",
    shortcutFlows: "Ausführungs-Flows öffnen",
    replayOnboarding: "Onboarding wiederholen",
    resetSurface: "Oberfläche zurücksetzen",
    resetConfirmTitle: "Oberfläche zurücksetzen?",
    resetConfirmBody:
      "Dies meldet Sie ab und löscht alle Flow-Entwürfe und lokalen Belege. Ihre Einstellungen bleiben erhalten. Kein Rückgängigmachen.",
    resetConfirmAction: "Alles zurücksetzen",
    resetCancel: "Abbrechen",
    lockConsole: "Abmelden",
  },
  dashboard: {
    ...english.dashboard,
    titleLead: "Bewahre die",
    titleEmphasis: "Belege auf.",
    review: (count) =>
      `${count} Agentenaktion${count === 1 ? "" : "en"} ${count === 1 ? "erfordert" : "erfordern"} Aufmerksamkeit.`,
    refresh: "Übersicht aktualisieren",
    managedValue: "Verwalteter Wert",
    myEventsSeen: "Meine Ereignisse",
    pendingMine: "Meine laufenden Operationen",
    operatingFleet: "Aktive Flotte",
    attentionFirst: "Aufmerksamkeit zuerst",
    allowanceReady: "Die Freigabe kann geprüft werden.",
    latestEvidence: "Neueste Belege",
    allReceipts: "Alle Belege",
    switchRequired: "Wechsel erforderlich",
    signerReady: "Bereit zum Signieren",
    signerWrong: "Falsches Netzwerk",
    noConnector: "kein Connector",
    attentionCount: (count) => `${count} Aktion${deS(count)} prüfen`,
    openReviewQueue: "Prüfungsliste öffnen",
    loadingVaults: "Vaults werden geladen…",
    agentsScoped: (count) => `${count} Agent${count === 1 ? "" : "en"} erfasst`,
    needReview: (count) => `${count} prüfen`,
    fleetNominal: "Flotte nominal",
    eventsIndexed: "Ereignisse indexiert",
    queueAwaiting: "Bestätigung ausstehend",
    oracleUnreachable: "Statusprüfungen fehlerhaft",
    telemetryTitle: "Letzte Aktivität",
    noEvidence: "Noch nichts hier",
    noEvidenceHint:
      "Minte einen Agent oder führe eine Zahlung aus, um den ersten Beleg zu erzeugen.",
    registerUnavailable: "Agentenregister nicht verfügbar",
    noAgents: "Noch keine Agents",
    noAgentsHint: "Minte deinen ersten Agent, um die Flotte zu starten.",
    mintAgent: "Agent minten",
    noDescription: "keine Beschreibung",
    refreshNotice: "Übersicht aus den Live-Indexern aktualisiert.",
    agentFundingLabel: (tokenId) => `Finanzierung von Agent #${tokenId}`,
  },
  chat: {
    ...english.chat,
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
    promptAgentsIntent: "Liste meine Agents und ihre Vault-Guthaben auf",
    promptMintIntent: "Hilf mir, einen neuen Agent zu minten",
    promptVaultIntent: "Zeige die Vault-Guthaben meiner Agents",
    promptTickIntent:
      "Teste einen Strategie-Tick für einen meiner Agents trocken",
    toolsToggle: (count) => `Alle ${count} Tools`,
    toolsBrowse: "anzeigen ▾",
    toolsHide: "ausblenden ▴",
    roleYou: "Du",
    roleAssistant: "Assistent",
    toolResultFallback: "Tool-Ergebnis",
    encodeTitle: "Diese Transaktion signieren",
    encodeSubmitted: "Eingereicht, wartet auf Bestätigung",
    encodeRawData: "roher Contract-Payload (Entwickleransicht)",
    encodeSign: "Im Wallet signieren",
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
      osint_company_search: "Suche die Firmenregistrierung von ",
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
    routingHint: "Nur diese Unterhaltung",
    routingAuto: "Auto (schnellster)",
    routingCheapest: "Günstigster",
    routingVerified: "Nur verifizierte Provider",
    routingPrivate: "Private Provider (zusätzliche Isolation)",
    routingPrivateHintOn:
      "TEE-isolierte Inferenz — Prompts verlassen die Enklave des Providers nie",
    routingPrivateHintOff: "Kein TEE-Provider bedient dieses Modell",
    routingChipTitle:
      "Provider-Routing. Ändere, wie diese Unterhaltung bedient wird",
    routingSummaryCheapest: "Günstigster",
    routingStatusPinned: (address) =>
      `An ${address} gepinnt. Jeder Turn wird von diesem Provider bedient.`,
    routingStatusCheapest:
      "Günstigster Provider zuerst; der bedienende Provider kann zwischen Turns wechseln.",
    routingStatusAuto:
      "Schnellster Provider zuerst; Turns bleiben auf einem Provider, damit Folgefragen schneller sind.",
    phaseRunning: (names, elapsed) => `${names} läuft… (${elapsed} s)`,
    phaseStreaming: (elapsed) => `Antwort wird gestreamt… (${elapsed} s)`,
    phaseThinking: "Denkt nach…",
    phaseWaiting: (elapsed) => `Warte auf Modellantwort… (${elapsed} s)`,
    txMined: (tokenId, event, block) =>
      `tx gemint${tokenId ? ` · Agent #${tokenId}` : ""}${event ? ` · ${event}` : ""}${block ? ` · Block ${block}` : ""}`,
    historyNew: "Neu",
    historySearch: "Chats suchen…",
    historyEmpty: "Noch kein Verlauf. Sende eine Nachricht.",
    historyNoMatch: "Keine passenden Chats.",
    historyLoading: "Server-Verlauf wird geladen…",
    historyRestore: "Server-Verlauf wiederherstellen",
    historyRestoreHint:
      "Signiere eine Wallet-Nachricht, um die serverseitigen Transkripte dieses Wallets zu laden. Es wird keine Transaktion gesendet.",
    historyOnChainNote:
      "Deine Chats werden on-chain gespeichert — stelle sie wieder her (1 Signatur)",
    historyDelete: (title) => `Chat löschen: ${title}`,
    untitledThread: "Neuer Chat",
    deletedToast: "Chat gelöscht",
    undo: "Rückgängig",
    metricsShow: "Metriken",
    metricsHide: "Metriken ausblenden",
  },
  storage: {
    ...english.storage,
    title: "Payload speichern, dann den Beleg prüfen.",
    description:
      "Verschlüsselung, Root-Hash, Storage-Transaktion, Integritätsnachweis und Index-Verfügbarkeit bleiben getrennt.",
    openChat: "Chat-Transkript öffnen",
    payload: "Agenten-Metadaten-Payload",
    fileSteps: "Datei und Schritte",
    fileMeta: "18,4 KB · AES-GCM-verschlüsselt · 4 Tags",
    labels: [
      "Payload bereit",
      "Verschlüsselt",
      "Root-Hash erstellt",
      "Veröffentlicht",
      "Beleg geprüft",
      "Verfügbar",
    ],
    note: "„Verfügbar“ leuchtet auf, sobald die obigen Schritte abgeschlossen sind.",
    whatCanProve: "Was die Oberfläche belegen kann",
    rootHash: "Root-Hash",
    storageTx: "Storage-Transaktion",
    integrityProof: "Integritätsnachweis",
    encryption: "Verschlüsselung",
    indexerAge: "Indexer-Alter",
    available: "verfügbar",
    notReady: "nicht bereit",
    sourceName: "0G-Storage-SDK / Indexer",
    sourceDescription: "Jeder Storage-Schritt wird separat nachgewiesen.",
    pending: "ausstehend",
    notIndexed: "nicht indexiert",
  },
  flows: {
    mint: {
      ...english.flows.mint,
      title: "Agent minten",
      copy: "Name → Hash → Registrierung → Beleg.",
      steps: [
        "Identität wird vorbereitet",
        "Eindeutigkeit wird bestätigt",
        "Beleg indexiert",
      ],
      consequence: "Nach der Bestätigung eine Agenten-Identität erstellen.",
      proofLine: "Speichert Metadaten-Hash und dessen On-Chain-Registrierung.",
      contextTitle: "Identität vor Eigentum.",
      fieldLabel: "Agentenname",
      fieldHint:
        "Der Metadaten-Hash wird abgeleitet und in der Prüfung gezeigt.",
      detail: "{name} · on-chain registriert",
      notice: deFlowNotice("Mint für {name} eingereicht."),
    },
    payment: {
      title: "Mit Kontext finanzieren",
      copy: "Token, exakte Freigabe, Gebühr, Royalty und Ereignisse bleiben sichtbar.",
      steps: ["Ausgabenlimit", "Freigeben, dann zahlen", "Beleg indexiert"],
      receiptKind: "Zahlung",
      consequence:
        "Den ausgewählten Agenten mit dem geprüften Betrag finanzieren.",
      proofLine: "Begrenzt die Freigabe; die Zahlung bestätigt separat.",
      contextTitle: "Freigabe vor Wert.",
      fieldLabel: "Betrag",
      fieldHint: "Die exakte Freigabe erscheint in der Prüfung.",
      detail: "{amount} → Agent #{agent}",
      notice: deFlowNotice("Zahlung für Agent #{agent} eingereicht."),
    },
    transfer: {
      ...english.flows.transfer,
      title: "Mit Nachweis übertragen",
      copy: "Challenge → Signatur → Abschluss → On-Chain-Beleg. Der Ablauf bleibt nachvollziehbar.",
      steps: ["Empfänger-Challenge", "Signierschritt", "Beleg indexiert"],
      consequence: "Den geprüften Nachweis an diesen Empfänger senden.",
      proofLine: "Bindet Empfänger-Challenge und Ablaufdatum.",
      contextTitle: "Challenge vor Endgültigkeit.",
      fieldLabel: "Empfänger",
      fieldHint: "Challenge und Ablaufdatum erscheinen in der Prüfung.",
      detail: "Agent #{agent} → {recipient}",
      notice:
        "Transfer für Agent #{agent} eingereicht. Nachweis-Beleg hinzugefügt.",
    },
    tick: {
      ...english.flows.tick,
      title: "Nächsten Tick ausführen",
      copy: "Absicht → Provider → Stream → Ergebnis → Ereignis oder Transaktion → Recovery.",
      steps: ["Begrenzte Anweisung", "Provider-Route", "Ereignis indexiert"],
      consequence: "Eine begrenzte, abbrechbare Anweisung starten.",
      proofLine: "Speichert Provider-Route und Ausführungsnachweis.",
      contextTitle: "Stream vor Ergebnis.",
      fieldLabel: "Anweisung",
      fieldHint: "Begrenzt und abbrechbar; gestreamte Tokens erscheinen unten.",
      notice: "Tick für Agent #{agent} {outcome}. Stream-Beleg indexiert.",
    },
    deposit: {
      title: "In den Vault einzahlen",
      copy: "Betrag → Prüfung → Wallet-Grenze → On-Chain-Beleg. Der Vault-Stand bleibt sichtbar, bevor Wert fließt.",
      steps: ["Betrag + Guthaben", "Wallet-Bestätigung", "Beleg indexiert"],
      receiptKind: "Einzahlen",
      consequence: "Den geprüften Betrag in den Vault dieses Agenten bewegen.",
      proofLine:
        "Über das Vault-Relais kodiert; der Wert entspricht dem geprüften Betrag.",
      contextTitle: "Prüfung vor Wertbewegung.",
      fieldLabel: "Betrag",
      fieldHint: "Der resultierende Vault-Stand erscheint in der Prüfung.",
      detail: "{amount} {symbol} in den Vault von Agent #{agent}",
      notice: deFlowNotice("Einzahlung für Agent #{agent} eingereicht."),
    },
    withdraw: {
      title: "Aus dem Vault auszahlen",
      copy: "Betrag → Prüfung → Wallet-Grenze → On-Chain-Beleg. Der Reststand wird vor dem Signieren gezeigt.",
      steps: ["Guthaben geprüft", "Wallet-Bestätigung", "Beleg indexiert"],
      receiptKind: "Auszahlen",
      consequence: "Den geprüften Betrag aus dem Vault dieses Agenten bewegen.",
      proofLine:
        "Über das Vault-Relais kodiert; der Reststand wird oben gezeigt.",
      contextTitle: "Guthaben vor Auszahlung.",
      fieldLabel: "Betrag",
      fieldHint: "Der resultierende Vault-Stand erscheint in der Prüfung.",
      detail: "{amount} {symbol} aus dem Vault von Agent #{agent}",
      notice: deFlowNotice("Auszahlung für Agent #{agent} eingereicht."),
    },
  },
  flowUi: {
    ...english.flowUi,
    openTransactions: "Transaktionszentrum öffnen",
    restart: "Diesen Flow neu starten",
    simulateReject: "Ablehnung simulieren",
    simulateTimeout: "Timeout simulieren",
    network: "Netzwerk",
    receipt: "Beleg",
    stepWallet: "Dein Wallet",
    stepAuto: "Automatisch beobachtet",
    coSignTitle: "Empfänger-Gegenzeichnung erforderlich",
    coSignBody: (receiver) =>
      `Das Empfänger-Wallet (${receiver}) signiert zuerst. Du bleibst Sender.`,
    coSignAction: "Als Empfänger signieren",
    coSignNote:
      "Nach der Signatur des Empfängers reichen Sie den Transfer von Ihrem eigenen Konto ein.",
    coSignBlockedTitle: "Empfängerkonto nicht verfügbar",
    coSignBlockedBody: (receiver) =>
      `Signieren für ${receiver} hier nicht möglich. Konto hinzufügen, oder der Empfänger akzeptiert selbst.`,
    stageTitle: "Prüfen Sie, bevor Sie handeln.",
    reviewOpenLabel: "Prüfung offen",
    detailsEditable: "Details bearbeitbar",
    chainLive: "Chain {chainId} · Live-Wallet",
    reviewAction: "Vorgang prüfen",
    agentA11y: "Ziel-Agent",
    agentSelectPlaceholder: "Agent auswählen",
    noAgentsOption: "keine Agenten vorhanden (erst minten)",
    agentHint:
      "Der Agent, dessen Vault oder Datensatz dieser Vorgang anspricht.",
    errAmountPositive: "Geben Sie einen Betrag über null ein.",
    errExceedsVault: "Der Betrag übersteigt das Vault-Guthaben.",
    errInvalidAmount: "Geben Sie einen gültigen Betrag ein.",
    errNameLength: "Verwenden Sie 2–80 Zeichen.",
    errRecipientAddress: "Der Empfänger muss eine gültige 0x-Adresse sein.",
    errRecipientKey:
      "Der öffentliche Schlüssel des Empfängers muss 64 Byte Hex sein (0x…).",
    errRecipientKeyIsAddress:
      "Das sieht nach einer Ethereum-Adresse aus (42 Zeichen) — eine Übertragung benötigt den öffentlichen Schlüssel des Empfängers (132 Zeichen). Siehe „Wie erhält man ihn“ unten.",
    transferKeyWalkthroughTitle: "Wie erhält man ihn",
    transferKeyWalkthroughSteps: [
      "Der Empfänger öffnet sein Wallet und wählt das Konto, das den Agent empfangen soll",
      "Er öffnet die Kontodetails und wählt „Öffentlichen Schlüssel exportieren“",
      "Fügen Sie den kopierten Schlüssel hier ein",
    ],
    errInstruction: "Beschreiben Sie die Anweisung.",
    errSelectAgent: "Wählen Sie zuerst einen Agenten.",
    intentFund: "Agent ausgewählt. Prüfen Sie die exakte Freigabe.",
    intentProof: "Transfer ausgewählt. Empfängerdetails prüfen.",
    intentBounded: "Anweisung ausgewählt. Der Stream bleibt abbrechbar.",
    intentRecovery:
      "Ein bestehender Beleg wird wiederaufgenommen. Kein doppelter Vorgang.",
    intentReceipt: "Mit einem indexierten Beleg verknüpft.",
    streamLabel: "Token-Stream",
    cancelStream: "Stream abbrechen",
    receiptHeadingConfirmed: "Beleg bereit.",
    receiptHeadingReverted: "On-Chain rückgängig.",
    receiptHeadingStale: "Bestätigung unbekannt.",
    receiptHeadingConfirming: "Eingereicht, Bestätigung läuft…",
    receiptOverlayConfirmed: "Beleg indexiert",
    receiptOverlayReverted: "Rückgängig",
    receiptOverlayStale: "Explorer prüfen",
    receiptOverlayConfirming: "On-Chain-Bestätigung",
    receiptBodyConfirmed:
      "Nachweis und Ereignis im Transaktionszentrum indexiert.",
    receiptBodyReverted:
      "On-Chain rückgängig. Die Zeile im Transaktionszentrum bietet Recovery.",
    receiptBodyStale:
      "Keine Bestätigung nach {seconds} s. Prüfen Sie den Explorer; die Zeile ist als Prüfbedarf markiert.",
    receiptBodyConfirming: "Eingereicht, wartet auf On-Chain-Bestätigung.",
    copyReceiptAction: "Beleg kopieren",
    openReceiptAction: "Beleg öffnen",
    startAnotherAction: "Neu beginnen",
    receiptCopiedNotice: "Beleg-Kennung kopiert.",
    vaultBalanceAfter: "Vault-Stand danach",
    exceedsBalance: "übersteigt Guthaben",
    vaultedHint:
      "Im Vault: {amount} {symbol}. Der resultierende Stand erscheint in der Prüfung.",
    allowanceNote:
      "Aktuelle Freigabe: {amount} {symbol} (nur exakte Betragsfreigabe, niemals unbegrenzt).",
    liveRouteNote:
      "Live-Route: Wallet-Signatur und Contract-Write erfolgen erst nach der Prüfung.",
    simulateRejectedError:
      "Signatur abgelehnt. Geprüfte Details bleiben gespeichert.",
    simulateTimeoutError:
      "Bestätigung abgelaufen. Nehmen Sie die Prüfung wieder auf.",
    tickActed: "ausgeführt",
    tickHeld: "zurückgehalten",
    allowanceKind: "Freigabe-Genehmigung",
    allowanceDetail: "{amount} {symbol} → Ausgabenlimit (Schritt 1)",
    approveSentNotice:
      "Freigabe on-chain genehmigt. Signieren Sie jetzt die Zahlung.",
    allowanceCoveredNotice:
      "Die bestehende Freigabe deckt diesen Betrag, keine Genehmigungstransaktion nötig.",
    reviewTitle: "Vorgang prüfen.",
    closeReviewA11y: "Prüfung schließen und Vorgangsdetails bearbeiten",
    factAgent: "Ziel-Agent",
    factAmount: "Betrag",
    factRecipient: "Empfänger",
    factName: "Agentenname",
    factInstruction: "Anweisung",
    factNetwork: "Netzwerk",
    factBoundary: "Limit",
    networkFact: "{chainName} · Chain {chainId}",
    primarySign: "Signieren & ausführen",
    primaryApprove: "Ausgabenlimit genehmigen",
    primaryContinuePayment: "Zur Zahlung fortfahren",
    payCta: "{amount} {symbol} zahlen",
    resumeReview: "Prüfung wieder aufnehmen",
    restartApproval: "Freigabe-Prüfung neu starten",
    editDetails: "Details bearbeiten",
    awaitingWallet: "Warten auf Wallet",
    submitTransfer: "Transfer einreichen",
    reviewDisclaimer:
      "Nichts wird eingereicht, bevor Sie im Wallet bestätigen.",
    confirmOne: "1 Wallet-Bestätigung erforderlich",
    confirmTwo: "2 Wallet-Bestätigungen erforderlich",
    confirmTwoApprovePay:
      "2 Wallet-Bestätigungen erforderlich (genehmigen, dann zahlen)",
    confirmOneAllowance:
      "1 Wallet-Bestätigung erforderlich (Freigabe ausreichend)",
    confirmChecking: "Bis zu 2 Wallet-Bestätigungen (Freigabe wird geprüft…)",
    confirmReceiverThenSubmit:
      "2 Wallet-Bestätigungen (Empfänger signiert, dann reichen Sie ein)",
    transferKeyLabel: "Öffentlicher Schlüssel des Empfängers",
    transferKeyHint:
      "64 Byte Hex (0x…), der Verschlüsselungsschlüssel des neuen Eigentümers.",
    transferAgentTitle: (id) => `Agent #${id} übertragen`,
    handoffTitle: "Empfänger an einem anderen Gerät?",
    handoffBody:
      "Link senden. Der Empfänger signiert; Code hier einfügen, dann reichst du ein.",
    handoffCopyLink: "Annahme-Link kopieren",
    handoffLinkCopied: "Annahme-Link kopiert. Senden Sie ihn an den Empfänger.",
    handoffPasteLabel: "Annahme-Code",
    handoffPasteHint:
      "Der Code, den das Wallet des Empfängers erzeugt hat (0x…).",
    handoffApply: "Annahme anwenden",
    handoffAppliedTitle: "Empfänger-Annahme angewendet",
    handoffAppliedNote:
      "Verifiziert. Aus deinem Wallet einreichen, um fertigzustellen.",
    handoffReceivedNotice: "Empfänger-Annahme aus diesem Browser empfangen.",
    receiveTitle: "Einen Transfer annehmen",
    receiveLede:
      "Jemand sendet dir einen Agenten. Prüfen und signieren zum Annehmen.",
    receiveNoLinkTitle: "Noch nichts anzunehmen",
    receiveNoLinkBody:
      "Auf dieser Seite nimmst du einen Agenten an, den dir jemand geschickt hat. Öffne den Annahme-Link des Senders oder bitte ihn um einen neuen aus seiner Transfer-Prüfung.",
    receiveBadTitle: "Dieser Annahme-Link ist nicht verwendbar",
    receiveBadBody: "Link beschädigt. Neu vom Sender anfordern.",
    receiveReceiver: "Empfänger (Sie)",
    receiveExpiry: "Annahme gültig bis",
    receiveNetwork: "Netzwerk",
    receiveExpiredTitle: "Annahme abgelaufen",
    receiveExpiredBody: "Link abgelaufen. Transfer neu starten lassen.",
    receiveWrongChain:
      "Ihr Wallet ist in einem anderen Netzwerk. Die Annahme ist an Chain {chainId} gebunden.",
    receiveConnect: "Wallet verbinden",
    receiveAcceptTitle: "Prüfen, dann zum Annehmen signieren.",
    receiveAcceptBody:
      "Ihr Wallet ({receiver}) signiert die Annahme. Der Absender übermittelt danach den Transfer. On-chain passiert bis dahin nichts.",
    receiveSign: "Annahme signieren",
    receiveSigning: "Warten auf Signatur…",
    receiveWrongAccount: "Falsches Konto. Diese Annahme braucht {receiver}.",
    receiveDoneTitle: "Annahme signiert",
    receiveDoneBody:
      "Code kopieren und dem Sender schicken. On-Chain ist noch nichts passiert.",
    receiveCopyCode: "Annahme-Code kopieren",
    receiveCodeCopied: "Annahme-Code kopiert.",
    receiveDoneSameBrowser:
      "Wurde im Sender-Tab dieses Browsers automatisch angewendet.",
    claimTokenLabel: "Claim-Token",
    claimUrlLabel: "Claim-Link",
    claimRawToggle: "Erweitert — rohe Signatur",
  },
  agentDetail: {
    ...english.agentDetail,
    operatingBalance: "Betriebsguthaben",
    vaultRoute: "Vault-Route · {chainName}",
    noStrategy: "keine Strategie gebunden",
    dataHash: "Metadaten-Hash",
    overview: "Übersicht",
    execute: "Ausführen",
    payments: "Zahlungen",
    activity: "Aktivität",
    agentRecord: "Agentenakte",
    owner: "Inhaber",
    agentId: "Agent-ID",
    metadataRoot: "Metadaten-Hash",
    lastEvent: "Letztes Ereignis",
    inspectStorageProof: "Storage-Beleg prüfen",
    chooseBoundedOperation: "Wähle eine begrenzte Operation.",
    fundAgent: "Agent finanzieren",
    depositFunds: "In Vault einzahlen",
    withdrawFunds: "Aus Vault auszahlen",
    transferProof: "Übertragen",
    queueTick: "Tick einreihen",
    commandEvidence: "Jede Aktion kehrt mit einem Beleg zurück.",
    runRecoveryPath: "Führe eine Operation mit Wiederherstellungspfad aus.",
    instruction: "Anweisung",
    instructionPlaceholder: "Aktuelle Route auswerten",
    instructionHint: "Wird unten gestreamt; abbrechbar.",
    providerRoute: "Provider-Route",
    providerValue: "Axiom-Orchestrator",
    createTickIntent: "Tick-Absicht erstellen",
    cancel: "Abbrechen",
    valueRouteFor: (agent) => `Wert-Route für ${agent}`,
    openPaymentFlow: "Zahlungsflow öffnen",
    earnings: "Erträge",
    evidenceTied: "Belege zu diesem Agenten",
  },
  transactions: {
    ...english.transactions,
    title: "Transaktionszentrum",
    description:
      "Jede Signatur hat einen Status, eine Quelle und einen Wiederherstellungspfad.",
    refreshState: "Status aktualisieren",
    refreshNotice:
      "Belegindex erneut geprüft. Ausstehende Status bleiben ausstehend.",
    feedDown: "Live-Ereignisfeed offline, Polling stattdessen.",
    confirmingNow: "wird bestätigt",
    needReview: "prüfen",
    confirmedNote:
      "Bestätigt bedeutet: Beleg wurde beobachtet und Ereignis dekodiert. Ausstehend wird nie zu Erfolg.",
    statefulOperations: "Zustandsbehaftete Operationen",
    filterAll: "Alle",
    filterReview: "Zur Prüfung",
    filterStale: "Veraltet",
    moreFilters: "Mehr Filter",
    age: "Alter",
    state: "Status",
    emptyState:
      "Keine Belege passen zu diesem Status. Der gemeinsame Store verbirgt keine Elemente.",
    closeReceipt: "Beleg schließen",
    transactionHash: "Transaktions-Hash",
    network: "Netzwerk",
    event: "Ereignis",
    decodedIndexed: "dekodiert + indexiert",
    awaitingFinalEvidence: "finale Bestätigung ausstehend",
    openRecovery: "Wiederherstellung öffnen",
    recoveryNotice: "Wiederherstellung geöffnet. Operation ist wieder bereit.",
    runAnother: "Ähnliche Operation erneut ausführen",
    drawerTitle: "Belegdetail",
    proofTitle: "Technische Details",
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
};

export function getCopy(locale: Locale = "en"): Copy {
  const copy = locale === "fr" ? french : locale === "de" ? german : english;
  return copy;
}
