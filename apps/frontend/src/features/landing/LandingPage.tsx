import { type ReactElement } from "react";
import { Link } from "react-router-dom";
import { useScrollReveal } from "../../hooks/useScrollReveal.js";
import {
  VaultSeal,
  MerkleTree,
} from "../../components/illustrations/index.js";

/**
 * LandingPage — the public face of Axiom Protocol (TypeUI · Atlas).
 *
 * Four sections, not seven. Every word earns its place.
 * 1. Hero     — brand indigo, the vision in one breath
 * 2. Why      — the problem, the answer, the proof
 * 3. How      — three steps, compact, no fluff
 * 4. CTA      — one decision, one click
 */
export function LandingPage(): ReactElement {
  const heroRef = useScrollReveal<HTMLElement>({ scope: true });

  return (
    <article>
      {/* ─── 1 · Hero — Atlas brand surface (indigo), white text ─── */}
      <section
        ref={heroRef}
        style={{
          background: "var(--c-bronze)",
          color: "#ffffff",
          paddingTop: "var(--space-6xl)",
          paddingBottom: "var(--space-6xl)",
          paddingLeft: "var(--space-xl)",
          paddingRight: "var(--space-xl)",
        }}
      >
        <div
          style={{
            maxWidth: "var(--content-max)",
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: "var(--space-2xl)",
          }}
        >
          {/* Eyebrow */}
          <div data-reveal>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "2px 8px",
                border: "1px solid rgba(255,255,255,0.4)",
                fontSize: "var(--text-xs)",
                color: "#ffffff",
                background: "transparent",
              }}
            >
              <span
                className="phosphor-pulse"
                style={{
                  display: "inline-block",
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#ffffff",
                }}
              />
              ERC-7857 · 0G Chain
            </span>
          </div>

          {/* Vault seal */}
          <div data-reveal style={{ marginBottom: "var(--space-lg)" }}>
            <VaultSeal size={160} style={{ color: "rgba(255,255,255,0.9)" }} />
          </div>

          {/* Headline */}
          <h1
            data-reveal
            style={{
              fontSize: "var(--text-4xl)",
              fontWeight: "var(--fw-bold)",
              color: "#ffffff",
              letterSpacing: "-0.03em",
              lineHeight: "var(--lh-tight)",
              maxWidth: "1024px",
              margin: 0,
            }}
          >
            Ownable AI agents,
            <br />
            sealed on-chain.
          </h1>

          {/* Subhead — the why, in one breath */}
          <p
            data-reveal
            style={{
              fontSize: "var(--text-lg)",
              color: "rgba(255,255,255,0.82)",
              maxWidth: "52ch",
              lineHeight: "var(--lh-snug)",
              margin: 0,
            }}
          >
            Every AI agent you use today belongs to someone else. The platform
            watches it, throttles it, can turn it off. Axiom binds the agent to
            a token you own — encrypted, verifiable, yours to keep or sell.
          </p>

          {/* CTAs */}
          <div
            data-reveal
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--space-md)",
              justifyContent: "center",
            }}
          >
            <Link
              to="/agents/new"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "0.625rem 1.25rem",
                background: "#ffffff",
                color: "var(--c-bronze)",
                border: "1px solid #ffffff",
                fontSize: "var(--text-sm)",
                fontWeight: "var(--fw-semibold)",
                textDecoration: "none",
                lineHeight: 1,
              }}
            >
              Mint an agent
            </Link>
            <Link
              to="/market"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "0.625rem 1.25rem",
                background: "transparent",
                color: "#ffffff",
                border: "2px solid rgba(255,255,255,0.6)",
                fontSize: "var(--text-sm)",
                fontWeight: "var(--fw-semibold)",
                textDecoration: "none",
                lineHeight: 1,
              }}
            >
              Explore market
            </Link>
            <Link
              to="/chat"
              style={{
                color: "#ffffff",
                textDecoration: "none",
                fontSize: "var(--text-sm)",
                fontWeight: "var(--fw-medium)",
                padding: "0.5rem 0.25rem",
              }}
            >
              Talk to your vault →
            </Link>
          </div>
        </div>
      </section>

      {/* ─── 2 · Why — the problem, the answer, the proof ─── */}
      <WhySection />

      {/* ─── 3 · How — three steps, compact ─── */}
      <HowSection />

      {/* ─── 4 · CTA — one decision ─── */}
      <CTASection />
    </article>
  );
}

