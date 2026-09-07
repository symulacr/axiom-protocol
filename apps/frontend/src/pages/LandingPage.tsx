/*
  Landing (v3, calm redesign): public marketing surface. Connect opens the
  live WalletGate (pending intent /app); "How Axiom works" opens the guide
  overlay. Noise-purge pass (2026-09): removed the ticker band, hero meta
  strip, trust chips, proof plate chrome and journey section, leaving nav,
  hero copy + buttons, principles, how-it-works and footer. All kicker /
  eyebrow / numbered-label spans removed per the no-noise design law.
*/
import { useRef, useState } from "react";
import {
  CircleHelp,
  Globe2,
  Menu,
  Wallet,
  ArrowRight,
  ShieldCheck,
  FileCheck2,
  CreditCard,
} from "../components/axiom/icons.js";
import { Button } from "../components/axiom/Controls.js";
import { Logo } from "../components/axiom/AppShell.js";
import { ThemeToggle } from "../components/axiom/ThemeToggle.js";
import { useModalDismiss } from "../hooks/useModalDismiss.js";
import { routePath, PUBLIC_HUB_PATHS } from "../lib/routeRegistry.js";
import { getCopy, interpolate, type Copy, type Locale } from "../lib/copy.js";
import {
  GrainOverlay,
  Reveal,
  ScrollProgress,
  SpotlightCard,
} from "../components/fx/fx.js";
import { ThreeBackground } from "../components/fx/ThreeBackground.js";

/** L2-N6: principle-card icon dispatch. 1.5 stroke is set here once so the
 *  three cards share a consistent glyph weight. */
function PrincipleIcon({ name }: { name: "shield" | "receipt" | "wallet" }) {
  const common = { size: 18, strokeWidth: 1.5, "aria-hidden": true } as const;
  if (name === "shield") return <ShieldCheck {...common} />;
  if (name === "receipt") return <FileCheck2 {...common} />;
  return <CreditCard {...common} />;
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

/** Mobile menu: same dismiss contract as the console overlays — Esc + Tab
 *  trap + initial focus + focus restore via useModalDismiss; the transparent
 *  fixed backdrop (filters-backdrop recipe) carries the outside-click leg. */
function LandingMobileMenu({
  copy,
  onClose,
  onGuide,
  go,
}: {
  copy: Copy;
  onClose: () => void;
  onGuide: () => void;
  go: (path: string) => void;
}) {
  const menuRef = useRef<HTMLElement>(null);
  useModalDismiss(onClose, menuRef);
  const navigate = (path: string) => {
    onClose();
    go(path);
  };
  return (
    <>
      <div className="filters-backdrop" onMouseDown={onClose} />
      <nav
        ref={menuRef}
        id="landing-mobile-menu"
        className="landing-mobile-menu"
        role="dialog"
        aria-label={copy.a11y.explorePublicPaths}
      >
        {(
          [
            {
              Icon: CircleHelp,
              title: copy.nav.howItWorks,
              hint: copy.landing.menuGuideHint,
              onClick: () => {
                onClose();
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
            <Icon size={16} strokeWidth={1.5} />
            <span>
              <strong>{title}</strong>
              <small>{hint}</small>
            </span>
          </button>
        ))}
      </nav>
    </>
  );
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
              <Wallet size={14} strokeWidth={1.5} aria-hidden="true" />
              {copy.landing.nav.connect}
            </button>
            <button
              className="icon-button landing-menu-trigger"
              onClick={() => setMenuOpen((value) => !value)}
              aria-label={copy.a11y.explorePublicPaths}
              aria-expanded={menuOpen}
              aria-controls="landing-mobile-menu"
            >
              <Menu size={18} strokeWidth={1.5} />
            </button>
            {menuOpen && (
              <LandingMobileMenu
                copy={copy}
                onClose={() => setMenuOpen(false)}
                onGuide={onGuide}
                go={go}
              />
            )}
          </div>
        </div>
      </header>

      <main className="landing-main" id="hero" tabIndex={-1}>
        <Reveal>
          <section className="landing-copy">
            <h1>{copy.landing.title}</h1>
            <p>{copy.landing.description}</p>
            <div className="button-row">
              <Button
                className="wallet-cta wallet-cta-hero"
                onClick={onConnect}
                icon={<Wallet size={16} strokeWidth={1.5} />}
              >
                {copy.nav.connectWallet}
              </Button>
              <Button
                variant="ghost"
                onClick={onGuide}
                icon={<CircleHelp size={16} strokeWidth={1.5} />}
              >
                {copy.nav.howItWorks}
              </Button>
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
                {p.link !== "" && (
                  <a href={PRINCIPLE_HREFS[i]} className="p-link">
                    {p.link}{" "}
                    <ArrowRight
                      size={14}
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                  </a>
                )}
              </SpotlightCard>
            ))}
          </div>
        </Reveal>
      </section>

      {/* R12: how-it-works — the operating loop; the nav's "How it works"
          anchor points here. */}
      <section className="scroll-section how-section" id="how">
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

      {/* Closing CTA — single primary action before the footer. */}
      <section className="scroll-section closing-cta">
        <Button
          className="wallet-cta wallet-cta-hero"
          onClick={onConnect}
          icon={<Wallet size={16} strokeWidth={1.5} />}
        >
          {copy.landing.closingCta}
        </Button>
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
