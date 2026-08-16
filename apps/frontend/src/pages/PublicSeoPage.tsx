/* Copper Command Deck public discovery: evidence-first hubs, route-specific risk artifacts, and explicit console boundary. */
import { useEffect } from "react";
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
import "../styles/axiom-seo-public.css";

export type PublicSeoSlug =
  "agents" | "payments" | "proofs" | "storage" | "developers";

type EvidenceArtifact = {
  label: string;
  state: string;
  rows: [string, string][];
};
type PublicPage = {
  eyebrow: string;
  title: string;
  metaTitle: string;
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
    eyebrow: "SOLUTION / AGENT PROVENANCE",
    title: "Agents with a\nvisible proof trail.",
    metaTitle: "Agent Provenance Workflows | Axiom",
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
    next: { href: "/proofs", label: "Trace a receipt lifecycle" },
    links: [
      { href: "/payments", label: "Programmable payments" },
      { href: "/storage/0g", label: "Verifiable 0G Storage" },
      { href: "/developers", label: "Developer quickstart" },
    ],
    icon: Network,
    artifact: {
      label: "PROVENANCE SPECIMEN",
      state: "IDENTITY LINKED",
      rows: [
        ["AGENT ID", "agnt_07F2"],
        ["MANIFEST", "mft_4A91"],
        ["LAST RECEIPT", "rcpt_81C3"],
      ],
    },
    journey: "Trace an\nagent evidence path.",
    rail: "IDENTITY → RECEIPT",
  },
  payments: {
    eyebrow: "SOLUTION / PROGRAMMABLE PAYMENTS",
    title: "Payments that retain\ntheir receipt boundary.",
    metaTitle: "Programmable Payment Receipts | Axiom",
    accent:
      "Keep approval, signature, submission and finality distinct so an operator sees both the next decision and the resulting evidence.",
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
    next: { href: "/proofs", label: "Inspect receipt states" },
    links: [
      { href: "/agents", label: "Agent provenance" },
      { href: "/storage/0g", label: "Store a verifiable artifact" },
      { href: "/developers", label: "Payment integration guide" },
    ],
    icon: ReceiptText,
    artifact: {
      label: "ALLOWANCE ROUTE",
      state: "SIGNATURE PENDING",
      rows: [
        ["APPROVAL", "approval_2E0"],
        ["ROUTE", "vault → royalty"],
        ["RECEIPT", "rcpt_94B1"],
      ],
    },
    journey: "Inspect the\nreceipt boundary.",
    rail: "ALLOWANCE → RECEIPT",
  },
  proofs: {
    eyebrow: "SOLUTION / RECEIPTS & FINALITY",
    title: "Proof stays beside\nthe decision it supports.",
    metaTitle: "Operational Receipts and Finality | Axiom",
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
    next: { href: "/payments", label: "See programmable payments" },
    links: [
      { href: "/agents", label: "Agent evidence" },
      { href: "/storage/0g", label: "Storage proof workflow" },
      { href: "/developers", label: "Developer references" },
    ],
    icon: FileCheck2,
    artifact: {
      label: "FINALITY CHAIN",
      state: "CONFIRMING",
      rows: [
        ["TX HASH", "0x8a2f…7e19"],
        ["STATE", "submitted → confirm"],
        ["RECOVERY", "retry surface"],
      ],
    },
    journey: "Follow the\nfinality chain.",
    rail: "SUBMIT → FINALITY",
  },
  storage: {
    eyebrow: "SOLUTION / VERIFIABLE 0G STORAGE",
    title: "Publish data with\na root you can inspect.",
    metaTitle: "Verifiable 0G Storage Evidence | Axiom",
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
    next: { href: "/developers", label: "Open Storage quickstart" },
    links: [
      { href: "/proofs", label: "Understand evidence lifecycle" },
      { href: "/agents", label: "Connect artifacts to agents" },
      { href: "/payments", label: "Payment receipts" },
    ],
    icon: ShieldCheck,
    artifact: {
      label: "PUBLICATION ROOT",
      state: "ROOT VERIFIED",
      rows: [
        ["ROOT", "0x71c4…a908"],
        ["PHASE", "publish → verify"],
        ["AVAILABILITY", "separate state"],
      ],
    },
    journey: "Inspect the\nstorage root.",
    rail: "ROOT → PUBLICATION",
  },
  developers: {
    eyebrow: "DEVELOPERS / IMPLEMENTATION PATH",
    title: "Start from the\nproof you need to expose.",
    metaTitle: "Developer Entry Point | Axiom",
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
      { href: "/agents", label: "Agent architecture" },
      { href: "/payments", label: "Payment lifecycle" },
      { href: "/storage/0g", label: "Storage evidence" },
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
  useEffect(() => {
    document.title = page.metaTitle;
    let description = document.querySelector('meta[name="description"]');
    if (!description) {
      description = document.createElement("meta");
      description.setAttribute("name", "description");
      document.head.appendChild(description);
    }
    description.setAttribute("content", page.metaDescription);
    let robots = document.querySelector('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement("meta");
      robots.setAttribute("name", "robots");
      document.head.appendChild(robots);
    }
    robots.setAttribute("content", "index,follow");
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
              name: page.eyebrow.split(" / ").at(-1),
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
              href={navSlug === "storage" ? "/storage/0g" : `/${navSlug}`}
              key={navSlug}
            >
              {pages[navSlug].eyebrow
                .split(" / ")
                .at(-1)
                ?.replace("VERIFIABLE 0G STORAGE", "STORAGE")}
            </a>
          ))}
        </nav>
        <div className="seo-route-status">
          <span>ROUTE / PUBLIC SURFACE</span>
          <b>PUBLIC · INDEXABLE</b>
        </div>
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
          <small>PROOF BOUNDARY</small>
        </div>
        <div className="seo-hero-copy">
          <span className="eyebrow">{page.eyebrow}</span>
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
            <span>VERIFIED SURFACE</span>
          </div>
          <strong>{page.evidenceTitle}</strong>
          <div
            className="seo-evidence-artifact"
            aria-label={`${page.artifact.label} specimen`}
          >
            <div>
              <span>{page.artifact.label}</span>
              <b>{page.artifact.state}</b>
            </div>
            {page.artifact.rows.map(([label, value]) => (
              <p key={label}>
                <span>{label}</span>
                <code>{value}</code>
              </p>
            ))}
            <small>PUBLIC MODEL · NOT LIVE OPERATION DATA</small>
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
          <span className="eyebrow">NEXT EVIDENCE PATH</span>
          <h2 id="related-title">
            {page.journey.split("\n").map((line, index) => (
              <span key={line}>
                {line}
                {index === 0 && <br />}
              </span>
            ))}
          </h2>
          <p>
            Continue through the route that exposes the next decision boundary.
          </p>
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
        <span>Claims are constrained to the implemented product surface.</span>
      </footer>
    </main>
  );
}
