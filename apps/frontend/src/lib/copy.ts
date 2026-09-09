/**
 * Axiom Copper Command Deck — typed interface copy.
 * Style reminder: operational, evidence-led, concise; keep copper actions explicit,
 * phosphor states factual, and avoid implying a live wallet or contract call.
 */

import type { PublicSeoSlug } from "./routeRegistry";

export type Locale = "en" | "fr" | "de";
/** Sidebar rail group-header keys (h1 §1) — indexable subset of Copy["nav"]. */
export type NavGroupKey =
  "groupOverview" | "groupOperations" | "groupResources";
/** Landing footer link ids — key the FOOTER_HREFS map in LandingPage, so
 * label↔href pairs survive copy reorders (F2b). */
export type LandingFooterLinkId =
  "agents" | "receipts" | "storage" | "developers";
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

/** One locked-gate hero: lead + emphasized tail for the two-line h1, plus
 * the lede under it. Shared shape across all gated routes and locales. */
export type GateHero = {
  titleLead: string;
  titleEmphasis: string;
  copy: string;
};

/** Locked-gate ids — the consoleCatalog slug per gated route. */
export type GateSlug =
  | "overview"
  | "settings"
  | "chat"
  | "mint"
  | "payment"
  | "transfer"
  | "agent"
  | "roster"
  | "tick"
  | "deposit"
  | "withdraw";

/** Locked-gate schematic row text; the row icon stays in consoleCatalog. */
export type GateRowText = { label: string; value: string };

