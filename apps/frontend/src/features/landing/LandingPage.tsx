import { type CSSProperties, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { BRAND } from "../../brand/assets.js";

/**
 * Public landing — dark, scannable, honest.
 * No card dumps, no scroll-reveal theater, no claims the app cannot keep.
 *
 * Product truth (aligned with Home / Chat / Mint):
 * - Mint an iNFT agent (name → auto payload → oracle + wallet)
 * - Fund vault, run ticks, transfer with re-key
 * - Chat with Axiom assistant for protocol tools
 * - Oracle is software TEE signer, not hardware enclave
 */
export function LandingPage(): ReactElement {
  return (
    <article className="landing-root">
      <Hero />
      <WhatYouDo />
      <Limits />
      <FooterCta />
    </article>
  );
}

function Hero(): ReactElement {
  return (
    <section className="landing-hero landing-hero--enter">
      <div className="landing-hero__grid">
        <div className="landing-hero__copy">
          <p className="landing-eyebrow">
            <span className="landing-dot" aria-hidden />
            ERC-7857 · 0G Aristotle · software oracle
          </p>
          <h1 className="landing-h1">
            Agents you mint,
            <br />
            <span className="landing-h1-accent">own, and run.</span>
          </h1>
          <p className="landing-lead">
            Axiom is a wallet app for intelligent NFTs on 0G: mint an agent,
            fund its vault, run strategy ticks, transfer with re-key. Chat with
            Axiom when you want the assistant to drive those tools.
          </p>
          <div className="landing-cta-row">
            <Link to="/app?mint=1" className="btn btn-primary landing-btn">
              Mint an agent
            </Link>
            <Link to="/app" className="btn btn-secondary landing-btn">
              Open app
            </Link>
            <Link to="/chat" className="landing-text-link">
              Chat with Axiom →
            </Link>
          </div>
        </div>
        <div className="landing-hero__visual">
          <img
            src={BRAND.heroSeal}
            alt=""
            width={320}
            height={320}
            className="landing-seal"
            decoding="async"
          />
        </div>
      </div>
    </section>
  );
}

function WhatYouDo(): ReactElement {
  const items = [
    {
      title: "Mint",
      body: "Name the agent. We build a default payload, register the dataHash with the oracle, and your wallet pays the mint fee.",
    },
    {
      title: "Fund & tick",
      body: "Deposit 0G into the agent vault, bind a strategy root when you have one, run ticks via 0G Compute from agent detail.",
    },
    {
      title: "Transfer",
      body: "iTransfer re-keys sealed intelligence for the new owner through the oracle. Old access does not travel with a bare transfer.",
    },
    {
      title: "Ask Axiom",
      body: "Chat can call protocol tools (mint, vault reads, ticks, market-style queries) while you stay connected with a wallet.",
    },
  ];

  return (
    <section className="landing-block">
      <h2 className="landing-h2">What you can do here</h2>
      <p className="landing-sub">
        Same product as Home and Chat — not a marketplace brochure.
      </p>
      <ul className="landing-list">
        {items.map((item, i) => (
          <li
            key={item.title}
            className="landing-list__item"
            style={{ "--i": i } as CSSProperties}
          >
            <h3 className="landing-list__title">{item.title}</h3>
            <p className="landing-list__body">{item.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Limits(): ReactElement {
  return (
    <section className="landing-block landing-block--tight">
      <div className="landing-note">
        <h2 className="landing-h3">What this is not</h2>
        <ul className="landing-plain-list">
          <li>
            Not a full open marketplace UI — transfer and tools live in the app;
            there is no peer “Market” destination.
          </li>
          <li>
            Oracle re-key uses a <strong>software</strong> TEE signer (process
            key), not Intel TDX / AMD SEV hardware.
          </li>
          <li>
            Ticks and chat need backend, compute, and wallet; mint needs chain
            fee in 0G.
          </li>
        </ul>
      </div>
    </section>
  );
}

function FooterCta(): ReactElement {
  return (
    <section className="landing-block landing-cta-end">
      <h2 className="landing-h2">Start with a name</h2>
      <p className="landing-sub">
        One field on mint. Then Home for portfolio, Chat for Axiom, agent detail
        for vault and ticks.
      </p>
      <div className="landing-cta-row landing-cta-row--center">
        <Link to="/app?mint=1" className="btn btn-primary landing-btn">
          Mint an agent
        </Link>
        <Link to="/app" className="btn btn-secondary landing-btn">
          Open Home
        </Link>
      </div>
    </section>
  );
}

export default LandingPage;
