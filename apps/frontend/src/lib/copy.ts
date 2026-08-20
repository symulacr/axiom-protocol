/**
 * Axiom Copper Command Deck — typed interface copy.
 * Style reminder: operational, evidence-led, concise; keep copper actions explicit,
 * phosphor states factual, and avoid implying a live wallet or contract call.
 */

export type Locale = "en" | "fr" | "de";
export type CopyFlow =
  "mint" | "payment" | "transfer" | "tick" | "deposit" | "withdraw";

export type Copy = {
  localeName: string;
  nav: {
    howItWorks: string;
    connectWallet: string;
    returnToLanding: string;
    openConsole: string;
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
  };
  wallet: {
    connectingTitle: string;
    connectingDescription: string;
    wrongNetworkTitle: string;
    wrongNetworkDescription: string;
    switchNetwork: string;
    testTimeout: string;
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
  settings: {
    languageLabel: string;
    languageHint: string;
    localeEnglish: string;
    localeFrench: string;
    localeGerman: string;
    localFixture: string;
    walletNetwork: string;
    signingContext: string;
    simulationConfig: string;
    explicitFixtures: string;
    compactRail: string;
    compactRailHint: string;
    reducedMotion: string;
    reducedMotionHint: string;
    railHidden: string;
    railHiddenHint: string;
    railWidth: string;
    railWidthHint: string;
    density: string;
    theme: string;
    themeHint: string;
    themeDark: string;
    themeLight: string;
    fixtureWallet: string;
    direction: string;
    replayOnboarding: string;
    resetSurface: string;
    reviewStakingBoundary: string;
    lockConsole: string;
  };
  dashboard: {
    eyebrow: string;
    titleLead: string;
    titleEmphasis: string;
    description: string;
    review: (count: number) => string;
    reviewAction: string;
    refresh: string;
    managedValue: string;
    agentsOnline: string;
    storageProofs: string;
    liveQueue: string;
    agentRegister: string;
    operatingFleet: string;
    openRegister: string;
    proofLane: string;
    attentionFirst: string;
    allowanceReady: string;
    allowanceDescription: string;
    openPayment: string;
    recentStore: string;
    latestEvidence: string;
    allReceipts: string;
  };
  chat: {
    eyebrow: string;
    titleLead: string;
    titleEmphasis: string;
    description: string;
    providerFixed: string;
    viewRouteDetails: string;
    emptyThread: string;
    placeholder: string;
    sendHint: string;
    send: string;
    resetThread: string;
    resetNotice: string;
    inputRequired: string;
    acknowledged: string;
    fixtureProvider: string;
    routeNoLiveCall: string;
    threads: string;
    conversations: string;
    needsDecision: string;
    updatedToday: string;
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
    encryptPayload: string;
    proofComplete: string;
    continueStep: string;
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
    activityFor: (agent: string) => string;
    evidenceTied: string;
  };
  transactions: {
    eyebrow: string;
    title: string;
    description: string;
    refreshState: string;
    refreshNotice: string;
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
    returnToLanding: "Return to landing",
    openConsole: "Open console",
  },
  landing: {
    eyebrow: "AXIOM / VERIFIED OPERATOR CONSOLE",
    titleLead: "Move with",
    titleEmphasis: "evidence.",
    description:
      "Connect a wallet, review the next operator action and keep its proof beside it. Every state is labeled; this prototype never implies a live transaction.",
    prototypeNote:
      "Prototype mode: wallet, network, signature and transaction boundaries are visible before console access.",
    nextSafeAction: "NEXT SAFE ACTION / AMBIENT LOOP",
    heroTitle: "Verify the operator before the action.",
    walletContext: "Wallet context",
    signatureBoundary: "Signature boundary",
    consoleAccess: "Console access",
    stakingBoundary: "Staking is not part of Axiom yet.",
  },
  wallet: {
    connectingTitle: "Reading wallet context.",
    connectingDescription:
      "Checking the wallet address, connector and target network.",
    wrongNetworkTitle: "Switch to 0G Mainnet.",
    wrongNetworkDescription:
      "The wallet is connected, but it is on a different network. Switch before signing the access message.",
    switchNetwork: "Switch to 0G Mainnet",
    testTimeout: "Test a timeout",
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
  settings: {
    languageLabel: "Interface language",
    languageHint:
      "Changes labels and plural forms without changing the simulated network.",
    localeEnglish: "English",
    localeFrench: "Français",
    localeGerman: "Deutsch",
    localFixture: "local fixture",
    walletNetwork: "WALLET & NETWORK",
    signingContext: "Signing context",
    simulationConfig: "SIMULATION CONFIG",
    explicitFixtures: "Explicit fixtures",
    compactRail: "Compact command rail",
    compactRailHint: "Keep labels available while giving work more room.",
    reducedMotion: "Reduced motion",
    reducedMotionHint: "Keep status and guide transitions instant.",
    railHidden: "Rail hidden",
    railHiddenHint: "Reopen from the vertical edge control.",
    railWidth: "Rail width",
    railWidthHint: "drag to tune the command surface.",
    density: "Density",
    theme: "Surface theme",
    themeHint:
      "Keep operational contrast legible in either working environment.",
    themeDark: "Graphite",
    themeLight: "Paper",
    fixtureWallet: "Fixture wallet",
    direction: "Direction",
    replayOnboarding: "Replay onboarding",
    resetSurface: "Reset surface",
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
    reviewAction: "Review Northstar",
    refresh: "Refresh overview",
    managedValue: "Managed value",
    agentsOnline: "Agents online",
    storageProofs: "Storage proofs",
    liveQueue: "Live queue",
    agentRegister: "AGENT REGISTER / 04",
    operatingFleet: "Operating fleet",
    openRegister: "Open register",
    proofLane: "PROOF LANE / 01",
    attentionFirst: "Attention first",
    allowanceReady: "Allowance is ready for review.",
    allowanceDescription:
      "Exact amount, destination and processor route are known. The next action opens the payment evidence flow.",
    openPayment: "Open payment route",
    recentStore: "RECENT / SHARED STORE",
    latestEvidence: "Latest evidence",
    allReceipts: "All receipts",
  },
  chat: {
    eyebrow: "CHAT / OPERATOR CONTEXT",
    titleLead: "Ask the",
    titleEmphasis: "surface.",
    description:
      "Threads are local prototype conversations; responses never call a live provider.",
    providerFixed: "Provider / fixture route",
    viewRouteDetails: "View route details",
    emptyThread:
      "This thread is empty. Ask about an agent, route or proof to start a local conversation.",
    placeholder: "Ask about an agent, route or proof…",
    sendHint: "Enter to send, Shift+Enter for a new line.",
    send: "Send",
    resetThread: "New thread",
    resetNotice:
      "New thread ready. The previous messages were cleared from this prototype view.",
    inputRequired: "Enter a message before sending.",
    acknowledged:
      "Acknowledged. I can route this to the selected agent, but no provider call is made in the cloud mockup.",
    fixtureProvider: "fixture provider",
    routeNoLiveCall: "Axiom route / no live call",
    threads: "THREADS / 03",
    conversations: "Conversations",
    needsDecision: "Needs operator decision",
    updatedToday: "Updated today",
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
    encryptPayload: "Encrypt payload",
    proofComplete: "Storage proof complete",
    continueStep: "Continue to next storage step",
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
      "Fixture mirrors the adapter shape; replication and pinning are not claimed.",
    pending: "pending",
    notIndexed: "not indexed",
    fixture: "fixture / explicit",
  },
  flows: {
    mint: {
      eyebrow: "MINT / PROVENANCE BOUNDARY",
      title: "Mint an agent",
      copy: "Name → hash → oracle acknowledgement → calldata → receipt.",
      steps: [
        "Name + payload",
        "dataHash derived",
        "Oracle accepted",
        "Sign transaction",
        "Receipt + agent",
      ],
    },
    payment: {
      eyebrow: "PAYMENT / ALLOWANCE ROUTE",
      title: "Fund with context",
      copy: "Token, exact allowance, fee, royalty and event decoding stay visible before completion.",
      steps: [
        "Amount + token",
        "Exact approval",
        "Approval receipt",
        "PayForAgent",
        "Event decoded",
      ],
    },
    transfer: {
      eyebrow: "TRANSFER / EIP-712 PROOF",
      title: "Transfer with evidence",
      copy: "Challenge → signature → finalization → on-chain receipt. Expiration never disappears.",
      steps: [
        "Recipient + dataHash",
        "Challenge",
        "EIP-712 sign",
        "Finalize proof",
        "On-chain receipt",
      ],
    },
    tick: {
      eyebrow: "ORCHESTRATOR / STREAM",
      title: "Run the next tick",
      copy: "Intent → provider → stream → result → event or transaction → recovery.",
      steps: [
        "Instruction",
        "Provider route",
        "Streaming",
        "Result",
        "Event / recovery",
      ],
    },
    deposit: {
      eyebrow: "VAULT / DEPOSIT ROUTE",
      title: "Deposit into the vault",
      copy: "Amount → review → wallet boundary → on-chain receipt. The vault balance stays visible before value moves.",
      steps: [
        "Amount + agent",
        "Review sheet",
        "Wallet signature",
        "Vault deposit",
        "Receipt indexed",
      ],
    },
    withdraw: {
      eyebrow: "VAULT / WITHDRAW ROUTE",
      title: "Withdraw from the vault",
      copy: "Amount → review → wallet boundary → on-chain receipt. The remaining balance is shown before you sign.",
      steps: [
        "Amount + agent",
        "Review sheet",
        "Wallet signature",
        "Vault withdraw",
        "Receipt indexed",
      ],
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
  },
  agentDetail: {
    executionSurface: "operator-controlled execution surface.",
    operatingBalance: "OPERATING BALANCE",
    vaultRoute: "vault route · 0G Mainnet · chain 16661",
    dataHash: "DATA HASH",
    overview: "Overview",
    execute: "Execute",
    payments: "Payments",
    activity: "Activity",
    identityProvenance: "IDENTITY / PROVENANCE",
    agentRecord: "Agent record",
    owner: "Owner",
    agentId: "Agent ID",
    metadataRoot: "Metadata root",
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
    activityFor: (agent) => `ACTIVITY / ${agent.toUpperCase()}`,
    evidenceTied: "Evidence tied to this agent",
  },
  transactions: {
    eyebrow: "OPERATIONS / RECEIPTS",
    title: "Transaction center",
    description: "Every signature has a state, a source and a recovery path.",
    refreshState: "Refresh state",
    refreshNotice: "Receipt index revalidated. Pending states remain pending.",
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
    returnToLanding: "Retour à l’accueil",
    openConsole: "Ouvrir la console",
  },
  landing: {
    eyebrow: "AXIOM / CONSOLE OPÉRATEUR VÉRIFIÉE",
    titleLead: "Avancez avec",
    titleEmphasis: "des preuves.",
    description:
      "Connectez un wallet, examinez la prochaine action opérateur et gardez sa preuve à côté. Chaque état est explicite ; ce prototype ne simule jamais une transaction réelle.",
    prototypeNote:
      "Mode prototype : wallet, réseau, signature et limites transactionnelles sont visibles avant l’accès à la console.",
    nextSafeAction: "PROCHAINE ACTION SÛRE / BOUCLE AMBIANTE",
    heroTitle: "Vérifiez l’opérateur avant l’action.",
    walletContext: "Contexte wallet",
    signatureBoundary: "Limite de signature",
    consoleAccess: "Accès console",
    stakingBoundary: "Le staking ne fait pas encore partie d’Axiom.",
  },
  wallet: {
    connectingTitle: "Lecture du contexte wallet.",
    connectingDescription:
      "Vérification de l’adresse, du connecteur et du réseau cible.",
    wrongNetworkTitle: "Passez sur 0G Mainnet.",
    wrongNetworkDescription:
      "Le wallet est connecté, mais utilise un autre réseau. Changez de réseau avant de signer le message d’accès.",
    switchNetwork: "Passer sur 0G Mainnet",
    testTimeout: "Tester un timeout",
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
  settings: {
    languageLabel: "Langue de l’interface",
    languageHint:
      "Modifie les libellés et les pluriels sans changer le réseau simulé.",
    localeEnglish: "English",
    localeFrench: "Français",
    localeGerman: "Deutsch",
    localFixture: "fixture locale",
    walletNetwork: "WALLET & RÉSEAU",
    signingContext: "Contexte de signature",
    simulationConfig: "CONFIGURATION SIMULÉE",
    explicitFixtures: "Fixtures explicites",
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
    theme: "Thème de surface",
    themeHint:
      "Préserve un contraste opérateur lisible dans chaque environnement de travail.",
    themeDark: "Graphite",
    themeLight: "Papier",
    fixtureWallet: "Wallet fixture",
    direction: "Direction",
    replayOnboarding: "Rejouer l’onboarding",
    resetSurface: "Réinitialiser la surface",
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
    reviewAction: "Revoir Northstar",
    refresh: "Actualiser la vue",
    managedValue: "Valeur gérée",
    agentsOnline: "Agents en ligne",
    storageProofs: "Preuves Storage",
    liveQueue: "File active",
    agentRegister: "REGISTRE AGENTS / 04",
    operatingFleet: "Flotte active",
    openRegister: "Ouvrir le registre",
    proofLane: "COULOIR DE PREUVE / 01",
    attentionFirst: "Attention d’abord",
    allowanceReady: "L’approbation est prête à être revue.",
    allowanceDescription:
      "Montant exact, destination et route du processeur sont connus. L’action suivante ouvre la preuve de paiement.",
    openPayment: "Ouvrir la route de paiement",
    recentStore: "RÉCENT / STORE PARTAGÉ",
    latestEvidence: "Dernières preuves",
    allReceipts: "Tous les reçus",
  },
  chat: {
    eyebrow: "CHAT / CONTEXTE OPÉRATEUR",
    titleLead: "Interrogez la",
    titleEmphasis: "surface.",
    description:
      "Les threads sont des conversations locales du prototype ; les réponses n’appellent jamais un fournisseur réel.",
    providerFixed: "Fournisseur / route fixture",
    viewRouteDetails: "Voir les détails de la route",
    emptyThread:
      "Ce thread est vide. Demandez un agent, une route ou une preuve pour démarrer une conversation locale.",
    placeholder: "Demander un agent, une route ou une preuve…",
    sendHint: "Entrée pour envoyer, Maj+Entrée pour passer à la ligne.",
    send: "Envoyer",
    resetThread: "Nouveau thread",
    resetNotice:
      "Nouveau thread prêt. Les messages précédents ont été effacés de cette vue prototype.",
    inputRequired: "Saisissez un message avant l’envoi.",
    acknowledged:
      "Reçu. Je peux router cette demande vers l’agent sélectionné, mais aucun appel fournisseur n’est effectué dans le mockup cloud.",
    fixtureProvider: "fournisseur fixture",
    routeNoLiveCall: "Route Axiom / aucun appel réel",
    threads: "THREADS / 03",
    conversations: "Conversations",
    needsDecision: "Décision opérateur requise",
    updatedToday: "Mis à jour aujourd’hui",
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
    encryptPayload: "Chiffrer le payload",
    proofComplete: "Preuve Storage terminée",
    continueStep: "Passer à l’étape Storage suivante",
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
      "La fixture reprend la forme de l’adaptateur ; aucune réplication ni pinning n’est revendiquée.",
    pending: "en attente",
    notIndexed: "non indexé",
    fixture: "fixture / explicite",
  },
  flows: {
    mint: {
      eyebrow: "MINT / LIMITE DE PROVENANCE",
      title: "Créer un agent",
      copy: "Nom → hash → accord oracle → calldata → reçu.",
      steps: [
        "Nom + payload",
        "dataHash dérivé",
        "Oracle accepté",
        "Signer la transaction",
        "Reçu + agent",
      ],
    },
    payment: {
      eyebrow: "PAIEMENT / ROUTE D’APPROBATION",
      title: "Financer avec contexte",
      copy: "Token, approbation exacte, frais, royalty et événements restent visibles avant la fin.",
      steps: [
        "Montant + token",
        "Approbation exacte",
        "Reçu d’approbation",
        "PayForAgent",
        "Événement décodé",
      ],
    },
    transfer: {
      eyebrow: "TRANSFERT / PREUVE EIP-712",
      title: "Transférer avec preuve",
      copy: "Challenge → signature → finalisation → reçu on-chain. L’expiration reste visible.",
      steps: [
        "Destinataire + dataHash",
        "Challenge",
        "Signature EIP-712",
        "Finaliser la preuve",
        "Reçu on-chain",
      ],
    },
    tick: {
      eyebrow: "ORCHESTRATEUR / FLUX",
      title: "Lancer le prochain tick",
      copy: "Intention → fournisseur → flux → résultat → événement ou transaction → récupération.",
      steps: [
        "Instruction",
        "Route fournisseur",
        "Flux",
        "Résultat",
        "Événement / récupération",
      ],
    },
    deposit: {
      eyebrow: "VAULT / ROUTE DE DÉPÔT",
      title: "Déposer dans le vault",
      copy: "Montant → revue → limite wallet → reçu on-chain. Le solde du vault reste visible avant le transfert.",
      steps: [
        "Montant + agent",
        "Fiche de revue",
        "Signature wallet",
        "Dépôt vault",
        "Reçu indexé",
      ],
    },
    withdraw: {
      eyebrow: "VAULT / ROUTE DE RETRAIT",
      title: "Retirer du vault",
      copy: "Montant → revue → limite wallet → reçu on-chain. Le solde restant est affiché avant la signature.",
      steps: [
        "Montant + agent",
        "Fiche de revue",
        "Signature wallet",
        "Retrait vault",
        "Reçu indexé",
      ],
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
  },
  agentDetail: {
    executionSurface: "surface d’exécution contrôlée par l’opérateur.",
    operatingBalance: "SOLDE D’EXPLOITATION",
    vaultRoute: "route du vault · 0G Mainnet · chaîne 16661",
    dataHash: "DATA HASH",
    overview: "Vue d’ensemble",
    execute: "Exécuter",
    payments: "Paiements",
    activity: "Activité",
    identityProvenance: "IDENTITÉ / PROVENANCE",
    agentRecord: "Fiche agent",
    owner: "Propriétaire",
    agentId: "ID agent",
    metadataRoot: "Racine de métadonnées",
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
    returnToLanding: "Zur Startseite",
    openConsole: "Konsole öffnen",
  },
  landing: {
    eyebrow: "AXIOM / VERIFIZIERTE OPERATOR-KONSOLE",
    titleLead: "Handle mit",
    titleEmphasis: "Belegen.",
    description:
      "Verbinde ein Wallet, prüfe die nächste Operator-Aktion und halte den Nachweis daneben. Jeder Status ist sichtbar; dieser Prototyp behauptet keine echte Transaktion.",
    prototypeNote:
      "Prototyp-Modus: Wallet, Netzwerk, Signatur und Transaktionsgrenzen sind vor dem Konsolenzugriff sichtbar.",
    nextSafeAction: "NÄCHSTE SICHERE AKTION / AMBIENT LOOP",
    heroTitle: "Prüfe den Operator vor der Aktion.",
    walletContext: "Wallet-Kontext",
    signatureBoundary: "Signaturgrenze",
    consoleAccess: "Konsolenzugriff",
    stakingBoundary: "Staking gehört noch nicht zu Axiom.",
  },
  wallet: {
    connectingTitle: "Wallet-Kontext wird gelesen.",
    connectingDescription:
      "Adresse, Connector und Zielnetzwerk werden geprüft.",
    wrongNetworkTitle: "Zu 0G Mainnet wechseln.",
    wrongNetworkDescription:
      "Das Wallet ist verbunden, verwendet aber ein anderes Netzwerk. Wechsle vor der Signatur der Zugriffsnachricht.",
    switchNetwork: "Zu 0G Mainnet wechseln",
    testTimeout: "Timeout testen",
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
  settings: {
    languageLabel: "Sprache der Oberfläche",
    languageHint:
      "Ändert Beschriftungen und Pluralformen, nicht das simulierte Netzwerk.",
    localeEnglish: "English",
    localeFrench: "Français",
    localeGerman: "Deutsch",
    localFixture: "lokale Fixture",
    walletNetwork: "WALLET & NETZWERK",
    signingContext: "Signaturkontext",
    simulationConfig: "SIMULATIONS-KONFIGURATION",
    explicitFixtures: "Explizite Fixtures",
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
    theme: "Oberflächenthema",
    themeHint: "Sichert lesbaren Bedienkontrast in jeder Arbeitsumgebung.",
    themeDark: "Graphit",
    themeLight: "Papier",
    fixtureWallet: "Fixture-Wallet",
    direction: "Richtung",
    replayOnboarding: "Onboarding wiederholen",
    resetSurface: "Oberfläche zurücksetzen",
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
    reviewAction: "Northstar prüfen",
    refresh: "Übersicht aktualisieren",
    managedValue: "Verwalteter Wert",
    agentsOnline: "Agents online",
    storageProofs: "Storage-Beweise",
    liveQueue: "Aktive Warteschlange",
    agentRegister: "AGENTENREGISTER / 04",
    operatingFleet: "Aktive Flotte",
    openRegister: "Register öffnen",
    proofLane: "BEWEIS-SPUR / 01",
    attentionFirst: "Aufmerksamkeit zuerst",
    allowanceReady: "Die Freigabe kann geprüft werden.",
    allowanceDescription:
      "Exakter Betrag, Ziel und Prozessor-Route sind bekannt. Die nächste Aktion öffnet den Zahlungsnachweis.",
    openPayment: "Zahlungsroute öffnen",
    recentStore: "AKTUELL / GEMEINSAMER STORE",
    latestEvidence: "Neueste Belege",
    allReceipts: "Alle Belege",
  },
  chat: {
    eyebrow: "CHAT / LOKALER OPERATOR-KONTEXT",
    titleLead: "Frage die",
    titleEmphasis: "Oberfläche.",
    description:
      "Routen-Kontext, Agentenstatus und Beweisfragen bleiben in einem lokalen Thread. Dieser Prototyp ruft keinen Live-Provider auf.",
    providerFixed: "Provider / Fixture-Route",
    viewRouteDetails: "Routendetails anzeigen",
    emptyThread:
      "Dieser Thread ist leer. Frage nach einem Agenten, einer Route oder einem Beleg, um eine lokale Unterhaltung zu starten.",
    placeholder: "Nach Agent, Route oder Beleg fragen…",
    sendHint: "Enter zum Senden, Umschalt+Enter für einen Zeilenumbruch.",
    send: "Senden",
    resetThread: "Neuer Thread",
    resetNotice:
      "Neuer Thread bereit. Die vorherigen Nachrichten wurden aus dieser Prototyp-Ansicht gelöscht.",
    inputRequired: "Gib vor dem Senden eine Nachricht ein.",
    acknowledged:
      "Verstanden. Ich kann die Anfrage an den ausgewählten Agenten routen, aber im Cloud-Mockup erfolgt kein Provider-Aufruf.",
    fixtureProvider: "Fixture-Provider",
    routeNoLiveCall: "Axiom-Route / kein Live-Aufruf",
    threads: "THREADS / 03",
    conversations: "Unterhaltungen",
    needsDecision: "Operator-Entscheidung erforderlich",
    updatedToday: "Heute aktualisiert",
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
    encryptPayload: "Payload verschlüsseln",
    proofComplete: "Storage-Beleg vollständig",
    continueStep: "Zum nächsten Storage-Schritt",
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
      "Die Fixture bildet die Adapterform ab; Replikation und Pinning werden nicht behauptet.",
    pending: "ausstehend",
    notIndexed: "nicht indexiert",
    fixture: "Fixture / explizit",
  },
  flows: {
    mint: {
      eyebrow: "MINT / PROVENANCE-GRENZE",
      title: "Agent minten",
      copy: "Name → Hash → Oracle-Bestätigung → Calldata → Beleg.",
      steps: [
        "Name + Payload",
        "dataHash abgeleitet",
        "Oracle akzeptiert",
        "Transaktion signieren",
        "Beleg + Agent",
      ],
    },
    payment: {
      eyebrow: "PAYMENT / FREIGABE-ROUTE",
      title: "Mit Kontext finanzieren",
      copy: "Token, exakte Freigabe, Gebühr, Royalty und Ereignisse bleiben sichtbar.",
      steps: [
        "Betrag + Token",
        "Exakte Freigabe",
        "Freigabe-Beleg",
        "PayForAgent",
        "Ereignis dekodiert",
      ],
    },
    transfer: {
      eyebrow: "TRANSFER / EIP-712-BELEG",
      title: "Mit Nachweis übertragen",
      copy: "Challenge → Signatur → Abschluss → On-Chain-Beleg. Der Ablauf bleibt nachvollziehbar.",
      steps: [
        "Empfänger + dataHash",
        "Challenge",
        "EIP-712 signieren",
        "Beleg abschließen",
        "On-Chain-Beleg",
      ],
    },
    tick: {
      eyebrow: "ORCHESTRATOR / STREAM",
      title: "Nächsten Tick ausführen",
      copy: "Absicht → Provider → Stream → Ergebnis → Ereignis oder Transaktion → Recovery.",
      steps: [
        "Anweisung",
        "Provider-Route",
        "Streaming",
        "Ergebnis",
        "Ereignis / Recovery",
      ],
    },
    deposit: {
      eyebrow: "VAULT / EINZAHLUNGSROUTE",
      title: "In den Vault einzahlen",
      copy: "Betrag → Prüfung → Wallet-Grenze → On-Chain-Beleg. Der Vault-Stand bleibt sichtbar, bevor Wert fließt.",
      steps: [
        "Betrag + Agent",
        "Prüfblatt",
        "Wallet-Signatur",
        "Vault-Einzahlung",
        "Beleg indexiert",
      ],
    },
    withdraw: {
      eyebrow: "VAULT / AUSZAHLUNGSROUTE",
      title: "Aus dem Vault auszahlen",
      copy: "Betrag → Prüfung → Wallet-Grenze → On-Chain-Beleg. Der Reststand wird vor dem Signieren gezeigt.",
      steps: [
        "Betrag + Agent",
        "Prüfblatt",
        "Wallet-Signatur",
        "Vault-Auszahlung",
        "Beleg indexiert",
      ],
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
  },
  agentDetail: {
    executionSurface: "operatorgesteuerte Ausführungsoberfläche.",
    operatingBalance: "BETRIEBSGUTHABEN",
    vaultRoute: "Vault-Route · 0G Mainnet · Chain 16661",
    dataHash: "DATA-HASH",
    overview: "Übersicht",
    execute: "Ausführen",
    payments: "Zahlungen",
    activity: "Aktivität",
    identityProvenance: "IDENTITÄT / PROVENIENZ",
    agentRecord: "Agentenakte",
    owner: "Inhaber",
    agentId: "Agent-ID",
    metadataRoot: "Metadaten-Root",
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
    chat: {
      ...copy.chat,
      threads: withoutSequence(copy.chat.threads),
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
