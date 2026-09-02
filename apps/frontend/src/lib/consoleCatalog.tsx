/* Flow + locked-route metadata. */
import {
  Activity,
  Bot,
  Clock3,
  CreditCard,
  Database,
  FileCheck2,
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
 * The localized hero words live in copy.lockedHero (`hero` key); this table
 * owns only what copy.ts must not: the route slug class, the preview media,
 * the evidence label, and the schematic rows rendered under the preview
 * (masked/teaser values only — the gate never fakes live data). */
export type LockedGateRow = { icon: React.ReactNode; label: string; value: string };

export type LockedGate = {
  slug: string;
  label: string;
  media: string;
  /** copy.lockedHero key carrying this route's localized hero. */
  hero: keyof import("./copy").Copy["lockedHero"];
  rows: [LockedGateRow, LockedGateRow];
};

export const lockedGates: Record<string, LockedGate | undefined> = {
  "/app": {
    slug: "overview",
    label: "Console overview",
    media: MEDIA.proof,
    hero: "app",
    rows: [
      { icon: <Bot size={16} />, label: "Agents", value: "••• live" },
      { icon: <Activity size={16} />, label: "Next tick", value: "••• queued" },
    ],
  },
  "/settings": {
    slug: "settings",
    label: "Session settings",
    media: MEDIA.recovery,
    hero: "settings",
    rows: [
      { icon: <Settings2 size={16} />, label: "Display", value: "•••" },
      { icon: <KeyRound size={16} />, label: "Session", value: "••• h" },
    ],
  },
  "/transactions": {
    slug: "transactions",
    label: "Transaction center",
    media: MEDIA.transfer,
    hero: "transactions",
    rows: [
      { icon: <ReceiptText size={16} />, label: "Receipts", value: "••• indexed" },
      { icon: <Clock3 size={16} />, label: "Recovery", value: "ready" },
    ],
  },
  "/chat": {
    slug: "chat",
    label: "Operator chat",
    media: MEDIA.onboarding,
    hero: "chat",
    rows: [
      { icon: <MessageSquare size={16} />, label: "Thread", value: "••• turns" },
      { icon: <Server size={16} />, label: "Tools", value: "••• live" },
    ],
  },
  "/mint": {
    slug: "mint",
    label: "Mint an agent",
    media: MEDIA.mint,
    hero: "mint",
    rows: [
      { icon: <KeyRound size={16} />, label: "Identity", value: "unique" },
      { icon: <ShieldCheck size={16} />, label: "Ownership", value: "you" },
    ],
  },
  "/payment": {
    slug: "payment",
    label: "Payment route",
    media: MEDIA.payment,
    hero: "payment",
    rows: [
      { icon: <CreditCard size={16} />, label: "Approval cap", value: "••• 0G" },
      { icon: <ShieldCheck size={16} />, label: "Fees", value: "up front" },
    ],
  },
  "/transfer": {
    slug: "transfer",
    label: "Transfer flow",
    media: MEDIA.transfer,
    hero: "transfer",
    rows: [
      { icon: <ShieldCheck size={16} />, label: "Co-sign", value: "receiver" },
      { icon: <Timer size={16} />, label: "Expiry", value: "enforced" },
    ],
  },
  "/storage": {
    slug: "storage",
    label: "Storage proofs",
    media: MEDIA.proof,
    hero: "storage",
    rows: [
      { icon: <Database size={16} />, label: "Proofs", value: "••• verified" },
      { icon: <FileCheck2 size={16} />, label: "Roots", value: "on-chain" },
    ],
  },
  "/agents/": {
    slug: "agent",
    label: "Agent detail",
    media: MEDIA.onboarding,
    hero: "agent",
    rows: [
      { icon: <Bot size={16} />, label: "Identity", value: "ERC-7857" },
      { icon: <ReceiptText size={16} />, label: "Receipts", value: "•••" },
    ],
  },
  "/agents/list": {
    slug: "roster",
    label: "Agent roster",
    media: MEDIA.onboarding,
    hero: "agentsList",
    rows: [
      { icon: <LayoutDashboard size={16} />, label: "Roster", value: "••• agents" },
      { icon: <Search size={16} />, label: "Details", value: "per agent" },
    ],
  },
  "/tick": {
    slug: "tick",
    label: "Run agent task",
    media: MEDIA.proof,
    hero: "tick",
    rows: [
      { icon: <Play size={16} />, label: "Instruction", value: "bounded" },
      { icon: <Gauge size={16} />, label: "Stream", value: "••• tokens" },
    ],
  },
  "/deposit": {
    slug: "deposit",
    label: "Deposit",
    media: MEDIA.payment,
    hero: "deposit",
    rows: [
      { icon: <Wallet size={16} />, label: "Vault gas", value: "••• 0G" },
      { icon: <Zap size={16} />, label: "Top-up", value: "native" },
    ],
  },
  "/withdraw": {
    slug: "withdraw",
    label: "Withdraw",
    media: MEDIA.transfer,
    hero: "withdraw",
    rows: [
      { icon: <UploadCloud size={16} />, label: "Balance", value: "••• 0G" },
      { icon: <Timer size={16} />, label: "Cooldown", value: "•••" },
    ],
  },
};

/** Route → gate slot, with the /agents/:tokenId prefix and the /app console
 * overview as the ordered fallbacks (unknown internal routes still gate). */
export const lockedGateFor = (pathname: string): LockedGate | undefined =>
  lockedGates[pathname] ??
  (pathname.startsWith("/agents/") ? lockedGates["/agents/"] : undefined) ??
  lockedGates["/app"];
