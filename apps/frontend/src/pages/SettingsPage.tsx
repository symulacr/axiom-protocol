/*
  SettingsPage (v2 control plane, live values): session/chain/RPC rows come
  from wagmi + useHealth; display preferences persist in axiom-ui-settings
  (uiStore). Theme also drives the document data-theme attribute via App.
*/
import { useState, type Dispatch, type ReactNode } from "react";
import { useAccount, useChainId } from "wagmi";
import {
  CircleHelp,
  Globe2,
  Keyboard,
  LogOut,
  Moon,
  RotateCcw,
  Server,
  ShieldCheck,
  Sun,
  Wifi,
} from "../components/axiom/icons.js";
import { Button, Status } from "../components/axiom/Controls.js";
import { getCopy } from "../lib/copy.js";
import type { AppState, UiSettings } from "../lib/models.js";
import type { PrototypeAction } from "../lib/prototypeStore.js";
import { useHealth } from "../hooks/useHealth.js";
import { APP_CHAIN, APP_CHAIN_ID } from "../config/wagmi.js";
import { BACKEND_URL } from "../config/env.js";

function SettingsDisclosure({
  eyebrow,
  title,
  icon,
  children,
}: {
  eyebrow: string;
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(
    () => !window.matchMedia("(max-width: 700px)").matches,
  );
  return (
    <section className="panel settings-card">
      <details
        className="settings-disclosure"
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary className="panel-head">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h2>{title}</h2>
          </div>
          {icon}
        </summary>
        <div className="settings-disclosure-content">{children}</div>
      </details>
    </section>
  );
}

export function SettingsPage({
  state,
  dispatch,
  go,
  onLock,
}: {
  state: AppState;
  dispatch: Dispatch<PrototypeAction>;
  go: (path: string) => void;
  onLock: () => void;
}) {
  const copy = getCopy(state.settings.locale);
  const labels = copy.settings;
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
      "Wallet",
      address
        ? `${state.session.profile || "operator"} / ${address}`
        : "not connected",
      address ? "Connected" : "Offline",
    ],
    [
      "Chain",
      `${APP_CHAIN.name} / ${APP_CHAIN_ID}`,
      chainId === APP_CHAIN_ID ? "Selected" : "Mismatch",
    ],
    ["RPC", rpc, health?.ok ? "oracle live" : "checking"],
    [
      "Connector",
      connector?.name ?? state.session.wallet ?? "—",
      address ? "Ready" : "—",
    ],
    [
      "API",
      BACKEND_URL.replace(/^https?:\/\//, ""),
      health?.ok ? "online" : "offline",
    ],
  ];

  return (
    <div className="ops-page settings-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">CONTROL PLANE / CONFIGURATION</span>
          <h1>Settings</h1>
          <p>{labels.languageHint}</p>
        </div>
        <Status
          label={address ? "live wallet" : labels.localFixture}
          tone={address ? "success" : "muted"}
        />
      </div>

      <div className="settings-grid">
        <SettingsDisclosure
          eyebrow={labels.walletNetwork}
          title={labels.signingContext}
          icon={<Wifi size={17} className="copper" />}
        >
          {walletRows.map(([label, value, status]) => (
            <div className="settings-row" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
              <Status
                label={status}
                tone={
                  status === "Selected" ||
                  status === "Connected" ||
                  status === "online" ||
                  status === "oracle live"
                    ? "success"
                    : "live"
                }
              />
            </div>
          ))}
        </SettingsDisclosure>

        <SettingsDisclosure
          eyebrow={labels.simulationConfig}
          title={labels.explicitFixtures}
          icon={<Server size={17} className="copper" />}
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
          {(
            [
              ["railCollapsed", labels.compactRail, labels.compactRailHint],
              ["reducedMotion", labels.reducedMotion, labels.reducedMotionHint],
              ["railHidden", labels.railHidden, labels.railHiddenHint],
            ] as const
          ).map(([key, label, hint]) => (
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
          ))}
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
                <option value="calm">Calm</option>
                <option value="dense">Dense</option>
              </select>
            </label>
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
                <option value="ltr">LTR / left to right</option>
                <option value="rtl">RTL / right to left</option>
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
          <div className="shortcut-map">
            <div>
              <span className="eyebrow">COMMAND CENTER</span>
              <strong>
                <Keyboard size={15} /> Keyboard map
              </strong>
              <small>
                Fast paths remain visible; they never bypass wallet, network or
                signature boundaries.
              </small>
            </div>
            <dl>
              <div>
                <dt>Ctrl / ⌘ K</dt>
                <dd>Find actions, agents, receipts and routes</dd>
              </div>
              <div>
                <dt>Alt 1–5</dt>
                <dd>Open core command surfaces</dd>
              </div>
              <div>
                <dt>Alt M / P / T / K</dt>
                <dd>Open execution flows</dd>
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

      <div className="diagnostic-note">
        <ShieldCheck size={15} />
        <span>
          Session, chain, RPC and preference state are visible before any action
          is taken.
        </span>
      </div>
      <div className="settings-footer-actions settings-destructive-actions">
        <Button
          variant="secondary"
          onClick={() => go("/staking")}
          icon={<Globe2 size={15} />}
        >
          {labels.reviewStakingBoundary}
        </Button>
        <Button
          variant="ghost"
          onClick={() => dispatch({ type: "reset" })}
          icon={<RotateCcw size={14} />}
        >
          {labels.resetSurface}
        </Button>
        <Button variant="danger" onClick={onLock} icon={<LogOut size={15} />}>
          {labels.lockConsole}
        </Button>
      </div>
    </div>
  );
}
