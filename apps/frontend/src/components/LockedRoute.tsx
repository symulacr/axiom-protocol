/*
  LockedRoute (ported from the v2 mockup): shown when an internal route is
  requested before the operator session is authenticated. Proof rails stay
  visible; the CTA opens the live WalletGate.
*/
import { ArrowLeft, ChevronRight, LockKeyhole, Wallet } from "./axiom/icons.js";
import { Button, Status } from "./axiom/Controls.js";
import { Logo } from "./axiom/AppShell.js";
import { lockedRouteMeta } from "../lib/prototypeCatalog.js";

export function LockedRoute({
  requested,
  onConnect,
  go,
}: {
  requested: string;
  onConnect: () => void;
  go: (path: string) => void;
}) {
  const pathname = requested.split("?", 1)[0] ?? requested;
  const meta =
    lockedRouteMeta[pathname] ??
    (pathname.startsWith("/agents/")
      ? lockedRouteMeta["/agents/"]
      : lockedRouteMeta["/app"]) ??
    lockedRouteMeta["/app"];
  if (!meta) return null;

  return (
    <div className={`locked-route-shell public-locked locked-${meta.slug}`}>
      <div className="locked-route-main">
        <header className="locked-topbar">
          <Logo compact />
          <div>
            <Status label="wallet required" tone="warning" />
          </div>
          <button className="text-link" onClick={() => go("/")}>
            <ArrowLeft size={14} /> Landing
          </button>
        </header>
        <div className="locked-command-strip">
          <span>SESSION / AWAITING</span>
          <span>CHAIN / 16661</span>
          <span>BOUNDARY / {meta.boundary}</span>
          <span>NEXT / {meta.next}</span>
        </div>
        <main className="locked-route-content">
          <section className="locked-route-copy">
            <div className="locked-ledger">
              <div>
                <span>WALLET</span>
                <strong>not connected</strong>
              </div>
              <div>
                <span>CHAIN</span>
                <strong>16661 / 0G</strong>
              </div>
              <div>
                <span>ROUTE</span>
                <strong>{meta.slug}</strong>
              </div>
            </div>
            <div className="locked-route-artifact">
              <span>EVIDENCE / {meta.artifact}</span>
              <strong>{meta.evidenceValue}</strong>
              <small>{meta.evidenceNote}</small>
            </div>
            <span className="eyebrow copper">ROUTE HELD / {meta.label}</span>
            <h1>
              {meta.title}
              <br />
              <i>{meta.emphasis}</i>
            </h1>
            <p>{meta.copy}</p>
            <p className="locked-route-consequence">
              <span>PROTECTED CONSEQUENCE</span>
              {meta.risk}
            </p>
            <div className="button-row">
              <Button onClick={onConnect} icon={<Wallet size={15} />}>
                {meta.cta}
              </Button>
              <Button
                variant="ghost"
                onClick={() => go("/")}
                icon={<ArrowLeft size={14} />}
              >
                Return to landing
              </Button>
            </div>
          </section>
          <aside className="locked-evidence">
            <div className="locked-evidence-head">
              <div>
                <span className="eyebrow">{meta.boundary}</span>
                <strong>{meta.next}</strong>
              </div>
              <LockKeyhole size={17} className="copper" />
            </div>
            <div className="locked-preview">
              <img src={meta.media} alt={`${meta.artifact} preview`} />
              <div>
                <span className="eyebrow">{meta.artifact}</span>
                <strong>Preview only</strong>
                <small>Wallet verification gates live evidence.</small>
              </div>
            </div>
            {meta.proofs.map((item, index) => (
              <div className="locked-evidence-row" key={item}>
                <span
                  className={`locked-evidence-state ${index === 0 ? "is-current" : ""}`}
                  aria-hidden="true"
                />
                <div>
                  <strong>{item}</strong>
                  <small>
                    {index === 0 ? "not connected" : "awaiting previous step"}
                  </small>
                </div>
                <ChevronRight size={14} />
              </div>
            ))}
          </aside>
        </main>
      </div>
    </div>
  );
}
