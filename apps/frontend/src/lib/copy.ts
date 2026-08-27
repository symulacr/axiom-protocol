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
    /** Connection summary suffix rendered next to signingContext in the
     * collapsed disclosure heading ("Signing — Working ✓"). */
    connectionOk: string;
    connectionFail: string;
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
    title: string;
    review: (count: number) => string;
    refresh: string;
    managedValue: string;
    agentsOnline: string;
    pendingMine: string;
    operatingFleet: string;
    attentionFirst: string;
    allowanceReady: string;
    /** Next-action CTA: reuses the deposit route for the first unready agent. */
    addMoney: string;
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
    /** Per-row fleet status pills (plain words, not internal states). */
    readyLabel: string;
    needsSetupLabel: string;
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
    composerNearLimit: (remaining: number) => string;
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
     * wallet must sign the approval before the sender submits. */
    coSignTitle: string;
    coSignBody: (receiver: string) => string;
    coSignAction: string;
    coSignNote: string;
    /** S12: the single "Needs approval" card replacing the former
     * waiting / blocked / handoff sibling blocks on the transfer sheet. */
    needsApprovalTitle: string;
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
    /** proto-subpages-a mint trims: cost row replaces Network+Limit on the
     * mint sheet. */
    factCost: string;
    confirmMint: string;
    /** proto-subpages-a mint success state. Placeholder: {name}. */
    mintDoneHeading: string;
    mintDoneBody: string;
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
    /** P3 §(b)#4: the pubkey field is replaced by an address resolved via
     * GET /v1/registry/pubkey/:address; the paste field survives only as the
     * NO_ONCHAIN_KEY fallback (Advanced details). */
    transferPubkeyFallbackSummary: string;
    transferPubkeyResolvePending: string;
    transferPubkeyResolveFailed: string;
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
    /** U26: co-sign done-state presents a one-piece approval link; the raw
     * signature/token hide behind "Advanced". */
    claimUrlLabel: string;
    claimRawToggle: string;
    /** Plain-language ghost exit used by CoSignPage back buttons. */
    goHome: string;
  };
  agentDetail: {
    /** Balance caption: `{amount}` — formatted balance + symbol from chain config. */
    balanceToSpend: string;
    needsSetup: string;
    dataHash: string;
    overview: string;
    execute: string;
    payments: string;
    activity: string;
    agentRecord: string;
    owner: string;
    agentId: string;
    metadataRoot: string;
    copyHashA11y: string;
    lastEvent: string;
    descriptionLabel: string;
    noActivityYet: string;
    explorerLabel: string;
    viewRecordLink: string;
    metadataReadFailed: string;
    inspectStorageProof: string;
    chooseBoundedOperation: string;
    addMoneyPrimary: string;
    runTask: string;
    moreActions: string;
    fundAgent: string;
    withdrawFunds: string;
    transferProof: string;
    runRecoveryPath: string;
    instruction: string;
    instructionPlaceholder: string;
    instructionHint: string;
    providerRoute: string;
    providerValue: string;
    providerHint: string;
    describeFirst: string;
    previewRun: string;
    cancel: string;
    valueRouteFor: (agent: string) => string;
    token: string;
    royalty: string;
    openPaymentFlow: string;
    withdrawEarningsCta: string;
    earnings: string;
    evidenceTied: string;
    dailySpendingLimitTitle: string;
    dailyLimitFact: string;
    spentTodayFact: string;
    remainingFact: string;
    resetsFact: string;
    expiresFact: string;
    neverExpires: string;
    newDailyLimit: string;
    setSpendingLimit: string;
    limitTipBound: string;
    limitTipUnbound: string;
    errLimitPositive: string;
    errLimitWallet: string;
    copiedNotice: string;
    limitToast: (hash: string) => string;
    withdrawToast: (hash: string) => string;
    ticksRun: (count: number) => string;
    activityLoading: string;
    activityEmptyTitle: string;
    activityEmptyHint: string;
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
    titleLead: "Own AI agents",
    titleEmphasis: "that work for you.",
    description:
      "Mint an agent on 0G, put your funds to work, and stay in control — every step signs through your wallet and leaves a receipt.",
    nextSafeAction: "Next safe action",
    signatureBoundary: "How signing works",
    consoleAccess: "Console access",
    menuGuideHint: "How signing and receipts work",
    menuDevelopers: "Developers",
    menuDevelopersHint: "APIs and developer tools",
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
    body: "Staking needs the official 0G app — Axiom doesn\u0027t do staking.",
    openVault: "Go to my agents",
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
    pageDescription: "Your preferences.",
    localeEnglish: "English",
    localeFrench: "Français",
    localeGerman: "Deutsch",
    liveWallet: "live wallet",
    signingContext: "Signing",
    connectionOk: "Working ✓",
    connectionFail: "Check connection ✗",
    profileNameLabel: "Operator profile name",
    profileNameSave: "Save name",
    profileNameSaved: "Profile name updated.",
    dailyTitle: "Appearance",
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
    resetSurface: "Reset settings",
    resetConfirmTitle: "Reset the settings?",
    resetConfirmBody: "Signs you out and wipes drafts and receipts. No undo.",
    resetConfirmAction: "Reset everything",
    resetCancel: "Cancel",
    lockConsole: "Sign out",
  },
  dashboard: {
    title: "Your agents.",
    review: (count) =>
      count === 1
        ? "1 agent isn't ready yet"
        : `${count} agents aren't ready yet`,
    refresh: "Refresh",
    managedValue: "Money held",
    agentsOnline: "Ready to work",
    pendingMine: "In progress",
    operatingFleet: "Your agents",
    attentionFirst: "Attention first",
    allowanceReady: "Needs money before it can work.",
    addMoney: "Add money",
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
    agentsScoped: (count) => `across ${count} agent${count === 1 ? "" : "s"}`,
    needReview: (count) => `${count} need review`,
    fleetNominal: "All set.",
    readyLabel: "ready",
    needsSetupLabel: "needs setup",
    queueAwaiting: "awaiting confirmation",
    oracleUnreachable: "status checks failing",
    telemetryTitle: "Recent activity",
    noEvidence: "Nothing here yet",
    noEvidenceHint: "Mint an agent to create the first receipt.",
    registerUnavailable: "Agent register unavailable",
    noAgents: "You don't have an agent yet",
    noAgentsHint: "Make one — about a minute.",
    mintAgent: "Create agent",
    noDescription: "no description",
    refreshNotice: "Updated",
    agentFundingLabel: (tokenId) => `Agent #${tokenId} has nothing to spend`,
  },
  chat: {
    pageTitle: "Chat",
    statusOnline: "Online · {chainName}",
    statusWrongNetwork: "Switch to {chainName}",
    wrongNetworkBanner: "Wrong network. Switch wallet to {chainName}.",
    newChat: "New chat",
    historyToggle: "History",
    emptyTagline: "Chat with your agents. They handle the chain.",
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
    composerNearLimit: (remaining) =>
      `${remaining} characters left before the composer cuts off pastes`,
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
    historyEmpty: "No chats yet.",
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
      title: "Create an agent",
      copy: "Pick a name. Confirm once.",
      steps: ["Preparing identity", "Confirming uniqueness", "Receipt indexed"],
      receiptKind: "Mint",
      consequence: "Once confirmed, your new agent is yours forever.",
      proofLine: "Records the metadata hash and its on-chain registration.",
      contextTitle: "Identity before ownership.",
      fieldLabel: "Agent name",
      fieldHint: "Names are permanent — choose well.",
      detail: "{name} · registered on-chain",
      notice: enFlowNotice("Mint submitted for {name}."),
    },
    payment: {
      title: "Add funds",
      copy: "One approval, then one payment.",
      steps: ["Approve", "Confirm", "Done"],
      receiptKind: "Payment",
      consequence: "Fund the selected agent with the reviewed amount.",
      proofLine: "",
      contextTitle: "",
      fieldLabel: "Amount",
      fieldHint: "",
      detail: "{amount} → agent #{agent}",
      notice: enFlowNotice("Payment submitted for agent #{agent}."),
    },
    transfer: {
      title: "Give an agent",
      copy: "Challenge → signature → finalization → on-chain receipt. Expiration never disappears.",
      steps: ["They agree", "You send", "Done"],
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
    stepWallet: "You",
    stepAuto: "Us",
    coSignTitle: "The receiver must approve first.",
    coSignBody: (receiver) =>
      `The receiver's wallet (${receiver}) signs the approval. You stay as sender.`,
    coSignAction: "Sign as receiver",
    coSignNote: "",
    needsApprovalTitle: "Needs approval",
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
    noAgentsOption: "No agents yet — create one",
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
    intentFund: "Paying agent #{agent}",
    intentProof: "Transfer selected. Review the recipient details.",
    intentBounded: "Instruction selected. Streaming stays cancellable.",
    intentRecovery: "Recovering an existing receipt. No duplicate operation.",
    intentReceipt: "Linked to an indexed receipt.",
    streamLabel: "Streamed tokens",
    cancelStream: "Cancel stream",
    factCost: "Cost",
    confirmMint: "1 click in your wallet · usual network fee",
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
    /** proto-subpages-a mint success — Placeholder: {name}. */
    mintDoneHeading: "Done — {name} is live!",
    mintDoneBody: "Saved in your history.",
    receiptCopiedNotice: "Receipt identifier copied.",
    vaultBalanceAfter: "Vault balance after",
    exceedsBalance: "exceeds balance",
    vaultedHint:
      "In vault: {amount} {symbol}. The resulting balance appears in review.",
    allowanceNote:
      "Current allowance: {amount} {symbol} — approves exactly this amount, never infinite.",
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
    factBoundary: "Asks twice?",
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
    confirmOne: "No — single ask",
    confirmTwo: "Yes — two wallet asks",
    confirmTwoApprovePay: "Yes — once now, once to pay",
    confirmOneAllowance: "No — your approval covers it",
    confirmChecking: "Up to 2 wallet asks (checking approval…)",
    confirmReceiverThenSubmit: "Approval needed: yes",
    transferKeyLabel: "Recipient public key",
    transferKeyHint: "64-byte hex (0x…), the new owner's encryption key.",
    transferPubkeyFallbackSummary: "Advanced — paste the public key instead",
    transferPubkeyResolvePending: "Looking up the key for this address…",
    transferPubkeyResolveFailed:
      "No public key found on-chain for this address yet. Paste it manually below.",
    transferAgentTitle: (id) => `Transfer agent #${id}`,
    handoffTitle: "Receiver on another device?",
    handoffBody:
      "Send this link. They sign it; paste their result here, then you submit.",
    handoffCopyLink: "Copy approval link",
    handoffLinkCopied: "Approval link copied. Send it to the receiver.",
    handoffPasteLabel: "Paste approval link",
    handoffPasteHint: "The receiver's signed result comes as a 0x… code.",
    handoffApply: "Apply result",
    handoffAppliedTitle: "Receiver approved",
    handoffAppliedNote: "Verified. Submit from your wallet to finish.",
    handoffReceivedNotice: "Receiver approval received from this browser.",
    receiveTitle: "Accept a transfer",
    receiveLede:
      "Someone is sending you an agent. Review, then sign to accept.",
    receiveNoLinkTitle: "Nothing to accept yet",
    receiveNoLinkBody:
      "This page is where you accept an agent someone sent you. Open the approval link they shared, or ask them for a fresh one from their transfer review.",
    receiveBadTitle: "This approval link is not usable",
    receiveBadBody: "Link damaged. Ask the sender for a new one.",
    receiveAgent: "Agent",
    receiveSender: "Sender",
    receiveReceiver: "Receiver (you)",
    receiveExpiry: "Approval link valid until",
    receiveNetwork: "Network",
    receiveExpiredTitle: "Approval link expired",
    receiveExpiredBody: "Link expired. Ask the sender to restart the transfer.",
    receiveWrongChain:
      "Your wallet is on a different network. The approval is bound to chain {chainId}.",
    receiveConnect: "Connect wallet",
    receiveAcceptTitle: "Review, then sign to approve.",
    receiveAcceptBody:
      "You're receiving this agent with your wallet ({receiver}). Sign to agree — nothing moves on-chain until the sender submits.",
    receiveSign: "Sign approval",
    receiveSigning: "Waiting for signature…",
    receiveWrongAccount: "Wrong account. This approval needs {receiver}.",
    receiveDoneTitle: "Approval signed",
    receiveDoneBody: "Send the approval link to the sender below.",
    receiveCopyCode: "Copy approval link",
    receiveCodeCopied: "Approval link copied.",
    receiveDoneSameBrowser: "Sent to the sender's tab automatically.",
    /** U26: co-sign done-state presents a one-piece approval link; the raw
     * signature/token hide behind "Advanced". */
    claimUrlLabel: "Approval link",
    claimRawToggle: "Advanced — raw signature",
    goHome: "Home",
  },
  agentDetail: {
    balanceToSpend: "Has {amount} to spend · ready",
    needsSetup: "Needs setup",
    dataHash: "Metadata hash",
    overview: "About",
    execute: "Run",
    payments: "Money",
    activity: "History",
    agentRecord: "Details",
    owner: "Owner",
    agentId: "Agent ID",
    metadataRoot: "Metadata hash",
    copyHashA11y: "Copy metadata hash",
    lastEvent: "Last active",
    descriptionLabel: "Description",
    noActivityYet: "Not active yet",
    explorerLabel: "Explorer",
    viewRecordLink: "View record",
    metadataReadFailed: "Couldn't load this agent's details.",
    inspectStorageProof: "Files & records",
    chooseBoundedOperation: "What do you want to do?",
    addMoneyPrimary: "Add money",
    runTask: "Run task",
    moreActions: "More…",
    fundAgent: "Give spending credit",
    withdrawFunds: "Take money back",
    transferProof: "Send to someone",
    runRecoveryPath: "Give it something to do",
    instruction: "Instruction",
    instructionPlaceholder: "e.g. Summarize my inbox",
    instructionHint: "You can cancel anytime.",
    providerRoute: "Provider route",
    providerValue: "Axiom orchestrator",
    providerHint: "",
    describeFirst: "Describe the task first.",
    previewRun: "Preview run",
    cancel: "Cancel",
    valueRouteFor: () => "Its money",
    token: "Token",
    royalty: "Service fee",
    openPaymentFlow: "Open payment flow",
    withdrawEarningsCta: "Withdraw earnings",
    earnings: "Earnings",
    evidenceTied: "Activity",
    dailySpendingLimitTitle: "Daily spending limit",
    dailyLimitFact: "Daily limit",
    spentTodayFact: "Spent today",
    remainingFact: "Remaining",
    resetsFact: "Resets",
    expiresFact: "Expires",
    neverExpires: "Never",
    newDailyLimit: "New daily limit",
    setSpendingLimit: "Set spending limit",
    limitTipBound:
      "Edits keep this agent's rules and expiry — only the daily limit changes.",
    limitTipUnbound:
      "Tip: set a daily limit so your agent can pay small bills by itself.",
    errLimitPositive: "Enter a daily limit greater than zero.",
    errLimitWallet: "Connect a wallet to set the spending limit.",
    copiedNotice: "Copied",
    limitToast: (hash) => `Spending limit submitted (${hash.slice(0, 10)}…)`,
    withdrawToast: (hash) => `Withdrawal submitted (${hash.slice(0, 10)}…)`,
    ticksRun: (count) => `ran ${count} tasks`,
    activityLoading: "Loading…",
    activityEmptyTitle: "Nothing yet",
    activityEmptyHint: "Runs will show up here.",
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
    titleLead: "Possédez des agents IA",
    titleEmphasis: "qui travaillent pour vous.",
    description:
      "Mintez un agent sur 0G, mettez vos fonds au travail et gardez le contrôle — chaque étape est signée par votre wallet et laisse un reçu.",
    nextSafeAction: "Prochaine action sûre",
    signatureBoundary: "Comment fonctionne la signature",
    consoleAccess: "Accès console",
    tryAssistant: "Essayer l’assistant — sans wallet",
    menuGuideHint: "Comment fonctionnent signatures et reçus",
    menuDevelopers: "Développeurs",
    menuDevelopersHint: "APIs et outils pour développeurs",
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
    body: "Le staking passe par l’app officielle 0G — Axiom ne fait pas de staking.",
    openVault: "Aller à mes agents",
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
    pageDescription: "Vos préférences.",
    liveWallet: "wallet actif",
    signingContext: "Signature",
    connectionOk: "Tout fonctionne ✓",
    connectionFail: "Vérifiez la connexion ✗",
    profileNameLabel: "Nom du profil opérateur",
    profileNameSave: "Enregistrer",
    profileNameSaved: "Nom du profil mis à jour.",
    dailyTitle: "Apparence",
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
    resetSurface: "Réinitialiser les réglages",
    resetConfirmTitle: "Réinitialiser les réglages ?",
    resetConfirmBody:
      "Cette action vous déconnecte et efface tous les brouillons de flow et les reçus locaux. Vos paramètres sont conservés. Aucune annulation possible.",
    resetConfirmAction: "Tout réinitialiser",
    resetCancel: "Annuler",
    lockConsole: "Se déconnecter",
  },
  dashboard: {
    title: "Vos agents.",
    review: (count) =>
      count === 1
        ? "1 agent n'est pas prêt"
        : `${count} agents ne sont pas prêts`,
    refresh: "Actualiser",
    managedValue: "Argent détenu",
    agentsOnline: "Prêts à travailler",
    pendingMine: "En cours",
    operatingFleet: "Vos agents",
    attentionFirst: "Attention d’abord",
    allowanceReady: "Il lui faut des fonds avant de pouvoir agir.",
    addMoney: "Ajouter des fonds",
    latestEvidence: "Derniers reçus",
    allReceipts: "Tous les reçus",
    switchRequired: "changement requis",
    signerReady: "Prêt à signer",
    signerWrong: "Mauvais réseau",
    noConnector: "aucun connecteur",
    attentionCount: (count) => `${count} action${frS(count)} à examiner`,
    openReviewQueue: "Ouvrir la file de revue",
    loadingVaults: "chargement des vaults…",
    agentsScoped: (count) => `sur ${count} agent${frS(count)}`,
    needReview: (count) => `${count} à examiner`,
    fleetNominal: "Tout est en ordre.",
    readyLabel: "prêt",
    needsSetupLabel: "à configurer",
    queueAwaiting: "confirmation en attente",
    oracleUnreachable: "vérifications en échec",
    telemetryTitle: "Activité récente",
    noEvidence: "Rien ici pour l’instant",
    noEvidenceHint:
      "Mintez un agent ou lancez un paiement pour créer le premier reçu.",
    registerUnavailable: "Registre d’agents indisponible",
    noAgents: "Vous n'avez pas encore d'agent",
    noAgentsHint: "Créez-en un — environ une minute.",
    mintAgent: "Créer un agent",
    noDescription: "sans description",
    refreshNotice: "Mis à jour",
    agentFundingLabel: (tokenId) => `L’agent #${tokenId} n’a rien à dépenser`,
  },
  chat: {
    ...english.chat,
    statusOnline: "En ligne · {chainName}",
    statusWrongNetwork: "Passer sur {chainName}",
    wrongNetworkBanner: "Mauvais réseau. Basculez le wallet sur {chainName}.",
    newChat: "Nouveau chat",
    historyToggle: "Historique",
    emptyTagline: "Discutez avec vos agents. Ils s’occupent de la chaîne.",
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
    stop: "Arrêter",
    queue: "En file",
    removeQueued: "Retirer le message en file",
    composerNearLimit: (remaining) =>
      `${remaining} caractères restants avant que le champ ne tronque les collages`,
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
    historyEmpty: "Pas encore de discussions.",
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
      copy: "Choisissez un nom. Confirmez une fois.",
      steps: [
        "Préparation de l’identité",
        "Confirmation d’unicité",
        "Reçu indexé",
      ],
      consequence:
        "Une fois confirmé, votre nouvel agent est à vous pour toujours.",
      proofLine:
        "Enregistre le hash de métadonnées et son inscription on-chain.",
      contextTitle: "L’identité avant la propriété.",
      fieldLabel: "Nom de l’agent",
      fieldHint: "Les noms sont permanents — choisissez bien.",
      detail: "{name} · enregistré on-chain",
      notice: frFlowNotice("Mint soumis pour {name}."),
    },
    payment: {
      ...english.flows.payment,
      title: "Ajouter des fonds",
      copy: "Une approbation, puis un paiement.",
      steps: ["Approuver", "Confirmer", "Terminé"],
      receiptKind: "Paiement",
      consequence: "Financer l’agent sélectionné du montant revu.",
      proofLine: "",
      contextTitle: "",
      fieldLabel: "Montant",
      fieldHint: "",
      notice: frFlowNotice("Paiement soumis pour l’agent #{agent}."),
    },
    transfer: {
      ...english.flows.transfer,
      title: "Donner un agent",
      copy: "Challenge → signature → finalisation → reçu on-chain. L’expiration reste visible.",
      steps: ["Ils acceptent", "Vous envoyez", "Terminé"],
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
    stepWallet: "Vous",
    stepAuto: "Nous",
    coSignTitle: "Le destinataire doit d’abord approuver.",
    coSignBody: (receiver) =>
      `Le wallet destinataire (${receiver}) signe l’approbation. Vous restez expéditeur.`,
    coSignAction: "Signer comme destinataire",
    coSignNote: "",
    needsApprovalTitle: "Approbation requise",
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
    noAgentsOption: "Pas encore d’agent — créez-en un",
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
    intentFund: "Paiement de l’agent #{agent}",
    intentProof: "Transfert sélectionné. Vérifiez les détails du destinataire.",
    intentBounded: "Instruction sélectionnée. Le flux reste annulable.",
    intentRecovery:
      "Récupération d’un reçu existant. Aucune opération en double.",
    intentReceipt: "Lié à un reçu indexé.",
    streamLabel: "Flux de tokens",
    cancelStream: "Annuler le flux",
    factCost: "Coût",
    confirmMint: "Un clic dans votre wallet · frais de réseau habituels",
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
    mintDoneHeading: "C’est fait — {name} est en ligne !",
    mintDoneBody: "Enregistré dans votre historique.",
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
    factBoundary: "Double demande ?",
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
    confirmOne: "Non — une seule demande",
    confirmTwo: "Oui — deux demandes wallet",
    confirmTwoApprovePay: "Oui — une fois maintenant, une pour payer",
    confirmOneAllowance: "Non — l’approbation suffit",
    confirmChecking: "Jusqu’à 2 demandes wallet (vérification…)",
    confirmReceiverThenSubmit: "Approbation requise : oui",
    transferKeyLabel: "Clé publique du destinataire",
    transferKeyHint:
      "Hex 64 octets (0x…), la clé de chiffrement du nouveau propriétaire.",
    transferPubkeyFallbackSummary: "Avancé — coller la clé publique à la place",
    transferPubkeyResolvePending: "Recherche de la clé pour cette adresse…",
    transferPubkeyResolveFailed:
      "Aucune clé publique trouvée on-chain pour cette adresse. Collez-la manuellement ci-dessous.",
    transferAgentTitle: (id) => `Transférer l’agent #${id}`,
    handoffTitle: "Destinataire sur un autre appareil ?",
    handoffBody:
      "Envoyez ce lien. Le destinataire le signe ; collez ici son résultat, puis vous soumettez.",
    handoffCopyLink: "Copier le lien d’approbation",
    handoffLinkCopied: "Lien d’approbation copié. Envoyez-le au destinataire.",
    handoffPasteLabel: "Coller le lien d’approbation",
    handoffPasteHint: "Le résultat signé du destinataire arrive en code 0x….",
    handoffApply: "Appliquer le résultat",
    handoffAppliedTitle: "Le destinataire a approuvé",
    handoffAppliedNote:
      "L’approbation est vérifiée contre l’adresse du destinataire. Soumettez le transfert depuis votre wallet pour terminer.",
    handoffReceivedNotice:
      "Approbation du destinataire reçue depuis ce navigateur.",
    receiveTitle: "Accepter un transfert",
    receiveLede:
      "Un agent est en cours de transfert vers votre adresse. Revoyez-le, puis signez l’approbation avec le wallet destinataire.",
    receiveNoLinkTitle: "Rien à accepter pour l’instant",
    receiveNoLinkBody:
      "Cette page sert à accepter un agent qu’on vous a envoyé. Ouvrez le lien d’approbation partagé par l’expéditeur, ou demandez-lui un nouveau lien depuis sa revue de transfert.",
    receiveBadTitle: "Ce lien d’approbation est inutilisable",
    receiveBadBody:
      "Le lien est incomplet ou endommagé. Demandez à l’expéditeur un lien frais depuis la revue de transfert.",
    receiveSender: "Expéditeur",
    receiveReceiver: "Destinataire (vous)",
    receiveExpiry: "Lien d’approbation valable jusqu’au",
    receiveNetwork: "Réseau",
    receiveExpiredTitle: "Lien d’approbation expiré",
    receiveExpiredBody:
      "Ce lien d’approbation a dépassé sa fenêtre de validité. Demandez à l’expéditeur de relancer le transfert pour un lien frais.",
    receiveWrongChain:
      "Votre wallet est sur un autre réseau. L’approbation est liée à la chaîne {chainId}.",
    receiveConnect: "Connecter le wallet",
    receiveAcceptTitle: "Vérifiez, puis signez pour approuver.",
    receiveAcceptBody:
      "Vous recevez cet agent avec votre wallet ({receiver}). Signez pour accepter — rien ne bouge on-chain tant que l’expéditeur n’a pas soumis.",
    receiveSign: "Signer l’approbation",
    receiveSigning: "En attente de la signature…",
    receiveWrongAccount:
      "Mauvais compte. Cette approbation doit être signée par {receiver}. Passez au compte destinataire.",
    receiveDoneTitle: "Approbation signée",
    receiveDoneBody: "Envoyez le lien d’approbation à l’expéditeur ci-dessous.",
    receiveCopyCode: "Copier le lien d’approbation",
    receiveCodeCopied: "Lien d’approbation copié.",
    receiveDoneSameBrowser:
      "Appliqué automatiquement à l’onglet de l’expéditeur dans ce navigateur.",
    claimUrlLabel: "Lien d’approbation",
    claimRawToggle: "Avancé — signature brute",
    goHome: "Accueil",
  },
  agentDetail: {
    ...english.agentDetail,
    balanceToSpend: "Dispose de {amount} à dépenser · prêt",
    needsSetup: "À configurer",
    dataHash: "Hash de métadonnées",
    overview: "À propos",
    execute: "Lancer",
    payments: "Argent",
    activity: "Historique",
    agentRecord: "Détails",
    owner: "Propriétaire",
    agentId: "ID agent",
    metadataRoot: "Hash de métadonnées",
    copyHashA11y: "Copier le hash de métadonnées",
    lastEvent: "Dernière activité",
    descriptionLabel: "Description",
    noActivityYet: "Pas encore actif",
    explorerLabel: "Explorateur",
    viewRecordLink: "Voir l’enregistrement",
    metadataReadFailed: "Impossible de charger les détails de cet agent.",
    inspectStorageProof: "Fichiers et enregistrements",
    chooseBoundedOperation: "Que voulez-vous faire ?",
    addMoneyPrimary: "Ajouter des fonds",
    runTask: "Lancer une tâche",
    moreActions: "Plus…",
    fundAgent: "Donner du crédit de dépense",
    withdrawFunds: "Reprendre des fonds",
    transferProof: "Envoyer à quelqu’un",
    runRecoveryPath: "Donnez-lui quelque chose à faire",
    instructionPlaceholder: "ex. Résumer ma boîte mail",
    instructionHint: "Vous pouvez annuler à tout moment.",
    providerRoute: "Route fournisseur",
    providerValue: "Orchestrateur Axiom",
    describeFirst: "Décrivez d’abord la tâche.",
    previewRun: "Aperçu de la tâche",
    cancel: "Annuler",
    valueRouteFor: () => "Son argent",
    royalty: "Frais de service",
    openPaymentFlow: "Ouvrir le flow de paiement",
    withdrawEarningsCta: "Retirer les gains",
    earnings: "Gains",
    evidenceTied: "Activité",
    dailySpendingLimitTitle: "Limite de dépense quotidienne",
    dailyLimitFact: "Limite quotidienne",
    spentTodayFact: "Dépensé aujourd’hui",
    remainingFact: "Restant",
    resetsFact: "Réinitialisation",
    expiresFact: "Expire",
    neverExpires: "Jamais",
    newDailyLimit: "Nouvelle limite quotidienne",
    setSpendingLimit: "Définir la limite",
    limitTipBound:
      "La modification conserve les règles et l’expiration de cet agent — seule la limite quotidienne change.",
    limitTipUnbound:
      "Astuce : définissez une limite quotidienne pour que votre agent puisse payer seul les petites factures.",
    errLimitPositive: "Entrez une limite quotidienne supérieure à zéro.",
    errLimitWallet: "Connectez un wallet pour définir la limite de dépense.",
    copiedNotice: "Copié",
    limitToast: (hash) => `Limite de dépense soumise (${hash.slice(0, 10)}…)`,
    withdrawToast: (hash) => `Retrait soumis (${hash.slice(0, 10)}…)`,
    ticksRun: (count) => `${count} tâches effectuées`,
    activityLoading: "Chargement…",
    activityEmptyTitle: "Rien pour l’instant",
    activityEmptyHint: "Les tâches apparaîtront ici.",
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
    titleLead: "Eigene KI-Agents,",
    titleEmphasis: "die für dich arbeiten.",
    description:
      "Minte einen Agent auf 0G, lass deine Mittel arbeiten und behalte die Kontrolle — jeder Schritt wird von deinem Wallet signiert und hinterlässt einen Beleg.",
    nextSafeAction: "Nächste sichere Aktion",
    signatureBoundary: "Wie die Signatur funktioniert",
    consoleAccess: "Konsolenzugriff",
    tryAssistant: "Assistent testen — ohne Wallet",
    menuGuideHint: "Wie Signatur und Beleg funktionieren",
    menuDevelopers: "Entwickler",
    menuDevelopersHint: "APIs und Entwickler-Tools",
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
    body: "Staking läuft über die offizielle 0G-App — Axiom macht kein Staking.",
    openVault: "Zu meinen Agents",
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
    pageDescription: "Deine Einstellungen.",
    liveWallet: "Live-Wallet",
    signingContext: "Signierung",
    connectionOk: "Funktioniert ✓",
    connectionFail: "Verbindung prüfen ✗",
    profileNameLabel: "Name des Operator-Profils",
    profileNameSave: "Namen speichern",
    profileNameSaved: "Profilname aktualisiert.",
    dailyTitle: "Erscheinungsbild",
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
    resetSurface: "Einstellungen zurücksetzen",
    resetConfirmTitle: "Einstellungen zurücksetzen?",
    resetConfirmBody:
      "Dies meldet Sie ab und löscht alle Flow-Entwürfe und lokalen Belege. Ihre Einstellungen bleiben erhalten. Kein Rückgängigmachen.",
    resetConfirmAction: "Alles zurücksetzen",
    resetCancel: "Abbrechen",
    lockConsole: "Abmelden",
  },
  dashboard: {
    ...english.dashboard,
    title: "Deine Agents.",
    review: (count) =>
      count === 1
        ? "1 Agent ist noch nicht bereit"
        : `${count} Agents sind noch nicht bereit`,
    refresh: "Aktualisieren",
    managedValue: "Verwaltetes Geld",
    agentsOnline: "Arbeitsbereit",
    pendingMine: "In Arbeit",
    operatingFleet: "Deine Agents",
    attentionFirst: "Aufmerksamkeit zuerst",
    allowanceReady: "Es braucht Geld, bevor es arbeiten kann.",
    addMoney: "Geld hinzufügen",
    latestEvidence: "Neueste Belege",
    allReceipts: "Alle Belege",
    switchRequired: "Wechsel erforderlich",
    signerReady: "Bereit zum Signieren",
    signerWrong: "Falsches Netzwerk",
    noConnector: "kein Connector",
    attentionCount: (count) => `${count} Aktion${deS(count)} prüfen`,
    openReviewQueue: "Prüfungsliste öffnen",
    loadingVaults: "Vaults werden geladen…",
    agentsScoped: (count) => `über ${count} Agent${count === 1 ? "" : "en"}`,
    needReview: (count) => `${count} prüfen`,
    fleetNominal: "Alles bereit.",
    readyLabel: "bereit",
    needsSetupLabel: "einrichten",
    queueAwaiting: "Bestätigung ausstehend",
    oracleUnreachable: "Statusprüfungen fehlerhaft",
    telemetryTitle: "Letzte Aktivität",
    noEvidence: "Noch nichts hier",
    noEvidenceHint:
      "Minte einen Agent oder führe eine Zahlung aus, um den ersten Beleg zu erzeugen.",
    registerUnavailable: "Agentenregister nicht verfügbar",
    noAgents: "Du hast noch keinen Agent",
    noAgentsHint: "Erstelle einen — dauert etwa eine Minute.",
    mintAgent: "Agent erstellen",
    noDescription: "keine Beschreibung",
    refreshNotice: "Aktualisiert",
    agentFundingLabel: (tokenId) => `Agent #${tokenId} hat nichts zum Ausgeben`,
  },
  chat: {
    ...english.chat,
    statusWrongNetwork: "Zu {chainName} wechseln",
    wrongNetworkBanner: "Falsches Netzwerk. Wallet zu {chainName} wechseln.",
    newChat: "Neuer Chat",
    historyToggle: "Verlauf",
    emptyTagline: "Chatte mit deinen Agents. Sie übernehmen die Chain.",
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
    composerNearLimit: (remaining) =>
      `${remaining} Zeichen übrig, bevor der Editor Einfügungen kürzt`,
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
    historyEmpty: "Noch keine Chats.",
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
      copy: "Namen wählen. Einmal bestätigen.",
      steps: [
        "Identität wird vorbereitet",
        "Eindeutigkeit wird bestätigt",
        "Beleg indexiert",
      ],
      consequence:
        "Nach der Bestätigung gehört dein neuer Agent für immer dir.",
      proofLine: "Speichert Metadaten-Hash und dessen On-Chain-Registrierung.",
      contextTitle: "Identität vor Eigentum.",
      fieldLabel: "Agentenname",
      fieldHint: "Namen sind dauerhaft — wähle mit Bedacht.",
      detail: "{name} · on-chain registriert",
      notice: deFlowNotice("Mint für {name} eingereicht."),
    },
    payment: {
      title: "Guthaben hinzufügen",
      copy: "Eine Freigabe, dann eine Zahlung.",
      steps: ["Freigeben", "Bestätigen", "Fertig"],
      receiptKind: "Zahlung",
      consequence:
        "Den ausgewählten Agenten mit dem geprüften Betrag finanzieren.",
      proofLine: "",
      contextTitle: "",
      fieldLabel: "Betrag",
      fieldHint: "",
      detail: "{amount} → Agent #{agent}",
      notice: deFlowNotice("Zahlung für Agent #{agent} eingereicht."),
    },
    transfer: {
      ...english.flows.transfer,
      title: "Einen Agenten weitergeben",
      copy: "Challenge → Signatur → Abschluss → On-Chain-Beleg. Der Ablauf bleibt nachvollziehbar.",
      steps: ["Empfänger stimmt zu", "Du sendest", "Fertig"],
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
    stepWallet: "Du",
    stepAuto: "Wir",
    coSignTitle: "Der Empfänger muss zuerst zustimmen.",
    coSignBody: (receiver) =>
      `Das Empfänger-Wallet (${receiver}) signiert die Zustimmung. Du bleibst Sender.`,
    coSignAction: "Als Empfänger signieren",
    coSignNote: "",
    needsApprovalTitle: "Zustimmung erforderlich",
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
    noAgentsOption: "Keine Agenten vorhanden — erst erstellen",
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
    intentFund: "Zahlung an Agent #{agent}",
    intentProof: "Transfer ausgewählt. Empfängerdetails prüfen.",
    intentBounded: "Anweisung ausgewählt. Der Stream bleibt abbrechbar.",
    intentRecovery:
      "Ein bestehender Beleg wird wiederaufgenommen. Kein doppelter Vorgang.",
    intentReceipt: "Mit einem indexierten Beleg verknüpft.",
    streamLabel: "Token-Stream",
    cancelStream: "Stream abbrechen",
    factCost: "Kosten",
    confirmMint: "Ein Klick im Wallet · übliche Netzwerkgebühr",
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
    mintDoneHeading: "Fertig — {name} ist live!",
    mintDoneBody: "In deinem Verlauf gespeichert.",
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
    factBoundary: "Doppelt gefragt?",
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
    confirmOne: "Nein — nur eine Anfrage",
    confirmTwo: "Ja — zwei Wallet-Anfragen",
    confirmTwoApprovePay: "Ja — einmal jetzt, einmal zum Zahlen",
    confirmOneAllowance: "Nein — die Freigabe reicht",
    confirmChecking: "Bis zu 2 Wallet-Anfragen (Freigabe wird geprüft…)",
    confirmReceiverThenSubmit: "Zustimmung erforderlich: ja",
    transferKeyLabel: "Öffentlicher Schlüssel des Empfängers",
    transferKeyHint:
      "64 Byte Hex (0x…), der Verschlüsselungsschlüssel des neuen Eigentümers.",
    transferPubkeyFallbackSummary:
      "Erweitert — öffentlichen Schlüssel stattdessen einfügen",
    transferPubkeyResolvePending: "Schlüssel für diese Adresse wird gesucht…",
    transferPubkeyResolveFailed:
      "Kein öffentlicher Schlüssel on-chain für diese Adresse gefunden. Fügen Sie ihn unten manuell ein.",
    transferAgentTitle: (id) => `Agent #${id} übertragen`,
    handoffTitle: "Empfänger an einem anderen Gerät?",
    handoffBody:
      "Link senden. Der Empfänger signiert; sein Ergebnis hier einfügen, dann reichst du ein.",
    handoffCopyLink: "Zustimmungs-Link kopieren",
    handoffLinkCopied:
      "Zustimmungs-Link kopiert. Senden Sie ihn an den Empfänger.",
    handoffPasteLabel: "Zustimmungs-Link einfügen",
    handoffPasteHint:
      "Das signierte Ergebnis des Empfängers kommt als 0x…-Code.",
    handoffApply: "Ergebnis anwenden",
    handoffAppliedTitle: "Empfänger hat zugestimmt",
    handoffAppliedNote:
      "Verifiziert. Aus deinem Wallet einreichen, um fertigzustellen.",
    handoffReceivedNotice: "Empfänger-Zustimmung aus diesem Browser empfangen.",
    receiveTitle: "Einen Transfer annehmen",
    receiveLede:
      "Jemand sendet dir einen Agenten. Prüfen und signieren zum Zustimmen.",
    receiveNoLinkTitle: "Noch nichts anzunehmen",
    receiveNoLinkBody:
      "Auf dieser Seite nimmst du einen Agenten an, den dir jemand geschickt hat. Öffne den Zustimmungs-Link des Senders oder bitte ihn um einen neuen aus seiner Transfer-Prüfung.",
    receiveBadTitle: "Dieser Zustimmungs-Link ist nicht verwendbar",
    receiveBadBody: "Link beschädigt. Neu vom Sender anfordern.",
    receiveReceiver: "Empfänger (Sie)",
    receiveExpiry: "Zustimmungs-Link gültig bis",
    receiveNetwork: "Netzwerk",
    receiveExpiredTitle: "Zustimmungs-Link abgelaufen",
    receiveExpiredBody: "Link abgelaufen. Transfer neu starten lassen.",
    receiveWrongChain:
      "Ihr Wallet ist in einem anderen Netzwerk. Die Zustimmung ist an Chain {chainId} gebunden.",
    receiveConnect: "Wallet verbinden",
    receiveAcceptTitle: "Prüfen, dann zum Zustimmen signieren.",
    receiveAcceptBody:
      "Du erhältst diesen Agenten mit deinem Wallet ({receiver}). Signieren zum Zustimmen — on-chain passiert nichts, bevor der Absender einreicht.",
    receiveSign: "Zustimmung signieren",
    receiveSigning: "Warten auf Signatur…",
    receiveWrongAccount: "Falsches Konto. Diese Zustimmung braucht {receiver}.",
    receiveDoneTitle: "Zustimmung signiert",
    receiveDoneBody: "Zustimmungs-Link unten an den Sender schicken.",
    receiveCopyCode: "Zustimmungs-Link kopieren",
    receiveCodeCopied: "Zustimmungs-Link kopiert.",
    receiveDoneSameBrowser:
      "Wurde im Sender-Tab dieses Browsers automatisch angewendet.",
    claimUrlLabel: "Zustimmungs-Link",
    claimRawToggle: "Erweitert — rohe Signatur",
    goHome: "Startseite",
  },
  agentDetail: {
    ...english.agentDetail,
    balanceToSpend: "Hat {amount} zum Ausgeben · bereit",
    needsSetup: "Einrichtung nötig",
    dataHash: "Metadaten-Hash",
    overview: "Über",
    execute: "Starten",
    payments: "Geld",
    activity: "Verlauf",
    agentRecord: "Details",
    owner: "Inhaber",
    agentId: "Agent-ID",
    metadataRoot: "Metadaten-Hash",
    copyHashA11y: "Metadaten-Hash kopieren",
    lastEvent: "Zuletzt aktiv",
    descriptionLabel: "Beschreibung",
    noActivityYet: "Noch nicht aktiv",
    explorerLabel: "Explorer",
    viewRecordLink: "Eintrag ansehen",
    metadataReadFailed:
      "Die Details dieses Agents konnten nicht geladen werden.",
    inspectStorageProof: "Dateien & Nachweise",
    chooseBoundedOperation: "Was möchtest du tun?",
    addMoneyPrimary: "Geld hinzufügen",
    runTask: "Aufgabe starten",
    moreActions: "Mehr…",
    fundAgent: "Ausgabenguthaben geben",
    withdrawFunds: "Geld zurückholen",
    transferProof: "An jemanden senden",
    runRecoveryPath: "Gib ihm etwas zu tun",
    instructionPlaceholder: "z. B. Mein Postfach zusammenfassen",
    instructionHint: "Du kannst jederzeit abbrechen.",
    providerRoute: "Provider-Route",
    providerValue: "Axiom-Orchestrator",
    describeFirst: "Beschreibe zuerst die Aufgabe.",
    previewRun: "Durchlauf vorschauen",
    cancel: "Abbrechen",
    valueRouteFor: () => "Sein Geld",
    royalty: "Servicegebühr",
    openPaymentFlow: "Zahlungsflow öffnen",
    withdrawEarningsCta: "Erträge abheben",
    earnings: "Erträge",
    evidenceTied: "Aktivität",
    dailySpendingLimitTitle: "Tägliches Ausgabenlimit",
    dailyLimitFact: "Tageslimit",
    spentTodayFact: "Heute ausgegeben",
    remainingFact: "Verbleibend",
    resetsFact: "Setzt sich zurück",
    expiresFact: "Läuft ab",
    neverExpires: "Nie",
    newDailyLimit: "Neues Tageslimit",
    setSpendingLimit: "Ausgabenlimit setzen",
    limitTipBound:
      "Änderungen behalten die Regeln und Ablaufdaten dieses Agents — nur das Tageslimit ändert sich.",
    limitTipUnbound:
      "Tipp: Setze ein Tageslimit, damit dein Agent kleine Rechnungen selbst bezahlen kann.",
    errLimitPositive: "Gib ein Tageslimit größer als null ein.",
    errLimitWallet: "Verbinde ein Wallet, um das Ausgabenlimit zu setzen.",
    copiedNotice: "Kopiert",
    limitToast: (hash) => `Ausgabenlimit übermittelt (${hash.slice(0, 10)}…)`,
    withdrawToast: (hash) => `Abhebung übermittelt (${hash.slice(0, 10)}…)`,
    ticksRun: (count) => `${count} Aufgaben ausgeführt`,
    activityLoading: "Wird geladen…",
    activityEmptyTitle: "Noch nichts",
    activityEmptyHint: "Durchläufe erscheinen hier.",
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
