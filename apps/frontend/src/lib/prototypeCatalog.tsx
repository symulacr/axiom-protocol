/* Flow + locked-route metadata ported from the v2 mockup (fixture agent list
 * removed — the register is live via useAgents/usePortfolio). */
import {
  Bot,
  CreditCard,
  Play,
  ShieldCheck,
  UploadCloud,
  Wallet,
} from "../components/axiom/icons";
import type { FlowKind } from "./models";
import { MEDIA } from "./media";

/* Text lives in copy.flows (localized); flowMeta keeps only the visual
 * assets FlowPage/uiStore still consume (02 FINDING-022: one copy owner). */
export const flowMeta: Record<
  FlowKind,
  {
    media: string;
    artifact: string;
    icon: React.ReactNode;
  }
> = {
  mint: {
    media: MEDIA.mint,
    artifact: "IDENTITY / HASH",
    icon: <Bot size={18} />,
  },
  payment: {
    media: MEDIA.payment,
    artifact: "ALLOWANCE / VALUE",
    icon: <CreditCard size={18} />,
  },
  transfer: {
    media: MEDIA.transfer,
    artifact: "CHALLENGE / FINALITY",
    icon: <ShieldCheck size={18} />,
  },
  tick: {
    media: MEDIA.proof,
    artifact: "STREAM / RECOVERY",
    icon: <Play size={18} />,
  },
  deposit: {
    media: MEDIA.payment,
    artifact: "VAULT / VALUE",
    icon: <Wallet size={18} />,
  },
  withdraw: {
    media: MEDIA.transfer,
    artifact: "VAULT / BALANCE",
    icon: <UploadCloud size={18} />,
  },
};

export const lockedRouteMeta: Record<
  string,
  {
    slug: string;
    label: string;
    title: string;
    emphasis: string;
    copy: string;
    risk: string;
    cta: string;
    boundary: string;
    artifact: string;
    next: string;
    media: string;
    proofs: string[];
    evidenceValue: string;
    evidenceNote: string;
  }
