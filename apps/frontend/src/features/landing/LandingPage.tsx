import { type CSSProperties, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { useScrollReveal } from "../../hooks/useScrollReveal.js";
import { BRAND } from "../../brand/assets.js";
import {
  VaultSeal,
  MerkleTree,
  AgentTick,
} from "../../components/illustrations/index.js";

/**
 * Landing — premium cyber-luxury public face of Axiom Protocol.
 * Void base · indigo · copper · phosphor · brand imagery.
 */
export function LandingPage(): ReactElement {
  return (
    <article className="landing-root">
      <HeroSection />
      <StatsStrip />
      <WhySection />
      <HowSection />
      <StackSection />
      <HonestySection />
      <CTASection />
    </article>
  );
}

function HeroSection(): ReactElement {
  const heroRef = useScrollReveal<HTMLElement>({ scope: true });

  return (
    <section
      ref={heroRef}
      className="landing-hero"
      style={{
        position: "relative",
        overflow: "hidden",
        paddingTop: "var(--space-5xl)",
        paddingBottom: "var(--space-5xl)",
        paddingLeft: "var(--space-xl)",
        paddingRight: "var(--space-xl)",
        background: "var(--c-bg)",
        backgroundImage: "var(--grad-hero)",
        borderBottom: "1px solid var(--c-border)",
      }}
    >
      {/* Soft brand wash */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `url(${BRAND.ogBanner})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          opacity: 0.14,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "relative",
          maxWidth: "var(--content-max)",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "var(--space-3xl)",
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-xl)",
            textAlign: "left",
          }}
        >
          <div data-reveal>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "4px 12px",
                borderRadius: "999px",
                border: "1px solid var(--c-border-strong)",
                background: "var(--c-surface)",
                fontSize: "var(--text-xs)",
                fontFamily: "var(--font-mono)",
                color: "var(--c-phosphor)",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              <span
                className="phosphor-glow"
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "var(--c-phosphor)",
                }}
              />
              ERC-7857 · 0G Aristotle
            </span>
          </div>

          <h1
            data-reveal
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-4xl)",
              fontWeight: "var(--fw-bold)",
              color: "var(--c-text-primary)",
              letterSpacing: "-0.03em",
              lineHeight: "var(--lh-tight)",
              margin: 0,
            }}
          >
            Ownable AI agents,
            <br />
            <span style={{ color: "var(--c-bronze-light)" }}>sealed on-chain.</span>
          </h1>

          <p
            data-reveal
            style={{
              fontSize: "var(--text-lg)",
              color: "var(--c-text-muted)",
              maxWidth: "42ch",
              lineHeight: "var(--lh-snug)",
              margin: 0,
            }}
          >
            Axiom mints intelligent NFTs you hold — strategy, vault capital, and
            re-keyed intelligence on transfer. Name your agent. Mint in one step.
          </p>

          <div
            data-reveal
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "var(--space-md)",
              alignItems: "center",
            }}
          >
            <Link to="/app?mint=1" className="btn btn-primary" style={ctaPrimary}>
              Mint an agent
            </Link>
            <Link to="/app" className="btn btn-secondary" style={ctaSecondary}>
              Open app
            </Link>
            <Link
              to="/chat"
              style={{
                color: "var(--c-bronze-light)",
                textDecoration: "none",
                fontSize: "var(--text-sm)",
                fontWeight: "var(--fw-medium)",
              }}
            >
              Talk to Axiom →
            </Link>
          </div>
        </div>

        <div
          data-reveal
          style={{
            display: "flex",
            justifyContent: "center",
            position: "relative",
          }}
        >
          <div
            className="surface-glass card-layered"
            style={{
              padding: "var(--space-lg)",
              borderRadius: "var(--radius-xl)",
              maxWidth: 360,
              width: "100%",
            }}
          >
            <img
              src={BRAND.heroSeal}
              alt=""
              width={320}
              height={320}
              style={{
                width: "100%",
                height: "auto",
                borderRadius: "var(--radius-lg)",
                display: "block",
                border: "1px solid var(--c-border)",
              }}
            />
            <div
              style={{
                marginTop: "var(--space-md)",
                display: "flex",
                justifyContent: "space-between",
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-xs)",
                color: "var(--c-text-dim)",
              }}
            >
              <span style={{ color: "var(--c-phosphor)" }}>LIVE · LCD</span>
              <span style={{ color: "var(--c-copper-light)" }}>VAULT READY</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatsStrip(): ReactElement {
  const items = [
    { k: "Standard", v: "ERC-7857 iNFT" },
    { k: "Chain", v: "0G Aristotle 16661" },
    { k: "Oracle", v: "Software TEE signer" },
    { k: "Mint", v: "Name → one click" },
  ];
  return (
    <section
      style={{
        borderBottom: "1px solid var(--c-border)",
        background: "var(--c-surface)",
        padding: "var(--space-lg) var(--space-xl)",
      }}
    >
      <div
        style={{
          maxWidth: "var(--content-max)",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "var(--space-md)",
        }}
      >
        {items.map((it) => (
          <div key={it.k} className="surface-lcd" style={{ padding: "var(--space-md)" }}>
            <div
              style={{
                fontSize: "10px",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                opacity: 0.7,
                marginBottom: 4,
              }}
            >
              {it.k}
            </div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--c-phosphor)" }}>
              {it.v}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function WhySection(): ReactElement {
  const ref = useScrollReveal<HTMLElement>({ scope: true });
  const principles = [
    {
      title: "Own the key",
      desc: "Intelligence is sealed off-chain; ownership and dataHash live on the iNFT. You control transfer and vault capital.",
      accent: "var(--c-bronze-light)",
    },
    {
      title: "Bound the strategy",
      desc: "Vault actions check a Merkle strategy root and daily limit. Ticks settle only with a valid proof plan.",
      accent: "var(--c-copper-light)",
    },
    {
      title: "Transfer with re-key",
      desc: "iTransfer re-encrypts for the receiver via the oracle — sealed DEK on the wire, no shared plaintext.",
      accent: "var(--c-phosphor)",
    },
  ];

  return (
    <section
      ref={ref}
      className="landing-section"
      style={{
        padding: "var(--space-5xl) var(--space-xl)",
        maxWidth: "var(--content-max)",
        margin: "0 auto",
      }}
    >
      <div data-reveal style={{ maxWidth: "40rem", marginBottom: "var(--space-3xl)" }}>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--text-3xl)",
            color: "var(--c-text-primary)",
            letterSpacing: "-0.02em",
            marginBottom: "var(--space-md)",
          }}
        >
          Your agent should be yours.
        </h2>
        <p
          style={{
            fontSize: "var(--text-base)",
            color: "var(--c-text-muted)",
            lineHeight: "var(--lh-normal)",
            margin: 0,
          }}
        >
          Platforms throttle, watch, and revoke. An iNFT is the agent — hold the
          token, hold the strategy. Transfer it and access re-keys.
        </p>
      </div>

      <div
        data-stagger
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "var(--space-lg)",
        }}
      >
        {principles.map((p, i) => (
          <div
            key={p.title}
            className="surface-glass card-layered"
            style={
              {
                "--stagger-index": i,
                padding: "var(--space-xl)",
                borderTop: `2px solid ${p.accent}`,
              } as CSSProperties
            }
          >
            <h3
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "var(--text-lg)",
                color: "var(--c-text-primary)",
                margin: "0 0 var(--space-sm)",
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
          marginTop: "var(--space-3xl)",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "var(--space-xl)",
          alignItems: "center",
        }}
      >
        <div
          className="surface-glass"
          style={{
            padding: "var(--space-2xl)",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <MerkleTree width={300} height={180} />
        </div>
        <div
          className="surface-glass"
          style={{
            padding: "var(--space-2xl)",
            display: "flex",
            justifyContent: "center",
            flexDirection: "column",
            alignItems: "center",
            gap: "var(--space-md)",
          }}
        >
          <img
            src={BRAND.agentLattice}
            alt=""
            width={200}
            height={200}
            style={{
              width: 160,
              height: 160,
              objectFit: "cover",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--c-border)",
            }}
          />
          <VaultSeal size={72} style={{ color: "var(--c-bronze-light)" }} />
        </div>
      </div>
    </section>
  );
}

function HowSection(): ReactElement {
  const ref = useScrollReveal<HTMLElement>({ scope: true });
  const steps = [
    {
      n: "01",
      title: "Name",
      desc: "One field. We auto-seal a default strategy payload and dataHash — no JSON ceremony.",
    },
    {
      n: "02",
      title: "Mint",
      desc: "Oracle registers the hash; your wallet signs the mint fee. iNFT appears in your vault.",
    },
    {
      n: "03",
      title: "Run",
      desc: "Fund the vault, bind a strategy root, tick via 0G Compute. Ask Axiom when you need help.",
    },
  ];

  return (
    <section
      ref={ref}
      style={{
        padding: "var(--space-5xl) var(--space-xl)",
        background: "linear-gradient(180deg, transparent, rgba(79,70,229,0.06), transparent)",
        borderTop: "1px solid var(--c-border)",
        borderBottom: "1px solid var(--c-border)",
      }}
    >
      <div style={{ maxWidth: "var(--content-max)", margin: "0 auto" }}>
        <div data-reveal style={{ textAlign: "center", marginBottom: "var(--space-3xl)" }}>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-3xl)",
              color: "var(--c-text-primary)",
              margin: "0 0 var(--space-sm)",
            }}
          >
            Three steps. Under a minute.
          </h2>
          <p style={{ color: "var(--c-text-muted)", margin: 0, fontSize: "var(--text-base)" }}>
            From name to ownable agent — oracle + chain handled for you.
          </p>
        </div>

        <div
          data-stagger
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "var(--space-lg)",
          }}
        >
          {steps.map((s, i) => (
            <div
              key={s.n}
              className="surface-glass card-layered"
              style={
                {
                  "--stagger-index": i,
                  padding: "var(--space-2xl)",
                } as CSSProperties
              }
            >
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-xs)",
                  color: "var(--c-bronze-light)",
                  marginBottom: "var(--space-sm)",
                  letterSpacing: "0.12em",
                }}
              >
                {s.n}
              </div>
              <h3
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "var(--text-xl)",
                  color: "var(--c-text-primary)",
                  margin: "0 0 var(--space-sm)",
                }}
              >
                {s.title}
              </h3>
              <p
                style={{
                  fontSize: "var(--text-sm)",
                  color: "var(--c-text-muted)",
                  margin: 0,
                  lineHeight: "var(--lh-snug)",
                }}
              >
                {s.desc}
              </p>
            </div>
          ))}
        </div>

        <div
          data-reveal
          style={{
            marginTop: "var(--space-2xl)",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <AgentTick width={280} height={120} />
        </div>
      </div>
    </section>
  );
}

function StackSection(): ReactElement {
  const ref = useScrollReveal<HTMLElement>({ scope: true });
  const layers = [
    { t: "0G Chain", d: "Settlement · ownership · vault limits" },
    { t: "0G Compute", d: "Chat + strategy tick inference" },
    { t: "0G Storage", d: "Encrypted payloads · Merkle roots" },
    { t: "Oracle", d: "Software TEE signer · re-key proofs" },
  ];
  return (
    <section
      ref={ref}
      className="landing-section"
      style={{
        padding: "var(--space-5xl) var(--space-xl)",
        maxWidth: "var(--content-max)",
        margin: "0 auto",
      }}
    >
      <h2
        data-reveal
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--text-2xl)",
          color: "var(--c-text-primary)",
          marginBottom: "var(--space-xl)",
        }}
      >
        Stack
      </h2>
      <div
        data-stagger
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "var(--space-md)",
        }}
      >
        {layers.map((l, i) => (
          <div
            key={l.t}
            className="surface-copper"
            style={
              {
                "--stagger-index": i,
                padding: "var(--space-lg)",
              } as CSSProperties
            }
          >
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: "var(--fw-semibold)",
                color: "var(--c-copper-light)",
                marginBottom: 6,
              }}
            >
              {l.t}
            </div>
            <div style={{ fontSize: "var(--text-sm)", color: "var(--c-text-muted)" }}>
              {l.d}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function HonestySection(): ReactElement {
  const ref = useScrollReveal<HTMLElement>({ scope: true });
  return (
    <section
      ref={ref}
      style={{
        padding: "var(--space-3xl) var(--space-xl)",
        maxWidth: "var(--content-max)",
        margin: "0 auto",
      }}
    >
      <div
        data-reveal
        className="surface-glass"
        style={{
          padding: "var(--space-xl)",
          borderLeft: "3px solid var(--c-warning)",
        }}
      >
        <h3
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--text-base)",
            color: "var(--c-text-primary)",
            margin: "0 0 var(--space-sm)",
          }}
        >
          Honest about the oracle
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: "var(--text-sm)",
            color: "var(--c-text-muted)",
            lineHeight: "var(--lh-snug)",
            maxWidth: "62ch",
          }}
        >
          Re-key proofs are signed by a software TEE signer (Node secp256k1), not
          Intel TDX / AMD SEV hardware enclaves. Product is real on-chain iNFTs
          and vaults — enclave class is disclosed, not hyped.
        </p>
      </div>
    </section>
  );
}

function CTASection(): ReactElement {
  const ref = useScrollReveal<HTMLElement>({ scope: true });
  return (
    <section
      ref={ref}
      style={{
        padding: "var(--space-5xl) var(--space-xl) var(--space-6xl)",
        textAlign: "center",
      }}
    >
      <div
        data-reveal
        className="surface-glass card-layered"
        style={{
          maxWidth: 640,
          margin: "0 auto",
          padding: "var(--space-4xl) var(--space-2xl)",
          backgroundImage: `linear-gradient(165deg, rgba(79,70,229,0.18), transparent 50%), url(${BRAND.emptyAgents})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(5,5,12,0.82)",
            pointerEvents: "none",
          }}
        />
        <div style={{ position: "relative" }}>
          <img
            src={BRAND.chatAvatar}
            alt=""
            width={56}
            height={56}
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              border: "1px solid var(--c-border-strong)",
              marginBottom: "var(--space-md)",
            }}
          />
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--text-3xl)",
              color: "var(--c-text-primary)",
              margin: "0 0 var(--space-md)",
            }}
          >
            Name it. Mint it. Own it.
          </h2>
          <p
            style={{
              fontSize: "var(--text-base)",
              color: "var(--c-text-muted)",
              maxWidth: "36ch",
              margin: "0 auto var(--space-2xl)",
            }}
          >
            One field. Auto payload. Oracle + chain. Your first iNFT in under a
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
            <Link to="/app?mint=1" className="btn btn-primary" style={ctaPrimary}>
              Mint an agent
            </Link>
            <Link to="/app" className="btn btn-secondary" style={ctaSecondary}>
              Open app
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

const ctaPrimary: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "0.75rem 1.35rem",
  borderRadius: "var(--radius-md)",
  background: "var(--c-bronze)",
  color: "#fff",
  fontWeight: "var(--fw-semibold)",
  fontSize: "var(--text-sm)",
  textDecoration: "none",
  border: "none",
};

const ctaSecondary: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "0.75rem 1.35rem",
  borderRadius: "var(--radius-md)",
  background: "transparent",
  color: "var(--c-text-primary)",
  fontWeight: "var(--fw-semibold)",
  fontSize: "var(--text-sm)",
  textDecoration: "none",
  border: "1px solid var(--c-border-strong)",
};

export default LandingPage;
