/*
  Recovery404 (v2): no sidebar, no wallet assumption, no partial dashboard —
  a safe exit with two destinations. Copy owns what happened + the next step, localized via copy.notFound.
*/
import { ArrowLeft, LayoutDashboard } from "../components/axiom/icons.js";
import { Button } from "../components/axiom/Controls.js";
import { Logo } from "../components/axiom/AppShell.js";
import { MEDIA } from "../lib/media.js";
import { routePath } from "../lib/routeRegistry.js";
import { getCopy, type Locale } from "../lib/copy.js";

export default function Recovery404({
  go,
  locale,
}: {
  go: (path: string) => void;
  locale: Locale;
}) {
  const copy = getCopy(locale).notFound;
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
        <div className="button-row">
          <Button onClick={() => go("/")} icon={<ArrowLeft size={14} />}>
            {copy.returnToLanding}
          </Button>
          <Button
            variant="secondary"
            onClick={() => go(routePath("dashboard"))}
            icon={<LayoutDashboard size={15} />}
          >
            {copy.openConsole}
          </Button>
        </div>
      </div>
    </div>
  );
}
