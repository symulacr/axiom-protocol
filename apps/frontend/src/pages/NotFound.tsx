/*
  Recovery404 (v3, Wave-12B): no sidebar, no wallet assumption, no partial
  dashboard — a safe exit with two destinations plus the shared hub explore
  row (browser-1 Top Fix #5: the CTAs were button/no-href elements — no
  middle-click, no crawl path — and the page had no hub escape hatch).
  Copy owns what happened + the next step, localized via copy.notFound.
*/
import { Link } from "react-router-dom";
import { ArrowLeft, LayoutDashboard } from "../components/axiom/icons.js";
import { Logo } from "../components/axiom/AppShell.js";
import { MEDIA } from "../lib/media.js";
import { routePath, PUBLIC_HUB_PATHS } from "../lib/routeRegistry.js";
import { getCopy, type Locale } from "../lib/copy.js";

export default function Recovery404({ locale }: { locale: Locale }) {
  const copy = getCopy(locale).notFound;
  // Wave-12B/F2b: labels are keyed by the same slug union the registry
  // derives PUBLIC_HUB_PATHS from — a copy reorder can no longer point a
  // label at the wrong hub path.
  return (
    <div className="recovery-404">
      <div className="recovery-404-art">
        <img
          src={MEDIA.recovery404}
          alt={copy.heroAlt}
          loading="lazy"
          decoding="async"
        />
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
            crawl path, keyboard focus preserved by :focus-visible styles).
            Link keeps the href but routes client-side (no full reload). */}
        <div className="button-row">
          <Link className="button button-primary" to="/">
            <ArrowLeft size={14} />
            {copy.returnToLanding}
          </Link>
          <Link className="button button-secondary" to={routePath("dashboard")}>
            <LayoutDashboard size={16} />
            {copy.openConsole}
          </Link>
        </div>
        {/* Wave-12B: shared hub explore row — the five public discovery
            surfaces stay reachable from a drifted route. 44px hit targets,
            keyboard focusable, hidden from SC duplication via nav labelling. */}
        <nav className="recovery-404-explore" aria-label={copy.exploreA11y}>
          {(
            ["agents", "payments", "proofs", "storage", "developers"] as const
          ).map((slug) => (
            <a key={slug} href={PUBLIC_HUB_PATHS[slug]}>
              {copy.hubLabels[slug]}
            </a>
          ))}
        </nav>
      </div>
    </div>
  );
}
