import { useState } from "react";
import { parseEther } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { Button } from "./Controls.js";
import { getAxiomGasTankAddress } from "../../abi/addresses.js";
import { toViemAbi } from "../../abi/addresses.js";
import { GAS_TANK_ABI } from "@axiom/config/abis";
import { useGasTank } from "../../hooks/useGasTank.js";
import { useFaucet } from "../../hooks/useFaucet.js";
import { formatTokenAmount, humanizeError } from "../../utils/format.js";
import { APP_CHAIN } from "../../config/wagmi.js";
import { getCopy } from "../../lib/copy.js";
import { toast } from "sonner";
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
 *
 * Audit fixes (critique-2 C1/C2): the deposit control previously shipped with
 * no handler; refill/claim outcomes were silent. Deposit now sends a direct
 * payable `deposit()` tx through the connected wallet (ABI source:
 * @axiom/config/abis), every path toasts, and the tank refetches after each
 * mutation.
 */
export function GasTankCard({
  locale = "en" as Locale,
}: {
  locale?: Locale;
}): React.ReactNode {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const gasTank = getAxiomGasTankAddress();
  const { tank, error, refetch } = useGasTank(address, publicClient);
  const copy = getCopy(locale).gasTank;
  const faucet = useFaucet(address);
  const [depositValue, setDepositValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Disabled-when-unset: no address → the whole card renders inert, never crashes.
  const unset = gasTank === undefined;
  const minDeposit = "0.01";

  /** Direct payable tank top-up: AxiomGasTank.deposit() credits msg.sender. */
  const onDeposit = async (): Promise<void> => {
    if (!gasTank || !walletClient || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const hash = await walletClient.sendTransaction({
        to: gasTank,
        data: "0xd0e30db0", // deposit() — payable, value carries the amount
        value: parseEther(depositValue),
      });
      toast.success(`${copy.depositQueued} (${hash.slice(0, 10)}…)`);
      setDepositValue("");
      refetch();
    } catch (err) {
      setActionError(humanizeError(err));
      // U24: error toasts persist until dismissed (same regime as the Notice rail).
      toast.error(humanizeError(err), { duration: Infinity });
    } finally {
      setBusy(false);
    }
  };

  /** Self-serve grant claim when the tank is empty: grantCredit() is value-free. */
  const onRefill = async (): Promise<void> => {
    if (!gasTank || !address || !publicClient || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await publicClient.readContract({
        address: gasTank,
        abi: toViemAbi(GAS_TANK_ABI),
        functionName: "grantCredit",
      });
      if (res !== undefined && res !== null) {
        toast.success(copy.refillDone);
      } else {
        toast.error(copy.refillFailed, { duration: Infinity });
      }
      refetch();
    } catch (err) {
      const msg = humanizeError(err);
      setActionError(msg);
      toast.error(msg, { duration: Infinity });
    } finally {
      setBusy(false);
    }
  };

  /** Faucet claim: branch on the hook's boolean — silent success was the old bug. */
  const onClaim = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const ok = await faucet.claim();
      if (ok) toast.success(copy.faucetDone);
      else toast.error(copy.faucetFailed, { duration: Infinity });
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
        <p style={{ color: "var(--dim)" }}>{copy.unsetNote}</p>
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
        <p style={{ color: "var(--danger)" }}>
          {humanizeError(new Error(error))}
        </p>
      ) : !tank ? (
        <p style={{ color: "var(--dim)" }}>{copy.loading}</p>
      ) : (
        <>
          <div className="gas-tank-card__balance">
            <strong className="num">
              {formatTokenAmount(tank.balance)} {nativeSymbol}
            </strong>
            <small className="num">
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
            aria-label={copy.grantsBarTitle}
            title={copy.grantsBarTitle}
          >
            <div style={{ width: `${grantsPct}%` }} />
          </div>
          <small className="num" style={{ color: "var(--dim)" }}>
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
              busy={busy}
              disabled={
                busy ||
                !walletClient ||
                !depositValue ||
                parseEther(depositValue || "0") < parseEther(minDeposit)
              }
              onClick={() => void onDeposit()}
              icon={undefined}
            >
              {copy.depositAction}
            </Button>
          </div>
          <Button
            variant="ghost"
            busy={busy}
            onClick={() => void onRefill()}
            disabled={busy || tank.balance > 0n || tank.grantsLeft === 0n}
          >
            {copy.refillAction}
          </Button>
          {actionError ? (
            <p className="wallet-gate-error" role="alert">
              {actionError}
            </p>
          ) : null}
          {/* Testnet retired: the faucet was a Galileo-only feature; mainnet
              builds never render a claim that cannot succeed. */}
          {false && (
          <div
            className="gas-tank-card__faucet"
            data-testid="gas-tank-faucet-row"
          >
            <small className="num" style={{ color: "var(--dim)" }}>
              {copy.faucetBalanceLabel}: {faucet.balance ?? "0"}
            </small>
            {faucet.eligible ? (
              <>
                <small>{copy.faucetEligibleBadge}</small>
                <Button
                  variant="ghost"
                  onClick={() => void onClaim()}
                  disabled={faucet.claiming}
                >
                  {copy.faucetClaimAction}
                </Button>
              </>
            ) : (
              <small style={{ color: "var(--dim)" }}>
                {copy.faucetIneligibleBadge}
              </small>
            )}
          </div>
          )}
        </>
      )}
    </div>
  );
}
