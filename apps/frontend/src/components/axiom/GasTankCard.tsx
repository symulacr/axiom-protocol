import { useState } from "react";
import { parseEther } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { COLORS } from "../ui.js";
import { Button } from "./Controls.js";
import { getAxiomGasTankAddress } from "../../abi/addresses.js";
import { useGasTank } from "../../hooks/useGasTank.js";
import { useFaucet } from "../../hooks/useFaucet.js";
import { formatTokenAmount, humanizeError } from "../../utils/format.js";
import { APP_CHAIN } from "../../config/wagmi.js";
import { getCopy } from "../../lib/copy.js";
import type { Locale } from "../../lib/copy.js";

const nativeSymbol = APP_CHAIN.nativeCurrency.symbol;

/** Ops-left rendering: 0 → "0"; sponsored-lazy state surfaces the grant note. */
function opsLeftLabel(
  opsLeft: number,
  sponsored: boolean,
  locale: Locale,
): string {
  if (opsLeft > 0) return String(opsLeft);
  const copy = getCopy(locale);
  return sponsored ? copy.gasTank.lazyGrantNote : "0";
}

/**
 * GasTankCard (V3 W5-B §4): prepaid gas balance, ~ops-left, grants bar, and a
 * refill button (self-serve grant claim via a sponsored relay op). Disabled
 * when the GasTank address is unset (pre-deploy) — the disabled-when-unset
 * pattern mirrors delegationRegistry consumers.
 */
export function GasTankCard({
  locale = "en" as Locale,
}: {
  locale?: Locale;
}): React.ReactNode {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const gasTank = getAxiomGasTankAddress();
  const { tank, error } = useGasTank(address, publicClient);
  const copy = getCopy(locale).gasTank;
  const faucet = useFaucet(address);
  const [depositValue, setDepositValue] = useState("");
  const [busy, setBusy] = useState(false);

  // Disabled-when-unset: no address → the whole card renders inert, never crashes.
  const unset = gasTank === undefined;
  const minDeposit = "0.01";

  const onRefill = async (): Promise<void> => {
    if (!gasTank || !address || !publicClient || busy) return;
    setBusy(true);
    try {
      // Refill = self-serve grant claim. Phase-1: the op goes through the
      // relayer's sponsor lane when the tank is empty (grantCredit() is
      // value-free); otherwise it would be a direct tx — not wired in the card.
      const res = await fetch("/api/v1/relayer/sponsor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          user: address,
          target: gasTank,
          data: "0x" + "4e71d92d", // keccak("refill()")… placeholder replaced by the sponsor lane
          maxGasCost: "0",
          nonce: "0",
          deadline: "0",
          signature: "0x",
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `refill failed (${res.status})`);
      }
    } finally {
      setBusy(false);
    }
  };

  if (unset) {
    return (
      <div
        className="gas-tank-card gas-tank-card--unset"
        data-testid="gas-tank-card"
      >
        <h3>{copy.title}</h3>
        <p style={{ color: COLORS.textDim }}>{copy.unsetNote}</p>
      </div>
    );
  }

  const grantsPct =
    tank && tank.grantsCap > 0n
      ? Math.min(100, Number((tank.grantsUsed * 100n) / tank.grantsCap))
      : 0;

  return (
    <div className="gas-tank-card" data-testid="gas-tank-card">
      <h3>{copy.title}</h3>
      {error ? (
        <p style={{ color: "var(--c-danger)" }}>
          {humanizeError(new Error(error))}
        </p>
      ) : !tank ? (
        <p style={{ color: COLORS.textDim }}>{copy.loading}</p>
      ) : (
        <>
          <div className="gas-tank-card__balance">
            <strong>
              {formatTokenAmount(tank.balance)} {nativeSymbol}
            </strong>
            <small>
              {opsLeftLabel(tank.opsLeft, tank.sponsored, locale)}{" "}
              {copy.opsLeftSuffix}
            </small>
          </div>
          <div
            className="gas-tank-card__grants"
            role="progressbar"
            aria-valuenow={grantsPct}
            aria-valuemin={0}
            aria-valuemax={100}
            title={copy.grantsBarTitle}
          >
            <div style={{ width: `${grantsPct}%` }} />
          </div>
          <small style={{ color: COLORS.textDim }}>
            {copy.grantsUsage
              .replace("{used}", tank.grantsUsed.toString())
              .replace("{cap}", tank.grantsCap.toString())}
          </small>
          <div className="gas-tank-card__deposit">
            <input
              type="text"
              inputMode="decimal"
              value={depositValue}
              onChange={(e) => setDepositValue(e.target.value)}
              placeholder={`${copy.depositPlaceholder} (min ${minDeposit} ${nativeSymbol})`}
              aria-label={copy.depositPlaceholder}
            />
            <Button
              variant="ghost"
              disabled={
                busy ||
                !depositValue ||
                parseEther(depositValue || "0") < parseEther(minDeposit)
              }
              icon={undefined}
            >
              {copy.depositAction}
            </Button>
          </div>
          <Button
            variant="ghost"
            onClick={() => void onRefill()}
            disabled={busy || tank.balance > 0n || tank.grantsLeft === 0n}
          >
            {copy.refillAction}
          </Button>
          <div
            className="gas-tank-card__faucet"
            data-testid="gas-tank-faucet-row"
          >
            <small style={{ color: COLORS.textDim }}>
              {copy.faucetBalanceLabel}: {faucet.balance ?? "0"}
            </small>
            {faucet.eligible ? (
              <>
                <small>{copy.faucetEligibleBadge}</small>
                <Button
                  variant="ghost"
                  onClick={() => void faucet.claim()}
                  disabled={faucet.claiming}
                >
                  {copy.faucetClaimAction}
                </Button>
              </>
            ) : (
              <small style={{ color: COLORS.textDim }}>
                {copy.faucetIneligibleBadge}
              </small>
            )}
          </div>
        </>
      )}
    </div>
  );
}
