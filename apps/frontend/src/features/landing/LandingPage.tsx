import { type CSSProperties, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { BRAND } from "../../brand/assets.js";

/**
 * Landing — short, use-case first, same story as Home / Chat / Mint.
 */
function LandingPage(): ReactElement {
  return (
    <article className="landing-root">
      <Hero />
      <Uses />
      <Limits />
      <Cta />
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
            0G · ERC-7857 · software oracle
          </p>
          <h1 className="landing-h1">
            Mint an agent.
            <br />
            <span className="landing-h1-accent">Own it on-chain.</span>
          </h1>
          <p className="landing-lead">
            Use Axiom to mint an iNFT agent, fund its vault, run ticks, transfer
            with re-key, or chat tools with Axiom.
          </p>
          <div className="landing-cta-row">
            <Link to="/app?mint=1" className="btn btn-primary landing-btn">
              Mint
            </Link>
            <Link to="/app" className="btn btn-secondary landing-btn">
              Home
            </Link>
            <Link to="/chat" className="landing-text-link">
              Chat →
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

function Uses(): ReactElement {
  const items = [
    {
      title: "Mint",
      body: "Name the agent. Wallet pays the mint fee. Payload is auto-built.",
    },
    {
      title: "Fund",
      body: "Deposit 0G on agent detail. Bind a strategy root when you have one.",
    },
    {
      title: "Tick",
      body: "Run strategy ticks from Execute. Needs vault funds and 0G Compute.",
    },
    {
      title: "Transfer",
      body: "iTransfer re-keys sealed data for the buyer via the software oracle.",
    },
    {
      title: "Chat",
      body: "Ask Axiom to mint, read vaults, or tick — wallet required.",
    },
  ];

  return (
    <section className="landing-block">
      <h2 className="landing-h2">What Axiom is for</h2>
      <p className="landing-sub">Same flows as Home and Chat. No extra product.</p>
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
        <h2 className="landing-h3">Limits</h2>
        <ul className="landing-plain-list">
          <li>No marketplace page — transfer lives on agent detail.</li>
          <li>
            Oracle is a <strong>software</strong> signer, not hardware TEE.
          </li>
          <li>Chat and ticks need backend + compute keys.</li>
        </ul>
      </div>
    </section>
  );
}

function Cta(): ReactElement {
  return (
    <section className="landing-block landing-cta-end">
      <h2 className="landing-h2">Start with a name</h2>
      <p className="landing-sub">Mint → Home list → detail for vault and ticks.</p>
      <div className="landing-cta-row landing-cta-row--center">
        <Link to="/app?mint=1" className="btn btn-primary landing-btn">
          Mint
        </Link>
        <Link to="/app" className="btn btn-secondary landing-btn">
          Open Home
        </Link>
      </div>
    </section>
  );
}

export default LandingPage;
