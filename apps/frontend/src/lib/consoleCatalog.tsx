/* Flow + locked-route metadata. */
import {
  Activity,
  Bot,
  CreditCard,
  Gauge,
  KeyRound,
  LayoutDashboard,
  MessageSquare,
  Play,
  ReceiptText,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  Timer,
  UploadCloud,
  Wallet,
  Zap,
} from "../components/axiom/icons";
import type { FlowKind } from "./models";
import type { Copy, GateSlug } from "./copy";
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

/* Locked-gate visual slots (Wave 4 gate merge): one table, one gate component.
 * The localized words live in copy.lockedHero (`hero` key) and copy.gate
 * (label + schematic rows, B-M4); this table owns only what copy.ts must
 * not: the route slug class, the preview media, and the row icons rendered
 * under the preview (masked/teaser values only — the gate never fakes live
 * data). */
export type LockedGate = {
  slug: GateSlug;
  media: string;
  /** copy.lockedHero key carrying this route's localized hero. */
  hero: keyof Copy["lockedHero"];
  /** Schematic row icons, paired by index with copy.gate.rows[slug]. */
  rowIcons: [React.ReactNode, React.ReactNode];
};

export const lockedGates: Record<string, LockedGate | undefined> = {
  "/app": {
    slug: "overview",
    media: MEDIA.proof,
    hero: "app",
    rowIcons: [<Bot size={16} />, <Activity size={16} />],
  },
  "/settings": {
    slug: "settings",
    media: MEDIA.recovery,
    hero: "settings",
    rowIcons: [<Settings2 size={16} />, <KeyRound size={16} />],
  },
  "/chat": {
    slug: "chat",
    media: MEDIA.onboarding,
    hero: "chat",
    rowIcons: [<MessageSquare size={16} />, <Server size={16} />],
  },
  "/mint": {
    slug: "mint",
    media: MEDIA.mint,
    hero: "mint",
    rowIcons: [<KeyRound size={16} />, <ShieldCheck size={16} />],
  },
  "/payment": {
    slug: "payment",
    media: MEDIA.payment,
    hero: "payment",
    rowIcons: [<CreditCard size={16} />, <ShieldCheck size={16} />],
  },
  "/transfer": {
    slug: "transfer",
    media: MEDIA.transfer,
    hero: "transfer",
    rowIcons: [<ShieldCheck size={16} />, <Timer size={16} />],
  },
  "/agents/": {
    slug: "agent",
    media: MEDIA.onboarding,
    hero: "agent",
    rowIcons: [<Bot size={16} />, <ReceiptText size={16} />],
  },
  "/agents/list": {
    slug: "roster",
    media: MEDIA.onboarding,
    hero: "agentsList",
    rowIcons: [<LayoutDashboard size={16} />, <Search size={16} />],
  },
  "/tick": {
    slug: "tick",
    media: MEDIA.proof,
    hero: "tick",
    rowIcons: [<Play size={16} />, <Gauge size={16} />],
  },
  "/deposit": {
    slug: "deposit",
    media: MEDIA.payment,
    hero: "deposit",
    rowIcons: [<Wallet size={16} />, <Zap size={16} />],
  },
  "/withdraw": {
    slug: "withdraw",
    media: MEDIA.transfer,
    hero: "withdraw",
    rowIcons: [<UploadCloud size={16} />, <Timer size={16} />],
  },
};

/** Route → gate slot, with the /agents/:tokenId prefix and the /app console
 * overview as the ordered fallbacks (unknown internal routes still gate). */
export const lockedGateFor = (pathname: string): LockedGate | undefined =>
  lockedGates[pathname] ??
  (pathname.startsWith("/agents/") ? lockedGates["/agents/"] : undefined) ??
  lockedGates["/app"];
