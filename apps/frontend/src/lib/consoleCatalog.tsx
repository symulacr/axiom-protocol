/* Flow + locked-route metadata. */
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
 * assets FlowPage/uiStore still consume (02: one copy owner). */
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
    boundary: string;
    artifact: string;
    next: string;
    media: string;
    proofs: string[];
  }
> = {
  "/app": {
    slug: "overview",
    label: "OVERVIEW / CONSOLE",
    title: "See the next",
    emphasis: "safe action.",
    copy: "See what your agents need next.",
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
  },
  "/settings": {
    slug: "settings",
    label: "SETTINGS / CONTROL PLANE",
    title: "Guard the",
    emphasis: "control plane.",
    copy: "Session, display and console preferences.",
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
  },
  "/transactions": {
    slug: "transactions",
    label: "TRANSACTIONS / RECEIPTS",
    title: "Trace every",
    emphasis: "receipt.",
    copy: "Every receipt, its state, and recovery.",
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
  },
  "/chat": {
    slug: "chat",
    label: "CHAT / OPERATOR STATE",
    title: "Ask from",
    emphasis: "context.",
    copy: "Ask about your agents — chat knows your session.",
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
  },
  "/mint": {
    slug: "mint",
    label: "MINT / PROVENANCE",
    title: "Prove the",
    emphasis: "identity.",
    copy: "Your name becomes an on-chain identity with a receipt.",
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
  },
  "/payment": {
    slug: "payment",
    label: "PAYMENT / ALLOWANCE",
    title: "Fund the",
    emphasis: "route.",
    copy: "Approve exactly what you pay — fees shown up front.",
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
  },
  "/transfer": {
    slug: "transfer",
    label: "TRANSFER / FINALITY",
    title: "Carry the",
    emphasis: "proof.",
    copy: "Receiver co-signs; expiry is enforced.",
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
  },
  "/storage": {
    slug: "storage",
    label: "STORAGE / PROVENANCE",
    title: "Keep the",
    emphasis: "evidence.",
    copy: "Every storage step is verifiable, not a success badge.",
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
  },
  "/agents/": {
    slug: "agent",
    label: "AGENT / DETAIL",
    title: "Inspect the",
    emphasis: "operator.",
    copy: "Identity, ownership, activity and receipts per agent.",
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
  },
};
