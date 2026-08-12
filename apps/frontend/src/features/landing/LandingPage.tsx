import { type CSSProperties, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { BRAND } from "../../brand/assets.js";

/** Landing — short, use-case first, telling the same story as Home / Chat / Mint. */
function LandingPage(): ReactElement {
  return (
    <article className="landing-root">
      <Hero />
      <Uses />
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
            {"Mint an agent.".split(" ").map((word, i) => (
              <span
                key={word}
                className="landing-word"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                {word}
                {i < 2 ? " " : null}
              </span>
            ))}
            <br />
            <span className="landing-h1-accent">
              {"Own it on-chain.".split(" ").map((word, i) => (
                <span
                  key={word}
                  className="landing-word"
                  style={{ animationDelay: `${(i + 3) * 60}ms` }}
                >
                  {word}
                  {i < 2 ? " " : null}
                </span>
              ))}
            </span>
          </h1>
          <p className="landing-lead">
            Mint, fund, tick, and transfer on-chain agents — or just ask Axiom
            in chat.
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
      <p className="landing-sub">
        One page for every agent action — mint, fund, tick, transfer, and chat.
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

export default LandingPage;
