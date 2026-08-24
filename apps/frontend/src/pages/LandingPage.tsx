/*
  Landing (v2): public marketing surface. Connect opens the live WalletGate
  (pending intent /app); "How Axiom works" opens the v2 guide overlay.
*/
import { useState } from "react";
import {
  CircleHelp,
  Database,
  Globe2,
  Menu,
  Wallet,
  ArrowRight,
} from "../components/axiom/icons.js";
import { Button } from "../components/axiom/Controls.js";
import { Logo } from "../components/axiom/AppShell.js";
import { MEDIA } from "../lib/media.js";
import { getCopy, type Locale } from "../lib/copy.js";

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
  const navigate = (path: string) => {
    setMenuOpen(false);
    go(path);
  };

  return (
    <div className="landing-page">
      <header className="landing-nav">
        <Logo />
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
            {/* Mobile menu entries share one icon + title/hint shape. */}
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
                  Icon: Database,
                  title: copy.landing.stakeTitle,
                  hint: copy.landing.stakingBoundary,
                  onClick: () => navigate("/staking"),
                },
                {
                  Icon: Globe2,
                  title: copy.landing.menuDevelopers,
                  hint: copy.landing.menuDevelopersHint,
                  onClick: () => navigate("/developers"),
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
            <Button
              onClick={() => {
                setMenuOpen(false);
                onConnect();
              }}
              icon={<Wallet size={15} />}
            >
              {copy.nav.connectWallet}
            </Button>
          </nav>
        )}
      </header>
      <main className="landing-main">
        <section className="landing-copy">
          <h1>
            <span>{copy.landing.titleLead}</span>
            <br />
            <i>{copy.landing.titleEmphasis}</i>
          </h1>
          <p>{copy.landing.description}</p>
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
          </div>
        </section>
        <section className="landing-visual hero-visual-modern">
          <img
            className="hero-visual-poster"
            src={MEDIA.heroPulse}
            alt="Abstract Axiom operator signal field"
          />
        </section>
      </main>
      {/* Journey strip: every cell is a real control with the same affordance
          (arrow + hover tint) — no dead look-alike cells.
          The CONNECT cell is gone: the header CTA owns connecting (06 essence). */}
      <section className="landing-strip">
        <button type="button" onClick={onGuide}>
          <strong>{copy.landing.signatureBoundary}</strong>
          <small>{copy.landing.stripVerifySmall}</small>
          <ArrowRight size={14} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => go("/app")}>
          <strong>{copy.landing.consoleAccess}</strong>
          <small>{copy.landing.stripOperateSmall}</small>
          <ArrowRight size={14} aria-hidden="true" />
        </button>
        <button type="button" onClick={() => go("/staking")}>
          <strong>{copy.landing.stakeTitle}</strong>
          <small>{copy.landing.stakingBoundary}</small>
          <ArrowRight size={14} aria-hidden="true" />
        </button>
      </section>
    </div>
  );
}
