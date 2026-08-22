/*
  LockedRoute : shown when an internal route is
  requested before the operator session is authenticated. Proof rails stay
  visible; the CTA opens the live WalletGate.
*/
import { ArrowLeft, LockKeyhole, Wallet } from "./axiom/icons.js";
import { Button, Status } from "./axiom/Controls.js";
import { Logo } from "./axiom/AppShell.js";
import { lockedRouteMeta } from "../lib/consoleCatalog.js";
import { getCopy } from "../lib/copy.js";
import type { Locale } from "../lib/copy.js";

export function LockedRoute({
  requested,
  locale,
  onConnect,
  go,
}: {
  requested: string;
  locale: Locale;
  onConnect: () => void;
  go: (path: string) => void;
}) {
  const copy = getCopy(locale);
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
          {/* S1 (duplication map #16): the topbar "Landing" text-link repeated
              the ghost "Return to landing" exit below — one exit remains. */}
        </header>
        <main className="locked-route-content">
          <section className="locked-route-copy">
            <span className="eyebrow copper">ROUTE HELD / {meta.label}</span>
            <h1>
              {meta.title}
              <br />
              <i>{meta.emphasis}</i>
            </h1>
            <p>{meta.copy}</p>
            <div className="button-row">
              <Button onClick={onConnect} icon={<Wallet size={15} />}>
                {copy.nav.connectWallet}
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
                <small>Connect a wallet to unlock live evidence.</small>
              </div>
            </div>
            {/* Ledger rows are static states, not controls — no chevron
                affordance on a row that does not open (02 FINDING-014). */}
            {meta.proofs.map((item, index) => (
              <div className="locked-evidence-row" key={item}>
                {/* S1 (audit 06 FINDING-014): the .locked-evidence-state dot
                    span rendered into every row and was display:none'd by
                    axiom-velocity.css (.public-locked) — dead markup, removed
                    with its CSS. */}
                <div>
                  <strong>{item}</strong>
                  <small>
                    {index === 0 ? "not connected" : "after connect"}
                  </small>
                </div>
              </div>
            ))}
          </aside>
        </main>
      </div>
    </div>
  );
}