> = {
  "/app": {
    slug: "overview",
    label: "OVERVIEW / CONSOLE",
    title: "See the next",
    emphasis: "safe action.",
    copy: "The command overview resolves agent health, active exposure and the one decision that should happen next.",
    risk: "Exposure is held until the operator session can be attributed.",
    cta: "Verify operator health",
    boundary: "SIGNATURE BOUNDARY",
    artifact: "HEALTH / NEXT ACTION",
    next: "Agent health / safe action",
    media: MEDIA.proof,
    proofs: [
      "Wallet context",
      "Network match",
      "Session signature",
      "Console profile",
    ],
    evidenceValue: "HEALTH: HELD",
    evidenceNote: "Operator health resolves after signed session.",
  },
  "/settings": {
    slug: "settings",
    label: "SETTINGS / CONTROL PLANE",
    title: "Guard the",
    emphasis: "control plane.",
    copy: "Settings governs session posture, display preferences and the console controls an operator can safely rely on.",
    risk: "Preference and session changes remain attributable to the signed operator.",
    cta: "Verify control plane",
    boundary: "SIGNATURE BOUNDARY",
    artifact: "SESSION / PREFERENCES",
    next: "Session / preferences / controls",
    media: MEDIA.recovery,
    proofs: [
      "Wallet context",
      "Session posture",
      "Preference scope",
      "Recovery control",
    ],
    evidenceValue: "CONTROL: HELD",
    evidenceNote:
      "Operator controls resolve after the local session is verified.",
  },
  "/transactions": {
    slug: "transactions",
    label: "TRANSACTIONS / RECEIPTS",
    title: "Trace every",
    emphasis: "receipt.",
    copy: "Transactions opens into approvals, signatures, receipts and recovery boundaries instead of a generic dashboard surface.",
    risk: "Receipt finality cannot be asserted before the wallet context is verified.",
    cta: "Verify receipt context",
    boundary: "SIGNATURE BOUNDARY",
    artifact: "RECEIPT / FINALITY",
    next: "Receipt / finality / recovery",
    media: MEDIA.transfer,
    proofs: [
      "Wallet context",
      "Receipt index",
      "Event decoding",
      "Recovery path",
    ],
    evidenceValue: "RECEIPT: 0xA82…91C",
    evidenceNote:
      "Receipt finality remains unavailable until wallet context is verified.",
  },
  "/chat": {
    slug: "chat",
    label: "CHAT / OPERATOR STATE",
    title: "Ask from",
    emphasis: "context.",
    copy: "Chat carries operator health, linked agent context and the next reviewable decision into every response instead of starting from an empty prompt.",
    risk: "Live operator context must be verified before a prompt can influence a reviewable decision.",
    cta: "Verify operator context",
    boundary: "SIGNATURE BOUNDARY",
    artifact: "HEALTH / CONTEXT",
    next: "Health / prompt / review",
    media: MEDIA.onboarding,
    proofs: [
      "Wallet context",
      "Operator health",
      "Agent context",
      "Reviewable response",
    ],
    evidenceValue: "SESSION: UNRESOLVED",
    evidenceNote:
      "Live operator context is available only after a signed local session is established.",
  },
  "/mint": {
    slug: "mint",
    label: "MINT / PROVENANCE",
    title: "Prove the",
    emphasis: "identity.",
    copy: "Mint keeps payload, metadata hash, oracle acknowledgement and ownership evidence visible before an agent exists.",
    risk: "Identity cannot be created until its payload is attributable to an operator.",
    cta: "Verify provenance context",
    boundary: "SIGNATURE BOUNDARY",
    artifact: "PAYLOAD / HASH",
    next: "Payload / hash / receipt",
    media: MEDIA.mint,
    proofs: [
      "Wallet context",
      "Metadata payload",
      "Oracle acknowledgement",
      "Mint receipt",
    ],
    evidenceValue: "HASH: PENDING",
    evidenceNote:
      "Metadata hash is calculated only after the payload is signed.",
  },
  "/payment": {
    slug: "payment",
    label: "PAYMENT / ALLOWANCE",
    title: "Fund the",
    emphasis: "route.",
    copy: "Payment separates exact ERC-20 approval from value transfer, protocol fee, royalty and decoded earnings.",
    risk: "No allowance or transfer is exposed until the accountable operator context is verified.",
    cta: "Verify allowance context",
    boundary: "SIGNATURE BOUNDARY",
    artifact: "ALLOWANCE / VALUE",
    next: "Allowance / payment / event",
    media: MEDIA.payment,
    proofs: [
      "Wallet context",
      "Exact allowance",
      "Payment receipt",
      "Earnings event",
    ],
    evidenceValue: "ALLOWANCE: UNISSUED",
    evidenceNote: "No spending approval has been issued for this route.",
  },
  "/transfer": {
    slug: "transfer",
    label: "TRANSFER / FINALITY",
    title: "Carry the",
    emphasis: "proof.",
    copy: "Transfer keeps challenge, signature, expiration and on-chain finality visible as one accountable path.",
    risk: "A transfer challenge is not issued until identity and recipient evidence can be attributed.",
    cta: "Verify finality context",
    boundary: "SIGNATURE BOUNDARY",
    artifact: "CHALLENGE / FINALITY",
    next: "Challenge / signature / finality",
    media: MEDIA.transfer,
    proofs: [
      "Wallet context",
      "Challenge nonce",
      "Signed challenge",
      "Finality receipt",
    ],
    evidenceValue: "NONCE: UNISSUED",
    evidenceNote:
      "A challenge is issued only after identity and recipient evidence match.",
  },
  "/storage": {
    slug: "storage",
    label: "STORAGE / PROVENANCE",
    title: "Keep the",
    emphasis: "evidence.",
    copy: "Storage exposes encryption, root hash, transaction, proof and index availability rather than hiding provenance behind a card.",
    risk: "The published root remains unavailable until its storage intent is attributable.",
    cta: "Verify storage context",
    boundary: "SIGNATURE BOUNDARY",
    artifact: "ROOT / INTEGRITY",
    next: "Encryption / root / integrity",
    media: MEDIA.proof,
    proofs: [
      "Wallet context",
      "Encrypted payload",
      "Root hash",
      "Proof + index",
    ],
    evidenceValue: "ROOT: UNPUBLISHED",
    evidenceNote:
      "The encrypted root appears only once the payload is published to 0G Storage.",
  },
  "/agents/": {
    slug: "agent",
    label: "AGENT / DETAIL",
    title: "Inspect the",
    emphasis: "operator.",
    copy: "Agent detail is ready to connect identity, ownership, activity, commands and receipt history after session verification.",
    risk: "Agent authority remains held until its owner and command capability are attributable.",
    cta: "Verify agent authority",
    boundary: "SIGNATURE BOUNDARY",
    artifact: "IDENTITY / ACTIVITY",
    next: "Identity / command / receipt",
    media: MEDIA.onboarding,
    proofs: [
      "Wallet context",
      "Agent identity",
      "Command capability",
      "Activity receipt",
    ],
    evidenceValue: "AGENT: LOCKED",
    evidenceNote:
      "Identity and activity records unlock together after the session signature.",
  },
};
