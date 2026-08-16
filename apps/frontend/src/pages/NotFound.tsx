/*
  Recovery404 (v2): no sidebar, no wallet assumption, no partial dashboard —
  a safe exit with two destinations.
*/
import { ArrowLeft, LayoutDashboard } from "../components/axiom/icons.js";
import { Button } from "../components/axiom/Controls.js";
import { Logo } from "../components/axiom/AppShell.js";
import { MEDIA } from "../lib/media.js";

export default function Recovery404({ go }: { go: (path: string) => void }) {
  return (
    <div className="recovery-404">
      <div className="recovery-404-art">
        <img src={MEDIA.recovery404} alt="Abstract recoverable Axiom route" />
      </div>
      <div className="recovery-404-copy">
        <Logo compact />
        <span className="eyebrow copper">404 / ROUTE NOT INDEXED</span>
        <h1>
          The route
          <br />
          <i>drifted.</i>
        </h1>
        <p>
          Axiom could not find this surface. No sidebar, wallet assumption or
          partial dashboard is loaded here.
        </p>
        <div className="button-row">
          <Button onClick={() => go("/")} icon={<ArrowLeft size={14} />}>
            Return to landing
          </Button>
          <Button
            variant="secondary"
            onClick={() => go("/app")}
            icon={<LayoutDashboard size={15} />}
          >
            Open console
          </Button>
        </div>
        <span className="mono recovery-code">RECOVERY / 404 / SAFE EXIT</span>
      </div>
    </div>
  );
}
