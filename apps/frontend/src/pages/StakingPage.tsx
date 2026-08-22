/*
  StakingPage (ported from the v2 mockup): the explicit "not integrated"
  boundary surface for 0G native staking.
*/
import {
  ReceiptText,
  Settings2,
  ShieldAlert,
  Wallet,
} from "../components/axiom/icons.js";
import { Button } from "../components/axiom/Controls.js";

export function StakingPage({ go }: { go: (path: string) => void }) {
  return (
    <div className="ops-page">
      <div className="page-head">
        <div>
          <h1>0G Stake</h1>
          <p>
            Native network staking remains separate from Axiom&apos;s confirmed
            strategy vault.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => go("/settings")}
          icon={<Settings2 size={15} />}
        >
          View integration settings
        </Button>
      </div>
      <section className="not-integrated">
        <div className="not-integrated-icon">
          <ShieldAlert size={25} />
        </div>
        <div>
          <span className="eyebrow copper">NOT INTEGRATED IN AXIOM</span>
          <h2>Axiom does not expose a staking action here.</h2>
          <p>
            Current product evidence covers vault control, payments, transfer
            proofs and 0G Storage. Validator delegation, rewards, unbonding and
            a native staking contract are not part of this console.
          </p>
          <div className="not-integrated-actions">
            <Button
              variant="secondary"
              onClick={() => go("/app")}
              icon={<Wallet size={15} />}
            >
              Open Axiom vault
            </Button>
            <Button
              variant="ghost"
              onClick={() => go("/transactions")}
              icon={<ReceiptText size={15} />}
            >
              Review evidence
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
