/*
  Landing (v2): public marketing surface. Connect opens the live WalletGate
  (pending intent /app); "How Axiom works" opens the v2 guide overlay.
  L2 round (2026-09): top nav expansion (4 inline links + Connect + phosphor
  dot + responsive hamburger), hero meta strip + trust-line + proof corners/
  label/hairline + floating receipt card, ticker, principles + journey
  sections, footer.
*/
import { useState } from "react";
import {
  CircleHelp,
  Globe2,
  Menu,
  Wallet,
  ArrowRight,
  ShieldCheck,
  FileCheck2,
  CreditCard,
  Clock3,
} from "../components/axiom/icons.js";
import { Button } from "../components/axiom/Controls.js";
import { Logo } from "../components/axiom/AppShell.js";
import { routePath } from "../lib/routeRegistry.js";
import { getCopy, interpolate, type Locale } from "../lib/copy.js";
import { useLandingStats } from "../hooks/useLandingStats.js";

/** L2-N2: format the live agents count as a comma-grouped number. */
function formatCount(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString();
}

/** L2-N6: principle-card icon dispatch. */
function PrincipleIcon({ name }: { name: "shield" | "receipt" | "wallet" }) {
  if (name === "shield") return <ShieldCheck size={18} aria-hidden="true" />;
  if (name === "receipt") return <FileCheck2 size={18} aria-hidden="true" />;
  return <CreditCard size={18} aria-hidden="true" />;
}

