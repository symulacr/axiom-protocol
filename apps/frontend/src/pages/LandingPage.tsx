/*
  Landing (v2): public marketing surface. Connect opens the live WalletGate
  (pending intent /app); "How Axiom works" opens the v2 guide overlay.
  L2 round (2026-09): top nav expansion (4 inline links + Connect + phosphor
  dot + responsive hamburger), hero meta strip + trust-line + proof corners/
  label/hairline + floating receipt card, ticker, principles + journey
  sections, footer.
  AW round (2026-09-03): cinematic layer (fx kit + axiom-awwwards.css) —
  scroll progress, grain, hero orbs, reveal stagger, parallax journey,
  spotlight principle cards, marquee ticker, wordmark footer. All kicker /
  eyebrow / numbered-label spans removed per the no-noise design law.
*/
import { useEffect, useRef, useState } from "react";
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
import { ThemeToggle } from "../components/axiom/ThemeToggle.js";
import {
  routePath,
  PUBLIC_HUB_PATHS,
} from "../lib/routeRegistry.js";
import { getCopy, interpolate, type Locale } from "../lib/copy.js";
import { APP_CHAIN } from "../config/wagmi.js";
import { useLandingStats } from "../hooks/useLandingStats.js";
import {
  useLandingTicker,
  TICKER_MAX_ITEMS,
} from "../hooks/useLandingTicker.js";
import {
  CountUp,
  GrainOverlay,
  Parallax,
  Reveal,
  ScrollProgress,
  SpotlightCard,
  useReducedMotion,
} from "../components/fx/fx.js";
import { ThreeBackground } from "../components/fx/ThreeBackground.js";
import { SignalArcField } from "../components/fx/SignalArcField.js";
import { ReceiptSeal } from "../components/fx/ReceiptSeal.js";

/** Splits a "{count}" template so the live number can animate via CountUp;
 *  templates without the placeholder render unchanged. A null value means
 *  the live count is unavailable (no backend) — the whole line is hidden
 *  instead of painting "Live · — agents online". */
function CountText({
  template,
  value,
}: {
  template: string;
  value: number | null;
}) {
  const [lead, tail = ""] = template.split("{count}");
  if (lead === template) return <>{template}</>;
  if (value === null) return null;
  return (
    <>
      {lead}
      <CountUp value={value} />
      {tail}
    </>
  );
}

/** L2-N6: principle-card icon dispatch. */
function PrincipleIcon({ name }: { name: "shield" | "receipt" | "wallet" }) {
  if (name === "shield") return <ShieldCheck size={18} aria-hidden="true" />;
  if (name === "receipt") return <FileCheck2 size={18} aria-hidden="true" />;
  return <CreditCard size={18} aria-hidden="true" />;
}

/** Wave 5: footer + principle links are locale-keyed labels with no href in
 *  copy.ts, so the destinations are wired by the (locale-stable) index order
 *  — Agents/Receipts/Storage/Developers map onto the canonical hub paths. */
const FOOTER_HREFS = [
  PUBLIC_HUB_PATHS.agents,
  PUBLIC_HUB_PATHS.proofs,
  PUBLIC_HUB_PATHS.storage,
  PUBLIC_HUB_PATHS.developers,
] as const;

/** Wave 5: principle cards (spec / receipts / wallet) get real destinations
 *  too — the audit flagged every `href="#"` on the landing as a dead link. */
