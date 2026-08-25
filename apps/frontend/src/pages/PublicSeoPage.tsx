/* Copper Command Deck public discovery: evidence-first hubs, route-specific risk artifacts, and explicit console boundary. */
import { useEffect, useState } from "react";
import { apiFetch } from "../utils/apiFetch.js";
import {
  ArrowRight,
  CheckCircle2,
  Code2,
  FileCheck2,
  LockKeyhole,
  Network,
  ReceiptText,
  ShieldCheck,
} from "../components/axiom/icons";
import { AxiomBrandMark } from "../components/axiom/BrandMark";
import { PUBLIC_HUB_PATHS } from "../lib/routeRegistry.js";
import "../styles/axiom-seo-public.css";

/** Live on-chain registry counts for the agents hub artifact — null while
 * loading or when the backend is unreachable (card falls back to the
 * labeled specimen). */
interface AgentRegistryStats {
  totalMinted: number;
  latestTokenId: string | null;
}

/** Create-or-update a document-head meta tag (description/robots share it). */
function setMeta(name: string, content: string) {
  let meta = document.querySelector(`meta[name="${name}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", name);
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", content);
}

function useAgentRegistryStats(enabled: boolean): AgentRegistryStats | null {
  const [stats, setStats] = useState<AgentRegistryStats | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    apiFetch<AgentRegistryStats>("/v1/agents/stats")
      .then((d) => {
        if (!cancelled && typeof d?.totalMinted === "number") setStats(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return stats;
}

export type PublicSeoSlug =
  "agents" | "payments" | "proofs" | "storage" | "developers";

type EvidenceArtifact = {
  label: string;
  state: string;
  rows: [string, string][];
};
type PublicPage = {
  title: string;
  metaTitle: string;
  /** Top-nav and breadcrumb label for this page. */
  navLabel: string;
  accent: string;
  metaDescription: string;
  evidenceTitle: string;
  evidence: string[];
  boundary: string;
  next: { href: string; label: string };
  links: { href: string; label: string }[];
  icon: typeof Network;
  artifact: EvidenceArtifact;
  journey: string;
  rail: string;
};

const pages: Record<PublicSeoSlug, PublicPage> = {
  agents: {
    title: "Agents with a\nvisible proof trail.",
    metaTitle: "Agent Provenance Workflows | Axiom",
    navLabel: "Agent provenance",
    accent:
      "An operator surface should explain what an agent is, what it did, and which artifacts support that account.",
    metaDescription:
      "Explore Axiom's approach to on-chain agent provenance, operator activity and evidence-oriented workflows.",
    evidenceTitle: "What the operator can inspect",
    evidence: [
      "Agent identity and observable activity",
      "Operation-linked receipts and transaction states",
      "Storage and proof references beside the action",
    ],
    boundary:
      "Axiom describes an operator workflow; it does not claim autonomous behavior beyond the configured flows.",
    next: { href: PUBLIC_HUB_PATHS.proofs, label: "Trace a receipt lifecycle" },
    links: [
      { href: PUBLIC_HUB_PATHS.payments, label: "Programmable payments" },
      { href: PUBLIC_HUB_PATHS.storage, label: "Verifiable 0G Storage" },
      { href: PUBLIC_HUB_PATHS.developers, label: "Developer quickstart" },
    ],
    icon: Network,
    artifact: {
      label: "PROVENANCE SPECIMEN",
      state: "IDENTITY LINKED",
      // Fallback rows while /v1/agents/stats is down; live reads replace them; never fabricate an agent id.
      rows: [
        ["AGENTS", "registry read…"],
        ["MANIFEST", "hash + metadata"],
        ["LAST RECEIPT", "tx hash + event"],
      ],
    },
    journey: "Trace an\nagent evidence path.",
    rail: "IDENTITY → RECEIPT",
  },
  payments: {
    title: "Payments that retain\ntheir receipt boundary.",
    metaTitle: "Programmable Payment Receipts | Axiom",
    navLabel: "Payments",
    accent:
      "Approval, submission and finality stay distinct — with the receipt to prove it.",
    metaDescription:
      "Understand Axiom's evidence-oriented programmable payment workflow, including approval, receipts and finality states.",
    evidenceTitle: "What remains visible",
    evidence: [
      "Exact approval and signing boundary",
      "Submitted, confirming and confirmed receipt states",
      "Protocol, royalty and vault context when configured",
    ],
    boundary:
      "A receipt is an operational trace, not a financial, legal or regulatory guarantee.",
    next: { href: PUBLIC_HUB_PATHS.proofs, label: "Inspect receipt states" },
    links: [
      { href: PUBLIC_HUB_PATHS.agents, label: "Agent provenance" },
      { href: PUBLIC_HUB_PATHS.storage, label: "Store a verifiable artifact" },
      { href: PUBLIC_HUB_PATHS.developers, label: "Payment integration guide" },
    ],
    icon: ReceiptText,
    artifact: {
      label: "ALLOWANCE ROUTE",
      state: "SIGNATURE PENDING",
      rows: [
        ["APPROVAL", "exact amount"],
        ["ROUTE", "vault → royalty"],
        ["RECEIPT", "tx hash + event"],
      ],
    },
    journey: "Inspect the\nreceipt boundary.",
    rail: "ALLOWANCE → RECEIPT",
  },
  proofs: {
    title: "Proof stays beside\nthe decision it supports.",
    metaTitle: "Operational Receipts and Finality | Axiom",
    navLabel: "Receipts",
    accent:
      "Axiom surfaces receipt status, transaction identity and recovery context rather than flattening an operation into one generic success message.",
    metaDescription:
      "Learn how Axiom presents operational receipts, transaction states and recovery context for Web3 workflows.",
    evidenceTitle: "Receipt lifecycle",
    evidence: [
      "Approval and signature remain separate",
      "Submission, confirmation and recovery are explicit",
      "Hashes and contextual agent links stay available",
    ],
    boundary:
      "Finality and recovery states depend on the relevant network and operation; they are never represented as a universal guarantee.",
    next: {
      href: PUBLIC_HUB_PATHS.payments,
      label: "See programmable payments",
    },
    links: [
      { href: PUBLIC_HUB_PATHS.agents, label: "Agent evidence" },
      { href: PUBLIC_HUB_PATHS.storage, label: "Storage proof workflow" },
      { href: PUBLIC_HUB_PATHS.developers, label: "Developer references" },
    ],
    icon: FileCheck2,
    artifact: {
      label: "FINALITY CHAIN",
      state: "CONFIRMING",
      rows: [
        ["TX HASH", "0x…"],
        ["STATE", "submitted → confirm"],
        ["RECOVERY", "retry surface"],
      ],
    },
    journey: "Follow the\nfinality chain.",
    rail: "SUBMIT → FINALITY",
  },
  storage: {
    title: "Publish data with\na root you can inspect.",
    metaTitle: "Verifiable 0G Storage Evidence | Axiom",
    navLabel: "Storage",
    accent:
      "The Storage flow separates encryption, root hashing, publication, verification and availability rather than treating upload as a black box.",
    metaDescription:
      "Explore Axiom's verifiable 0G Storage workflow: publication, root hash, proof context, recovery and availability.",
    evidenceTitle: "Storage evidence",
    evidence: [
      "Root hash and publication reference",
      "Optional encryption context and recovery state",
      "Verification and availability expressed as separate phases",
    ],
    boundary:
      "0G infrastructure capabilities and Axiom's current product integration are described separately; no absolute availability or privacy claim is made.",
    next: {
      href: PUBLIC_HUB_PATHS.developers,
      label: "Open Storage quickstart",
    },
    links: [
      { href: PUBLIC_HUB_PATHS.proofs, label: "Understand evidence lifecycle" },
      { href: PUBLIC_HUB_PATHS.agents, label: "Connect artifacts to agents" },
      { href: PUBLIC_HUB_PATHS.payments, label: "Payment receipts" },
    ],
    icon: ShieldCheck,
    artifact: {
      label: "PUBLICATION ROOT",
      state: "ROOT VERIFIED",
      rows: [
        ["ROOT", "0x…"],
        ["PHASE", "publish → verify"],
        ["AVAILABILITY", "separate state"],
      ],
    },
    journey: "Inspect the\nstorage root.",
    rail: "ROOT → PUBLICATION",
  },
  developers: {
    title: "Start from the\nproof you need to expose.",
    metaTitle: "Developer Entry Point | Axiom",
    navLabel: "Developers",
    accent:
      "Use the public documentation path to understand a flow before entering a wallet-gated operator console.",
    metaDescription:
      "Axiom developer entry point for agent provenance, payment receipts and verifiable 0G Storage workflows.",
    evidenceTitle: "Build path",
    evidence: [
      "Choose the agent, payment or Storage proof workflow",
      "Review signing, receipt and failure states",
      "Enter the console only when an operator action is required",
    ],
    boundary:
      "Integration details must remain aligned with the deployed contracts, network configuration and 0G SDK version used by the product.",
    next: { href: "/app", label: "Open operator console" },
    links: [
      { href: PUBLIC_HUB_PATHS.agents, label: "Agent architecture" },
      { href: PUBLIC_HUB_PATHS.payments, label: "Payment lifecycle" },
      { href: PUBLIC_HUB_PATHS.storage, label: "Storage evidence" },
    ],
    icon: Code2,
    artifact: {
      label: "IMPLEMENTATION PATH",
      state: "DOCS FIRST",
      rows: [
        ["SDK", "0G Storage SDK"],
        ["FLOW", "sign → receipt"],
        ["BOUNDARY", "console gated"],
      ],
    },
    journey: "Build from the\nproof boundary.",
    rail: "DOCS → CONSOLE",
  },
};

export function PublicSeoPage({ slug }: { slug: PublicSeoSlug }) {
  const page = pages[slug];
  const Icon = page.icon;
  const liveStats = useAgentRegistryStats(slug === "agents");
  // Real registry counts replace the specimen rows once the chain read lands.
  const artifact = (() => {
    if (slug !== "agents" || !liveStats) return page.artifact;
    if (liveStats.totalMinted === 0) {
      return {
        ...page.artifact,
        rows: [
          ["AGENTS", "none minted yet"],
          ...page.artifact.rows.slice(1),
        ] as [string, string][],
      };
    }
    return {
      ...page.artifact,
      rows: [
        ["AGENTS ON-CHAIN", String(liveStats.totalMinted)],
        ["LATEST AGENT", `#${liveStats.latestTokenId ?? "?"}`],
        ...page.artifact.rows.slice(2),
      ] as [string, string][],
    };
  })();
  const isLiveData = slug === "agents" && liveStats !== null;
  useEffect(() => {
    document.title = page.metaTitle;
    setMeta("description", page.metaDescription);
    setMeta("robots", "index,follow");
    const schemaId = "axiom-public-schema";
    document.getElementById(schemaId)?.remove();
    const schema = document.createElement("script");
    schema.id = schemaId;
    schema.type = "application/ld+json";
    schema.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebPage",
          name: page.metaTitle,
          description: page.metaDescription,
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Axiom", item: "/" },
            {
              "@type": "ListItem",
              position: 2,
              name: page.navLabel,
            },
          ],
        },
      ],
    });
    document.head.appendChild(schema);
    return () => schema.remove();
  }, [page]);
  return (
    <main className={`seo-public seo-public--${slug}`} data-seo-page={slug}>
      <header className="seo-public-nav">
        <a className="seo-public-brand" href="/" aria-label="Axiom home">
          <AxiomBrandMark />
          <span>AXIOM</span>
        </a>
        <nav aria-label="Public product navigation">
          {(Object.keys(pages) as PublicSeoSlug[]).map((navSlug) => (
            <a
              className={navSlug === slug ? "is-active" : undefined}
              href={PUBLIC_HUB_PATHS[navSlug]}
              key={navSlug}
            >
              {pages[navSlug].navLabel}
            </a>
          ))}
        </nav>
        <a className="seo-console-link" href="/app">
          <LockKeyhole size={14} /> Operator console
        </a>
      </header>
      <section className="seo-hero">
        <div
          className="seo-route-rail"
          aria-label={`Route context: ${page.rail}`}
        >
          <span>ROUTE</span>
          <strong>{page.rail}</strong>
          <i aria-hidden="true" />
        </div>
        <div className="seo-hero-copy">
          <h1>
            {page.title.split("\n").map((line, index) => (
              <span key={line}>
                {line}
                {index === 0 && <br />}
              </span>
            ))}
          </h1>
          <p>{page.accent}</p>
          <div className="seo-hero-actions">
            <a className="seo-action-primary" href={page.next.href}>
              {page.next.label}
              <ArrowRight size={16} />
            </a>
            <a className="seo-action-secondary" href="/">
              Return to product overview
            </a>
          </div>
        </div>
        <aside className="seo-proof-card">
          <div className="seo-proof-card-head">
            <Icon size={19} />
          </div>
          <strong>{page.evidenceTitle}</strong>
          <div
            className="seo-evidence-artifact"
            aria-label={`${artifact.label} specimen`}
          >
            <div>
              <span>{artifact.label}</span>
              <b>{artifact.state}</b>
            </div>
            {artifact.rows.map(([label, value]) => (
              <p key={label}>
                <span>{label}</span>
                <code>{value}</code>
              </p>
            ))}
            <small>{isLiveData ? "LIVE CHAIN DATA" : "EXAMPLE DATA"}</small>
          </div>
          <ul>
            {page.evidence.map((item) => (
              <li key={item}>
                <CheckCircle2 size={15} />
                {item}
              </li>
            ))}
          </ul>
          <p>{page.boundary}</p>
        </aside>
      </section>
      <section className="seo-link-field" aria-labelledby="related-title">
        <div>
          <h2 id="related-title">
            {page.journey.split("\n").map((line, index) => (
              <span key={line}>
                {line}
                {index === 0 && <br />}
              </span>
            ))}
          </h2>
        </div>
        <div className="seo-link-grid">
          {page.links.map((link) => (
            <a key={link.href} href={link.href}>
              <strong>{link.label}</strong>
              <ArrowRight size={15} />
            </a>
          ))}
        </div>
      </section>
      <footer className="seo-public-footer">
        <span>0G-aware operator workflows</span>
      </footer>
    </main>
  );
}