export function Landing({
  onConnect,
  onGuide,
  go,
  locale,
}: {
  onConnect: () => void;
  onGuide: () => void;
  go: (path: string) => void;
  locale: Locale;
}) {
  const copy = getCopy(locale);
  const [menuOpen, setMenuOpen] = useState(false);
  const stats = useLandingStats();
  const chainId = stats.networkChain ?? 9000;
  const agentsCount = stats.agentsOnline;
  const navigate = (path: string) => {
    setMenuOpen(false);
    go(path);
  };

  // L2-N7: dispatch for the journey card onClick so the icon key in copy stays
  // a typed union (no inline string → handler mapping in JSX).
  const journeyOnClicks = {
    onGuide,
    goToApp: () => go("/app"),
  } as const;

  return (
    <div className="landing-page">
      {/* L2-N1: expanded top nav. Logo gains the phosphor dot, 4 inline links
          visible at ≥980px, Connect pill, hamburger collapses to mobile. */}
      <header className="landing-nav">
        <Logo glyph />
        <nav className="nav-inline" aria-label={copy.landing.nav.overview}>
          <a className="is-active" href="#hero">
            {copy.landing.nav.overview}
          </a>
          <a href="#principles">{copy.landing.nav.principles}</a>
          <a href="#journey">{copy.landing.nav.howItWorks}</a>
          <a href="#footer">{copy.landing.nav.start}</a>
        </nav>
        <div className="nav-right">
          <button type="button" className="nav-connect" onClick={onConnect}>
            <Wallet size={14} aria-hidden="true" />
            {copy.landing.nav.connect}
          </button>
          <button
            className="icon-button landing-menu-trigger"
            onClick={() => setMenuOpen((value) => !value)}
            aria-label={copy.a11y.explorePublicPaths}
            aria-expanded={menuOpen}
            aria-controls="landing-mobile-menu"
          >
            <Menu size={18} />
          </button>
          {menuOpen && (
            <nav
              id="landing-mobile-menu"
              className="landing-mobile-menu"
              aria-label={copy.a11y.explorePublicPaths}
            >
              {(
                [
                  {
                    Icon: CircleHelp,
                    title: copy.nav.howItWorks,
                    hint: copy.landing.menuGuideHint,
                    onClick: () => {
                      setMenuOpen(false);
                      onGuide();
                    },
                  },
                  {
                    Icon: Globe2,
                    title: copy.landing.menuDevelopers,
                    hint: copy.landing.menuDevelopersHint,
                    onClick: () => navigate(routePath("developers")),
                  },
                ] as const
              ).map(({ Icon, title, hint, onClick }) => (
                <button key={title} onClick={onClick}>
                  <Icon size={16} />
                  <span>
                    <strong>{title}</strong>
                    <small>{hint}</small>
                  </span>
                </button>
              ))}
            </nav>
          )}
        </div>
      </header>

      <main className="landing-main" id="hero">
        <section className="landing-copy">
          <span className="eyebrow">
            <span>{copy.landing.eyebrow}</span>
          </span>
          <h1>
            <span>{copy.landing.titleLead}</span>
            <br />
            <i>{copy.landing.titleEmphasis}</i>
          </h1>
          <p>{copy.landing.description}</p>
          {/* L2-N2: hero meta strip — chain / agents / receipts counts. */}
          <div className="hero-meta">
            <span className="meta-item">
              <span className="dot" />
              {interpolate(copy.landing.meta.network, { chainId })}
            </span>
            <span className="meta-item">
              <span className="dot copper" />
              {interpolate(copy.landing.meta.agentsOnline, {
                count: formatCount(agentsCount),
              })}
            </span>
            <span className="meta-item">
              <span className="dot" />
              {interpolate(copy.landing.meta.receiptsIndexed, {
                count: "2.4M",
              })}
            </span>
          </div>
          <div className="button-row">
            <Button
              className="wallet-cta wallet-cta-hero"
              onClick={onConnect}
              icon={<Wallet size={15} />}
            >
              {copy.nav.connectWallet}
            </Button>
            <Button
              variant="ghost"
              onClick={onGuide}
              icon={<CircleHelp size={15} />}
            >
              {copy.nav.howItWorks}
            </Button>
            <button
              type="button"
              className="text-link"
              onClick={() => navigate(routePath("chat"))}
            >
              {copy.landing.tryAssistant}
            </button>
          </div>
          {/* L2-N3: trust-line chips below the buttons. */}
          <div className="trust-line">
            <span className="trust-item">
              <ShieldCheck size={12} aria-hidden="true" />
              {copy.landing.trust.nonCustodial}
            </span>
            <span className="trust-item">
              <Clock3 size={12} aria-hidden="true" />
              {copy.landing.trust.signedIn}
            </span>
            <span className="trust-item">
              <FileCheck2 size={12} aria-hidden="true" />
              {copy.landing.trust.receipt}
            </span>
          </div>
        </section>
        {/* L2-N4: proof plate chrome — corners, live label, hairline, floating
            receipt card. Existing hero-caption (R10) stays in place. */}
        <section className="landing-visual hero-visual-modern">
          <img
            className="hero-visual-poster"
            src="/brand/landing-proof-field-1536.webp"
            alt=""
            aria-hidden="true"
          />
          <div className="proof-corners" aria-hidden="true">
            <span className="bl" />
            <span className="br" />
          </div>
          <div className="proof-label">
            <span className="live-pulse" />
            <span>{copy.landing.proof.label}</span>
          </div>
          <div className="proof-hairline" aria-hidden="true" />
          <div className="hero-caption">
            <small>{copy.landing.proofCaptionSmall}</small>
            <strong>{copy.landing.proofCaptionBody}</strong>
          </div>
          <div className="floating-receipt">
            <div className="receipt-head">
              <span className="receipt-kind">
                {copy.landing.proof.receipt.kind}
              </span>
              <span className="receipt-state">
                <span className="live-pulse" />
                {copy.landing.proof.receipt.state}
              </span>
            </div>
            <h4 className="receipt-title">
              {copy.landing.proof.receipt.title}
            </h4>
            <div className="receipt-rows">
              <div>
                <span>{copy.landing.proof.receipt.agent}</span>
                <strong>#7</strong>
              </div>
              <div>
                <span>{copy.landing.proof.receipt.block}</span>
                <strong>1,284,901</strong>
              </div>
              <div>
                <span>{copy.landing.proof.receipt.gas}</span>
                <strong>0.0024 0G</strong>
              </div>
              <div>
                <span>{copy.landing.proof.receipt.outcome}</span>
                <strong>{copy.landing.proof.receipt.outcomeValue}</strong>
              </div>
            </div>
            <div className="receipt-meta">
              <span>{copy.landing.proof.receipt.meta}</span>
              <span className="hash">0x9f3c…7a2e</span>
            </div>
          </div>
        </section>
      </main>

      {/* L2-N5: live activity ticker (placeholder data; live event stream is
          auth-gated and not appropriate for the signed-out Landing). */}
      <section
        className="ticker"
        aria-label={interpolate(copy.landing.ticker.label, { chainId })}
      >
        <span className="ticker-label">
          <span className="live-pulse" />
          {interpolate(copy.landing.ticker.label, { chainId })}
        </span>
        <div className="ticker-track">
          {copy.landing.ticker.items.map((item, i) => (
            <span key={i} className="ticker-item">
              <span
                className={`dot ${item.dot === "warning" ? "warning" : ""}`}
              />
              <strong>{item.agent}</strong>
              <span>
                {" "}
                · {item.action} · {item.ago}
              </span>
            </span>
          ))}
        </div>
      </section>

      {/* L2-N6: principles section — three numbered cards. */}
      <section className="scroll-section principles-section" id="principles">
        <header className="section-head">
          <span className="section-eyebrow">
            <span className="num">02</span>// {copy.landing.principles.eyebrow}
          </span>
          <h2
            dangerouslySetInnerHTML={{
              __html: interpolate(copy.landing.principles.title, {
                emphasis: "<em>",
                endEmphasis: "</em>",
              }),
            }}
          />
        </header>
        <div className="principles-grid">
          {copy.landing.principles.items.map((p, i) => (
            <article key={i} className="principle">
              <span className="p-num">0{i + 1}</span>
              <span className="p-icon" aria-hidden="true">
                <PrincipleIcon name={p.icon} />
              </span>
              <h3 dangerouslySetInnerHTML={{ __html: p.title }} />
              <p dangerouslySetInnerHTML={{ __html: p.body }} />
              <a href="#" className="p-link">
                {p.link} <ArrowRight size={11} aria-hidden="true" />
              </a>
            </article>
          ))}
        </div>
      </section>

      {/* L2-N7: journey section (replaces the strip — same destinations). */}
      <section className="scroll-section journey-section" id="journey">
        <header className="section-head">
          <span className="section-eyebrow">
            <span className="num">03</span>// {copy.landing.journey.eyebrow}
          </span>
          <h2
            dangerouslySetInnerHTML={{
              __html: interpolate(copy.landing.journey.title, {
                emphasis: "<em>",
                endEmphasis: "</em>",
              }),
            }}
          />
        </header>
        <div className="journey">
          {copy.landing.journey.items.map((item, i) => (
            <article key={i} className="journey-card">
              <span className="j-num">// {item.eyebrow}</span>
              <h3 dangerouslySetInnerHTML={{ __html: item.title }} />
              <p dangerouslySetInnerHTML={{ __html: item.body }} />
              <div className="j-meta">
                <strong
                  dangerouslySetInnerHTML={{
                    __html: interpolate(item.meta, {
                      count: formatCount(agentsCount),
                    }),
                  }}
                />
              </div>
              <button
                type="button"
                className="j-cta"
                onClick={journeyOnClicks[item.onClick]}
              >
                {item.cta} <ArrowRight size={13} aria-hidden="true" />
              </button>
            </article>
          ))}
        </div>
      </section>

      {/* L2-N8: footer. */}
      <footer className="landing-footer" id="footer">
        <small>{copy.landing.footer.credit}</small>
        <div className="footer-meta">
          {copy.landing.footer.links.map((l, i) => (
            <a key={i} href="#">
              {l.label}
            </a>
          ))}
        </div>
      </footer>
    </div>
  );
}
