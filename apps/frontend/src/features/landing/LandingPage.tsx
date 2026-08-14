import { type CSSProperties, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { useHealth } from "../../hooks/useHealth.js";
import { truncateAddress } from "../../utils/format.js";

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
  const { data: health } = useHealth();

  const oracleUp = health?.oracle === "up";
  const chainHead =
    typeof health?.chainHead === "number" ? health.chainHead : null;
  const signer = health?.signer ?? null;

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
            An AI agent that runs on-chain: mint it, fund it with 0G, run it,
            transfer it. Every balance, event, and trade you see is real — you
            can verify it on-chain.
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
          <div className="landing-panel" aria-label="Axiom system status">
            <div className="landing-panel__head">
              <span>Axiom system</span>
              <span className="landing-live">
                <span className="landing-dot" aria-hidden />
                {oracleUp ? "online" : "checking"}
              </span>
            </div>
            <div className="landing-panel__body">
              <div className="landing-row">
                <span className="landing-row__label">Chain</span>
                <span className="landing-row__value">0G Aristotle</span>
              </div>
              <div className="landing-row">
                <span className="landing-row__label">Block head</span>
                <span className="landing-row__value">
                  {chainHead !== null ? `#${chainHead.toLocaleString()}` : "…"}
                </span>
              </div>
              <div className="landing-row">
                <span className="landing-row__label">Oracle</span>
                <span className="landing-row__value">
                  {oracleUp ? "up" : "…"}
                </span>
              </div>
              <div className="landing-row">
                <span className="landing-row__label">Signer</span>
                <span
                  className="landing-row__value"
                  title={signer ?? undefined}
                >
                  {signer ? truncateAddress(signer) : "…"}
                </span>
              </div>
              <div className="landing-row">
                <span className="landing-row__label">Metadata</span>
                <span className="landing-row__value landing-row__value--copper">
                  re-keyed on transfer
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Uses(): ReactElement {
  const items = [
    {
      title: "Mint",
      body: "Give your agent a name. Your wallet signs the mint. The payload is built for you.",
    },
    {
      title: "Fund",
      body: "Deposit 0G into the agent's vault. Add a strategy when you have one.",
    },
    {
      title: "Tick",
      body: "Let your agent act — each run uses 0G Compute, paid from the vault.",
    },
    {
      title: "Transfer",
      body: "Sell or hand off the agent. Its data is re-sealed for the new owner.",
    },
    {
      title: "Chat",
      body: "Ask Axiom to check a vault, run the agent, or start a mint — your wallet approves every on-chain step.",
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
