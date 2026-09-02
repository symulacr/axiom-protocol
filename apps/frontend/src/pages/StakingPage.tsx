/*
  StakingPage : the explicit "not integrated"
  boundary surface for 0G native staking.
*/
import { ShieldAlert, Wallet } from "../components/axiom/icons.js";
import { Button, PageHead } from "../components/axiom/Controls.js";
import { getCopy } from "../lib/copy.js";
import { routePath } from "../lib/routeRegistry.js";
import type { Locale } from "../lib/copy.js";

/** Empty-state glyph — semantic exception to the 14/16/18 icon scale. */
const EMPTY_STATE_ICON_SIZE = 25;

export function StakingPage({
  go,
  locale,
}: {
  go: (path: string) => void;
  locale: Locale;
}) {
  const copy = getCopy(locale).staking;
  return (
    <div className="ops-page">
      {/* Wave-9B (browser-4 /staking "orphaned navigation state"): /staking has
          no rail item and is reachable by deep link — the header itself carries
          the return path so the page never floats parentless. */}
      <PageHead
        title="0G Stake"
        lede={copy.lede}
        actions={
          <Button variant="ghost" onClick={() => go(routePath("dashboard"))}>
            {copy.backLabel}
          </Button>
        }
      />
      <section className="not-integrated">
        <div className="not-integrated-icon">
          <ShieldAlert size={EMPTY_STATE_ICON_SIZE} />
        </div>
        <div>
          <p>{copy.body}</p>
          {/* proto-subpages-b S10: one honest sentence + one CTA total.
              L2-B3: the outbound docs link gives the page's own subject a
              forward action — nothing on this surface dead-ends. */}
          <div className="not-integrated-actions">
            <Button
              onClick={() => go(routePath("dashboard"))}
              icon={<Wallet size={16} />}
            >
              {copy.openVault}
            </Button>
            <a
              className="button button-secondary"
              href={copy.docsLink}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={copy.docsA11y}
            >
              {copy.docsLabel}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
