/*
  StakingPage : the explicit "not integrated"
  boundary surface for 0G native staking.
*/
import { ReceiptText, ShieldAlert, Wallet } from "../components/axiom/icons.js";
import { Button, PageHead } from "../components/axiom/Controls.js";
import { getCopy } from "../lib/copy.js";
import type { Locale } from "../lib/copy.js";

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
      <PageHead title="0G Stake" lede={copy.lede} />
      <section className="not-integrated">
        <div className="not-integrated-icon">
          <ShieldAlert size={25} />
        </div>
        <div>
          <p>{copy.body}</p>
          <div className="not-integrated-actions">
            <Button onClick={() => go("/app")} icon={<Wallet size={15} />}>
              {copy.openVault}
            </Button>
            <Button
              variant="ghost"
              onClick={() => go("/transactions")}
              icon={<ReceiptText size={15} />}
            >
              {copy.reviewEvidence}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