/* ════════════════════════════════════════════════════════════════
 *  Why — the soul of the page. Why this exists. What changes.
 * ════════════════════════════════════════════════════════════════ */
function WhySection(): ReactElement {
  const ref = useScrollReveal<HTMLElement>({ scope: true });

  const principles = [
    {
      title: "Own the key",
      desc: "Agent intelligence is sealed off-chain; ownership and dataHash live on the iNFT. You control transfer and vault capital.",
    },
    {
      title: "Bound the strategy",
      desc: "Vault actions check a Merkle strategy root and daily limit on-chain. Ticks can recommend and settle only with a valid proof plan.",
    },
    {
      title: "Transfer with re-key",
      desc: "iTransfer re-encrypts for the receiver via the oracle (software TEE signer today) and publishes a sealed key — no shared plaintext DEK on the wire.",
    },
  ];

  return (
    <section
      ref={ref}
      className="landing-section"
      style={{
        paddingTop: "var(--space-5xl)",
        paddingBottom: "var(--space-5xl)",
      }}
    >
      {/* Heading block — max 768px, then ≥64px to content */}
      <div
        data-reveal
        style={{ maxWidth: "768px", marginBottom: "var(--space-4xl)" }}
      >
        <h2
          style={{
            fontSize: "var(--text-3xl)",
            color: "var(--c-text-primary)",
            letterSpacing: "-0.02em",
            marginBottom: "var(--space-lg)",
            maxWidth: "16ch",
          }}
        >
          Your agent should be yours.
        </h2>
        <p
          style={{
            fontSize: "var(--text-base)",
            color: "var(--c-text-muted)",
            lineHeight: "var(--lh-normal)",
            maxWidth: "52ch",
          }}
        >
          An iNFT is an ERC-7857 token that carries encrypted AI agent metadata
          — strategy roots, daily limits, model weights. The token is the
          agent. Hold the token, hold the agent. Transfer the token, the agent
          follows. No platform between you and your strategy. No one can
          revoke what you own.
        </p>
      </div>

      {/* Two-column: principles on left, Merkle proof on right */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "var(--space-2xl)",
          alignItems: "start",
        }}
      >
        <div data-stagger style={{ display: "flex", flexDirection: "column" }}>
          {principles.map((p, i) => (
            <div
              key={p.title}
              style={
                {
                  "--stagger-index": i,
                  padding: "var(--space-lg) 0",
                  borderBottom: "1px solid var(--c-border)",
                } as React.CSSProperties
              }
            >
              <h3
                style={{
                  fontSize: "var(--text-base)",
                  fontWeight: "var(--fw-semibold)",
                  color: "var(--c-text-primary)",
                  marginBottom: "var(--space-xs)",
                }}
              >
                {p.title}
              </h3>
              <p
                style={{
                  fontSize: "var(--text-sm)",
                  color: "var(--c-text-muted)",
                  lineHeight: "var(--lh-snug)",
                  margin: 0,
                }}
              >
                {p.desc}
              </p>
            </div>
          ))}
        </div>

        <div
          data-reveal
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: "var(--space-2xl)",
            border: "1px solid var(--c-border)",
            background: "var(--c-surface)",
          }}
        >
          <MerkleTree width={300} height={180} />
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════
 *  How — three steps. Compact, no fluff. Built on 0G as a footer note.
 * ════════════════════════════════════════════════════════════════ */
