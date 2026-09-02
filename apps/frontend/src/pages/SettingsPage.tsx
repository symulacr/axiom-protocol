/*
  SettingsPage (v2 control plane, live values): session/chain/RPC rows come
  from wagmi + useHealth; display preferences persist in axiom-ui-settings
  (uiStore). Theme also drives the document data-theme attribute via App.

  Depth contract:
  - depth 0: Connection diagnostics (read-only — W5-B: open at ≥1120px, the
    summary carries a one-line connection status; detail inside) + Appearance
    (theme, compact rail, density, language). Lock console lives in the
    topbar session cell — one owner, no stranded footer ghost.
  - depth 1: Console layout + Advanced — disclosures start CLOSED at every
    viewport (an accordion that defaults open is grouping, not disclosure).
  - depth 2: Danger zone (closed) → Reset surface wears danger chrome behind
    an explicit confirm dialog (Esc/backdrop/Cancel via the modal-dismiss
    contract). Lock console is routine → ghost, never danger.
*/
import { useRef, useState, type Dispatch, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAccount, useChainId } from "wagmi";
import {
  CircleHelp,
  Keyboard,
  LayoutDashboard,
  Moon,
  RotateCcw,
  Settings2,
  ShieldAlert,
  Sun,
  Wifi,
} from "../components/axiom/icons.js";
import {
  Button,
  Field,
  PageHead,
  Status,
} from "../components/axiom/Controls.js";
import { getCopy, type Copy } from "../lib/copy.js";
import { GasTankCard } from "../components/axiom/GasTankCard.js";
import type { AppState, UiSettings } from "../lib/models.js";
import type { ConsoleAction } from "../lib/consoleStore.js";
import { useHealth } from "../hooks/useHealth.js";
import { useModalDismiss } from "../hooks/useModalDismiss.js";
import { APP_CHAIN, APP_CHAIN_ID } from "../config/wagmi.js";
import { BACKEND_URL } from "../config/env.js";

