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
    media: string;
  }
> = {
  "/app": {
    slug: "overview",
    label: "Console overview",
    title: "Your console,",
    emphasis: "at a glance.",
    copy: "See what your agents need next.",
    media: MEDIA.proof,
  },
  "/settings": {
    slug: "settings",
    label: "Session settings",
    title: "Settings live",
    emphasis: "here.",
    copy: "Session, display and console preferences.",
    media: MEDIA.recovery,
  },
  "/transactions": {
    slug: "transactions",
    label: "Transaction center",
    title: "Track every payment",
    emphasis: "to its receipt.",
    copy: "Every receipt, its state, and recovery.",
    media: MEDIA.transfer,
  },
  "/chat": {
    slug: "chat",
    label: "Operator chat",
    title: "Chat that knows",
    emphasis: "your setup.",
    copy: "Ask about your agents — chat knows your session.",
    media: MEDIA.onboarding,
  },
  "/mint": {
    slug: "mint",
    label: "Mint an agent",
    title: "Name your agent",
    emphasis: "on-chain.",
    copy: "Your name becomes an on-chain identity with a receipt.",
    media: MEDIA.mint,
  },
  "/payment": {
    slug: "payment",
    label: "Payment route",
    title: "Pay exactly",
    emphasis: "what you approve.",
    copy: "Approve exactly what you pay — fees shown up front.",
    media: MEDIA.payment,
  },
  "/transfer": {
    slug: "transfer",
    label: "Transfer flow",
    title: "Transfers your receiver",
    emphasis: "co-signs.",
    copy: "Receiver co-signs; expiry is enforced.",
    media: MEDIA.transfer,
  },
  "/storage": {
    slug: "storage",
    label: "Storage proofs",
    title: "Storage you can",
    emphasis: "verify.",
    copy: "Every storage step is verifiable, end to end.",
    media: MEDIA.proof,
  },
  "/agents/": {
    slug: "agent",
    label: "Agent detail",
    title: "Every agent,",
    emphasis: "in detail.",
    copy: "Identity, ownership, activity and receipts per agent.",
    media: MEDIA.onboarding,
  },
};
