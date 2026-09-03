/* Copper Command Deck public discovery: evidence-first hubs and an explicit
   console boundary. AW round (2026-09-03): cinematic layer (fx kit +
   axiom-awwwards.css); the artifact spec-blocks and EXAMPLE/LIVE DATA badges
   are gone per the no-noise design law — the evidence checklist carries the
   substance now. */
import { useEffect } from "react";
import {
  ArrowRight,
  CircleCheck,
  Code2,
  FileCheck2,
  LockKeyhole,
  Network,
  ReceiptText,
  ShieldCheck,
} from "../components/axiom/icons";
import {
  GrainOverlay,
  OrbsField,
  Reveal,
  ScrollProgress,
} from "../components/fx/fx";
import { AxiomBrandMark } from "../components/axiom/BrandMark";
import { PUBLIC_HUB_PATHS } from "../lib/routeRegistry.js";
import "../styles/axiom-seo-public.css";

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

/** Create-or-update a document-head rel=canonical link (one per page). */
function setCanonical(href: string) {
  const id = "axiom-public-canonical";
  document.getElementById(id)?.remove();
  const link = document.createElement("link");
  link.id = id;
  link.setAttribute("rel", "canonical");
  link.setAttribute("href", href);
  document.head.appendChild(link);
}

/** Create-or-update a property-tagged meta (og:/twitter: — name≠property in the HTML spec). */
function setProperty(property: string, content: string) {
  let meta = document.querySelector(`meta[property="${property}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("property", property);
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", content);
}

/** Multiline heading body: one <span> per line, break after the first. */
function MultilineHeading({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, index) => (
        <span key={line}>
          {line}
          {index === 0 && <br />}
        </span>
      ))}
    </>
  );
}

export type PublicSeoSlug =
  "agents" | "payments" | "proofs" | "storage" | "developers";

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
  journey: string;
};

const pages: Record<PublicSeoSlug, PublicPage> = {
  agents: {
    title: "Agents with a\nvisible track record.",
    metaTitle: "Agent Provenance Workflows | Axiom",
    navLabel: "Explore agents",
    accent: "See what an agent is, what it did, and what backs it.",
    metaDescription:
      "Explore Axiom's approach to on-chain agent provenance, operator activity and evidence-oriented workflows.",
    evidenceTitle: "What you can inspect",
    evidence: [
      "Identity and activity",
      "Receipts beside each operation",
      "Storage and proof references",
    ],
    boundary:
      "Human-controlled flows — no autonomous behavior beyond what you configure.",
    next: { href: PUBLIC_HUB_PATHS.proofs, label: "See how it works" },
    links: [
      { href: PUBLIC_HUB_PATHS.payments, label: "Programmable payments" },
      { href: PUBLIC_HUB_PATHS.storage, label: "Verifiable 0G Storage" },
      { href: PUBLIC_HUB_PATHS.developers, label: "Developer quickstart" },
    ],
    icon: Network,
    journey: "Trace an\nagent evidence path.",
  },
  payments: {
    title: "Payments that keep\ntheir receipts.",
    metaTitle: "Programmable Payment Receipts | Axiom",
    navLabel: "Payments",
    accent:
      "Approval, submission and finality stay distinct — with the receipt to prove it.",
    metaDescription:
      "Understand Axiom's evidence-oriented programmable payment workflow, including approval, receipts and finality states.",
    evidenceTitle: "What remains visible",
    evidence: [
      "Approval and signing, kept separate",
      "Each receipt state, explicit",
      "Fee and vault context when set",
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
    journey: "Inspect the\nreceipt trail.",
  },
  proofs: {
    title: "Proof stays beside\nthe decision it supports.",
    metaTitle: "On-chain Receipts and Recovery | Axiom",
    navLabel: "Receipts",
    accent:
      "Receipt status, transaction identity and recovery context — never one generic success message.",
    metaDescription:
      "Learn how Axiom presents operational receipts, transaction states and recovery context for Web3 workflows.",
    evidenceTitle: "Receipt lifecycle",
    evidence: [
      "Approval and signature, separate",
      "Submission, confirmation, recovery — explicit",
      "Hashes and agent links, one tap away",
    ],
    boundary:
      "Finality and recovery depend on the network and operation — never a universal guarantee.",
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
    journey: "Follow the\nfinality chain.",
  },
  storage: {
    title: "Publish data with\na root you can inspect.",
    metaTitle: "Verifiable 0G Storage Evidence | Axiom",
    navLabel: "Storage",
    accent:
      "Encryption, root hashing, publication, verification, availability — each phase stays visible.",
    metaDescription:
      "Explore Axiom's verifiable 0G Storage workflow: publication, root hash, proof context, recovery and availability.",
    evidenceTitle: "Storage evidence",
    evidence: [
      "Root hash and publication reference",
      "Encryption and recovery, when used",
      "Verification and availability, separate phases",
    ],
    boundary:
      "0G capabilities and Axiom's integration are described separately — no absolute availability or privacy claim.",
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
    journey: "Inspect the\nstorage root.",
  },
  developers: {
    title: "Start from the\nproof you need to expose.",
    metaTitle: "Developer Entry Point | Axiom",
    navLabel: "Developers",
    accent:
      "Read the flow first; open the console only when an action needs your wallet.",
    metaDescription:
      "Axiom developer entry point for agent provenance, payment receipts and verifiable 0G Storage workflows.",
    evidenceTitle: "Build path",
    evidence: [
      "Pick a proof workflow: agent, payment, storage",
      "Review signing, receipt and failure states",
      "Enter the app only to act",
    ],
    boundary:
      "Integration details track the deployed contracts, network config and 0G SDK.",
    next: { href: "/app", label: "Open operator console" },
    links: [
      { href: PUBLIC_HUB_PATHS.agents, label: "Agent architecture" },
      { href: PUBLIC_HUB_PATHS.payments, label: "Payment lifecycle" },
      { href: PUBLIC_HUB_PATHS.storage, label: "Storage evidence" },
    ],
    icon: Code2,
    journey: "Build from the\nfirst receipt.",
  },
};

export function PublicSeoPage({ slug }: { slug: PublicSeoSlug }) {
  const page = pages[slug];
  const Icon = page.icon;
  useEffect(() => {
    document.title = page.metaTitle;
    setMeta("description", page.metaDescription);
    setMeta("robots", "index,follow");
    // L1-M7: PUBLIC_HUB_PATHS IS the short canonical path — no prefix hack.
    const canonicalHref = new URL(
      PUBLIC_HUB_PATHS[slug],
      location.origin,
    ).href;
    setCanonical(canonicalHref);
    // Audit critique-3 C2: the five crawlable hubs shared the shell's single
    // OG card. Each hub now owns its OG title/description/url/image.
    setProperty("og:title", page.metaTitle);
    setProperty("og:description", page.metaDescription);
    setProperty("og:url", canonicalHref);
    setProperty("og:type", "website");
    setProperty("og:site_name", "Axiom");
    setProperty("og:image", new URL("/brand/og-1200.jpg", location.origin).href);
    setProperty("twitter:image", new URL("/brand/og-1200.jpg", location.origin).href);
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
    return () => {
      schema.remove();
      // Keep the console's head clean when navigating out of the public hubs.
      document.getElementById("axiom-public-canonical")?.remove();
    };
  }, [page]);
  return (
    <main className={`seo-public seo-public--${slug}`} data-seo-page={slug}>
      <ScrollProgress />
      <GrainOverlay />
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
        <OrbsField />
        <div className="seo-route-rail" role="presentation" />
        <Reveal>
        <div className="seo-hero-copy">
          <h1>
            <MultilineHeading text={page.title} />
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
        </Reveal>
        <Reveal delay={140}>
        <aside className="seo-proof-card">
          <div className="seo-proof-card-head">
            <Icon size={18} />
          </div>
          <strong>{page.evidenceTitle}</strong>
          <ul>
            {page.evidence.map((item) => (
              <li key={item}>
                <CircleCheck size={16} />
                {item}
              </li>
            ))}
          </ul>
          <p>{page.boundary}</p>
        </aside>
        </Reveal>
      </section>
      <section className="seo-link-field" aria-labelledby="related-title">
        <div>
          <h2 id="related-title">
            <MultilineHeading text={page.journey} />
          </h2>
        </div>
        <Reveal>
        <div className="seo-link-grid">
          {page.links.map((link) => (
            <a key={link.href} href={link.href}>
              <strong>{link.label}</strong>
              <ArrowRight size={16} />
            </a>
          ))}
        </div>
        </Reveal>
      </section>
      <footer className="seo-public-footer">
        <span>Built on 0G</span>
      </footer>
    </main>
  );
}