const PRINCIPLE_HREFS = [
  PUBLIC_HUB_PATHS.developers,
  PUBLIC_HUB_PATHS.proofs,
  PUBLIC_HUB_PATHS.payments,
] as const;

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
  const plateRef = useRef<HTMLElement | null>(null);
  const stats = useLandingStats();
  // networkChain is the configured chain (APP_CHAIN_ID) — the landing no
  // longer claims a hardcoded mainnet id on a testnet build.
  const chainId = stats.networkChain;
  const agentsCount = stats.agentsOnline;
  const liveTickerItems = useLandingTicker(
    copy.landing.ticker.actionLabels,
    locale,
  );
  /** L2-N5-LIVE: live events first, padded with copy placeholders so the
   *  rail is always exactly TICKER_MAX_ITEMS long. Placeholders whose agent
   *  id is already shown by a live row are dropped — a duplicated row read
   *  as a rendering bug, not as data (2026-09-02 re-audit). */
  const seenAgents = new Set(liveTickerItems.map((item) => item.agent));
  const tickerItems = [
    ...liveTickerItems,
    ...copy.landing.ticker.items.filter(
      (item) => !seenAgents.has(item.agent),
    ),
  ].slice(0, TICKER_MAX_ITEMS);

  // R13 (baseline-ui): looping animations MUST pause when off-screen — the
  // marquee and live dots keep running past the fold otherwise.
  const tickerRef = useRef<HTMLElement>(null);
  // R20: the marquee strip needs enough duplicated sets that one half always
  // covers the viewport — a fixed 2-set strip left a right-side gap on wide
  // screens. Measured after mount (and on resize) from one set's width.
  // Reduced motion: the tape is a static list, so ONE set renders — repeated
  // copies read as a broken screenshot-like row, not as a motion fallback.
  const reducedMotion = useReducedMotion();
  const [tickerCopies, setTickerCopies] = useState(2);
  const copiesRef = useRef(2);
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;
    const compute = () => {
      const setWidth = track.scrollWidth / copiesRef.current;
      if (setWidth <= 0) return;
      const next = Math.max(2, 2 * Math.ceil(viewport.clientWidth / setWidth));
      copiesRef.current = next;
      setTickerCopies((prev) => (prev === next ? prev : next));
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);
  useEffect(() => {
    const el = tickerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) =>
        el.toggleAttribute("data-offscreen", !entries[0]?.isIntersecting),
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

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
      <ScrollProgress />
      <GrainOverlay />
      {/* R12: WebGL point field behind all landing content (direct child so
          the z-index contract in index.css keeps it under every section). */}
      <ThreeBackground />
      {/* U27 parity with the console: keyboard bypass of the landing nav. */}
      <a className="skip-link" href="#hero">
        {copy.a11y.skipToContent}
      </a>
      {/* L2-N1: expanded top nav. Logo gains the phosphor dot, 4 inline links
          visible at ≥980px, Connect pill, hamburger collapses to mobile. */}
      {/* R16: nav + live ticker form ONE sticky header band — the live strip
          rode mid-page before; now it sits under the nav like a market tape. */}
      <header className="landing-header">
        <div className="landing-nav">
        <Logo glyph />
        <nav className="nav-inline" aria-label={copy.landing.nav.overview}>
          <a className="is-active" href="#hero">
            {copy.landing.nav.overview}
          </a>
          <a href="#principles">{copy.landing.nav.principles}</a>
          <a href="#how">{copy.landing.nav.howItWorks}</a>
          <a href="#footer">{copy.landing.nav.start}</a>
        </nav>
        <div className="nav-right">
          <ThemeToggle locale={locale} />
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
        </div>
        {/* L2-N5: live activity ticker. Renders the most recent events
            pulled from /v1/events, padded with copy placeholders so the
            rail always has TICKER_MAX_ITEMS rows. */}
        <section
          ref={tickerRef}
          className="ticker"
          aria-label={interpolate(copy.landing.ticker.label, { chainId })}
        >
          <span className="ticker-label">
            <span className="live-pulse" />
            {interpolate(copy.landing.ticker.label, { chainId })}
          </span>
          {/* Wave 5: the track is aria-hidden — the section label above already
              names the rail, so screen readers hear the summary once instead of
              the row contents twice. */}
          {/* R20: the strip runs inside a clipping viewport — translated
              max-content previously slid UNDER the static label and left a
              right-side gap. The viewport clips both; the set count is
              measured so one loop half always covers the band. */}
          <div className="ticker-viewport" ref={viewportRef}>
            <div className="ticker-track" aria-hidden="true" ref={trackRef}>
              {Array.from({
                length: reducedMotion ? 1 : tickerCopies,
              }).map((_, copy) => (
                <span key={copy} className="ticker-set">
                  {tickerItems.map((item, i) => (
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
                </span>
              ))}
            </div>
          </div>
        </section>
      </header>

      <main className="landing-main" id="hero" tabIndex={-1}>
        <Reveal>
        <section className="landing-copy">
          <h1>
            <span>{copy.landing.titleLead}</span>
            <br />
            <i>{copy.landing.titleEmphasis}</i>
          </h1>
          <p>{copy.landing.description}</p>
          {/* L2-N2: hero meta strip — live chain + on-chain agent count only. */}
          <div className="hero-meta">
            <span className="meta-item">
              <span className="dot" />
              {interpolate(copy.landing.meta.network, {
                chainName: APP_CHAIN.name,
                chainId,
              })}
            </span>
            {/* Live count unavailable (no backend) → the whole item hides;
                a lone dot next to nothing reads as a broken chip. */}
            {agentsCount !== null && (
              <span className="meta-item">
                <span className="dot copper" />
                <CountText
                  template={copy.landing.meta.agentsOnline}
                  value={agentsCount}
                />
              </span>
            )}
          </div>
          <div className="button-row">
            <Button
              className="wallet-cta wallet-cta-hero"
              onClick={onConnect}
              icon={<Wallet size={16} />}
            >
              {copy.nav.connectWallet}
            </Button>
            <Button
              variant="ghost"
              onClick={onGuide}
              icon={<CircleHelp size={16} />}
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
              <ShieldCheck size={14} aria-hidden="true" />
              {copy.landing.trust.nonCustodial}
            </span>
            <span className="trust-item">
              <Clock3 size={14} aria-hidden="true" />
              {copy.landing.trust.signedIn}
            </span>
            <span className="trust-item">
              <FileCheck2 size={14} aria-hidden="true" />
              {copy.landing.trust.receipt}
            </span>
          </div>
        </section>
        </Reveal>
        {/* L2-N4: proof plate chrome — corners, live label, hairline, floating
            receipt card. Existing hero-caption (R10) stays in place. */}
        <Reveal delay={160}>
        <section
          className="landing-visual hero-visual-modern aw-spotlight"
          ref={plateRef}
          onPointerMove={(event) => {
            // Same contract as fx.tsx SpotlightCard: the ::before glow tracks
            // the cursor through --aw-spot-x/-y.
            const el = plateRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            el.style.setProperty("--aw-spot-x", `${event.clientX - rect.left}px`);
            el.style.setProperty("--aw-spot-y", `${event.clientY - rect.top}px`);
          }}
        >
          {/* R11: the whole plate is one click target to the proofs hub —
              the receipt card is display content, not a separate control. */}
          <a
            className="proof-plate-link"
            href="/proofs"
            aria-label={copy.landing.proofPlateA11y}
          />
          <img
            className="hero-visual-poster"
            src="/brand/hero-seal-512.jpg"
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
                <ReceiptSeal />
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
        </Reveal>
      </main>

      {/* L2-N6: principles section — three numbered cards. */}
      <section className="scroll-section principles-section" id="principles">
        <header className="section-head">
          <h2
            dangerouslySetInnerHTML={{
              __html: interpolate(copy.landing.principles.title, {
                emphasis: "<em>",
                endEmphasis: "</em>",
              }),
            }}
          />
        </header>
        <Reveal>
        <div className="principles-grid">
          {copy.landing.principles.items.map((p, i) => (
            <SpotlightCard key={i} className="principle">
              <span className="p-icon" aria-hidden="true">
                <PrincipleIcon name={p.icon} />
              </span>
              <h3 dangerouslySetInnerHTML={{ __html: p.title }} />
              <p dangerouslySetInnerHTML={{ __html: p.body }} />
              <a href={PRINCIPLE_HREFS[i]} className="p-link">
                {p.link} <ArrowRight size={14} aria-hidden="true" />
              </a>
            </SpotlightCard>
          ))}
        </div>
        </Reveal>
      </section>

      {/* R12: how-it-works — the operating loop; the nav's "How it works"
          anchor points here (it previously mis-landed on the journey). */}
      <section className="scroll-section how-section" id="how">
        {/* R23: canvas2D data-arc band (ThreeUI Predictive Arc adaptation) —
            atmosphere behind the steps, clipped and pointer-inert. */}
        <SignalArcField />
        <header className="section-head">
          <h2
            dangerouslySetInnerHTML={{
              __html: interpolate(copy.landing.how.title, {
                emphasis: "<em>",
                endEmphasis: "</em>",
              }),
            }}
          />
        </header>
        <Reveal>
        <div className="principles-grid how-grid">
          {copy.landing.how.steps.map((step, i) => (
            <SpotlightCard key={i} className="principle how-step">
              <h3 dangerouslySetInnerHTML={{ __html: step.title }} />
              <p dangerouslySetInnerHTML={{ __html: step.body }} />
            </SpotlightCard>
          ))}
        </div>
        </Reveal>
      </section>

      {/* L2-N7: journey section (replaces the strip — same destinations). */}
      <section className="scroll-section journey-section" id="journey">
        <header className="section-head">
          <h2
            dangerouslySetInnerHTML={{
              __html: interpolate(copy.landing.journey.title, {
                emphasis: "<em>",
                endEmphasis: "</em>",
              }),
            }}
          />
        </header>
        <Reveal>
        <div className="journey">
          {copy.landing.journey.items.map((item, i) => (
            <Parallax key={i} strength={i === 0 ? -30 : 30}>
            <article className="journey-card">
              <h3 dangerouslySetInnerHTML={{ __html: item.title }} />
              <p dangerouslySetInnerHTML={{ __html: item.body }} />
              {/* Static meta always shows; the live-count line only when the
                  count is real (no-backend builds hide the broken dash). */}
              {(agentsCount !== null || !item.meta.includes("{count}")) && (
                <div className="j-meta">
                  <strong>
                    <CountText template={item.meta} value={agentsCount} />
                  </strong>
                </div>
              )}
              <button
                type="button"
                className="j-cta"
                onClick={journeyOnClicks[item.onClick]}
              >
                {item.cta} <ArrowRight size={14} aria-hidden="true" />
              </button>
            </article>
            </Parallax>
          ))}
        </div>
        </Reveal>
      </section>

      {/* L2-N8: footer. */}
      <Reveal>
      <footer className="landing-footer" id="footer">
        <small>{copy.landing.footer.credit}</small>
        <div className="footer-meta">
          {copy.landing.footer.links.map((l, i) => (
            <a key={i} href={FOOTER_HREFS[i]}>
              {l.label}
            </a>
          ))}
        </div>
      </footer>
      </Reveal>
    </div>
  );
}
