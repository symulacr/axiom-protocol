/*
  Recovery404 (v3, Wave-12B): no sidebar, no wallet assumption, no partial
  dashboard — a safe exit with two destinations plus the shared hub explore
  row (browser-1 Top Fix #5: the CTAs were button/no-href elements — no
  middle-click, no crawl path — and the page had no hub escape hatch).
  Copy owns what happened + the next step, localized via copy.notFound.
*/
import { ArrowLeft, LayoutDashboard } from "../components/axiom/icons.js";
import { Logo } from "../components/axiom/AppShell.js";
import { MEDIA } from "../lib/media.js";
import {
  routePath,
  PUBLIC_HUB_PATHS,
} from "../lib/routeRegistry.js";
import { getCopy, type Locale } from "../lib/copy.js";

export default function Recovery404({ locale }: { locale: Locale }) {
  const copy = getCopy(locale).notFound;
  // Wave-12B: same index-order wiring as LandingPage's FOOTER_HREFS —
  // labels are locale keys, destinations come from the registry-derived
  // PUBLIC_HUB_PATHS (agents/payments/proofs/storage/developers), so the
  // two can never drift from the canonical hub paths.
  return (
    <div className="recovery-404">
      <div className="recovery-404-art">
        <img src={MEDIA.recovery404} alt="Abstract recoverable Axiom route" />
      </div>
      <div className="recovery-404-copy">
        <Logo compact />
        <h1>
          {copy.titleLead}
          <br />
          <i>{copy.titleEmphasis}</i>
        </h1>
        <p>{copy.body}</p>
        {/* Wave-12B: real anchors now — href on every CTA (middle-click,
            crawl path, keyboard focus preserved by :focus-visible styles). */}
        <div className="button-row">
          <a className="button button-primary" href="/">
            <ArrowLeft size={14} />
            {copy.returnToLanding}
          </a>
          <a className="button button-secondary" href={routePath("dashboard")}>
            <LayoutDashboard size={16} />
            {copy.openConsole}
          </a>
        </div>
        {/* Wave-12B: shared hub explore row — the five public discovery
            surfaces stay reachable from a drifted route. 44px hit targets,
            keyboard focusable, hidden from SC duplication via nav labelling. */}
        <nav className="recovery-404-explore" aria-label={copy.exploreA11y}>
          {(
            [
              "agents",
              "payments",
              "proofs",
              "storage",
              "developers",
            ] as const
          ).map((slug, i) => (
            <a key={slug} href={PUBLIC_HUB_PATHS[slug]}>
              {copy.hubLabels[i]}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}