function HowSection(): ReactElement {
  const ref = useScrollReveal<HTMLElement>({ scope: true });

  const steps = [
    {
      title: "Mint",
      desc: "Define the strategy root, daily limit, and model. Everything is encrypted and sealed inside an ERC-7857 token on 0G Chain.",
    },
    {
      title: "Run",
      desc: "Strategy ticks run via 0G Compute inference; vault actions verify Merkle proofs and daily limits on-chain. Settlement requires a proof plan.",
    },
    {
      title: "Trade",
      desc: "List on the open market. When someone buys, the key re-forges itself for the new owner. Old access dies instantly.",
    },
  ];

  return (
    <section
      ref={ref}
      className="landing-section"
      style={{
        paddingTop: "var(--space-5xl)",
        paddingBottom: "var(--space-5xl)",
      }}
    >
      <div
        data-reveal
        style={{
          textAlign: "center",
          maxWidth: "768px",
          margin: "0 auto var(--space-4xl)",
        }}
      >
        <h2
          style={{
            fontSize: "var(--text-3xl)",
            color: "var(--c-text-primary)",
            letterSpacing: "-0.02em",
            marginBottom: "var(--space-sm)",
          }}
        >
          Three steps.
        </h2>
        <p
          style={{
            fontSize: "var(--text-base)",
            color: "var(--c-text-muted)",
            maxWidth: "44ch",
            margin: "0 auto",
          }}
        >
          From mint to market in under a minute. No custodian, no middleman,
          no waiting.
        </p>
      </div>

      <div
        data-stagger
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "var(--space-xl)",
        }}
      >
        {steps.map((s, i) => (
          <div
            key={s.title}
            style={
              {
                "--stagger-index": i,
                padding: "var(--space-2xl)",
                border: "1px solid var(--c-border)",
                background: "var(--c-surface)",
              } as React.CSSProperties
            }
          >
            <h3
              style={{
                fontSize: "var(--text-lg)",
                color: "var(--c-text-primary)",
                marginBottom: "var(--space-sm)",
              }}
            >
              {s.title}
            </h3>
            <p
              style={{
                fontSize: "var(--text-sm)",
                color: "var(--c-text-muted)",
                lineHeight: "var(--lh-snug)",
                margin: 0,
              }}
            >
              {s.desc}
            </p>
          </div>
        ))}
      </div>

      {/* Compact stack note — replaces the old full StackSection */}
      <div
        data-reveal
        style={{
          marginTop: "var(--space-3xl)",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "var(--space-lg)",
          fontSize: "var(--text-xs)",
          color: "var(--c-text-dim)",
          fontFamily: "var(--font-mono)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        <span>0G Chain — settlement · ownership</span>
        <span style={{ color: "var(--c-border-strong)" }}>·</span>
        <span>0G Compute — router inference (software oracle for re-key)</span>
        <span style={{ color: "var(--c-border-strong)" }}>·</span>
        <span>0G Storage — encrypted payloads · Merkle proofs</span>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════
 *  CTA — one decision, one click.
 * ════════════════════════════════════════════════════════════════ */
function CTASection(): ReactElement {
  const ref = useScrollReveal<HTMLElement>({ scope: true });

  return (
    <section
      ref={ref}
      className="landing-section"
      style={{
        paddingTop: "var(--space-5xl)",
        paddingBottom: "var(--space-6xl)",
        textAlign: "center",
      }}
    >
      <div
        data-reveal
        style={{
          padding: "var(--space-4xl) var(--space-2xl)",
          border: "1px solid var(--c-border)",
          background: "var(--c-surface)",
          maxWidth: 640,
          margin: "0 auto",
        }}
      >
        <h2
          style={{
            fontSize: "var(--text-3xl)",
            color: "var(--c-text-primary)",
            letterSpacing: "-0.02em",
            marginBottom: "var(--space-md)",
          }}
        >
          Ready to mint?
        </h2>
        <p
          style={{
            fontSize: "var(--text-base)",
            color: "var(--c-text-muted)",
            maxWidth: "36ch",
            margin: "0 auto var(--space-2xl)",
          }}
        >
          Connect your wallet and deploy your first iNFT agent in under a
          minute.
        </p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-md)",
            justifyContent: "center",
          }}
        >
          <Link to="/agents/new" className="btn btn-primary">
            Mint an agent
          </Link>
          <Link to="/app" className="btn btn-secondary">
            Open dashboard
          </Link>
        </div>
      </div>
    </section>
  );
}

export default LandingPage;
