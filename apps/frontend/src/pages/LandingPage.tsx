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
  ShieldCheck,
  Wallet,
  ArrowRight,
} from "../components/axiom/icons.js";
import { Button } from "../components/axiom/Controls.js";
import { Logo } from "../components/axiom/AppShell.js";
import { MEDIA } from "../lib/media.js";
import { getCopy, type Locale } from "../lib/copy.js";
import { APP_CHAIN_ID } from "../config/wagmi.js";

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
          aria-label="Explore public paths"
          aria-expanded={menuOpen}
          aria-controls="landing-mobile-menu"
        >
          <Menu size={18} />
        </button>
        {menuOpen && (
          <nav
            id="landing-mobile-menu"
            className="landing-mobile-menu"
            aria-label="Explore public paths"
          >
            <button
              onClick={() => {
                setMenuOpen(false);
                onGuide();
              }}
            >
              <CircleHelp size={16} />
              <span>
                <strong>{copy.nav.howItWorks}</strong>
                <small>Review the wallet and proof boundary</small>
              </span>
            </button>
            <button onClick={() => navigate("/staking")}>
              <Database size={16} />
              <span>
                <strong>0G Stake</strong>
                <small>{copy.landing.stakingBoundary}</small>
              </span>
            </button>
            <button onClick={() => navigate("/developers")}>
              <Globe2 size={16} />
              <span>
                <strong>Developers</strong>
                <small>Inspect the integration boundary</small>
              </span>
            </button>
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
          <span className="eyebrow copper">
            AXIOM / VERIFIED OPERATOR CONSOLE
          </span>
          <h1>
            <span>Move with</span>
            <br />
            <i>evidence.</i>
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
          <p className="landing-note">
            <ShieldCheck size={14} /> {copy.landing.prototypeNote}
          </p>
        </section>
        <section className="landing-visual hero-visual-modern">
          <img
            className="hero-visual-poster"
            src={MEDIA.heroPulse}
            alt="Abstract Axiom operator signal field"
          />
          <div className="hero-visual-scanline" aria-hidden="true" />
          <div className="hero-visual-overlay">
            <span className="eyebrow">{copy.landing.nextSafeAction}</span>
            <strong>{copy.landing.heroTitle}</strong>
            <div className="hero-visual-readout">
              <span>chain {APP_CHAIN_ID}</span>
              <span>proof boundary online</span>
              <span>motion / reduced-motion aware</span>
            </div>
          </div>
        </section>
      </main>
      <section className="landing-strip">
        <div>
          <span className="eyebrow">CONNECT</span>
          <strong>{copy.landing.walletContext}</strong>
          <small>Connector and address</small>
        </div>
        <div>
          <span className="eyebrow">VERIFY</span>
          <strong>{copy.landing.signatureBoundary}</strong>
          <small>No gas · no custody</small>
        </div>
        <div>
          <span className="eyebrow">OPERATE</span>
          <strong>{copy.landing.consoleAccess}</strong>
          <small>Receipts beside action</small>
        </div>
        <button onClick={() => go("/staking")}>
          <span className="eyebrow">BOUNDARY</span>
          <strong>0G Stake</strong>
          <small>{copy.landing.stakingBoundary}</small>
          <ArrowRight size={14} />
        </button>
      </section>
    </div>
  );
}
