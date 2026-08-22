/*
  SettingsPage (v2 control plane, live values): session/chain/RPC rows come
  from wagmi + useHealth; display preferences persist in axiom-ui-settings
  (uiStore). Theme also drives the document data-theme attribute via App.

  Depth contract (C-SETTINGS / 03 FINDING-004+005, 04 FINDING-003):
  - depth 0: Signing context (read-only, open) + Daily preferences (theme,
    compact rail, density, language) + footer (staking link, Lock console).
  - depth 1: Console layout + Advanced — disclosures start CLOSED at every
    viewport (an accordion that defaults open is grouping, not disclosure).
  - depth 2: Danger zone (closed) → Reset surface wears danger chrome behind
    an explicit confirm dialog (Esc/backdrop/Cancel via the modal-dismiss
    contract). Lock console is routine → ghost, never danger.
*/
import { useState, type Dispatch, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAccount, useChainId } from "wagmi";
import {
  CircleHelp,
  Globe2,
  Keyboard,
  LayoutDashboard,
  LogOut,
  Moon,
  RotateCcw,
  Settings2,
  ShieldAlert,
  Sun,
  Wifi,
} from "../components/axiom/icons.js";
import { Button, Field, Status } from "../components/axiom/Controls.js";
import { getCopy, type Copy } from "../lib/copy.js";
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
  className = "",
  children,
}: {
  title: string;
  icon: ReactNode;
  /** Shallow sections (read-only context, daily preferences) stay open; every
   *  advanced/rare/destructive section starts closed at any viewport. */
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`panel settings-card ${className}`.trim()}>
      <details
        className="settings-disclosure"
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary className="panel-head">
          {/* S2 (audit 06 FINDING-003): disclosure eyebrows restated the h2
              beneath them ("CONSOLE / LAYOUT" over "Console layout") — the h2
              is the one title per card. */}
          <div>
            <h2>{title}</h2>
          </div>
          {icon}
        </summary>
        <div className="settings-disclosure-content">{children}</div>
      </details>
    </section>
  );
}

/** Reset-surface confirm dialog (C-SETTINGS): the app's most destructive
 *  non-wallet action gets the canonical modal trio — Esc + backdrop + explicit
 *  Cancel — and an explicit danger confirm before anything is wiped. */
function ResetConfirmDialog({
  labels,
  onCancel,
  onConfirm,
}: {
  labels: Copy["settings"];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useModalDismiss(onCancel);
  return createPortal(
    <div className="drawer-layer settings-confirm-layer" onMouseDown={onCancel}>
      <div
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
  go,
  onLock,
}: {
  state: AppState;
  dispatch: Dispatch<ConsoleAction>;
  go: (path: string) => void;
  onLock: () => void;
}) {
  const copy = getCopy(state.settings.locale);
  const labels = copy.settings;
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  // Profile-name editor (03 FINDING-013): draft tracks the stored name and
  // re-syncs when it changes elsewhere (first-run WalletGate step).
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
      health?.ok ? labels.statusOnline : labels.statusOffline,
    ],
  ];
  // Status-pill tones key off the semantic kind, not the localized label.
  const toneFor = (status: string) =>
    status === labels.statusSelected ||
    status === labels.statusConnected ||
    status === labels.statusOnline ||
    status === copy.topbar.oracleLive
      ? "success"
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

  return (
    <div className="ops-page settings-page">
      <div className="page-head">
        <div>
          <h1>{labels.pageTitle}</h1>
          <p>{labels.pageDescription}</p>
        </div>
        <Status
          label={address ? labels.liveWallet : copy.topbar.notConnected}
          tone={address ? "success" : "muted"}
        />
      </div>

      <div className="settings-grid">
        <SettingsDisclosure
          title={labels.signingContext}
          icon={<Wifi size={17} className="copper" />}
          defaultOpen
        >
          {walletRows.map(([label, value, status]) => (
            <div className="settings-row" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
              <Status label={status} tone={toneFor(status)} />
            </div>
          ))}
          {/* 03 FINDING-013: Settings owns the operator profile name — the
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
          icon={<Settings2 size={17} className="copper" />}
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
              <button
                type="button"
                className={state.settings.theme === "dark" ? "active" : ""}
                aria-pressed={state.settings.theme === "dark"}
                onClick={() => update({ theme: "dark" })}
              >
                <Moon size={13} />
                {labels.themeDark}
              </button>
              <button
                type="button"
                className={state.settings.theme === "light" ? "active" : ""}
                aria-pressed={state.settings.theme === "light"}
                onClick={() => update({ theme: "light" })}
              >
                <Sun size={13} />
                {labels.themeLight}
              </button>
            </div>
          </div>
          {toggleRow(
            "railCollapsed",
            labels.compactRail,
            labels.compactRailHint,
          )}
          <div className="settings-select-row">
            <label>
              {labels.density}
              <select
                aria-label={labels.density}
                value={state.settings.density}
                onChange={(event) =>
                  update({
                    density: event.target.value as UiSettings["density"],
                  })
                }
              >
                <option value="calm">{labels.densityCalm}</option>
                <option value="dense">{labels.densityDense}</option>
              </select>
            </label>
            <label>
              {labels.languageLabel}
              <select
                aria-label={labels.languageLabel}
                value={state.settings.locale}
                onChange={(event) =>
                  update({
                    locale: event.target
                      .value as AppState["settings"]["locale"],
                  })
                }
              >
                <option value="en">{labels.localeEnglish}</option>
                <option value="fr">{labels.localeFrench}</option>
                <option value="de">{labels.localeGerman}</option>
              </select>
            </label>
          </div>
        </SettingsDisclosure>

        <SettingsDisclosure
          title={labels.layoutTitle}
          icon={<LayoutDashboard size={17} className="copper" />}
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
                {state.settings.railWidth}px · {labels.railWidthHint}
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
          icon={<Keyboard size={17} className="copper" />}
        >
          <div className="settings-select-row">
            <label>
              {labels.direction}
              <select
                aria-label={labels.direction}
                value={state.settings.direction}
                onChange={(event) =>
                  update({
                    direction: event.target.value as UiSettings["direction"],
                  })
                }
              >
                <option value="ltr">{labels.directionLtr}</option>
                <option value="rtl">{labels.directionRtl}</option>
              </select>
            </label>
          </div>
          <div className="shortcut-map">
            <div>
              <strong>
                <Keyboard size={15} /> {labels.shortcutTitle}
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
              icon={<CircleHelp size={15} />}
            >
              {labels.replayOnboarding}
            </Button>
          </div>
        </SettingsDisclosure>
      </div>

      <SettingsDisclosure
        title={labels.dangerTitle}
        icon={<ShieldAlert size={17} className="copper" />}
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

      <div className="settings-footer-actions">
        <Button
          variant="secondary"
          onClick={() => go("/staking")}
          icon={<Globe2 size={15} />}
        >
          {labels.reviewStakingBoundary}
        </Button>
        <Button variant="ghost" onClick={onLock} icon={<LogOut size={15} />}>
          {labels.lockConsole}
        </Button>
      </div>

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
