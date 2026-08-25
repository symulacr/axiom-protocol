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
    icon: React.ReactNode;
  }
> = {
  mint: {
    media: MEDIA.mint,
    icon: <Bot size={18} />,
  },
  payment: {
    media: MEDIA.payment,
    icon: <CreditCard size={18} />,
  },
  transfer: {
    media: MEDIA.transfer,
    icon: <ShieldCheck size={18} />,
  },
  tick: {
    media: MEDIA.proof,
    icon: <Play size={18} />,
  },
  deposit: {
    media: MEDIA.payment,
    icon: <Wallet size={18} />,
  },
  withdraw: {
    media: MEDIA.transfer,
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
    next: string;
    media: string;
    proofs: string[];
  }
> = {
  "/app": {
    slug: "overview",
    label: "Console overview",
    title: "See the next",
    emphasis: "safe action.",
    copy: "See what your agents need next.",
    next: "Agent health / safe action",
    media: MEDIA.proof,
    proofs: [
      "Wallet context",
      "Network match",
      "Console profile",
    ],
  },
  "/settings": {
    slug: "settings",
    label: "Session settings",
    title: "Guard the",
    emphasis: "control plane.",
    copy: "Session, display and console preferences.",
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
    label: "Transaction center",
    title: "Trace every",
    emphasis: "receipt.",
    copy: "Every receipt, its state, and recovery.",
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
    label: "Operator chat",
    title: "Ask from",
    emphasis: "context.",
    copy: "Ask about your agents — chat knows your session.",
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
    label: "Mint an agent",
    title: "Prove the",
    emphasis: "identity.",
    copy: "Your name becomes an on-chain identity with a receipt.",
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
    label: "Payment route",
    title: "Fund the",
    emphasis: "route.",
    copy: "Approve exactly what you pay — fees shown up front.",
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
    label: "Transfer flow",
    title: "Carry the",
    emphasis: "proof.",
    copy: "Receiver co-signs; expiry is enforced.",
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
    label: "Storage proofs",
    title: "Keep the",
    emphasis: "evidence.",
    copy: "Every storage step is verifiable, not a success badge.",
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
    label: "Agent detail",
    title: "Inspect the",
    emphasis: "operator.",
    copy: "Identity, ownership, activity and receipts per agent.",
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