export type Copy = {
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
    /** Sidebar rail group headers (small muted labels, h1 §1). */
    groupOverview: string;
    groupOperations: string;
    groupResources: string;
  };
  /** Shell chrome above/beside the page body. */
  topbar: {
    connected: string;
    notConnected: string;
    operator: string;
    openRail: string;
    oracleLive: string;
    oracleDown: string;
    chainLabel: (id: string) => string;
  };
  /** Priority action strip + next-safe-action engine (lib/nextSafeAction). */
  strip: {
    reviewTitle: (kind: string) => string;
    reviewSummary: string;
    reviewImpact: string;
    proofReceipt: string;
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
    /** Sonner toast region label (the one sonner default that leaks English). */
    notificationsRegion: string;
    openNav: string;
    closeNav: string;
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
    /** R12: global theme icon button. */
    switchToLight: string;
    switchToDark: string;
    /** U27: skip-to-content link in AppShell. */
    skipToContent: string;
    /** I5: ui.tsx shared primitives (CopyButton + Spinner) read these via
     * useUiStore, so every consumer localizes without prop threading. */
    copyLabel: string;
    copyA11y: string;
    copiedA11y: string;
    loading: string;
  };
  landing: {
    /** Hero h1. Placeholders: `{emphasis}` opens <em>, `{endEmphasis}` closes it. */
    title: string;
    description: string;
    /** document.title for the landing route (App.tsx route table). */
    docTitle: string;
    /** Closing CTA before the footer; empty locales fall back to English. */
    closingCta: string;
    /** R1: editorial-variant closing headline (emphasis markers). */
    closingTitle: string;
    /** R1: hero eyebrow (emphasis markers around the standard's name). */
    eyebrow: string;
    /** R1: A/B design-switch accessible labels (the switch is icon-only and
     * doubles as the landing's theme control: forge = dark, editorial = light). */
    switchToEditorial: string;
    switchToForge: string;
    menuGuideHint: string;
    menuDevelopers: string;
    menuDevelopersHint: string;
    nav: {
      overview: string;
      principles: string;
      howItWorks: string;
      start: string;
      connect: string;
    };
    /** R1: simulated agent feed — the forge console strip and the editorial
     * hero card share this one source. Line templates carry {tick},
     * {receiptHash}, {block} and {nativeSymbol} placeholders. */
    console: {
      agentId: string;
      chip: string;
      indexing: string;
      /** Visible orb state labels for the working/searching/solving cycle. */
      orbStates: ReadonlyArray<string>;
      /** Orb accessible name; `{state}` resolves to the current orbStates entry. */
      orbA11y: string;
      /** Screen-reader summary of the full feed (the animated lines are
       * aria-hidden). `{nativeSymbol}` placeholder. */
      srOnly: string;
      /** aria-label of the editorial hero console card. */
      previewA11y: string;
      lines: ReadonlyArray<string>;
    };
    /** R1: protocol-fact stats (1 mint tx, 0 accounts, 100% receipted, ERC id)
     * — numbers are locale-invariant, labels localize. */
    stats: ReadonlyArray<{ value: number; suffix: string; label: string }>;
    /** R1: editorial-variant spec sheet. The Account cluster's row values are
     * composed from principles.items by icon at render time (one copy source);
     * the Network row interpolates {chainName}/{chainId} from config/wagmi. */
    spec: {
      /** Placeholders: `{emphasis}` opens <em>, `{endEmphasis}` closes it. */
      title: string;
      clusters: ReadonlyArray<{
        head: string;
        rows: ReadonlyArray<{ label: string; value: string }>;
      }>;
      account: { head: string; accessLabel: string; receiptsLabel: string };
    };
    /** L2-N6: principles section — 3 cards. */
    principles: {
      /** Placeholders: `{emphasis}` opens <em>, `{endEmphasis}` closes it. */
      title: string;
      items: ReadonlyArray<{
        icon: "shield" | "receipt" | "wallet";
        title: string;
        body: string;
        link: string;
      }>;
    };
    /** R12: how-it-works — the three-step operating loop (no numbered chips:
        the banned numbered-label pattern; titles carry the sequence).
        R1: `fact` is the editorial variant's mono footnote under each tab. */
    how: {
      /** Placeholders: `{emphasis}` opens <em>, `{endEmphasis}` closes it. */
      title: string;
      steps: ReadonlyArray<{ title: string; body: string; fact: string }>;
    };
    /** L2-N8: landing footer. */
    footer: {
      credit: string;
      /** F2b: links carry a stable id that keys LandingPage's FOOTER_HREFS
       * map — the old index wiring drifted if copy reordered. */
      links: ReadonlyArray<{ id: LandingFooterLinkId; label: string }>;
    };
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
    /** Conflict chooser (mounted only when >1 injected wallet is installed). */
    connectTitle: string;
    /** Status line while the connect attempt runs in the click gesture. */
    connectingStatus: string;
    browserWalletLabel: string;
    browserWalletHint: string;
    walletConnectLabel: string;
    walletConnectHint: string;
    pairingTitle: string;
    pairingHint: string;
    /** Shown when no injected provider announced via EIP-6963. */
    noWalletDetected: string;
    /** Interpolated as the chain id when the wallet reports none. */
    unknownChain: string;
  };
  guide: {
    nextStep: string;
    /** Guide overlay artwork alt (rendered in every locale). */
    illustrationAlt: string;
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
    /** PageHead title + document.title (the App route table reuses it). */
    pageTitle: string;
    lede: string;
    body: string;
    openVault: string;
    /** Wave-9B (browser-4 /staking "orphaned navigation state"): return link
     * into the console — the page is reachable via deep link with no rail
     * item, so it must own its exit back to /app. */
    backLabel: string;
    /** Outbound pointer to 0G's own staking docs — the honest forward action
     * for a surface that deliberately does not implement staking. */
    docsLink: string;
    docsA11y: string;
    docsLabel: string;
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
    /** Alt text for the recovery illustration. */
    heroAlt: string;
    /** Wave-12B: accessible name for the recovery explore row. */
    exploreA11y: string;
    /** Wave-12B/F2b: public hub labels for the recovery explore row, keyed by
     * the same slug union the registry derives PUBLIC_HUB_PATHS from — labels
     * and destinations can no longer drift apart on reorder. */
    hubLabels: Record<PublicSeoSlug, string>;
  };
  /** Pre-auth locked-gate hero copy for every gated route — one locale owner
   * per surface. The visual slots (slug/media/row icons) live in
   * consoleCatalog.lockedGates; the hero words live here, the gate label and
   * schematic row text in copy.gate. */
  lockedHero: {
    app: GateHero;
    settings: GateHero;
    chat: GateHero;
    mint: GateHero;
    payment: GateHero;
    transfer: GateHero;
    agent: GateHero;
    agentsList: GateHero;
    tick: GateHero;
    deposit: GateHero;
    withdraw: GateHero;
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
  /** humanizeError's user-facing ladder (P-L6): the pattern match stays in
   * utils/format.ts; the words live here per locale. */
  errors: {
    userRejected: string;
    unknownDatahash: string;
    signerMismatch: string;
    receiverUnavailable: string;
    acceptanceNotSigned: string;
    computeOutOfCredits: string;
    insufficientFunds: string;
    rateLimited: string;
    tankExhausted: string;
    reserveExhausted: string;
    sponsorRateLimited: string;
    computeInvalidRequest: string;
    computeUpstream: string;
    gasEstimate: string;
    reverted: string;
    revertedWithReason: (reason: string) => string;
    networkError: string;
    timeout: string;
    nonceTooLow: string;
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
    /** First-run checklist replay (T1): distinct from replayOnboarding,
     * which reopens the Guide overlay. */
    showChecklistAgain: string;
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
    needsSetupLabel: string;
    /** Live-queue stat subline while the oracle is healthy — describes the
     * queue, not the plumbing; an outage overrides it. */
    queueAwaiting: string;
    telemetryTitle: string;
    noEvidence: string;
    noEvidenceHint: string;
    registerUnavailable: string;
    /** T6 recovery: retry CTA on the register-error empty state. */
    retryFetch: string;
    noAgents: string;
    noAgentsHint: string;
    mintAgent: string;
    noDescription: string;
    refreshNotice: string;
    /** T6 recovery: actionable remedy for a stale/reverted receipt. */
    receiptRemedy: string;
    /** Proof-card category line above the allowance headline. */
    agentFundingLabel: (tokenId: string) => string;
    /** T2 attention split: scope text for the agents-online Stat subline.
     * unconfigured = fresh agents (zero deposits / no vault row) — expected,
     * neutral; failing = vault fetch error or stale strategy root — faults. */
    unconfigured: (count: number) => string;
    failing: (count: number) => string;
    /** T2: ContextStrip health cell — replaces the in-grid oracle subline. */
    healthCheckLabel: string;
    oracleDown: string;
    /** T2: per-row neutral setup status label (muted tone, not warning). */
    unconfiguredLabel: string;
    /** T1 replay: inline link shown when the checklist was dismissed but
     * the fleet is not fully activated yet. */
    showChecklist: string;
  };
  /** Live /chat surface (v1 SSE chat). Every rendered string routes through
   * this section — hardcoded English in ChatPage was the defect. */
  chat: {
    pageTitle: string;
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
    removeQueued: (message: string) => string;
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
    stepsSummary: (count: number, seconds: number) => string;
    stepsWorking: (count: number) => string;
    stepsFailedSuffix: (failed: number) => string;
    stepNoResult: string;
    browseTools: (count: number) => string;
    footHint: string;
    storedOn0G: string;
    historyClose: string;
    /** I1: the run-loop strings that were hardcoded English. */
    /** Terminal turn-limit message; {max} is MAX_TOOL_LOOPS. */
    turnLimit: (max: number) => string;
    /** 429 toast. */
    rateLimited: string;
    /** Empty terminal answer from the model. */
    noResponse: string;
    /** The chat service answered with no body at all (transport-level). */
    errNoResponseBody: string;
    /** The model named an unregistered tool (run card + tool result). */
    unknownTool: (name: string) => string;
    /** openTransfer rejects a non-numeric id. */
    invalidTokenId: (tokenId: string) => string;
    /** TransferModal closed without submitting. */
    transferCancelled: string;
    /** Stream start/end announcements on the persistent visually-hidden
     * status node; the token flush itself stays aria-hidden (M2). */
    streamStarted: string;
    streamComplete: string;
    /** B-M2: tool-card chrome — sponsor chip, run state, archive verdict and
     * class badges route through here like every other chat string
     * (MessageAtoms). */
    toolSponsored: string;
    toolSponsoredA11y: string;
    toolSponsoredTitle: string;
    toolDone: string;
    toolFailed: string;
    toolRunning: (seconds: number) => string;
    toolRanIn: (seconds: number) => string;
    toolWasArchived: string;
    toolNotArchived: string;
    /** Class badge labels keyed by ChatToolClass (union duplicated from
     * @axiom/config/chat-tools so copy.ts stays dependency-free). */
    toolClassLabels: Record<
      "read" | "encode" | "orchestrate" | "archive" | "ask" | "skill",
      string
    >;
  };
  /** GasTank card (V3 W5-B). Placeholders: {used}/{cap} grant counters. */
  gasTank: {
    title: string;
    unsetNote: string;
    loading: string;
    opsLeftSuffix: string;
    /** Shown when the tank is empty but grants remain (next op is sponsored). */
    lazyGrantNote: string;
    grantsBarTitle: string;
    /** Placeholders: {used} consumed, {cap} cap. */
    grantsUsage: string;
    depositPlaceholder: string;
    depositAction: string;
    refillAction: string;
    tankLowBanner: string;
    /** Outcome toasts (audit critique-2 C2: refill/claim were silent). */
    depositQueued: string;
    refillDone: string;
    refillFailed: string;
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
    /** Verify-on-0G block (L2-B4): one operable element on a read-only page. */
    verifyTitle: string;
    verifyHint: string;
    verifyLabel: string;
    verifyPlaceholder: string;
    verifyAction: string;
    verifyA11y: string;
    verifyError: string;
    verifyExplorerHint: string;
    verifyDocsLabel: string;
    forwardTitle: string;
    forwardCta: string;
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
    chainLive: string;
    reviewAction: string;
    agentLabel: string;
    agentA11y: string;
    agentSelectPlaceholder: string;
    agentOption: (id: string) => string;
    agentHint: string;
    errAmountPositive: string;
    errExceedsVault: string;
    errInvalidAmount: string;
    errNameLength: string;
    errRecipientAddress: string;
    errRecipientKeyIsAddress: string;
    /** U11: expanding 3-step walkthrough under the recipient-key field. */
    transferKeyWalkthroughSteps: string[];
    errInstruction: string;
    errSelectAgent: string;
    intentFund: string;
    intentProof: string;
    intentBounded: string;
    intentRecovery: string;
    intentReceipt: string;
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
    /** T6 recovery: one remedy line per humanizeError map (retry tx / raise
     * gas / check network) shown under a stale/reverted receipt body. */
    receiptRemedy: string;
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
    /** Static review-sheet title; all locales keep it flow-agnostic (no
     * {kind} token — strip.reviewTitle is the parameterized one). */
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
    /** Chain id alone, no name segment (receiver-page fact). */
    networkFactId: string;
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
    transferKeyHint: string;
    /** P3 §(b)#4: the pubkey field is replaced by an address resolved via
     * GET /v1/registry/pubkey/:address; the paste field survives only as the
     * NO_ONCHAIN_KEY fallback (Advanced details). */
    transferPubkeyFallbackSummary: string;
    transferPubkeyResolvePending: string;
    transferPubkeyResolveFailed: string;
    transferPubkeyResolveResolved: string;
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
    /** Placeholder: {receiver}. */
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
    /** I3: vault-write guard when no wallet is connected at submit time. */
    connectToSubmit: string;
    /** I3: mint review fallback when the name field is blank. */
    mintAgentFallback: string;
    /** I3: aria-label for the review-sheet action row. */
    operationActions: string;
    /** Tick stream start/end announcements on the visually-hidden status
     * node; the token flush itself is aria-hidden (M4). */
    streamStarted: string;
    streamComplete: string;
    /** CoSignPage hint shown when the Clipboard API is unavailable. */
    receiveCopyManual: string;
    /** One-word actions shared by flow overlays. */
    cancel: string;
    edit: string;
    /** I4: TransferModal body — phases, fields, validation, actions, toasts. */
    transferPhases: Record<
      "idle" | "challenge" | "signing" | "finalizing" | "confirming",
      string
    >;
    transferRetryHint: string;
    transferErrChallenge: string;
    transferErrSubmit: string;
    transferErrGeneric: string;
    closeTransferA11y: string;
    transferLede: string;
    transferReceiverLabel: string;
    transferPubkeyLabel: string;
    transferPubkeyPlaceholder: string;
    transferRekeySummary: string;
    transferRekeyHint: string;
    transferOldKeyLabel: string;
    transferOldKeyPlaceholder: string;
    transferOldUriLabel: string;
    transferOldUriPlaceholder: string;
    transferErrKeyRequired: string;
    transferErrKeyPrefix: string;
    transferErrKeyLength: (length: number) => string;
    transferErrRekeyPair: string;
    transferSigning: string;
    transferSignAction: string;
    transferConfirmLede: string;
    transferAuthorizedTitle: string;
    transferAuthorizedBody: string;
    transferProofDetails: string;
    /** Sealed-proof labels render inline after a mono value; the second one
     * carries its "; " separator so locales keep their own punctuation. */
    transferNewHashLabel: string;
    transferSealedKeyLabel: string;
    transferOwnershipProof: string;
    transferValidUntil: string;
    transferAcceptedBy: string;
    transferSubmitting: string;
    transferConfirmAction: string;
    /** Success toast; {hash} arrives pre-truncated. */
    transferConfirmedToast: (hash: string) => string;
  };
  agentDetail: {
    /** Balance caption: `{amount}` — formatted balance + symbol from chain config. */
    balanceToSpend: string;
    needsSetup: string;
    /** Head status pill pair: strategy bound → online, otherwise attention. */
    statusOnline: string;
    statusAttention: string;
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
    openStorage: string;
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
    /** W3-C Permit2 pay panel. */
    permit2Title: string;
    permit2Hint: string;
    permit2Cta: string;
    permit2LaneNote: (lane: string) => string;
    permit2SnapshotCap: string;
    permit2SnapshotAllowance: string;
    permit2SnapshotBalance: string;
    payAmountLabel: string;
    /** W3-C Agent Delegation card (owner-only). */
    delegationTitle: string;
    delegationHint: string;
    delegationDelegateLabel: string;
    delegationPerTxCapLabel: string;
    delegationWindowCapLabel: string;
    delegationWindowLabel: string;
    delegationExpiryLabel: string;
    delegationActive: string;
    delegationNone: string;
    delegationInstall: string;
    delegationRevoke: string;
    delegationNotConfigured: string;
    delegationTargetsLabel: string;
    delegationTargetsPlaceholder: string;
    delegationToast: (hash: string) => string;
    errDelegationForm: string;
    errDelegationWallet: string;
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
    /** Fallback kind for unnamed chain events (B-M3). */
    chainEvent: string;
    /** Chain-event row detail. Placeholders: {agent}, {block}. */
    eventDetail: string;
    /** Chain-event row detail when the event carries no agent token.
     * Placeholder: {block}. */
    eventDetailBlockOnly: string;
    emptyState: string;
    /** Zero-receipts first run (no filter active) — distinct from the filter-miss line. */
    emptyAll: string;
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
    /** I2: receipt-surface strings that were hardcoded English. */
    viewOnExplorer: string;
    copyReceiptHash: string;
    receiptCopied: string;
    receiptsCount: (shown: number, total: number) => string;
    filterA11y: string;
    clearFilter: string;
  };
  status: Record<string, string>;
  /** I6: relative-age strings shared by receipt surfaces. */
  time: {
    minutesAgo: (minutes: number) => string;
    /** Age ladder past 119 minutes (B-L3). */
    hoursAgo: (hours: number) => string;
    daysAgo: (days: number) => string;
    /** Age cell for chain rows the indexer returned without a timestamp. */
    indexed: string;
  };
  /** Locked-route shell chrome (App.tsx LockedShell pill + gate preview). */
  gate: {
    statusWallet: string;
    statusNetwork: string;
    /** Gate preview alt text; the label is the localized labels[slug]. */
    previewAlt: (label: string) => string;
    previewNote: string;
    /** B-M4: gate label + schematic row text per gate slug (was hardcoded
     * English in consoleCatalog); the row icons stay in the catalog. */
    labels: Record<GateSlug, string>;
    rows: Record<GateSlug, [GateRowText, GateRowText]>;
  };
  /** T1 guided first success: the dismissible Dashboard activation card. */
  checklist: {
    title: string;
    dismiss: string;
    done: string;
    steps: {
      mint: { label: string; hint: string };
      deposit: { label: string; hint: string };
      tick: { label: string; hint: string };
    };
  };
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

/* Route names shared by the nav label, the flow receiptKind (copy.test.ts
 * pins them equal) and the locked-gate label — one source per locale. */
const enTickName = "Run agent task";
const enTxCenterName = "Transaction center";
const frTickName = "Lancer une tâche";
const frTxCenterName = "Centre transactionnel";
const deTickName = "Agent-Aufgabe ausführen";
const deTxCenterName = "Transaktionszentrum";

const english: Copy = {
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
    tick: enTickName,
    deposit: "Deposit",
    withdraw: "Withdraw",
    groupOverview: "Overview",
    groupOperations: "Operations",
    groupResources: "Resources",
  },
  topbar: {
    connected: "connected",
    notConnected: "not connected",
    operator: "You",
    openRail: "Show sidebar",
    oracleLive: "online",
    oracleDown: "services degraded",
    chainLabel: (id) => `chain ${id}`,
  },
  strip: {
    reviewTitle: (kind) => `Review ${kind}`,
    reviewSummary: "Recover the existing receipt before retrying.",
    reviewImpact: "No asset movement until you continue.",
    proofReceipt: "Receipt",
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
    resultsCount: (count) => `${count} result${enS(count)}`,
    placeholder: "Find action, receipt, or route",
    emptyTitle: "No matching destination",
    emptyBody: "Try a route, receipt hash, or the next safe action.",
    hintKeys: "↑↓ move, ↵ open, esc close",
  },
  a11y: {
    primaryNav: "Primary navigation",
    notificationsRegion: "Notifications",
    openNav: "Open primary navigation",
    closeNav: "Close navigation",
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
    switchToLight: "Switch to light theme",
    switchToDark: "Switch to dark theme",
    walletAccess: "Axiom wallet access",
    closeWalletAccess: "Close wallet access",
    skipToContent: "Skip to content",
    copyLabel: "Copy",
    copyA11y: "Copy to clipboard",
    copiedA11y: "Copied to clipboard",
    loading: "Loading",
  },
  landing: {
    title: "Ownable AI agents, {emphasis}on 0G.{endEmphasis}",
    description:
      "Mint an agent with a bounded vault. It runs only inside rules you set, and every action leaves an on-chain receipt.",
    docTitle: "Axiom: Own an AI Agent On-Chain",
    closingCta: "Mint your first agent.",
    closingTitle: "Mint your {emphasis}first agent.{endEmphasis}",
    eyebrow: "{emphasis}ERC-7857{endEmphasis} · ownable agent standard",
    switchToEditorial: "Switch to the light editorial design",
    switchToForge: "Switch to the dark forge design",
    menuGuideHint: "How signing and receipts work",
    menuDevelopers: "Developers",
    menuDevelopersHint: "APIs and developer tools",
    nav: {
      overview: "Overview",
      principles: "Principles",
      howItWorks: "How it works",
      start: "Start",
      connect: "Connect",
    },
    console: {
      agentId: "AXIOM OPS / AGENT 0x7a4c…91f2",
      chip: "Ops feed",
      indexing: "indexing",
      orbStates: ["working", "searching", "solving"],
      orbA11y: "Agent is {state}",
      srOnly:
        "tick 4821, vault check passed, daily limit 25 {nativeSymbol}. Action: rebalance storage, within bounds. Receipt 0x8f3ac21e indexed at block 4812336. Next tick in 60 seconds, agent idle.",
      previewA11y: "Agent console preview, sample data",
      lines: [
        "tick {tick} · vault check ok, limit 25 {nativeSymbol}/day",
        "action: rebalance_storage · within bounds",
        "receipt {receiptHash} indexed · block {block}",
        "next tick in 60s · agent idle",
      ],
    },
    stats: [
      { value: 1, suffix: "", label: "transaction to mint agent and vault" },
      { value: 0, suffix: "", label: "accounts, emails or passwords" },
      { value: 100, suffix: "%", label: "of signatures indexed as receipts" },
      { value: 7857, suffix: "", label: "the ERC standard agents live under" },
    ],
    spec: {
      title: "The protocol, {emphasis}specified.{endEmphasis}",
      clusters: [
        {
          head: "Identity",
          rows: [
            { label: "Standard", value: "ERC-7857, ownable AI agents" },
            { label: "Network", value: "{chainName}, chain {chainId}" },
          ],
        },
        {
          head: "Bounds",
          rows: [
            { label: "Vault", value: "Bounded, daily limit set by the owner" },
            {
              label: "Overspend",
              value: "Impossible by construction, for agent and team",
            },
          ],
        },
      ],
      account: {
        head: "Account",
        accessLabel: "Access",
        receiptsLabel: "Receipts",
      },
    },
    principles: {
      title: "What makes Axiom {emphasis}different.{endEmphasis}",
      items: [
        {
          icon: "shield",
          title: "Bounded by design.",
          body: "An on-chain vault with a daily limit. Your agent can never spend past it — and we can't spend at all.",
          link: "Read the spec",
        },
        {
          icon: "receipt",
          title: "Receipts, not promises.",
          body: "Every signature is indexed as a receipt: which agent, which block, what happened.",
          link: "How receipts work",
        },
        {
          icon: "wallet",
          title: "Your wallet, your keys.",
          body: "Connect the wallet you already have. No accounts, no emails, no passwords.",
          link: "",
        },
      ],
    },
    how: {
      title: "Three steps to {emphasis}a running agent.{endEmphasis}",
      steps: [
        {
          title: "Mint.",
          body: "One transaction creates the agent and its vault.",
          fact: "1 transaction · ERC-7857",
        },
        {
          title: "Fund.",
          body: "Top up the vault. Set the daily limit.",
          fact: "owner-set limit, enforced on-chain",
        },
        {
          title: "Run.",
          body: "Ticks execute inside your rules. Receipts index on-chain.",
          fact: "one receipt per signature",
        },
      ],
    },
    footer: {
      credit: "Built on 0G · Mainnet beta",
      links: [
        { id: "agents", label: "Agents" },
        { id: "receipts", label: "Receipts" },
        { id: "storage", label: "Storage" },
        { id: "developers", label: "Developers" },
      ],
    },
  },
  wallet: {
    wrongNetworkTitle: "Switch to {chainName}.",
    wrongNetworkDescription:
      "Your wallet is on another network. Switch networks before signing the access message.",
    switchNetwork: "Switch to {chainName}",
    networkMismatch: "Network mismatch",
    connectedChain: "Connected: chain {chainId}",
    requiredChain: "Required: {chainName}, chain {chainId}",
    profileHint: "Stored on this device only.",
    connectTitle: "Choose a wallet.",
    connectingStatus: "Connecting…",
    browserWalletLabel: "Browser wallet",
    browserWalletHint: "MetaMask and other injected wallets",
    walletConnectLabel: "WalletConnect",
    walletConnectHint: "Scan the QR code or open your wallet app",
    pairingTitle: "Pair your wallet",
    pairingHint: "Copy the code into your wallet app's WalletConnect screen.",
    noWalletDetected:
      "No browser wallet detected. Install one, or use a mobile wallet.",
    unknownChain: "unknown",
  },
  guide: {
    nextStep: "Next step",
    illustrationAlt: "Axiom onboarding illustration",
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
    pageTitle: "Staking on 0G",
    lede: "Staking isn\u0027t part of Axiom.",
    body: "Staking lives in the official 0G app: agents, vaults and receipts stay here.",
    openVault: "Go to my agents",
    backLabel: "Back to console",
    docsLink:
      "https://docs.0g.ai/developer-hub/building-on-0g/contracts-on-0g/staking-interfaces",
    docsA11y: "0G staking documentation (opens in a new tab)",
    docsLabel: "0G staking docs",
  },
  notFound: {
    titleLead: "The route",
    titleEmphasis: "drifted.",
    body: "This page doesn't exist. Nothing was loaded and no wallet action was taken.",
    returnToLanding: "Return to landing",
    openConsole: "Open the app",
    title: "Page not found",
    heroAlt: "Abstract recoverable Axiom route",
    // Wave-12B: recovery explore row (accessible name + hub labels).
    exploreA11y: "Explore public paths",
    hubLabels: {
      agents: "Agents",
      payments: "Payments",
      proofs: "Proofs",
      storage: "Storage",
      developers: "Developers",
    },
  },
  errorBoundary: {
    networkTitle: "Connection problem",
    genericTitle: "Unable to load this view",
    networkBody:
      "Unable to load this section. Retry, or check your connection if it keeps failing.",
    retry: "Try again",
    reload: "Reload page",
  },
  errors: {
    userRejected:
      "Transaction cancelled — you rejected the request in your wallet.",
    unknownDatahash:
      "This agent's metadata is not registered with the oracle yet. Re-register it from the mint flow (or pick another agent), then retry the transfer.",
    signerMismatch:
      "The transfer acceptance must be signed by the recipient's own wallet. Go back and use the “Sign as receiver” step with the recipient account selected.",
    receiverUnavailable:
      "The receiving account is not available in the connected wallet. Add the receiver account to this wallet, or let the receiver accept the transfer from their own session.",
    acceptanceNotSigned:
      "This acceptance code was not signed by the receiver's wallet. Ask the receiver to sign the acceptance link again with the receiving account, then paste the new code.",
    computeOutOfCredits:
      "0G Compute is out of credits. Fund the compute account for AXIOM_COMPUTE_API_KEY, then retry.",
    insufficientFunds:
      "Insufficient balance to complete this transaction. Please add funds and try again.",
    rateLimited:
      "The compute provider is rate-limiting requests. Wait a few seconds and send again.",
    tankExhausted:
      "Your free gas grants are used up. Deposit via the GasTank UI, or connect a wallet to sign ops directly.",
    reserveExhausted:
      "The protocol gas reserve is temporarily empty. Sponsored ops pause until it's refunded — try again shortly.",
    sponsorRateLimited:
      "Too many sponsored ops in a row. Wait a moment and retry.",
    computeInvalidRequest:
      "The compute provider rejected this request as invalid. Start a new chat thread, then try again.",
    computeUpstream:
      "Compute is unavailable right now. Check backend compute keys and balance.",
    gasEstimate:
      "Transaction would fail on-chain. Check your inputs and wallet balance.",
    reverted:
      "Transaction reverted by the contract. Check your inputs and permissions.",
    revertedWithReason: (reason) => `Transaction reverted: ${reason}`,
    networkError:
      "Network error — check your internet connection and try again.",
    timeout:
      "Request timed out. The network may be congested — please try again.",
    nonceTooLow:
      "Transaction nonce conflict. Please wait for pending transactions to confirm.",
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
    railWidthHint: "Drag the handle to resize the sidebar.",
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
    shortcutHint: "Shortcuts navigate. They never sign.",
    shortcutPalette: "Find actions, agents, receipts and routes",
    shortcutSurfaces: "Open main areas",
    shortcutFlows: "Open execution flows",
    replayOnboarding: "Replay onboarding",
    showChecklistAgain: "Show setup checklist again",
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
    addMoney: "Fund agent",
    // One canonical allowance sentence, shared with the strip.
    latestEvidence: "Latest receipts",
    allReceipts: "All receipts",
    switchRequired: "switch required",
    signerReady: "Ready to sign",
    signerWrong: "Wrong network",
    noConnector: "no connector",
    attentionCount: (count) =>
      `${count} receipt${enS(count)} ${count === 1 ? "needs" : "need"} review`,
    openReviewQueue: "Open review queue",
    loadingVaults: "loading vaults…",
    agentsScoped: (count) => `across ${count} agent${count === 1 ? "" : "s"}`,
    needReview: (count) => `${count} need review`,
    fleetNominal: "All set.",
    needsSetupLabel: "needs setup",
    queueAwaiting: "awaiting confirmation",
    telemetryTitle: "Balances & recent activity",
    noEvidence: "Nothing here yet",
    noEvidenceHint: "Mint an agent to create the first receipt.",
    registerUnavailable: "Agent register unavailable",
    retryFetch: "Retry",
    noAgents: "You don't have an agent yet",
    noAgentsHint: "Make one. About a minute.",
    mintAgent: "Create agent",
    noDescription: "no description",
    refreshNotice: "Updated",
    agentFundingLabel: (tokenId) => `Agent #${tokenId} has nothing to spend`,
    receiptRemedy: "Check the receipt's remedy hint, or retry below.",
    unconfigured: (count) => `${count} unconfigured`,
    failing: (count) => `${count} failing`,
    healthCheckLabel: "status checks",
    oracleDown: "oracle down",
    unconfiguredLabel: "setup",
    showChecklist: "Show setup checklist",
  },
  chat: {
    pageTitle: "Chat",
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
      event_history: "Show recent on-chain protocol events",
      execute_tick: "Execute a strategy tick for agent #",
      simulate_tick: "Dry-run a tick for agent #",
      mint_agent: "Mint a new agent named ",
      deposit: "Deposit funds into the vault of agent #",
      withdraw: "Withdraw funds from the vault of agent #",
      set_strategy: "Set the daily spending limit of agent #",
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
    removeQueued: (message) => `Remove queued message: ${message}`,
    composerNearLimit: (remaining) =>
      `${remaining} character${enS(remaining)} left before the composer cuts off pastes`,
    routing: "Routing",
    routingHint: "This conversation only",
    routingAuto: "Auto (fastest)",
    routingCheapest: "Lowest cost",
    routingVerified: "Verified providers only",
    routingPrivate: "Private providers (extra isolation)",
    routingPrivateHintOn:
      "TEE-isolated inference. Prompts never leave the provider's enclave",
    routingPrivateHintOff: "No TEE provider serves this model",
    routingChipTitle:
      "Provider routing. Change how this conversation is served",
    routingSummaryAuto: "Auto",
    routingSummaryCheapest: "Lowest cost",
    routingStatusPinned: (address) =>
      `Pinned to ${address}. Every turn is served by this provider.`,
    routingStatusCheapest: "Cheapest first. The pick can change between turns.",
    routingStatusAuto: "Fastest provider. Follow-ups stay on it.",
    phaseRunning: (names, elapsed) => `Running ${names}… (${elapsed}s)`,
    phaseStreaming: (elapsed) => `Streaming response… (${elapsed}s)`,
    phaseThinking: "Thinking…",
    phaseWaiting: (elapsed) => `Waiting for model response… (${elapsed}s)`,
    txMined: (tokenId, event, block) =>
      `tx mined${tokenId ? `, agent #${tokenId}` : ""}${event ? `, ${event}` : ""}${block ? `, block ${block}` : ""}`,
    historyTitle: "Chats",
    historyNew: "New",
    historySearch: "Search chats…",
    historyEmpty: "No chats yet.",
    historyNoMatch: "No matching chats.",
    historyLoading: "Loading server history…",
    historyRestore: "Restore server history",
    historyRestoreHint: "One free signature loads your saved chats.",
    historyOnChainNote:
      "Your chats are saved on 0G. Restore them (1 signature)",
    historyDelete: (title) => `Delete chat: ${title}`,
    untitledThread: "New chat",
    deletedToast: "Chat deleted",
    undo: "Undo",
    metricsShow: "Metrics",
    metricsHide: "Hide metrics",
    stepsSummary: (count, seconds) =>
      `Worked for ${seconds}s · ${count} ${count === 1 ? "step" : "steps"}`,
    stepsWorking: (count) =>
      `Working… · ${count} ${count === 1 ? "step" : "steps"}`,
    stepsFailedSuffix: (failed) => ` · ${failed} failed`,
    stepNoResult: "No result recorded",
    browseTools: (count) => `Browse all ${count} tools`,
    footHint: "Shift+Enter for a new line",
    storedOn0G: "Stored on 0G",
    historyClose: "Close history",
    turnLimit: (max) =>
      `Turn limit hit after ${max} steps — send "continue" to keep going.`,
    rateLimited: "Rate limited: wait a moment and try again.",
    noResponse: "No response: try again.",
    errNoResponseBody: "No response body from the chat service.",
    unknownTool: (name) => `Unknown tool: ${name}`,
    invalidTokenId: (tokenId) => `Invalid token id: ${tokenId}`,
    transferCancelled: "Transfer cancelled: no transaction was submitted.",
    streamStarted: "Response started.",
    streamComplete: "Response complete.",
    toolSponsored: "sponsored",
    toolSponsoredA11y: "sponsored relay",
    toolSponsoredTitle: "Executed gas-free via the protocol GasTank",
    toolDone: "done",
    toolFailed: "failed",
    toolRunning: (seconds) => `running ${seconds}s`,
    toolRanIn: (seconds) => `ran in ${seconds}s`,
    toolWasArchived: "Was archived",
    toolNotArchived: "Not archived",
    toolClassLabels: {
      read: "Read",
      encode: "Encode",
      orchestrate: "Orchestrate",
      archive: "Archive",
      ask: "Ask User",
      skill: "Hermes Skills (EVM, DeFi, OSINT, Forensics)",
    },
  },
  gasTank: {
    title: "Gas Tank",
    unsetNote:
      "Sponsored transactions are unavailable right now. Connect a wallet to sign gas fees directly.",
    loading: "Reading tank…",
    opsLeftSuffix: "ops left",
    lazyGrantNote: "next op sponsored",
    grantsBarTitle: "Free gas grants consumed",
    grantsUsage: "Grants: {used} of {cap} used",
    depositPlaceholder: "Deposit amount",
    depositAction: "Deposit",
    refillAction: "Claim free gas grant",
    tankLowBanner:
      "Your gas tank is nearly empty: ops keep running until your free grants run out.",
    depositQueued: "Deposit queued: track it in the transaction center.",
    refillDone: "Gas grant claimed. Tank balance refreshed.",
    refillFailed:
      "Gas grant claim failed: check your connection and try again.",
  },
  storage: {
    title: "See how a payload is stored, then verify its proof.",
    description: "Each storage step is proven separately.",
    openChat: "Open chat transcript",
    payload: "Agent metadata payload",
    fileSteps: "File & steps",
    fileMeta: "Example payload. Real size and tags appear after an upload.",
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
    verifyTitle: "Verify on 0G",
    verifyHint:
      "Paste a publication root hash to open the 0G storage indexer's own record for it. Axiom never stores your files. Verification runs on 0G infrastructure.",
    verifyLabel: "Root hash to verify",
    verifyPlaceholder: "0x…",
    verifyAction: "Open 0G verification",
    verifyA11y:
      "Verify this root hash on the 0G storage indexer (opens in a new tab)",
    verifyError: "Enter a 0x-prefixed 32-byte root hash.",
    verifyExplorerHint:
      "The publication transaction is also visible on the 0G block explorer.",
    verifyDocsLabel: "0G storage verification docs",
    forwardTitle: "Storage proofs start with an operation.",
    forwardCta: "Mint an agent to publish metadata",
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
      fieldHint: "Names are permanent. Choose well.",
      detail: "{name}, registered on-chain",
      notice: enFlowNotice("Mint submitted for {name}."),
    },
    payment: {
      title: "Fund an agent",
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
      receiptKind: enTickName,
      consequence: "Launch one cancellable task.",
      proofLine: "Records the provider route and execution evidence.",
      contextTitle: "Stream before result.",
      fieldLabel: "Instruction",
      fieldHint: "Cancellable. Streamed tokens appear below.",
      detail: "{action}, {reason}",
      notice: "Tick {outcome} for agent #{agent}. Stream receipt indexed.",
    },
    deposit: {
      title: "Deposit into the vault",
      copy: "Amount → review → receipt. Balance shown before you sign.",
      steps: ["Amount + balance", "Wallet confirmation", "Receipt indexed"],
      receiptKind: "Deposit",
      consequence: "Move the reviewed amount into this agent's vault.",
      proofLine:
        "Encodes via the vault relay. Value equals the reviewed amount.",
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
        "Encodes via the vault relay. The remaining balance is shown above.",
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
    chainLive: "chain {chainId}, live wallet",
    reviewAction: "Review operation",
    agentLabel: "Agent",
    agentA11y: "Target agent",
    agentSelectPlaceholder: "select an agent",
    agentOption: (id) => `Agent #${id}`,
    agentHint: "The agent whose vault or record this operation targets.",
    errAmountPositive: "Enter an amount above zero.",
    errExceedsVault: "Amount exceeds the vault balance.",
    errInvalidAmount: "Enter a valid amount.",
    errNameLength: "Use 2–80 characters.",
    errRecipientAddress: "Recipient must be a valid 0x address.",
    errRecipientKeyIsAddress:
      "This looks like an Ethereum address (42 chars). A transfer needs the receiver's public key (64-byte hex, 0x-prefixed, 130 chars). See “How to get it” below.",
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
    cancelStream: "Cancel stream",
    factCost: "Cost",
    confirmMint: "1 click in your wallet, usual network fee",
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
      "No confirmation after {seconds}s. Check the explorer. The row is marked Needs review.",
    receiptBodyConfirming: "Submitted, awaiting on-chain confirmation.",
    receiptRemedy:
      "Reverted or timed out? Retry the transaction: raise gas if the network is busy, or check your connection.",
    copyReceiptAction: "Copy receipt",
    openReceiptAction: "Open receipt",
    startAnotherAction: "Start another",
    /** proto-subpages-a mint success — Placeholder: {name}. */
    mintDoneHeading: "Done. {name} is live!",
    mintDoneBody: "Saved in your history.",
    receiptCopiedNotice: "Receipt identifier copied.",
    vaultBalanceAfter: "Vault balance after",
    exceedsBalance: "exceeds balance",
    vaultedHint:
      "In vault: {amount} {symbol}. The resulting balance appears in review.",
    allowanceNote:
      "Current allowance: {amount} {symbol}, approves exactly this amount, never infinite.",
    liveRouteNote:
      "Live route: wallet signature and contract write happen only after review.",
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
    networkFact: "{chainName}, chain {chainId}",
    networkFactId: "chain {chainId}",
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
    confirmOne: "No, single ask",
    confirmTwo: "Yes, two wallet asks",
    confirmTwoApprovePay: "Yes, once now, once to pay",
    confirmOneAllowance: "No, your approval covers it",
    confirmChecking: "Up to 2 wallet asks (checking approval…)",
    confirmReceiverThenSubmit: "Approval needed: yes",
    transferKeyHint: "64-byte hex (0x…), the new owner's encryption key.",
    transferPubkeyFallbackSummary: "Advanced, paste the public key instead",
    transferPubkeyResolvePending: "Looking up the key for this address…",
    transferPubkeyResolveFailed:
      "No public key found on-chain for this address yet. Paste it manually below.",
    transferPubkeyResolveResolved:
      "Key found on-chain. The receiver can decrypt the payload.",
    transferAgentTitle: (id) => `Transfer agent #${id}`,
    handoffTitle: "Receiver on another device?",
    handoffBody:
      "Send this link. They sign it and paste the result here. Then you submit.",
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
      "You're receiving this agent with your wallet ({receiver}). Sign to agree, nothing moves on-chain until the sender submits.",
    receiveSign: "Sign approval",
    receiveSigning: "Waiting for signature…",
    receiveWrongAccount: "Wrong account. This approval needs {receiver}.",
    receiveDoneTitle: "Approval signed",
    receiveDoneBody: "Send the approval link to the sender below.",
    receiveCopyCode: "Copy approval link",
    receiveCodeCopied: "Approval link copied.",
    receiveDoneSameBrowser:
      "If the sender's review is open in this browser, their tab applies it automatically.",
    /** U26: co-sign done-state presents a one-piece approval link; the raw
     * signature/token hide behind "Advanced". */
    claimUrlLabel: "Approval link",
    claimRawToggle: "Advanced, raw signature",
    goHome: "Home",
    connectToSubmit: "Connect a wallet to submit this operation.",
    mintAgentFallback: "Axiom agent",
    operationActions: "Operation actions",
    streamStarted: "Stream started.",
    streamComplete: "Stream complete.",
    receiveCopyManual:
      "Clipboard unavailable: select the link above and copy it manually.",
    cancel: "Cancel",
    edit: "Edit",
    transferPhases: {
      idle: "Ready",
      challenge: "Preparing transfer…",
      signing: "Waiting for signature…",
      finalizing: "Securing data for the receiver…",
      confirming: "Confirming on-chain…",
    },
    transferRetryHint: "Failed. Tap Edit to retry.",
    transferErrChallenge: "The request failed. Please try again.",
    transferErrSubmit:
      "Submission failed. Nothing was sent. Tap Edit to retry.",
    transferErrGeneric: "Something went wrong. Tap Edit to start over.",
    closeTransferA11y: "Close transfer",
    transferLede:
      "You'll sign once to authorize, then confirm the on-chain transfer.",
    transferReceiverLabel: "Receiver address",
    transferPubkeyLabel: "Receiver public key",
    transferPubkeyPlaceholder: "0x… (130 chars: 0x + 128 hex)",
    transferRekeySummary: "Re-encrypt for receiver (optional)",
    transferRekeyHint:
      "Optional: AES key + storage URI so only the receiver can read the data after the transfer. Blank = sign-only.",
    transferOldKeyLabel: "Old data encryption key (base64)",
    transferOldKeyPlaceholder: "base64 32-byte AES key",
    transferOldUriLabel: "Old data URI (0x…)",
    transferOldUriPlaceholder: "0x… storage root hash",
    transferErrKeyRequired: "required",
    transferErrKeyPrefix: "must be 0x-prefixed",
    transferErrKeyLength: (length) =>
      `must be ${length} chars (64 raw bytes, no 0x04 prefix)`,
    transferErrRekeyPair:
      "supply both old data key and old data URI to re-encrypt, or leave both blank",
    transferSigning: "Signing…",
    transferSignAction: "Sign transfer authorization",
    transferConfirmLede:
      "Confirm. Your wallet will ask for the final signature.",
    transferAuthorizedTitle: "Transfer authorized",
    transferAuthorizedBody:
      "the agent's data was re-encrypted so only the new owner can read it.",
    transferProofDetails: "Proof details",
    transferNewHashLabel: "New metadata hash:",
    transferSealedKeyLabel: "; new sealed key:",
    transferOwnershipProof: "Ownership proof",
    transferValidUntil: "Valid until",
    transferAcceptedBy: "Accepted by",
    transferSubmitting: "Submitting…",
    transferConfirmAction: "Confirm on-chain transfer",
    transferConfirmedToast: (hash) => `Transfer ${hash}… confirmed`,
  },
  agentDetail: {
    balanceToSpend: "Has {amount} to spend, ready",
    needsSetup: "Needs setup",
    statusOnline: "online",
    statusAttention: "attention",
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
    openStorage: "Open storage",
    chooseBoundedOperation: "What do you want to do?",
    addMoneyPrimary: "Fund agent",
    runTask: "Run task",
    moreActions: "More…",
    fundAgent: "Fund agent",
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
      "Edits keep this agent's rules and expiry, only the daily limit changes.",
    limitTipUnbound:
      "Tip: set a daily limit so your agent can pay small bills by itself.",
    errLimitPositive: "Enter a daily limit greater than zero.",
    errLimitWallet: "Connect a wallet to set the spending limit.",
    copiedNotice: "Copied",
    limitToast: (hash) => `Spending limit submitted (${hash.slice(0, 10)}…)`,
    withdrawToast: (hash) => `Withdrawal submitted (${hash.slice(0, 10)}…)`,
    ticksRun: (count) => `ran ${count} task${enS(count)}`,
    activityLoading: "Loading…",
    activityEmptyTitle: "Nothing yet",
    activityEmptyHint: "Runs will show up here.",
    // W3-C Permit2 pay panel — terms render exactly what the signature permits.
    permit2Title: "Pay with Permit2",
    permit2Hint:
      "Sign once: no approval transaction. The signature allows the payment processor to pull exactly this amount for this agent.",
    permit2Cta: "Sign & pay",
    payAmountLabel: "Amount to pay",
    permit2LaneNote: (lane) =>
      lane === "permit2"
        ? "Settled via Permit2 signature."
        : "Settled via existing token allowance.",
    permit2SnapshotCap: "Payment cap",
    permit2SnapshotAllowance: "Processor allowance",
    permit2SnapshotBalance: "Your token balance",
    // W3-C Agent Delegation card (owner-only).
    delegationTitle: "Agent Delegation",
    delegationHint:
      "Let a delegate key run bounded operations for this agent under caps you set. Signed by you, revocable instantly.",
    delegationDelegateLabel: "Delegate address",
    delegationPerTxCapLabel: "Per-tx cap (wei)",
    delegationWindowCapLabel: "Window cap (wei)",
    delegationWindowLabel: "Window length (seconds)",
    delegationExpiryLabel: "Expires in (days)",
    delegationActive: "Active delegation",
    delegationNone: "No active delegation",
    delegationInstall: "Sign & install",
    delegationRevoke: "Revoke",
    delegationNotConfigured:
      "Delegation registry not configured yet: available after the next deployment.",
    delegationTargetsLabel:
      "Allowed operations (contract:selector, one per line)",
    delegationTargetsPlaceholder: "0x…:0x1a2b3c4d",
    delegationToast: (hash) => `Delegation updated (${hash.slice(0, 10)}…)`,
    errDelegationForm: "Check the delegation fields: {error}",
    errDelegationWallet: "Connect your wallet to install a delegation.",
  },
  transactions: {
    title: enTxCenterName,
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
    chainEvent: "Chain event",
    eventDetail: "agent #{agent}, block {block}",
    eventDetailBlockOnly: "block {block}",
    emptyState: "No receipts match this filter.",
    emptyAll: "No receipts yet. Mint an agent to create the first one.",
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
    viewOnExplorer: "View on explorer",
    copyReceiptHash: "Copy receipt hash",
    receiptCopied: "Receipt hash copied.",
    receiptsCount: (shown, total) => `${shown} of ${total} receipts`,
    filterA11y: "Receipt state filter",
    clearFilter: "Clear filter",
  },
  status: {
    label: "Status",
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
  time: {
    minutesAgo: (minutes) => `${minutes}m ago`,
    hoursAgo: (hours) => `${hours}h ago`,
    daysAgo: (days) => `${days}d ago`,
    indexed: "indexed",
  },
  gate: {
    statusWallet: "wallet not connected",
    statusNetwork: "network mismatch",
    previewAlt: (label) => `${label} preview`,
    previewNote: "Preview — connect a wallet for live data.",
    // deposit/withdraw labels mirror nav.deposit/nav.withdraw.
    labels: {
      overview: "Console overview",
      settings: "Session settings",
      chat: "Operator chat",
      mint: "Mint an agent",
      payment: "Payment route",
      transfer: "Transfer flow",
      agent: "Agent detail",
      roster: "Agent roster",
      tick: enTickName,
      deposit: "Deposit",
      withdraw: "Withdraw",
    },
    rows: {
      overview: [
        { label: "Agents", value: "••• live" },
        { label: "Next tick", value: "••• queued" },
      ],
      settings: [
        { label: "Display", value: "•••" },
        { label: "Session", value: "••• h" },
      ],
      chat: [
        { label: "Thread", value: "••• turns" },
        { label: "Tools", value: "••• live" },
      ],
      mint: [
        { label: "Identity", value: "unique" },
        { label: "Ownership", value: "you" },
      ],
      payment: [
        { label: "Approval cap", value: "••• 0G" },
        { label: "Fees", value: "up front" },
      ],
      transfer: [
        { label: "Co-sign", value: "receiver" },
        { label: "Expiry", value: "enforced" },
      ],
      agent: [
        { label: "Identity", value: "ERC-7857" },
        { label: "Receipts", value: "•••" },
      ],
      roster: [
        { label: "Roster", value: "••• agents" },
        { label: "Details", value: "per agent" },
      ],
      tick: [
        { label: "Instruction", value: "bounded" },
        { label: "Stream", value: "••• tokens" },
      ],
      deposit: [
        { label: "Vault gas", value: "••• 0G" },
        { label: "Top-up", value: "native" },
      ],
      withdraw: [
        { label: "Balance", value: "••• 0G" },
        { label: "Cooldown", value: "•••" },
      ],
    },
  },
  // Locked-gate heroes — every gated route in one table (was: English strings
  // in consoleCatalog.lockedRouteMeta + a lockedHero override for the three
  // flow routes; one locale owner now).
  lockedHero: {
    app: {
      titleLead: "Your console,",
      titleEmphasis: "at a glance.",
      copy: "See what your agents need next.",
    },
    settings: {
      titleLead: "Console settings,",
      titleEmphasis: "on your terms.",
      copy: "Session, display and console preferences.",
    },
    chat: {
      titleLead: "Chat that knows",
      titleEmphasis: "your setup.",
      copy: "Ask about your agents. Chat knows your session.",
    },
    mint: {
      titleLead: "Name your agent",
      titleEmphasis: "on-chain.",
      copy: "The name you pick becomes an on-chain identity with a receipt.",
    },
    payment: {
      titleLead: "Pay exactly",
      titleEmphasis: "what you approve.",
      copy: "Approve exactly what you pay. Costs are clear before you sign.",
    },
    transfer: {
      titleLead: "Transfers your receiver",
      titleEmphasis: "co-signs.",
      copy: "Receiver co-signs. Expiry is enforced.",
    },
    agent: {
      titleLead: "Every agent,",
      titleEmphasis: "in detail.",
      copy: "Identity, ownership, activity and receipts per agent.",
    },
    agentsList: {
      titleLead: "Every agent you own,",
      titleEmphasis: "one overview.",
      copy: "Connect to see your agents, their vaults and their receipts.",
    },
    tick: {
      titleLead: "Run one agent task,",
      titleEmphasis: "bounded.",
      copy: "Give the agent one instruction, it streams the result and stops.",
    },
    deposit: {
      titleLead: "Fund an agent",
      titleEmphasis: "vault.",
      copy: "Add native gas to one agent's vault before it runs.",
    },
    withdraw: {
      titleLead: "Withdraw from an",
      titleEmphasis: "agent vault.",
      copy: "Move funds out of one agent's vault, balance shown first.",
    },
  },
  checklist: {
    title: "Get your first agent working",
    dismiss: "Dismiss",
    done: "Fleet active: your agents are funded and running.",
    steps: {
      mint: {
        label: "Mint your agent",
        hint: "Register an agent: no funds needed yet.",
      },
      deposit: {
        label: "Fund its vault",
        hint: "Add native gas so the agent can pay for runs.",
      },
      tick: {
        label: "Run a task",
        hint: "Give one instruction and watch the receipt land.",
      },
    },
  },
};

const frFlowNotice = (head: string): string =>
  `${head} Reçu ajouté au centre transactionnel.`;

const french: Copy = {
  nav: {
    ...english.nav,
    howItWorks: "Comprendre Axiom",
    connectWallet: "Connecter le wallet",
    overview: "Vue d’ensemble",
    storage: "Stockage",
    groupOverview: "Console",
    groupOperations: "Opérations",
    groupResources: "Ressources",
    payment: "Paiement",
    transfer: "Transfert",
    tick: frTickName,
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
    chainLabel: (id) => `chaîne ${id}`,
  },
  strip: {
    ...english.strip,
    reviewTitle: (kind) => `Examiner ${kind}`,
    reviewSummary: "Récupérez le reçu existant avant de réessayer.",
    reviewImpact: "Aucun mouvement d’actifs avant votre reprise.",
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
    hintKeys: "↑↓ naviguer, ↵ ouvrir, esc fermer",
  },
  a11y: {
    primaryNav: "Navigation principale",
    notificationsRegion: "Notifications",
    openNav: "Ouvrir la navigation principale",
    closeNav: "Fermer la navigation",
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
    switchToLight: "Passer en thème clair",
    switchToDark: "Passer en thème sombre",
    walletAccess: "Accès wallet Axiom",
    closeWalletAccess: "Fermer l’accès wallet",
    skipToContent: "Aller au contenu",
    copyLabel: "Copier",
    copyA11y: "Copier dans le presse-papiers",
    copiedA11y: "Copié dans le presse-papiers",
    loading: "Chargement",
  },
  landing: {
    ...english.landing,
    title: "Des agents IA que vous possédez, {emphasis}sur 0G.{endEmphasis}",
    description:
      "Mintez un agent avec un coffre plafonné. Il ne s’exécute que dans les règles que vous fixez, et chaque action laisse un reçu on-chain.",
    closingCta: "Mintez votre premier agent.",
    closingTitle: "Mintez votre {emphasis}premier agent.{endEmphasis}",
    eyebrow: "{emphasis}ERC-7857{endEmphasis} · des agents que vous possédez",
    switchToEditorial: "Passer au design éditorial clair",
    switchToForge: "Passer au design forge sombre",
    docTitle: "Axiom : possédez vos agents IA on-chain",
    menuGuideHint: "Comment fonctionnent signatures et reçus",
    menuDevelopers: "Développeurs",
    menuDevelopersHint: "APIs et outils pour développeurs",
    nav: {
      overview: "Aperçu",
      principles: "Principes",
      howItWorks: "Comment ça marche",
      start: "Démarrer",
      connect: "Connecter",
    },
    console: {
      agentId: "AXIOM OPS / AGENT 0x7a4c…91f2",
      chip: "Flux d'ops",
      indexing: "indexation",
      orbStates: ["en cours", "en recherche", "en résolution"],
      orbA11y: "L’agent est {state}",
      srOnly:
        "tick 4821, coffre vérifié, limite quotidienne 25 {nativeSymbol}. Action : rebalance storage, dans les limites. Reçu 0x8f3ac21e indexé au bloc 4812336. Prochain tick dans 60 secondes, agent inactif.",
      previewA11y: "Aperçu de la console agent, données d’exemple",
      lines: [
        "tick {tick} · coffre vérifié, limite 25 {nativeSymbol}/jour",
        "action : rebalance_storage · dans les limites",
        "reçu {receiptHash} indexé · bloc {block}",
        "prochain tick dans 60 s · agent inactif",
      ],
    },
    stats: [
      {
        value: 1,
        suffix: "",
        label: "transaction pour minter agent et coffre",
      },
      { value: 0, suffix: "", label: "comptes, e-mails ou mots de passe" },
      { value: 100, suffix: "%", label: "des signatures indexées en reçus" },
      { value: 7857, suffix: "", label: "le standard ERC des agents" },
    ],
    spec: {
      title: "Le protocole, {emphasis}spécifié.{endEmphasis}",
      clusters: [
        {
          head: "Identité",
          rows: [
            { label: "Standard", value: "ERC-7857, des agents IA possédables" },
            { label: "Réseau", value: "{chainName}, chaîne {chainId}" },
          ],
        },
        {
          head: "Limites",
          rows: [
            {
              label: "Coffre",
              value: "Plafonné, limite quotidienne fixée par le propriétaire",
            },
            {
              label: "Dépassement",
              value:
                "Impossible par construction, pour l’agent comme pour l’équipe",
            },
          ],
        },
      ],
      account: { head: "Compte", accessLabel: "Accès", receiptsLabel: "Reçus" },
    },
    principles: {
      title: "Ce qui rend Axiom {emphasis}différent.{endEmphasis}",
      items: [
        {
          icon: "shield",
          title: "Délimité par conception.",
          body: "Un coffre on-chain avec une limite quotidienne. Votre agent ne peut jamais dépenser au-delà — et nous ne pouvons rien dépenser.",
          link: "Lire la spec",
        },
        {
          icon: "receipt",
          title: "Reçus, pas promesses.",
          body: "Chaque signature est indexée en reçu : quel agent, quel bloc, que s’est-il passé.",
          link: "Comment fonctionnent les reçus",
        },
        {
          icon: "wallet",
          title: "Votre wallet, vos clés.",
          body: "Connectez le wallet que vous avez déjà. Pas de comptes, pas d’emails, pas de mots de passe.",
          link: "",
        },
      ],
    },
    how: {
      title: "Trois étapes vers {emphasis}un agent actif.{endEmphasis}",
      steps: [
        {
          title: "Mintez.",
          body: "Une transaction crée l’agent et son coffre.",
          fact: "1 transaction · ERC-7857",
        },
        {
          title: "Financez.",
          body: "Approvisionnez le coffre. Fixez la limite quotidienne.",
          fact: "limite du propriétaire, appliquée on-chain",
        },
        {
          title: "Opérez.",
          body: "Les ticks s’exécutent dans vos règles. Les reçus s’indexent on-chain.",
          fact: "un reçu par signature",
        },
      ],
    },
    footer: {
      credit: "Construit sur 0G · Mainnet beta",
      links: [
        { id: "agents", label: "Agents" },
        { id: "receipts", label: "Reçus" },
        { id: "storage", label: "Stockage" },
        { id: "developers", label: "Développeurs" },
      ],
    },
  },
  wallet: {
    wrongNetworkTitle: "Passez sur {chainName}.",
    wrongNetworkDescription:
      "Le wallet est connecté, mais utilise un autre réseau. Changez de réseau avant de signer le message d’accès.",
    switchNetwork: "Passer sur {chainName}",
    networkMismatch: "Mauvais réseau",
    connectedChain: "Connecté : chaîne {chainId}",
    requiredChain: "Requis : {chainName}, chaîne {chainId}",
    profileHint: "Enregistré uniquement sur cet appareil.",
    connectTitle: "Choisissez un wallet.",
    connectingStatus: "Connexion…",
    browserWalletLabel: "Wallet du navigateur",
    browserWalletHint: "MetaMask et autres wallets injectés",
    walletConnectLabel: "WalletConnect",
    walletConnectHint: "Scannez le QR code ou ouvrez votre app wallet",
    pairingTitle: "Appairez votre wallet",
    pairingHint:
      "Copiez le code dans l’écran WalletConnect de votre app wallet.",
    noWalletDetected:
      "Aucun wallet de navigateur détecté. Installez-en un ou utilisez un wallet mobile.",
    unknownChain: "inconnue",
  },
  guide: {
    nextStep: "Étape suivante",
    illustrationAlt: "Illustration du guide Axiom",
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
    pageTitle: "Le staking sur 0G",
    lede: "Le staking ne fait pas partie d’Axiom.",
    body: "Le staking passe par l’app officielle 0G : agents, coffres et reçus restent ici.",
    openVault: "Aller à mes agents",
    backLabel: "Retour à la console",
    docsLink:
      "https://docs.0g.ai/developer-hub/building-on-0g/contracts-on-0g/staking-interfaces",
    docsA11y: "Documentation de staking 0G (s’ouvre dans un nouvel onglet)",
    docsLabel: "Docs staking 0G",
  },
  notFound: {
    titleLead: "La route",
    titleEmphasis: "s’est égarée.",
    body: "Cette page n’existe pas. Rien n’a été chargé et aucune action wallet n’a été effectuée.",
    returnToLanding: "Retour à l’accueil",
    openConsole: "Ouvrir l’app",
    title: "Page introuvable",
    heroAlt: "Route Axiom abstraite récupérable",
    // Wave-12B : rangée d’exploration de secours (nom accessible + libellés hubs).
    exploreA11y: "Explorer les parcours publics",
    hubLabels: {
      agents: "Agents",
      payments: "Paiements",
      proofs: "Preuves",
      storage: "Stockage",
      developers: "Développeurs",
    },
  },
  errorBoundary: {
    networkTitle: "Problème de connexion",
    genericTitle: "Impossible de charger cette vue",
    networkBody:
      "Impossible de charger cette section. Réessayez, ou vérifiez votre connexion si l’erreur persiste.",
    retry: "Réessayer",
    reload: "Recharger la page",
  },
  errors: {
    userRejected:
      "Transaction annulée : vous avez refusé la demande dans votre wallet.",
    unknownDatahash:
      "Les métadonnées de cet agent ne sont pas encore enregistrées auprès de l’oracle. Ré-enregistrez-le depuis le flow de mint (ou choisissez un autre agent), puis réessayez le transfert.",
    signerMismatch:
      "L’acceptation du transfert doit être signée par le wallet du destinataire. Revenez en arrière et utilisez l’étape « Signer comme destinataire » avec le compte du destinataire sélectionné.",
    receiverUnavailable:
      "Le compte destinataire n’est pas disponible dans le wallet connecté. Ajoutez le compte du destinataire à ce wallet, ou laissez le destinataire accepter le transfert depuis sa propre session.",
    acceptanceNotSigned:
      "Ce code d’acceptation n’a pas été signé par le wallet du destinataire. Demandez au destinataire de signer à nouveau le lien d’acceptation avec le compte destinataire, puis collez le nouveau code.",
    computeOutOfCredits:
      "0G Compute n’a plus de crédits. Rechargez le compte compute pour AXIOM_COMPUTE_API_KEY, puis réessayez.",
    insufficientFunds:
      "Solde insuffisant pour cette transaction. Ajoutez des fonds et réessayez.",
    rateLimited:
      "Le fournisseur de calcul limite le débit des requêtes. Patientez quelques secondes et renvoyez.",
    tankExhausted:
      "Vos subventions de gaz gratuites sont épuisées. Déposez via l’interface GasTank, ou connectez un wallet pour signer les opérations directement.",
    reserveExhausted:
      "La réserve de gaz du protocole est temporairement vide. Les opérations sponsorisées reprennent dès qu’elle est rechargée : réessayez dans un instant.",
    sponsorRateLimited:
      "Trop d’opérations sponsorisées d’affilée. Patientez un instant et réessayez.",
    computeInvalidRequest:
      "Le fournisseur de calcul a rejeté cette requête comme invalide. Ouvrez un nouveau fil de discussion, puis réessayez.",
    computeUpstream:
      "Le calcul est indisponible pour le moment. Vérifiez les clés et le solde compute du backend.",
    gasEstimate:
      "La transaction échouerait on-chain. Vérifiez vos saisies et le solde du wallet.",
    reverted:
      "Transaction revertie par le contrat. Vérifiez vos saisies et autorisations.",
    revertedWithReason: (reason) => `Transaction revertie : ${reason}`,
    networkError:
      "Erreur réseau : vérifiez votre connexion internet et réessayez.",
    timeout:
      "La requête a expiré. Le réseau est peut-être congestionné : réessayez.",
    nonceTooLow:
      "Conflit de nonce de transaction. Attendez la confirmation des transactions en cours.",
  },
  settings: {
    ...english.settings,
    pageTitle: "Paramètres",
    languageLabel: "Langue de l’interface",
    pageDescription: "Vos préférences.",
    liveWallet: "wallet actif",
    signingContext: "Signature",
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
    railWidthHint: "Faites glisser la poignée pour régler la largeur.",
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
    shortcutHint: "Les raccourcis naviguent. Ils ne signent jamais.",
    shortcutPalette: "Chercher actions, agents, reçus et routes",
    shortcutSurfaces: "Ouvrir les zones principales",
    shortcutFlows: "Ouvrir les flows d’exécution",
    replayOnboarding: "Rejouer l’onboarding",
    showChecklistAgain: "Revoir la liste de configuration",
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
        ? "1 agent n’est pas prêt"
        : `${count} agents ne sont pas prêts`,
    refresh: "Actualiser",
    managedValue: "Argent détenu",
    agentsOnline: "Prêts à travailler",
    pendingMine: "En cours",
    operatingFleet: "Vos agents",
    attentionFirst: "Attention d’abord",
    allowanceReady: "Il lui faut des fonds avant de pouvoir agir.",
    addMoney: "Financer l’agent",
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
    needsSetupLabel: "à configurer",
    queueAwaiting: "confirmation en attente",
    telemetryTitle: "Soldes et activité récente",
    noEvidence: "Rien ici pour l’instant",
    noEvidenceHint:
      "Mintez un agent ou lancez un paiement pour créer le premier reçu.",
    registerUnavailable: "Registre d’agents indisponible",
    retryFetch: "Réessayer",
    noAgents: "Vous n’avez pas encore d’agent",
    noAgentsHint: "Créez-en un. Environ une minute.",
    mintAgent: "Créer un agent",
    noDescription: "sans description",
    refreshNotice: "Mis à jour",
    agentFundingLabel: (tokenId) => `L’agent #${tokenId} n’a rien à dépenser`,
    receiptRemedy:
      "Suivez le remède indiqué sur le reçu, ou réessayez ci-dessous.",
    unconfigured: (count) => `${count} à configurer`,
    failing: (count) => `${count} en échec`,
    healthCheckLabel: "vérifications d’état",
    oracleDown: "oracle hors ligne",
    unconfiguredLabel: "configuration",
    showChecklist: "Afficher la liste de configuration",
  },
  chat: {
    ...english.chat,
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
      event_history: "Montre les événements on-chain récents du protocole",
      execute_tick: "Exécute un tick de stratégie pour l’agent #",
      simulate_tick: "Simule un tick à blanc pour l’agent #",
      mint_agent: "Minte un nouvel agent nommé ",
      deposit: "Dépose des fonds dans le vault de l’agent #",
      withdraw: "Retire des fonds du vault de l’agent #",
      set_strategy: "Définis la limite de dépense quotidienne de l’agent #",
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
    removeQueued: (message) => `Retirer le message en file : ${message}`,
    composerNearLimit: (remaining) =>
      `${remaining} caractère${frS(remaining)} restant${frS(remaining)} avant que le champ ne tronque les collages`,
    routing: "Routage",
    routingHint: "Cette conversation uniquement",
    routingAuto: "Auto (le plus rapide)",
    routingCheapest: "Coût le plus bas",
    routingVerified: "Fournisseurs vérifiés uniquement",
    routingPrivate: "Fournisseurs privés (isolation supplémentaire)",
    routingPrivateHintOn:
      "Inférence isolée en TEE. Les prompts ne quittent jamais l’enclave du fournisseur",
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
      `tx miné${tokenId ? `, agent #${tokenId}` : ""}${event ? `, ${event}` : ""}${block ? `, bloc ${block}` : ""}`,
    historyNew: "Nouveau",
    historySearch: "Rechercher des chats…",
    historyEmpty: "Pas encore de discussions.",
    historyNoMatch: "Aucun chat correspondant.",
    historyLoading: "Chargement de l’historique serveur…",
    historyRestore: "Restaurer l’historique serveur",
    historyRestoreHint: "Une signature gratuite charge vos chats enregistrés.",
    historyOnChainNote:
      "Vos chats sont sauvegardés sur 0G Storage. Restaurez-les (1 signature)",
    historyDelete: (title) => `Supprimer le chat : ${title}`,
    untitledThread: "Nouveau chat",
    deletedToast: "Chat supprimé",
    undo: "Annuler",
    metricsShow: "Métriques",
    metricsHide: "masquer les métriques",
    stepsSummary: (count, seconds) =>
      `${seconds}s de travail · ${count} étape${count === 1 ? "" : "s"}`,
    stepsWorking: (count) =>
      `En cours… · ${count} étape${count === 1 ? "" : "s"}`,
    stepsFailedSuffix: (failed) =>
      ` · ${failed} échec${failed === 1 ? "" : "s"}`,
    stepNoResult: "Aucun résultat enregistré",
    browseTools: (count) => `Parcourir les ${count} outils`,
    footHint: "Maj+Entrée pour un saut de ligne",
    storedOn0G: "Stocké sur 0G",
    historyClose: "Fermer l’historique",
    turnLimit: (max) =>
      `Limite de tours atteinte après ${max} étapes : envoyez « continue » pour poursuivre.`,
    rateLimited: "Trop de requêtes : patientez un instant, puis réessayez.",
    noResponse: "Aucune réponse : réessayez.",
    errNoResponseBody: "Pas de corps de réponse du service de chat.",
    unknownTool: (name) => `Outil inconnu : ${name}`,
    invalidTokenId: (tokenId) => `tokenId invalide : ${tokenId}`,
    transferCancelled: "Transfert annulé : aucune transaction n’a été soumise.",
    streamStarted: "Début de la réponse.",
    streamComplete: "Réponse terminée.",
    toolSponsored: "Sponsorisé",
    toolSponsoredA11y: "relais sponsorisé",
    toolSponsoredTitle: "Exécuté sans gaz via le GasTank du protocole",
    toolDone: "terminé",
    toolFailed: "échec",
    toolRunning: (seconds) => `en cours ${seconds} s`,
    toolRanIn: (seconds) => `exécuté en ${seconds} s`,
    toolWasArchived: "Archivé",
    toolNotArchived: "Non archivé",
    toolClassLabels: {
      read: "Lecture",
      encode: "Encodage",
      orchestrate: "Orchestration",
      archive: "Archive",
      ask: "Demande utilisateur",
      skill: "Hermes Skills (EVM, DeFi, OSINT, Forensics)",
    },
  },
  gasTank: {
    ...english.gasTank,
    title: "Réservoir de gaz",
    unsetNote:
      "Les transactions sponsorisées sont indisponibles pour le moment. Connectez un wallet pour signer les frais de gaz directement.",
    loading: "Lecture du réservoir…",
    opsLeftSuffix: "opérations restantes",
    lazyGrantNote: "prochaine opération offerte",
    grantsBarTitle: "Subventions de gaz gratuites consommées",
    grantsUsage: "Subventions : {used} sur {cap} utilisées",
    depositPlaceholder: "Montant du dépôt",
    depositAction: "Déposer",
    refillAction: "Réclamer une subvention de gaz",
    tankLowBanner:
      "Votre réservoir de gaz est presque vide : les opérations continuent jusqu’à épuisement de vos subventions gratuites.",
    depositQueued: "Dépôt en file : suivez-le dans le centre des transactions.",
    refillDone: "Subvention de gaz réclamée. Solde du réservoir actualisé.",
    refillFailed:
      "Échec de la réclamation de gaz : vérifiez votre connexion et réessayez.",
  },
  storage: {
    ...english.storage,
    title: "Voyez comment un payload est stocké, puis vérifiez sa preuve.",
    description: "Chaque étape Storage est prouvée séparément.",
    openChat: "Ouvrir le transcript Chat",
    payload: "Payload de métadonnées agent",
    fileSteps: "Fichier et étapes",
    fileMeta: "Payload d’exemple. Taille et tags réels après un upload.",
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
    rootHash: "Hash de racine",
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
    verifyTitle: "Vérifier sur 0G",
    verifyHint:
      "Collez un hash de racine de publication pour ouvrir la fiche propre de l’indexer 0G Storage. Axiom ne stocke jamais vos fichiers ; la vérification a lieu sur l’infrastructure 0G.",
    verifyLabel: "Hash de racine à vérifier",
    verifyPlaceholder: "0x…",
    verifyAction: "Ouvrir la vérification 0G",
    verifyA11y:
      "Vérifier ce hash de racine sur l’indexer 0G Storage (s’ouvre dans un nouvel onglet)",
    verifyError: "Saisissez un hash de racine 32 octets préfixé 0x.",
    verifyExplorerHint:
      "La transaction de publication est aussi visible sur l’explorateur de blocs 0G.",
    verifyDocsLabel: "Documentation de vérification 0G Storage",
    forwardTitle: "Les preuves Storage commencent par une opération.",
    forwardCta: "Minter un agent pour publier des métadonnées",
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
      fieldHint: "Les noms sont permanents. Choisissez bien.",
      detail: "{name}, enregistré on-chain",
      notice: frFlowNotice("Mint soumis pour {name}."),
    },
    payment: {
      ...english.flows.payment,
      title: "Financer un agent",
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
      copy: "Challenge → signature → finalisation → reçu on-chain. L’expiration ne disparaît jamais.",
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
      receiptKind: frTickName,
      consequence: "Lancer une instruction bornée et annulable.",
      proofLine: "Enregistre la route fournisseur et la preuve d’exécution.",
      contextTitle: "Le flux avant le résultat.",
      fieldHint:
        "Bornée et annulable ; les tokens du flux apparaissent ci-dessous.",
      notice: "Tick {outcome} pour l’agent #{agent}. Reçu de flux indexé.",
    },
    deposit: {
      title: "Déposer dans le vault",
      copy: "Montant → revue → reçu on-chain. Le solde du vault reste visible avant le transfert.",
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
      copy: "Montant → revue → reçu on-chain. Le solde restant est affiché avant la signature.",
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
    chainLive: "chaîne {chainId}, wallet réel",
    reviewAction: "Revoir l’opération",
    agentA11y: "Agent ciblé",
    agentSelectPlaceholder: "choisir un agent",
    agentHint:
      "L’agent dont le vault ou la fiche est visé par cette opération.",
    errAmountPositive: "Saisissez un montant supérieur à zéro.",
    errExceedsVault: "Le montant dépasse le solde du vault.",
    errInvalidAmount: "Saisissez un montant valide.",
    errNameLength: "Utilisez 2 à 80 caractères.",
    errRecipientAddress: "Le destinataire doit être une adresse 0x valide.",
    errRecipientKeyIsAddress:
      "Ceci ressemble à une adresse Ethereum (42 caractères) ; un transfert exige la clé publique du destinataire (64 octets en hex, préfixée 0x, 130 caractères). Voyez « Comment l’obtenir » ci-dessous.",
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
    cancelStream: "Annuler le flux",
    factCost: "Coût",
    confirmMint: "Un clic dans votre wallet, frais de réseau habituels",
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
    receiptRemedy:
      "Rejeté ou expiré ? Relancez la transaction : augmentez le gas si le réseau est chargé, ou vérifiez votre connexion.",
    copyReceiptAction: "Copier le reçu",
    openReceiptAction: "Ouvrir le reçu",
    startAnotherAction: "Recommencer",
    mintDoneHeading: "C’est fait. {name} est en ligne !",
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
    networkFact: "{chainName}, chaîne {chainId}",
    networkFactId: "chaîne {chainId}",
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
    confirmOne: "Non, une seule demande",
    confirmTwo: "Oui, deux demandes wallet",
    confirmTwoApprovePay: "Oui, une fois maintenant, une pour payer",
    confirmOneAllowance: "Non, l’approbation suffit",
    confirmChecking: "Jusqu’à 2 demandes wallet (vérification…)",
    confirmReceiverThenSubmit: "Approbation requise : oui",
    transferKeyHint:
      "Hex 64 octets (0x…), la clé de chiffrement du nouveau propriétaire.",
    transferPubkeyFallbackSummary: "Avancé, coller la clé publique à la place",
    transferPubkeyResolvePending: "Recherche de la clé pour cette adresse…",
    transferPubkeyResolveFailed:
      "Aucune clé publique trouvée on-chain pour cette adresse. Collez-la manuellement ci-dessous.",
    transferPubkeyResolveResolved:
      "Clé trouvée on-chain. Le destinataire peut déchiffrer la charge.",
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
      "Vous recevez cet agent avec votre wallet ({receiver}). Signez pour accepter, rien ne bouge on-chain tant que l’expéditeur n’a pas soumis.",
    receiveSign: "Signer l’approbation",
    receiveSigning: "En attente de la signature…",
    receiveWrongAccount:
      "Mauvais compte. Cette approbation doit être signée par {receiver}. Passez au compte destinataire.",
    receiveDoneTitle: "Approbation signée",
    receiveDoneBody: "Envoyez le lien d’approbation à l’expéditeur ci-dessous.",
    receiveCopyCode: "Copier le lien d’approbation",
    receiveCodeCopied: "Lien d’approbation copié.",
    receiveDoneSameBrowser:
      "Si la revue de l’expéditeur est ouverte dans ce navigateur, son onglet l’applique automatiquement.",
    claimUrlLabel: "Lien d’approbation",
    claimRawToggle: "Avancé, signature brute",
    goHome: "Accueil",
    connectToSubmit: "Connectez un wallet pour soumettre cette opération.",
    mintAgentFallback: "Agent Axiom",
    operationActions: "Actions de l’opération",
    streamStarted: "Flux lancé.",
    streamComplete: "Flux terminé.",
    receiveCopyManual:
      "Presse-papiers indisponible : sélectionnez le lien ci-dessus et copiez-le manuellement.",
    cancel: "Annuler",
    edit: "Modifier",
    transferPhases: {
      idle: "Prêt",
      challenge: "Préparation du transfert…",
      signing: "En attente de la signature…",
      finalizing: "Sécurisation des données pour le destinataire…",
      confirming: "Confirmation on-chain…",
    },
    transferRetryHint: "Échec. Touchez Modifier pour réessayer.",
    transferErrChallenge: "La demande a échoué. Réessayez.",
    transferErrSubmit:
      "Échec de la soumission. Rien n’a été envoyé. Touchez Modifier pour réessayer.",
    transferErrGeneric:
      "Une erreur est survenue. Touchez Modifier pour recommencer.",
    closeTransferA11y: "Fermer le transfert",
    transferLede:
      "Vous signez une fois pour autoriser, puis vous confirmez le transfert on-chain.",
    transferReceiverLabel: "Adresse du destinataire",
    transferPubkeyLabel: "Clé publique du destinataire",
    transferPubkeyPlaceholder: "0x… (130 caractères : 0x + 128 hex)",
    transferRekeySummary: "Rechiffrer pour le destinataire (optionnel)",
    transferRekeyHint:
      "Optionnel : clé AES + URI de stockage pour que seul le destinataire puisse lire les données après le transfert. Vide = signature seule.",
    transferOldKeyLabel: "Ancienne clé de chiffrement des données (base64)",
    transferOldKeyPlaceholder: "clé AES 32 octets en base64",
    transferOldUriLabel: "Ancienne URI des données (0x…)",
    transferOldUriPlaceholder: "hash racine de stockage 0x…",
    transferErrKeyRequired: "requis",
    transferErrKeyPrefix: "doit être préfixée de 0x",
    transferErrKeyLength: (length) =>
      `doit faire ${length} caractères (64 octets bruts, sans préfixe 0x04)`,
    transferErrRekeyPair:
      "fournissez l’ancienne clé et l’ancienne URI des données pour rechiffrer, ou laissez les deux vides",
    transferSigning: "Signature…",
    transferSignAction: "Signer l’autorisation de transfert",
    transferConfirmLede:
      "Confirmez. Votre wallet demandera la signature finale.",
    transferAuthorizedTitle: "Transfert autorisé",
    transferAuthorizedBody:
      "les données de l’agent ont été rechiffrées pour que seul le nouveau propriétaire puisse les lire.",
    transferProofDetails: "Détails de la preuve",
    transferNewHashLabel: "Nouveau hash de métadonnées :",
    transferSealedKeyLabel: "; nouvelle clé scellée :",
    transferOwnershipProof: "Preuve de propriété",
    transferValidUntil: "Valide jusqu’au",
    transferAcceptedBy: "Accepté par",
    transferSubmitting: "Soumission…",
    transferConfirmAction: "Confirmer le transfert on-chain",
    transferConfirmedToast: (hash) => `Transfert ${hash}… confirmé`,
  },
  agentDetail: {
    ...english.agentDetail,
    balanceToSpend: "Dispose de {amount} à dépenser, prêt",
    needsSetup: "À configurer",
    statusOnline: "en ligne",
    statusAttention: "attention",
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
    openStorage: "Ouvrir le stockage",
    chooseBoundedOperation: "Que voulez-vous faire ?",
    addMoneyPrimary: "Financer l’agent",
    runTask: "Lancer une tâche",
    moreActions: "Plus…",
    fundAgent: "Financer l’agent",
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
      "La modification conserve les règles et l’expiration de cet agent, seule la limite quotidienne change.",
    limitTipUnbound:
      "Astuce : définissez une limite quotidienne pour que votre agent puisse payer seul les petites factures.",
    errLimitPositive: "Entrez une limite quotidienne supérieure à zéro.",
    errLimitWallet: "Connectez un wallet pour définir la limite de dépense.",
    copiedNotice: "Copié",
    limitToast: (hash) => `Limite de dépense soumise (${hash.slice(0, 10)}…)`,
    withdrawToast: (hash) => `Retrait soumis (${hash.slice(0, 10)}…)`,
    ticksRun: (count) => `${count} tâche${frS(count)} effectuée${frS(count)}`,
    activityLoading: "Chargement…",
    activityEmptyTitle: "Rien pour l’instant",
    activityEmptyHint: "Les tâches apparaîtront ici.",
    // W3-C Permit2 pay panel — terms render exactly what the signature permits.
    permit2Title: "Payer avec Permit2",
    permit2Hint:
      "Signez une fois : aucune transaction d’approbation. La signature autorise le processeur de paiement à prélever exactement ce montant pour cet agent.",
    permit2Cta: "Signer et payer",
    payAmountLabel: "Montant à payer",
    permit2LaneNote: (lane) =>
      lane === "permit2"
        ? "Réglé via signature Permit2."
        : "Réglé via l’approbation de token existante.",
    permit2SnapshotCap: "Plafond de paiement",
    permit2SnapshotAllowance: "Autorisation du processeur",
    permit2SnapshotBalance: "Votre solde de tokens",
    // W3-C Agent Delegation card (owner-only).
    delegationTitle: "Délégation d’agent",
    delegationHint:
      "Laissez une clé déléguée exécuter des opérations bornées pour cet agent sous les plafonds que vous fixez. Signé par vous, révocable instantanément.",
    delegationDelegateLabel: "Adresse du délégué",
    delegationPerTxCapLabel: "Plafond par tx (wei)",
    delegationWindowCapLabel: "Plafond par fenêtre (wei)",
    delegationWindowLabel: "Durée de fenêtre (secondes)",
    delegationExpiryLabel: "Expiration dans (jours)",
    delegationActive: "Délégation active",
    delegationNone: "Aucune délégation active",
    delegationInstall: "Signer et installer",
    delegationRevoke: "Révoquer",
    delegationNotConfigured:
      "Registre de délégation pas encore configuré : disponible après le prochain déploiement.",
    delegationTargetsLabel:
      "Opérations autorisées (contrat:sélecteur, une par ligne)",
    delegationTargetsPlaceholder: "0x…:0x1a2b3c4d",
    delegationToast: (hash) => `Délégation mise à jour (${hash.slice(0, 10)}…)`,
    errDelegationForm: "Vérifiez les champs de délégation : {error}",
    errDelegationWallet:
      "Connectez votre wallet pour installer une délégation.",
  },
  transactions: {
    ...english.transactions,
    title: frTxCenterName,
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
    chainEvent: "Événement de chaîne",
    eventDetail: "agent #{agent}, bloc {block}",
    eventDetailBlockOnly: "bloc {block}",
    emptyState: "Aucun reçu ne correspond à cet état.",
    emptyAll: "Pas encore de reçu. Mintez un agent pour créer le premier.",
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
    viewOnExplorer: "Voir sur l’explorateur",
    copyReceiptHash: "Copier le hash du reçu",
    receiptCopied: "Hash du reçu copié.",
    receiptsCount: (shown, total) => `${shown} sur ${total} reçus`,
    filterA11y: "Filtre d’état des reçus",
    clearFilter: "Effacer le filtre",
  },
  status: {
    label: "Statut",
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
  time: {
    minutesAgo: (minutes) => `il y a ${minutes} min`,
    hoursAgo: (hours) => `il y a ${hours} h`,
    daysAgo: (days) => `il y a ${days} j`,
    indexed: "indexé",
  },
  gate: {
    statusWallet: "wallet non connecté",
    statusNetwork: "mauvais réseau",
    previewAlt: (label) => `Aperçu ${label}`,
    previewNote: "Aperçu : connectez un wallet pour les données réelles.",
    // deposit/withdraw : libellés identiques à nav.deposit/nav.withdraw.
    labels: {
      overview: "Vue d’ensemble de la console",
      settings: "Réglages de session",
      chat: "Chat opérateur",
      mint: "Créer un agent",
      payment: "Route de paiement",
      transfer: "Flux de transfert",
      agent: "Détail de l’agent",
      roster: "Liste d’agents",
      tick: frTickName,
      deposit: "Dépôt",
      withdraw: "Retrait",
    },
    rows: {
      overview: [
        { label: "Agents", value: "••• en ligne" },
        { label: "Prochain tick", value: "••• en file" },
      ],
      settings: [
        { label: "Affichage", value: "•••" },
        { label: "Session", value: "••• h" },
      ],
      chat: [
        { label: "Fil", value: "••• tours" },
        { label: "Outils", value: "••• en ligne" },
      ],
      mint: [
        { label: "Identité", value: "unique" },
        { label: "Propriété", value: "vous" },
      ],
      payment: [
        { label: "Plafond d’approbation", value: "••• 0G" },
        { label: "Frais", value: "d’avance" },
      ],
      transfer: [
        { label: "Co-signature", value: "destinataire" },
        { label: "Expiration", value: "appliquée" },
      ],
      agent: [
        { label: "Identité", value: "ERC-7857" },
        { label: "Reçus", value: "•••" },
      ],
      roster: [
        { label: "Liste", value: "••• agents" },
        { label: "Détails", value: "par agent" },
      ],
      tick: [
        { label: "Instruction", value: "bornée" },
        { label: "Flux", value: "••• tokens" },
      ],
      deposit: [
        { label: "Gaz du vault", value: "••• 0G" },
        { label: "Recharge", value: "native" },
      ],
      withdraw: [
        { label: "Solde", value: "••• 0G" },
        { label: "Délai", value: "•••" },
      ],
    },
  },
  lockedHero: {
    app: {
      titleLead: "Votre console,",
      titleEmphasis: "en un coup d’œil.",
      copy: "Voyez ce que vos agents attendent ensuite.",
    },
    settings: {
      titleLead: "Réglages console,",
      titleEmphasis: "à votre main.",
      copy: "Session, affichage et préférences console.",
    },
    chat: {
      titleLead: "Un chat qui connaît",
      titleEmphasis: "votre setup.",
      copy: "Interrogez vos agents ; le chat connaît votre session.",
    },
    mint: {
      titleLead: "Nommez votre agent",
      titleEmphasis: "on-chain.",
      copy: "Le nom choisi devient une identité on-chain avec reçu.",
    },
    payment: {
      titleLead: "Payez exactement",
      titleEmphasis: "ce que vous approuvez.",
      copy: "Approuvez exactement ce que vous payez ; coûts clairs avant signature.",
    },
    transfer: {
      titleLead: "Les transferts que",
      titleEmphasis: "votre destinataire co-signe.",
      copy: "Le destinataire co-signe ; l’expiration est appliquée.",
    },
    agent: {
      titleLead: "Chaque agent,",
      titleEmphasis: "en détail.",
      copy: "Identité, propriété, activité et reçus par agent.",
    },
    agentsList: {
      titleLead: "Tous vos agents,",
      titleEmphasis: "une vue d’ensemble.",
      copy: "Connectez-vous pour voir vos agents, leurs vaults et leurs reçus.",
    },
    tick: {
      titleLead: "Lancez une tâche d’agent,",
      titleEmphasis: "bornée.",
      copy: "Donnez une instruction à l’agent, il diffuse le résultat puis s’arrête.",
    },
    deposit: {
      titleLead: "Alimentez le vault",
      titleEmphasis: "d’un agent.",
      copy: "Ajoutez du gas natif au vault d’un agent avant son exécution.",
    },
    withdraw: {
      titleLead: "Retirez des fonds du",
      titleEmphasis: "vault d’un agent.",
      copy: "Sortez des fonds du vault d’un agent, solde affiché avant signature.",
    },
  },
  checklist: {
    title: "Faites travailler votre premier agent",
    dismiss: "Fermer",
    done: "Flotte active : vos agents sont financés et opérationnels.",
    steps: {
      mint: {
        label: "Créez votre agent",
        hint: "Enregistrez un agent : aucun fonds requis pour l’instant.",
      },
      deposit: {
        label: "Alimentez son vault",
        hint: "Ajoutez du gas natif pour payer les exécutions.",
      },
      tick: {
        label: "Lancez une tâche",
        hint: "Donnez une instruction et voyez le reçu arriver.",
      },
    },
  },
};

const deFlowNotice = (head: string): string =>
  `${head} Beleg zum Transaktionszentrum hinzugefügt.`;

const german: Copy = {
  nav: {
    ...english.nav,
    howItWorks: "So funktioniert Axiom",
    connectWallet: "Wallet verbinden",
    overview: "Übersicht",
    groupOverview: "Überblick",
    groupOperations: "Vorgänge",
    groupResources: "Ressourcen",
    transactions: "Transaktionen",
    storage: "Speicher",
    mint: "Minten",
    payment: "Zahlung",
    tick: deTickName,
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
    chainLabel: (id) => `Chain ${id}`,
  },
  strip: {
    ...english.strip,
    reviewTitle: (kind) => `${kind} prüfen`,
    reviewSummary:
      "Stelle den vorhandenen Beleg wieder her, bevor du es erneut versuchst.",
    reviewImpact: "Keine Vermögensbewegung, bis du fortfährst.",
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
    hintKeys: "↑↓ bewegen, ↵ öffnen, esc schließen",
  },
  a11y: {
    primaryNav: "Hauptnavigation",
    notificationsRegion: "Benachrichtigungen",
    openNav: "Hauptnavigation öffnen",
    closeNav: "Navigation schließen",
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
    switchToLight: "Zum hellen Thema wechseln",
    switchToDark: "Zum dunklen Thema wechseln",
    walletAccess: "Axiom-Wallet-Zugang",
    closeWalletAccess: "Wallet-Zugang schließen",
    skipToContent: "Zum Inhalt springen",
    copyLabel: "Kopieren",
    copyA11y: "In die Zwischenablage kopieren",
    copiedA11y: "In die Zwischenablage kopiert",
    loading: "Laden",
  },
  landing: {
    ...english.landing,
    title: "Eigene KI-Agenten, {emphasis}auf 0G.{endEmphasis}",
    description:
      "Minte einen Agenten mit einem begrenzten Tresor. Er läuft nur innerhalb deiner Regeln, und jede Aktion hinterlässt einen On-Chain-Beleg.",
    closingCta: "Minte deinen ersten Agenten.",
    closingTitle: "Minte deinen {emphasis}ersten Agenten.{endEmphasis}",
    eyebrow: "{emphasis}ERC-7857{endEmphasis} · Agenten in deinem Besitz",
    switchToEditorial: "Zum hellen Editorial-Design wechseln",
    switchToForge: "Zum dunklen Forge-Design wechseln",
    docTitle: "Axiom: Eigene KI-Agenten on-chain",
    menuGuideHint: "Wie Signatur und Beleg funktionieren",
    menuDevelopers: "Entwickler",
    menuDevelopersHint: "APIs und Entwickler-Tools",
    nav: {
      overview: "Überblick",
      principles: "Prinzipien",
      howItWorks: "So funktioniert es",
      start: "Starten",
      connect: "Verbinden",
    },
    console: {
      agentId: "AXIOM OPS / AGENT 0x7a4c…91f2",
      chip: "Ops-Feed",
      indexing: "Indexierung",
      orbStates: ["aktiv", "suchend", "lösend"],
      orbA11y: "Agent ist {state}",
      srOnly:
        "Tick 4821, Tresor-Check bestanden, Tageslimit 25 {nativeSymbol}. Aktion: rebalance storage, innerhalb der Grenzen. Beleg 0x8f3ac21e bei Block 4812336 indexiert. Nächster Tick in 60 Sekunden, Agent inaktiv.",
      previewA11y: "Vorschau der Agent-Konsole, Beispieldaten",
      lines: [
        "Tick {tick} · Tresor-Check ok, Limit 25 {nativeSymbol}/Tag",
        "Aktion: rebalance_storage · innerhalb der Grenzen",
        "Beleg {receiptHash} indexiert · Block {block}",
        "nächster Tick in 60 s · Agent inaktiv",
      ],
    },
    stats: [
      { value: 1, suffix: "", label: "Transaktion für Agent und Tresor" },
      { value: 0, suffix: "", label: "Konten, E-Mails oder Passwörter" },
      { value: 100, suffix: "%", label: "der Signaturen als Belege indexiert" },
      { value: 7857, suffix: "", label: "der ERC-Standard der Agenten" },
    ],
    spec: {
      title: "Das Protokoll, {emphasis}spezifiziert.{endEmphasis}",
      clusters: [
        {
          head: "Identität",
          rows: [
            { label: "Standard", value: "ERC-7857, eigene KI-Agenten" },
            { label: "Netzwerk", value: "{chainName}, Chain {chainId}" },
          ],
        },
        {
          head: "Grenzen",
          rows: [
            {
              label: "Tresor",
              value: "Begrenzt, Tageslimit vom Besitzer gesetzt",
            },
            {
              label: "Überschreitung",
              value: "Konstruktionsbedingt unmöglich, für Agent und Team",
            },
          ],
        },
      ],
      account: {
        head: "Konto",
        accessLabel: "Zugang",
        receiptsLabel: "Belege",
      },
    },
    principles: {
      title: "Was Axiom {emphasis}anders macht.{endEmphasis}",
      items: [
        {
          icon: "shield",
          title: "Grenzen durch Design.",
          body: "Ein On-Chain-Tresor mit Tageslimit. Dein Agent kann nie darüber hinaus ausgeben — und wir können gar nichts ausgeben.",
          link: "Spec lesen",
        },
        {
          icon: "receipt",
          title: "Belege, keine Versprechen.",
          body: "Jede Signatur wird als Beleg indexiert: welcher Agent, welcher Block, was passiert ist.",
          link: "Wie Belege funktionieren",
        },
        {
          icon: "wallet",
          title: "Dein Wallet, deine Schlüssel.",
          body: "Verbinde das Wallet, das du schon hast. Keine Accounts, keine E-Mails, keine Passwörter.",
          link: "",
        },
      ],
    },
    how: {
      title: "Drei Schritte zu {emphasis}einem laufenden Agenten.{endEmphasis}",
      steps: [
        {
          title: "Minten.",
          body: "Eine Transaktion erstellt Agent und Tresor.",
          fact: "1 Transaktion · ERC-7857",
        },
        {
          title: "Finanzieren.",
          body: "Tresor aufladen. Tageslimit setzen.",
          fact: "Besitzer-Limit, on-chain erzwungen",
        },
        {
          title: "Ausführen.",
          body: "Ticks laufen in deinen Regeln. Belege indexieren on-chain.",
          fact: "ein Beleg pro Signatur",
        },
      ],
    },
    footer: {
      credit: "Gebaut auf 0G · Mainnet beta",
      links: [
        { id: "agents", label: "Agents" },
        { id: "receipts", label: "Belege" },
        { id: "storage", label: "Speicher" },
        { id: "developers", label: "Entwickler" },
      ],
    },
  },
  wallet: {
    wrongNetworkTitle: "Zu {chainName} wechseln.",
    wrongNetworkDescription:
      "Das Wallet ist verbunden, verwendet aber ein anderes Netzwerk. Wechsle vor der Signatur der Zugriffsnachricht.",
    switchNetwork: "Zu {chainName} wechseln",
    networkMismatch: "Falsches Netzwerk",
    connectedChain: "Verbunden: Chain {chainId}",
    requiredChain: "Erforderlich: {chainName}, Chain {chainId}",
    profileHint: "Nur auf diesem Gerät gespeichert.",
    connectTitle: "Wähle ein Wallet.",
    connectingStatus: "Verbindung…",
    browserWalletLabel: "Browser-Wallet",
    browserWalletHint: "MetaMask und andere injizierte Wallets",
    walletConnectLabel: "WalletConnect",
    walletConnectHint: "QR-Code scannen oder Wallet-App öffnen",
    pairingTitle: "Wallet koppeln",
    pairingHint:
      "Kopiere den Code in den WalletConnect-Bildschirm deiner Wallet-App.",
    noWalletDetected:
      "Keine Browser-Wallet erkannt. Installiere eine oder nutze eine mobile Wallet.",
    unknownChain: "unbekannt",
  },
  guide: {
    nextStep: "Nächster Schritt",
    illustrationAlt: "Axiom-Einführungsillustration",
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
    pageTitle: "Staking auf 0G",
    lede: "Staking ist nicht Teil von Axiom.",
    body: "Staking läuft über die offizielle 0G-App: Agents, Vaults und Belege bleiben hier.",
    openVault: "Zu meinen Agents",
    backLabel: "Zurück zur Konsole",
    docsLink:
      "https://docs.0g.ai/developer-hub/building-on-0g/contracts-on-0g/staking-interfaces",
    docsA11y: "0G-Staking-Dokumentation (öffnet in neuem Tab)",
    docsLabel: "0G-Staking-Doku",
  },
  notFound: {
    titleLead: "Diese Route",
    titleEmphasis: "treibt davon.",
    body: "Diese Seite existiert nicht. Es wurde nichts geladen und keine Wallet-Aktion ausgeführt.",
    returnToLanding: "Zurück zur Startseite",
    openConsole: "App öffnen",
    title: "Seite nicht gefunden",
    heroAlt: "Abstrakte wiederherstellbare Axiom-Route",
    // Wave-12B: Erkennungsreihe (barrierefreier Name + Hub-Beschriftungen).
    exploreA11y: "Öffentliche Pfade erkunden",
    hubLabels: {
      agents: "Agents",
      payments: "Zahlungen",
      proofs: "Nachweise",
      storage: "Speicher",
      developers: "Entwickler",
    },
  },
  errorBoundary: {
    networkTitle: "Verbindungsproblem",
    genericTitle: "Ansicht konnte nicht geladen werden",
    networkBody:
      "Dieser Abschnitt ließ sich nicht laden. Versuche es erneut, oder prüfe deine Verbindung, wenn der Fehler bestehen bleibt.",
    retry: "Erneut versuchen",
    reload: "Seite neu laden",
  },
  errors: {
    userRejected:
      "Transaktion abgebrochen. Du hast die Anfrage in deinem Wallet abgelehnt.",
    unknownDatahash:
      "Die Metadaten dieses Agenten sind noch nicht beim Orakel registriert. Registriere sie erneut im Mint-Flow (oder wähle einen anderen Agenten) und versuche den Transfer dann erneut.",
    signerMismatch:
      "Die Transfer-Annahme muss vom Wallet des Empfängers signiert werden. Geh zurück und nutze den Schritt „Als Empfänger signieren“ mit dem Empfängerkonto.",
    receiverUnavailable:
      "Das Empfängerkonto ist im verbundenen Wallet nicht verfügbar. Füge das Empfängerkonto zu diesem Wallet hinzu oder lass den Empfänger den Transfer in seiner eigenen Sitzung annehmen.",
    acceptanceNotSigned:
      "Dieser Annahmecode wurde nicht vom Wallet des Empfängers signiert. Bitte den Empfänger, den Annahme-Link erneut mit dem Empfängerkonto zu signieren, und füge dann den neuen Code ein.",
    computeOutOfCredits:
      "0G Compute hat keine Guthaben mehr. Lade das Compute-Konto für AXIOM_COMPUTE_API_KEY auf und versuche es erneut.",
    insufficientFunds:
      "Unzureichendes Guthaben für diese Transaktion. Lade Guthaben auf und versuche es erneut.",
    rateLimited:
      "Der Compute-Provider begrenzt gerade die Anfragen. Warte ein paar Sekunden und sende erneut.",
    tankExhausted:
      "Deine Gratis-Gas-Zuschüsse sind aufgebraucht. Zahle über die GasTank-Oberfläche ein oder verbinde ein Wallet, um Vorgänge direkt zu signieren.",
    reserveExhausted:
      "Die Gas-Reserve des Protokolls ist vorübergehend leer. Gesponserte Vorgänge pausieren, bis sie wieder aufgefüllt ist. Versuche es gleich erneut.",
    sponsorRateLimited:
      "Zu viele gesponserte Vorgänge hintereinander. Warte kurz und versuche es erneut.",
    computeInvalidRequest:
      "Der Compute-Provider hat diese Anfrage als ungültig abgelehnt. Starte einen neuen Chat und versuche es erneut.",
    computeUpstream:
      "Compute ist gerade nicht verfügbar. Prüfe die Compute-Schlüssel und das Guthaben des Backends.",
    gasEstimate:
      "Die Transaktion würde on-chain fehlschlagen. Prüfe deine Eingaben und dein Wallet-Guthaben.",
    reverted:
      "Transaktion vom Contract rückgängig gemacht. Prüfe deine Eingaben und Berechtigungen.",
    revertedWithReason: (reason) => `Transaktion rückgängig: ${reason}`,
    networkError:
      "Netzwerkfehler. Prüfe deine Internetverbindung und versuche es erneut.",
    timeout:
      "Zeitüberschreitung der Anfrage. Das Netzwerk ist möglicherweise überlastet. Versuche es erneut.",
    nonceTooLow:
      "Nonce-Konflikt bei der Transaktion. Warte, bis ausstehende Transaktionen bestätigt sind.",
  },
  settings: {
    ...english.settings,
    pageTitle: "Einstellungen",
    languageLabel: "Sprache der Oberfläche",
    pageDescription: "Deine Einstellungen.",
    liveWallet: "Live-Wallet",
    signingContext: "Signierung",
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
    railWidthHint: "Ziehe am Griff, um die Breite einzustellen.",
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
    shortcutHint: "Kurzbefehle navigieren. Sie signieren nie.",
    shortcutPalette: "Aktionen, Agents, Belege und Routen suchen",
    shortcutSurfaces: "Hauptbereiche öffnen",
    shortcutFlows: "Ausführungs-Flows öffnen",
    replayOnboarding: "Onboarding wiederholen",
    showChecklistAgain: "Einrichtungsliste erneut anzeigen",
    resetSurface: "Einstellungen zurücksetzen",
    resetConfirmTitle: "Einstellungen zurücksetzen?",
    resetConfirmBody:
      "Dies meldet dich ab und löscht alle Flow-Entwürfe und lokalen Belege. Deine Einstellungen bleiben erhalten. Kein Rückgängigmachen.",
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
    addMoney: "Agent finanzieren",
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
    needsSetupLabel: "einrichten",
    queueAwaiting: "Bestätigung ausstehend",
    telemetryTitle: "Guthaben & letzte Aktivität",
    noEvidence: "Noch nichts hier",
    noEvidenceHint:
      "Minte einen Agenten oder führe eine Zahlung aus, um den ersten Beleg zu erzeugen.",
    registerUnavailable: "Agentenregister nicht verfügbar",
    retryFetch: "Erneut versuchen",
    noAgents: "Du hast noch keinen Agenten",
    noAgentsHint: "Erstelle einen. Dauert etwa eine Minute.",
    mintAgent: "Agent erstellen",
    noDescription: "keine Beschreibung",
    refreshNotice: "Aktualisiert",
    agentFundingLabel: (tokenId) => `Agent #${tokenId} hat nichts zum Ausgeben`,
    receiptRemedy:
      "Folge dem Lösungshinweis auf dem Beleg, oder versuche es unten erneut.",
    unconfigured: (count) => `${count} unkonfiguriert`,
    failing: (count) => `${count} fehlerhaft`,
    healthCheckLabel: "Statusprüfungen",
    oracleDown: "Oracle offline",
    unconfiguredLabel: "Einrichtung",
    showChecklist: "Einrichtungsliste anzeigen",
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
    promptMintIntent: "Hilf mir, einen neuen Agenten zu minten",
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
      event_history: "Zeige die letzten On-Chain-Ereignisse des Protokolls",
      execute_tick: "Führe einen Strategie-Tick für Agent # aus",
      simulate_tick: "Teste einen Tick für Agent # trocken",
      mint_agent: "Minte einen neuen Agenten namens ",
      deposit: "Zahle Guthaben in den Vault von Agent # ein",
      set_strategy: "Setze das tägliche Ausgabenlimit von Agent #",
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
    removeQueued: (message) => `Wartende Nachricht entfernen: ${message}`,
    composerNearLimit: (remaining) =>
      `${remaining} Zeichen übrig, bevor der Editor Einfügungen kürzt`,
    routingHint: "Nur diese Unterhaltung",
    routingAuto: "Auto (schnellster)",
    routingCheapest: "Günstigster",
    routingVerified: "Nur verifizierte Provider",
    routingPrivate: "Private Provider (zusätzliche Isolation)",
    routingPrivateHintOn:
      "TEE-isolierte Inferenz. Prompts verlassen die Enklave des Providers nie",
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
      `tx gemintet${tokenId ? `, Agent #${tokenId}` : ""}${event ? `, ${event}` : ""}${block ? `, Block ${block}` : ""}`,
    historyNew: "Neu",
    historySearch: "Chats suchen…",
    historyEmpty: "Noch keine Chats.",
    historyNoMatch: "Keine passenden Chats.",
    historyLoading: "Server-Verlauf wird geladen…",
    historyRestore: "Server-Verlauf wiederherstellen",
    historyRestoreHint:
      "Eine kostenlose Signatur lädt deine gespeicherten Chats.",
    historyOnChainNote:
      "Deine Chats werden auf 0G Storage gespeichert. Stelle sie wieder her (1 Signatur)",
    historyDelete: (title) => `Chat löschen: ${title}`,
    untitledThread: "Neuer Chat",
    deletedToast: "Chat gelöscht",
    undo: "Rückgängig",
    metricsShow: "Metriken",
    metricsHide: "Metriken ausblenden",
    stepsSummary: (count, seconds) =>
      `${seconds}s gearbeitet · ${count} Schritt${count === 1 ? "" : "e"}`,
    stepsWorking: (count) =>
      `Arbeitet… · ${count} Schritt${count === 1 ? "" : "e"}`,
    stepsFailedSuffix: (failed) => ` · ${failed} fehlgeschlagen`,
    stepNoResult: "Kein Ergebnis aufgezeichnet",
    browseTools: (count) => `Alle ${count} Werkzeuge durchsuchen`,
    footHint: "Umschalt+Eingabe für eine neue Zeile",
    storedOn0G: "Auf 0G gespeichert",
    historyClose: "Verlauf schließen",
    turnLimit: (max) =>
      `Rundenlimit nach ${max} Schritten erreicht — sende „continue“, um fortzufahren.`,
    rateLimited:
      "Zu viele Anfragen: einen Moment warten, dann erneut versuchen.",
    noResponse: "Keine Antwort: erneut versuchen.",
    errNoResponseBody: "Keine Antwortdaten vom Chat-Dienst.",
    unknownTool: (name) => `Unbekanntes Tool: ${name}`,
    invalidTokenId: (tokenId) => `Ungültige tokenId: ${tokenId}`,
    transferCancelled:
      "Transfer abgebrochen: es wurde keine Transaktion übermittelt.",
    streamStarted: "Antwort begonnen.",
    streamComplete: "Antwort abgeschlossen.",
    toolSponsored: "Gesponsert",
    toolSponsoredA11y: "gesponsertes Relay",
    toolSponsoredTitle: "Gasfrei über den Protokoll-GasTank ausgeführt",
    toolDone: "fertig",
    toolFailed: "fehlgeschlagen",
    toolRunning: (seconds) => `läuft ${seconds} s`,
    toolRanIn: (seconds) => `ausgeführt in ${seconds} s`,
    toolWasArchived: "Archiviert",
    toolNotArchived: "Nicht archiviert",
    toolClassLabels: {
      read: "Lesen",
      encode: "Encodieren",
      orchestrate: "Orchestrieren",
      archive: "Archiv",
      ask: "Nutzer fragen",
      skill: "Hermes Skills (EVM, DeFi, OSINT, Forensics)",
    },
  },
  gasTank: {
    ...english.gasTank,
    title: "Gas-Tank",
    unsetNote:
      "Sponsorierte Transaktionen sind derzeit nicht verfügbar. Verbinde ein Wallet, um Gasgebühren direkt zu signieren.",
    loading: "Tank wird gelesen…",
    opsLeftSuffix: "Operationen übrig",
    lazyGrantNote: "nächste Operation gratis",
    grantsBarTitle: "Verbrauchte Gratis-Gas-Zuschüsse",
    grantsUsage: "Zuschüsse: {used} von {cap} verbraucht",
    depositPlaceholder: "Einzahlungsbetrag",
    depositAction: "Einzahlen",
    refillAction: "Gratis-Gas-Zuschuss anfordern",
    tankLowBanner:
      "Dein Gas-Tank ist fast leer: Operationen laufen weiter, bis deine Gratis-Zuschüsse aufgebraucht sind.",
    depositQueued: "Einzahlung eingereicht: im Transaktionszentrum verfolgen.",
    refillDone: "Gas-Zuschuss angefordert. Tankkonto aktualisiert.",
    refillFailed:
      "Gas-Zuschuss fehlgeschlagen: Verbindung prüfen und erneut versuchen.",
  },
  storage: {
    ...english.storage,
    title:
      "Sieh, wie ein Payload gespeichert wird, und prüfe dann den Nachweis.",
    description:
      "Verschlüsselung, Root-Hash, Storage-Transaktion, Integritätsnachweis und Index-Verfügbarkeit bleiben getrennt.",
    openChat: "Chat-Transkript öffnen",
    payload: "Agenten-Metadaten-Payload",
    fileSteps: "Datei und Schritte",
    fileMeta:
      "Beispiel-Payload. Echte Größe und Tags erscheinen nach einem Upload.",
    labels: [
      "Payload bereit",
      "Verschlüsselt",
      "Root-Hash erstellt",
      "Veröffentlicht",
      "Nachweis geprüft",
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
    verifyTitle: "Auf 0G verifizieren",
    verifyHint:
      "Füge den Root-Hash einer Veröffentlichung ein, um den eigenen Eintrag des 0G-Storage-Indexers zu öffnen. Axiom speichert deine Dateien nie; die Verifizierung läuft auf 0G-Infrastruktur.",
    verifyLabel: "Zu prüfender Root-Hash",
    verifyPlaceholder: "0x…",
    verifyAction: "0G-Verifizierung öffnen",
    verifyA11y:
      "Diesen Root-Hash auf dem 0G-Storage-Indexer verifizieren (öffnet in neuem Tab)",
    verifyError: "Gib einen 0x-präfixierten 32-Byte-Root-Hash ein.",
    verifyExplorerHint:
      "Die Veröffentlichungstransaktion ist auch im 0G-Block-Explorer sichtbar.",
    verifyDocsLabel: "0G-Storage-Verifizierungsdokumentation",
    forwardTitle: "Storage-Belege beginnen mit einer Operation.",
    forwardCta: "Agent minten, um Metadaten zu veröffentlichen",
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
      receiptKind: "Minten",
      consequence:
        "Nach der Bestätigung gehört dein neuer Agent für immer dir.",
      proofLine: "Speichert Metadaten-Hash und dessen On-Chain-Registrierung.",
      contextTitle: "Identität vor Eigentum.",
      fieldLabel: "Agentenname",
      fieldHint: "Namen sind dauerhaft. Wähle mit Bedacht.",
      detail: "{name}, on-chain registriert",
      notice: deFlowNotice("Mint für {name} eingereicht."),
    },
    payment: {
      title: "Einen Agenten finanzieren",
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
      copy: "Challenge → Signatur → Abschluss → On-Chain-Beleg. Der Ablauf verschwindet nie.",
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
      receiptKind: deTickName,
      consequence: "Eine begrenzte, abbrechbare Anweisung starten.",
      proofLine: "Speichert Provider-Route und Ausführungsnachweis.",
      contextTitle: "Stream vor Ergebnis.",
      fieldLabel: "Anweisung",
      fieldHint: "Begrenzt und abbrechbar; gestreamte Tokens erscheinen unten.",
      notice: "Tick für Agent #{agent} {outcome}. Stream-Beleg indexiert.",
    },
    deposit: {
      title: "In den Vault einzahlen",
      copy: "Betrag → Prüfung → On-Chain-Beleg. Der Vault-Stand bleibt sichtbar, bevor Wert fließt.",
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
      copy: "Betrag → Prüfung → On-Chain-Beleg. Der Reststand wird vor dem Signieren gezeigt.",
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
    stageTitle: "Prüfe, bevor du handelst.",
    reviewOpenLabel: "Prüfung offen",
    chainLive: "Chain {chainId}, Live-Wallet",
    reviewAction: "Vorgang prüfen",
    agentA11y: "Ziel-Agent",
    agentSelectPlaceholder: "Agent auswählen",
    agentHint:
      "Der Agent, dessen Vault oder Datensatz dieser Vorgang anspricht.",
    errAmountPositive: "Gib einen Betrag über null ein.",
    errExceedsVault: "Der Betrag übersteigt das Vault-Guthaben.",
    errInvalidAmount: "Gib einen gültigen Betrag ein.",
    errNameLength: "Verwende 2–80 Zeichen.",
    errRecipientAddress: "Der Empfänger muss eine gültige 0x-Adresse sein.",
    errRecipientKeyIsAddress:
      "Das sieht nach einer Ethereum-Adresse aus (42 Zeichen). Eine Übertragung braucht den öffentlichen Schlüssel des Empfängers (64 Byte hex, 0x-präfixiert, 130 Zeichen). Sieh „Wie erhält man ihn“ unten.",
    transferKeyWalkthroughSteps: [
      "Der Empfänger öffnet sein Wallet und wählt das Konto, das den Agenten empfangen soll",
      "Er öffnet die Kontodetails und wählt „Öffentlichen Schlüssel exportieren“",
      "Füge den kopierten Schlüssel hier ein",
    ],
    errInstruction: "Beschreibe die Anweisung.",
    errSelectAgent: "Wähle zuerst einen Agenten.",
    intentFund: "Zahlung an Agent #{agent}",
    intentProof: "Transfer ausgewählt. Empfängerdetails prüfen.",
    intentBounded: "Anweisung ausgewählt. Der Stream bleibt abbrechbar.",
    intentRecovery:
      "Ein bestehender Beleg wird wiederaufgenommen. Kein doppelter Vorgang.",
    intentReceipt: "Mit einem indexierten Beleg verknüpft.",
    cancelStream: "Stream abbrechen",
    factCost: "Kosten",
    confirmMint: "Ein Klick im Wallet, übliche Netzwerkgebühr",
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
      "Keine Bestätigung nach {seconds} s. Prüfe den Explorer; die Zeile ist als Prüfbedarf markiert.",
    receiptBodyConfirming: "Eingereicht, wartet auf On-Chain-Bestätigung.",
    receiptRemedy:
      "Zurückgesetzt oder abgelaufen? Wiederhole die Transaktion: erhöhe das Gas bei Netzüberlastung, oder prüfe deine Verbindung.",
    copyReceiptAction: "Beleg kopieren",
    openReceiptAction: "Beleg öffnen",
    startAnotherAction: "Neu beginnen",
    mintDoneHeading: "Fertig. {name} ist live!",
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
      "Bestätigung abgelaufen. Nimm die Prüfung wieder auf.",
    tickActed: "ausgeführt",
    tickHeld: "zurückgehalten",
    allowanceKind: "Freigabe-Genehmigung",
    allowanceDetail: "{amount} {symbol} → Ausgabenlimit (Schritt 1)",
    approveSentNotice:
      "Freigabe on-chain genehmigt. Signiere jetzt die Zahlung.",
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
    networkFact: "{chainName}, Chain {chainId}",
    networkFactId: "Chain {chainId}",
    primarySign: "Signieren & ausführen",
    primaryApprove: "Ausgabenlimit genehmigen",
    primaryContinuePayment: "Zur Zahlung fortfahren",
    payCta: "{amount} {symbol} zahlen",
    resumeReview: "Prüfung wieder aufnehmen",
    restartApproval: "Freigabe-Prüfung neu starten",
    editDetails: "Details bearbeiten",
    awaitingWallet: "Warten auf Wallet",
    submitTransfer: "Transfer einreichen",
    reviewDisclaimer: "Nichts wird eingereicht, bevor du im Wallet bestätigst.",
    confirmOne: "Nein, nur eine Anfrage",
    confirmTwo: "Ja, zwei Wallet-Anfragen",
    confirmTwoApprovePay: "Ja, einmal jetzt, einmal zum Zahlen",
    confirmOneAllowance: "Nein, die Freigabe reicht",
    confirmChecking: "Bis zu 2 Wallet-Anfragen (wird geprüft…)",
    confirmReceiverThenSubmit: "Zustimmung erforderlich: ja",
    transferKeyHint:
      "64 Byte Hex (0x…), der Verschlüsselungsschlüssel des neuen Eigentümers.",
    transferPubkeyFallbackSummary: "Erweitert, Schlüssel selbst einfügen",
    transferPubkeyResolvePending: "Schlüssel für diese Adresse wird gesucht…",
    transferPubkeyResolveFailed:
      "Kein öffentlicher Schlüssel on-chain für diese Adresse gefunden. Füge ihn unten manuell ein.",
    transferPubkeyResolveResolved:
      "Schlüssel on-chain gefunden. Der Empfänger kann die Nutzlast entschlüsseln.",
    transferAgentTitle: (id) => `Agent #${id} übertragen`,
    handoffTitle: "Empfänger an einem anderen Gerät?",
    handoffBody:
      "Link senden. Der Empfänger signiert; sein Ergebnis hier einfügen, dann reichst du ein.",
    handoffCopyLink: "Zustimmungs-Link kopieren",
    handoffLinkCopied: "Zustimmungs-Link kopiert. Sende ihn an den Empfänger.",
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
    receiveReceiver: "Empfänger (du)",
    receiveExpiry: "Zustimmungs-Link gültig bis",
    receiveNetwork: "Netzwerk",
    receiveExpiredTitle: "Zustimmungs-Link abgelaufen",
    receiveExpiredBody: "Link abgelaufen. Transfer neu starten lassen.",
    receiveWrongChain:
      "Dein Wallet ist in einem anderen Netzwerk. Die Zustimmung ist an Chain {chainId} gebunden.",
    receiveConnect: "Wallet verbinden",
    receiveAcceptTitle: "Prüfen, dann zum Zustimmen signieren.",
    receiveAcceptBody:
      "Du erhältst diesen Agenten mit deinem Wallet ({receiver}). Signieren zum Zustimmen, on-chain passiert nichts, bevor der Absender einreicht.",
    receiveSign: "Zustimmung signieren",
    receiveSigning: "Warten auf Signatur…",
    receiveWrongAccount: "Falsches Konto. Diese Zustimmung braucht {receiver}.",
    receiveDoneTitle: "Zustimmung signiert",
    receiveDoneBody: "Zustimmungs-Link unten an den Sender schicken.",
    receiveCopyCode: "Zustimmungs-Link kopieren",
    receiveCodeCopied: "Zustimmungs-Link kopiert.",
    receiveDoneSameBrowser:
      "Ist die Prüfung des Senders in diesem Browser offen, übernimmt sein Tab sie automatisch.",
    claimUrlLabel: "Zustimmungs-Link",
    claimRawToggle: "Erweitert, rohe Signatur",
    goHome: "Startseite",
    connectToSubmit: "Verbinde ein Wallet, um diesen Vorgang zu übermitteln.",
    mintAgentFallback: "Axiom-Agent",
    operationActions: "Aktionen des Vorgangs",
    streamStarted: "Stream gestartet.",
    streamComplete: "Stream abgeschlossen.",
    receiveCopyManual:
      "Zwischenablage nicht verfügbar: Link oben auswählen und manuell kopieren.",
    cancel: "Abbrechen",
    edit: "Bearbeiten",
    transferPhases: {
      idle: "Bereit",
      challenge: "Transfer wird vorbereitet…",
      signing: "Warten auf Signatur…",
      finalizing: "Daten werden für den Empfänger gesichert…",
      confirming: "On-Chain-Bestätigung…",
    },
    transferRetryHint: "Fehlgeschlagen. Zum Wiederholen auf Bearbeiten tippen.",
    transferErrChallenge:
      "Die Anfrage ist fehlgeschlagen. Bitte erneut versuchen.",
    transferErrSubmit:
      "Übermittlung fehlgeschlagen. Nichts wurde gesendet. Zum Wiederholen auf Bearbeiten tippen.",
    transferErrGeneric:
      "Etwas ist schiefgelaufen. Zum Neustart auf Bearbeiten tippen.",
    closeTransferA11y: "Transfer schließen",
    transferLede:
      "Du signierst einmal zur Autorisierung und bestätigst dann den On-Chain-Transfer.",
    transferReceiverLabel: "Empfängeradresse",
    transferPubkeyLabel: "Öffentlicher Schlüssel des Empfängers",
    transferPubkeyPlaceholder: "0x… (130 Zeichen: 0x + 128 Hex)",
    transferRekeySummary: "Für Empfänger neu verschlüsseln (optional)",
    transferRekeyHint:
      "Optional: AES-Schlüssel + Speicher-URI, damit nur der Empfänger die Daten nach dem Transfer lesen kann. Leer = nur signieren.",
    transferOldKeyLabel: "Alter Daten-Verschlüsselungsschlüssel (base64)",
    transferOldKeyPlaceholder: "base64 32-Byte-AES-Schlüssel",
    transferOldUriLabel: "Alte Daten-URI (0x…)",
    transferOldUriPlaceholder: "0x… Speicher-Root-Hash",
    transferErrKeyRequired: "erforderlich",
    transferErrKeyPrefix: "muss mit 0x beginnen",
    transferErrKeyLength: (length) =>
      `muss ${length} Zeichen haben (64 Roh-Bytes, ohne 0x04-Präfix)`,
    transferErrRekeyPair:
      "alten Datenschlüssel und alte Daten-URI angeben, um neu zu verschlüsseln, oder beide leer lassen",
    transferSigning: "Signierung…",
    transferSignAction: "Transfer-Autorisierung signieren",
    transferConfirmLede:
      "Bestätigen. Dein Wallet fragt die finale Signatur ab.",
    transferAuthorizedTitle: "Transfer autorisiert",
    transferAuthorizedBody:
      "die Daten des Agents wurden neu verschlüsselt, sodass nur der neue Inhaber sie lesen kann.",
    transferProofDetails: "Nachweisdetails",
    transferNewHashLabel: "Neuer Metadaten-Hash:",
    transferSealedKeyLabel: "; neuer versiegelter Schlüssel:",
    transferOwnershipProof: "Eigentumsnachweis",
    transferValidUntil: "Gültig bis",
    transferAcceptedBy: "Akzeptiert von",
    transferSubmitting: "Übermittlung…",
    transferConfirmAction: "On-Chain-Transfer bestätigen",
    transferConfirmedToast: (hash) => `Transfer ${hash}… bestätigt`,
  },
  agentDetail: {
    ...english.agentDetail,
    balanceToSpend: "Hat {amount} zum Ausgeben, bereit",
    needsSetup: "Einrichtung nötig",
    statusOnline: "online",
    statusAttention: "Achtung",
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
    openStorage: "Speicher öffnen",
    chooseBoundedOperation: "Was möchtest du tun?",
    addMoneyPrimary: "Agent finanzieren",
    runTask: "Aufgabe starten",
    moreActions: "Mehr…",
    fundAgent: "Agent finanzieren",
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
      "Änderungen behalten die Regeln und Ablaufdaten dieses Agents, nur das Tageslimit ändert sich.",
    limitTipUnbound:
      "Tipp: Setze ein Tageslimit, damit dein Agent kleine Rechnungen selbst bezahlen kann.",
    errLimitPositive: "Gib ein Tageslimit größer als null ein.",
    errLimitWallet: "Verbinde ein Wallet, um das Ausgabenlimit zu setzen.",
    copiedNotice: "Kopiert",
    limitToast: (hash) => `Ausgabenlimit übermittelt (${hash.slice(0, 10)}…)`,
    withdrawToast: (hash) => `Abhebung übermittelt (${hash.slice(0, 10)}…)`,
    ticksRun: (count) => `${count} Aufgabe${count === 1 ? "" : "n"} ausgeführt`,
    activityLoading: "Wird geladen…",
    activityEmptyTitle: "Noch nichts",
    activityEmptyHint: "Durchläufe erscheinen hier.",
    // W3-C Permit2 pay panel — terms render exactly what the signature permits.
    permit2Title: "Mit Permit2 zahlen",
    permit2Hint:
      "Einmal signieren: keine Genehmigungstransaktion. Die Signatur erlaubt dem Zahlungsprozessor, genau diesen Betrag für diesen Agenten einzuziehen.",
    permit2Cta: "Signieren & zahlen",
    payAmountLabel: "Zu zahlender Betrag",
    permit2LaneNote: (lane) =>
      lane === "permit2"
        ? "Per Permit2-Signatur abgewickelt."
        : "Über bestehende Token-Freigabe abgewickelt.",
    permit2SnapshotCap: "Zahlungslimit",
    permit2SnapshotAllowance: "Prozessor-Freigabe",
    permit2SnapshotBalance: "Dein Token-Guthaben",
    // W3-C Agent Delegation card (owner-only).
    delegationTitle: "Agent-Delegation",
    delegationHint:
      "Lasse einen Delegatenschlüssel begrenzte Vorgänge für diesen Agenten unter von dir gesetzten Limits ausführen. Von dir signiert, sofort widerrufbar.",
    delegationDelegateLabel: "Delegatenadresse",
    delegationPerTxCapLabel: "Limit pro Tx (wei)",
    delegationWindowCapLabel: "Fenster-Limit (wei)",
    delegationWindowLabel: "Fensterlänge (Sekunden)",
    delegationExpiryLabel: "Läuft ab in (Tagen)",
    delegationActive: "Aktive Delegation",
    delegationNone: "Keine aktive Delegation",
    delegationInstall: "Signieren & installieren",
    delegationRevoke: "Widerrufen",
    delegationNotConfigured:
      "Delegationsregister noch nicht konfiguriert: nach dem nächsten Deployment verfügbar.",
    delegationTargetsLabel:
      "Erlaubte Vorgänge (Contract:Selektor, einer pro Zeile)",
    delegationTargetsPlaceholder: "0x…:0x1a2b3c4d",
    delegationToast: (hash) =>
      `Delegation aktualisiert (${hash.slice(0, 10)}…)`,
    errDelegationForm: "Delegationsfelder prüfen: {error}",
    errDelegationWallet:
      "Verbinde dein Wallet, um eine Delegation zu installieren.",
  },
  transactions: {
    ...english.transactions,
    title: deTxCenterName,
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
    chainEvent: "Chain-Ereignis",
    eventDetail: "Agent #{agent}, Block {block}",
    eventDetailBlockOnly: "Block {block}",
    emptyState: "Keine Belege passen zu diesem Status.",
    emptyAll: "Noch keine Belege. Minte einen Agenten für den ersten.",
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
    viewOnExplorer: "Im Explorer ansehen",
    copyReceiptHash: "Beleg-Hash kopieren",
    receiptCopied: "Beleg-Hash kopiert.",
    receiptsCount: (shown, total) => `${shown} von ${total} Belegen`,
    filterA11y: "Belegstatus-Filter",
    clearFilter: "Filter zurücksetzen",
  },
  status: {
    label: "Status",
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
  time: {
    minutesAgo: (minutes) => `vor ${minutes} Min.`,
    hoursAgo: (hours) => `vor ${hours} Std.`,
    daysAgo: (days) => `vor ${days} T.`,
    indexed: "indexiert",
  },
  gate: {
    statusWallet: "Wallet nicht verbunden",
    statusNetwork: "falsches Netzwerk",
    previewAlt: (label) => `${label}-Vorschau`,
    previewNote: "Vorschau: Wallet verbinden für Live-Daten.",
    // deposit/withdraw: Labels wie nav.deposit/nav.withdraw.
    labels: {
      overview: "Konsolen-Übersicht",
      settings: "Sitzungseinstellungen",
      chat: "Operator-Chat",
      mint: "Agent minten",
      payment: "Zahlungsroute",
      transfer: "Transfer-Flow",
      agent: "Agent-Detail",
      roster: "Agent-Liste",
      tick: deTickName,
      deposit: "Einzahlen",
      withdraw: "Auszahlen",
    },
    rows: {
      overview: [
        { label: "Agents", value: "••• live" },
        { label: "Nächster Tick", value: "••• in Warteschlange" },
      ],
      settings: [
        { label: "Anzeige", value: "•••" },
        { label: "Sitzung", value: "••• Std." },
      ],
      chat: [
        { label: "Thread", value: "••• Turns" },
        { label: "Tools", value: "••• live" },
      ],
      mint: [
        { label: "Identität", value: "eindeutig" },
        { label: "Eigentum", value: "du" },
      ],
      payment: [
        { label: "Freigabelimit", value: "••• 0G" },
        { label: "Gebühren", value: "im Voraus" },
      ],
      transfer: [
        { label: "Co-Signatur", value: "Empfänger" },
        { label: "Ablauf", value: "erzwungen" },
      ],
      agent: [
        { label: "Identität", value: "ERC-7857" },
        { label: "Belege", value: "•••" },
      ],
      roster: [
        { label: "Liste", value: "••• Agents" },
        { label: "Details", value: "pro Agent" },
      ],
      tick: [
        { label: "Instruktion", value: "begrenzt" },
        { label: "Stream", value: "••• Tokens" },
      ],
      deposit: [
        { label: "Vault-Gas", value: "••• 0G" },
        { label: "Top-up", value: "nativ" },
      ],
      withdraw: [
        { label: "Saldo", value: "••• 0G" },
        { label: "Cooldown", value: "•••" },
      ],
    },
  },
  lockedHero: {
    app: {
      titleLead: "Deine Konsole,",
      titleEmphasis: "auf einen Blick.",
      copy: "Sieh, was deine Agenten als Nächstes brauchen.",
    },
    settings: {
      titleLead: "Konsolen-Einstellungen,",
      titleEmphasis: "nach deinen Regeln.",
      copy: "Sitzung, Anzeige und Konsolen-Präferenzen.",
    },
    chat: {
      titleLead: "Ein Chat, der dein",
      titleEmphasis: "Setup kennt.",
      copy: "Frag deine Agenten; der Chat kennt deine Sitzung.",
    },
    mint: {
      titleLead: "Benenne deinen Agenten",
      titleEmphasis: "on-chain.",
      copy: "Der gewählte Name wird eine On-Chain-Identität mit Beleg.",
    },
    payment: {
      titleLead: "Zahle genau,",
      titleEmphasis: "was du freigibst.",
      copy: "Gib exakt frei, was du zahlst; Kosten vor dem Signieren klar.",
    },
    transfer: {
      titleLead: "Transfers, die dein",
      titleEmphasis: "Empfänger co-signiert.",
      copy: "Der Empfänger co-signiert; der Ablauf wird erzwungen.",
    },
    agent: {
      titleLead: "Jeder Agent,",
      titleEmphasis: "im Detail.",
      copy: "Identität, Eigentum, Aktivität und Belege pro Agent.",
    },
    agentsList: {
      titleLead: "Alle deine Agents,",
      titleEmphasis: "eine Übersicht.",
      copy: "Verbinde dich, um deine Agents, ihre Vaults und ihre Belege zu sehen.",
    },
    tick: {
      titleLead: "Führe eine Agent-Aufgabe aus,",
      titleEmphasis: "begrenzt.",
      copy: "Gib dem Agenten eine Anweisung, er streamt das Ergebnis und stoppt.",
    },
    deposit: {
      titleLead: "Das Vault eines",
      titleEmphasis: "Agents füllen.",
      copy: "Füge natives Gas zum Vault eines Agents hinzu, bevor er läuft.",
    },
    withdraw: {
      titleLead: "Aus dem Agent-Vault",
      titleEmphasis: "abheben.",
      copy: "Ziehe Geld aus dem Vault eines Agents ab, Guthaben zuerst sichtbar.",
    },
  },
  checklist: {
    title: "Bringe deinen ersten Agenten ans Laufen",
    dismiss: "Ausblenden",
    done: "Flotte aktiv: deine Agenten sind finanziert und laufen.",
    steps: {
      mint: {
        label: "Minte deinen Agenten",
        hint: "Registriere einen Agenten: noch keine Guthaben nötig.",
      },
      deposit: {
        label: "Fülle seinen Vault",
        hint: "Füge natives Gas hinzu, damit der Agent laufen kann.",
      },
      tick: {
        label: "Starte eine Aufgabe",
        hint: "Gib eine Anweisung und sieh zu, wie der Beleg eintrifft.",
      },
    },
  },
};

export function getCopy(locale: Locale = "en"): Copy {
  const copy = locale === "fr" ? french : locale === "de" ? german : english;
  return copy;
}