function SettingsDisclosure({
  title,
  icon,
  defaultOpen = false,
  /** Daily-use diagnostics (Signing/Layout) default open on wide viewports —
   * closed-by-default hid the page's most important status rows. */
  openOnDesktop = false,
  /** Optional one-line status rendered inside the summary row (W5-B). */
  summary,
  className = "",
  children,
}: {
  title: string;
  icon: ReactNode;
  /** Shallow sections (read-only context, daily preferences) stay open; every
   * advanced/rare/destructive section starts closed at any viewport. */
  defaultOpen?: boolean;
  openOnDesktop?: boolean;
  summary?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(
    () =>
      defaultOpen ||
      (openOnDesktop &&
        typeof window !== "undefined" &&
        window.matchMedia("(min-width: 1120px)").matches),
  );
  return (
    <section className={`panel settings-card ${className}`.trim()}>
      <details
        className="settings-disclosure"
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary className="panel-head">
          <div>
            <h2>{title}</h2>
          </div>
          {summary}
          {icon}
        </summary>
        <div className="settings-disclosure-content">{children}</div>
      </details>
    </section>
  );
}

/** Reset-surface confirm dialog: the app's most destructive
 * non-wallet action gets the canonical modal trio — Esc + backdrop + explicit
 * Cancel — and an explicit danger confirm before anything is wiped. */
function ResetConfirmDialog({
  labels,
  onCancel,
  onConfirm,
}: {
  labels: Copy["settings"];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // Canonical modal contract: Esc + Tab trap + initial focus + focus restore (useModalDismiss),
  // backdrop + explicit Cancel below — initial focus lands on Cancel, the non-destructive choice.
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalDismiss(onCancel, dialogRef);
  return createPortal(
    <div className="drawer-layer settings-confirm-layer" onMouseDown={onCancel}>
      <div
        ref={dialogRef}
        className="settings-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={labels.resetConfirmTitle}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2>{labels.resetConfirmTitle}</h2>
        <p>{labels.resetConfirmBody}</p>
        <div className="settings-confirm-actions">
          <Button variant="ghost" onClick={onCancel}>
            {labels.resetCancel}
          </Button>
          <Button
            variant="danger"
            onClick={onConfirm}
            icon={<RotateCcw size={14} />}
          >
            {labels.resetConfirmAction}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function SettingsPage({
  state,
  dispatch,
}: {
  state: AppState;
  dispatch: Dispatch<ConsoleAction>;
}) {
  const copy = getCopy(state.settings.locale);
  const labels = copy.settings;
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  // Profile-name editor: draft tracks stored name, re-syncs on external change (first-run gate step).
  const [profileDraft, setProfileDraft] = useState(state.session.profile);
  const [profileSynced, setProfileSynced] = useState(state.session.profile);
  if (profileSynced !== state.session.profile) {
    setProfileSynced(state.session.profile);
    setProfileDraft(state.session.profile);
  }
  const update = (patch: Partial<UiSettings>) =>
    dispatch({ type: "settings", patch });
  const toggle = (key: "railCollapsed" | "reducedMotion" | "railHidden") =>
    update({ [key]: !state.settings[key] });
  const { address, connector } = useAccount();
  const chainId = useChainId();
  const { data: health } = useHealth();
  const rpc = APP_CHAIN.rpcUrls.default.http[0] ?? "https://evmrpc.0g.ai";
  const walletRows: [string, string, string][] = [
    [
      labels.rowWallet,
      address
        ? `${state.session.profile || copy.topbar.operator} / ${address}`
        : copy.topbar.notConnected,
      address ? labels.statusConnected : labels.statusOffline,
    ],
    [
      labels.rowChain,
      `${APP_CHAIN.name} / ${APP_CHAIN_ID}`,
      chainId === APP_CHAIN_ID ? labels.statusSelected : labels.statusMismatch,
    ],
    [
      labels.rowRpc,
      rpc,
      health?.ok ? copy.topbar.oracleLive : labels.statusChecking,
    ],
    [
      labels.rowConnector,
      connector?.name ?? state.session.wallet ?? "—",
      address ? labels.statusReady : "—",
    ],
    [
      labels.rowApi,
      BACKEND_URL.replace(/^https?:\/\//, ""),
      // Honest readout: the health read is still in flight → "checking",
      // never a premature "Offline" (critique-2: statuses degrade silently).
      health === undefined
        ? labels.statusChecking
        : health.ok
          ? labels.statusOnline
          : labels.statusOffline,
    ],
  ];
  // Status-pill tones key off the semantic kind, not the localized label.
  // W5-B (critique-4): the old fallback mapped everything unread to "live"
  // (green) — Offline/Mismatch rendered as healthy. Faults → warning,
  // in-flight/unknown reads → muted; only the positive kinds go green.
  const toneFor = (status: string) =>
    status === labels.statusSelected ||
    status === labels.statusConnected ||
    status === labels.statusOnline ||
    status === copy.topbar.oracleLive
      ? "success"
      : status === labels.statusOffline || status === labels.statusMismatch
        ? "warning"
        : status === labels.statusChecking || status === "—"
          ? "muted"
          : "live";

  const toggleRow = (
    key: "railCollapsed" | "reducedMotion" | "railHidden",
    label: string,
    hint: string,
  ) => (
    <button
      className="settings-toggle-row settings-toggle-control"
      type="button"
      key={key}
      onClick={() => toggle(key)}
      aria-pressed={state.settings[key]}
    >
      <span>
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
      <span
        className={`toggle ${state.settings[key] ? "on" : ""}`}
        aria-hidden="true"
      >
        <i />
      </span>
    </button>
  );

  // Shared <label><select> row for enum preferences (density/language/direction).
  const selectRow = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: readonly (readonly [string, string])[],
  ) => (
    <label>
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="ops-page settings-page">
      <PageHead title={labels.pageTitle} lede={labels.pageDescription}>
        <Status
          label={address ? labels.liveWallet : copy.topbar.notConnected}
          tone={address ? "success" : "muted"}
        />
      </PageHead>

      <div className="settings-grid">
        <SettingsDisclosure
          // F2/R2 #8: status lives in the row pills; the title is a plain label.
          title={labels.signingContext}
          icon={<Wifi size={18} className="copper" />}
          // W5-B: the connection diagnostics are the page's most important
          // rows — open by default at ≥1120px, with a one-line status echoed
          // in the summary so the answer survives the closed state too.
          openOnDesktop
          summary={
            <Status
              label={address ? labels.statusConnected : labels.statusOffline}
              tone={address ? "success" : "warning"}
            />
          }
        >
          {walletRows.map(([label, value, status]) => (
            <div className="settings-row" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
              <Status label={status} tone={toneFor(status)} />
            </div>
          ))}
          {/* V3 W5-B: GasTank status card mount (disabled-when-unset). */}
          <GasTankCard locale={state.settings.locale} />
          {/* 03: Settings owns the operator profile name — the
              WalletGate step only creates the first value; renames land here
              and propagate to sidebar/topbar/avatar without re-auth. */}
          <form
            className="settings-profile-form"
            onSubmit={(event) => {
              event.preventDefault();
              const next = profileDraft.trim();
              if (!next || next === state.session.profile) return;
              dispatch({ type: "session", session: { profile: next } });
              dispatch({ type: "notice", notice: labels.profileNameSaved });
            }}
          >
            <Field
              label={labels.profileNameLabel}
              value={profileDraft}
              onChange={setProfileDraft}
              maxLength={60}
              hint={copy.wallet.profileHint}
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={
                !profileDraft.trim() ||
                profileDraft.trim() === state.session.profile
              }
            >
              {labels.profileNameSave}
            </Button>
          </form>
        </SettingsDisclosure>

        <SettingsDisclosure
          title={labels.dailyTitle}
          icon={<Settings2 size={18} className="copper" />}
          defaultOpen
        >
          <div className="settings-toggle-row theme-setting">
            <div>
              <strong>{labels.theme}</strong>
              <small>{labels.themeHint}</small>
            </div>
            <div
              className="theme-segmented"
              role="group"
              aria-label={labels.theme}
            >
              {(
                [
                  ["dark", Moon, labels.themeDark],
                  ["light", Sun, labels.themeLight],
                ] as const
              ).map(([value, Icon, text]) => (
                <button
                  key={value}
                  type="button"
                  className={state.settings.theme === value ? "active" : ""}
                  aria-pressed={state.settings.theme === value}
                  onClick={() => update({ theme: value })}
                >
                  <Icon size={14} />
                  {text}
                </button>
              ))}
            </div>
          </div>
          {toggleRow(
            "railCollapsed",
            labels.compactRail,
            labels.compactRailHint,
          )}
          <div className="settings-select-row">
            {selectRow(
              labels.density,
              state.settings.density,
              (v) => update({ density: v as UiSettings["density"] }),
              [
                ["calm", labels.densityCalm],
                ["dense", labels.densityDense],
              ],
            )}
            {selectRow(
              labels.languageLabel,
              state.settings.locale,
              (v) => update({ locale: v as AppState["settings"]["locale"] }),
              [
                ["en", labels.localeEnglish],
                ["fr", labels.localeFrench],
                ["de", labels.localeGerman],
              ],
            )}
          </div>
        </SettingsDisclosure>

        <SettingsDisclosure
          title={labels.layoutTitle}
          icon={<LayoutDashboard size={18} className="copper" />}
          openOnDesktop
        >
          {toggleRow("railHidden", labels.railHidden, labels.railHiddenHint)}
          {toggleRow(
            "reducedMotion",
            labels.reducedMotion,
            labels.reducedMotionHint,
          )}
          <label className="range-control">
            <span>
              <strong>{labels.railWidth}</strong>
              <small>
                {state.settings.railWidth}px, {labels.railWidthHint}
              </small>
            </span>
            <input
              aria-label={labels.railWidth}
              type="range"
              min="220"
              max="360"
              step="4"
              value={state.settings.railWidth}
              onChange={(event) =>
                update({
                  railWidth: Number(event.target.value),
                  railCollapsed: false,
                })
              }
            />
          </label>
        </SettingsDisclosure>

        <SettingsDisclosure
          title={labels.advancedTitle}
          icon={<Keyboard size={18} className="copper" />}
        >
          <div className="settings-select-row">
            {selectRow(
              labels.direction,
              state.settings.direction,
              (v) => update({ direction: v as UiSettings["direction"] }),
              [
                ["ltr", labels.directionLtr],
                ["rtl", labels.directionRtl],
              ],
            )}
          </div>
          <div className="shortcut-map">
            <div>
              <strong>
                <Keyboard size={16} /> {labels.shortcutTitle}
              </strong>
              <small>{labels.shortcutHint}</small>
            </div>
            <dl>
              <div>
                <dt>Ctrl / ⌘ K</dt>
                <dd>{labels.shortcutPalette}</dd>
              </div>
              <div>
                <dt>Alt 1 / 3–5</dt>
                <dd>{labels.shortcutSurfaces}</dd>
              </div>
              <div>
                <dt>Alt M / P / T / K</dt>
                <dd>{labels.shortcutFlows}</dd>
              </div>
            </dl>
          </div>
          <div className="settings-control-actions">
            <Button
              variant="secondary"
              onClick={() => dispatch({ type: "guide" })}
              icon={<CircleHelp size={16} />}
            >
              {labels.replayOnboarding}
            </Button>
            {/* T1 replay: the checklist lives on the Dashboard; clearing the
                dismissal here restores it there on the next visit. */}
            <Button
              variant="ghost"
              onClick={() => dispatch({ type: "first-run-reset" })}
              icon={<RotateCcw size={14} />}
            >
              {labels.showChecklistAgain}
            </Button>
          </div>
        </SettingsDisclosure>
      </div>

      <SettingsDisclosure
        title={labels.dangerTitle}
        icon={<ShieldAlert size={18} className="copper" />}
        className="settings-danger-zone"
      >
        <p className="settings-danger-hint">{labels.dangerHint}</p>
        <div className="settings-control-actions">
          <Button
            variant="danger"
            onClick={() => setResetConfirmOpen(true)}
            icon={<RotateCcw size={14} />}
          >
            {labels.resetSurface}
          </Button>
        </div>
      </SettingsDisclosure>

      {resetConfirmOpen && (
        <ResetConfirmDialog
          labels={labels}
          onCancel={() => setResetConfirmOpen(false)}
          onConfirm={() => {
            setResetConfirmOpen(false);
            dispatch({ type: "reset" });
          }}
        />
      )}
    </div>
  );
}
