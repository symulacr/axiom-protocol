/*
  ConnectModal — conflict chooser only. The WalletGate CTA connects the first
  discovered injected wallet directly; this surface mounts solely when more
  than one injected wallet is installed (or via "Use mobile wallet"). Lists
  the connectors configured in config/wagmi (mipd-discovered injected +
  WalletConnect); WalletConnect renders its own QR/deep-link flow through
  wagmi's connector. Styling reuses the existing surface tokens and
  the shared Button component — no new design system.
*/
import { useState } from "react";
import { useConnect, useConnectors } from "wagmi";
import { X } from "./icons.js";
import { Button } from "./Controls.js";
import { getCopy, type Locale } from "../../lib/copy.js";
import { humanizeError } from "../../utils/format.js";

export function ConnectModal({
  onClose,
  locale,
}: {
  onClose: () => void;
  locale: Locale;
}) {
  const copy = getCopy(locale);
  const connectors = useConnectors();
  const { connectAsync } = useConnect();
  const [error, setError] = useState<string | null>(null);
  // Local busy marker — wagmi's variables.connector unions away the uid.
  const [pendingUid, setPendingUid] = useState<string | null>(null);

  // Localized labels keyed on the configured connector types; unknown ids fall
  // back to the connector's own name.
  const options = connectors.map((connector) => {
    switch (connector.type) {
      case "injected":
        return {
          connector,
          label: copy.wallet.browserWalletLabel,
          hint: copy.wallet.browserWalletHint,
        };
      case "walletConnect":
        return {
          connector,
          label: copy.wallet.walletConnectLabel,
          hint: copy.wallet.walletConnectHint,
        };
      default:
        return { connector, label: connector.name, hint: "" };
    }
  });

  const connect = async (connector: (typeof connectors)[number]) => {
    setError(null);
    setPendingUid(connector.uid);
    try {
      await connectAsync({ connector });
      onClose();
    } catch (err) {
      setError(humanizeError(err));
    } finally {
      setPendingUid(null);
    }
  };

  return (
    <div className="connect-modal-layer" onMouseDown={onClose}>
      <section
        className="connect-modal"
        role="dialog"
        aria-modal="true"
        aria-label={copy.wallet.connectTitle}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className="connect-modal-close"
          onClick={onClose}
          aria-label={copy.a11y.closeWalletAccess}
        >
          <X size={16} />
        </button>
        <h2>{copy.wallet.connectTitle}</h2>
        <div className="connect-options">
          {options.map(({ connector, label, hint }) => (
            <Button
              key={connector.uid}
              variant="secondary"
              busy={pendingUid === connector.uid}
              onClick={() => void connect(connector)}
            >
              <span className="connect-option">
                <strong>{label}</strong>
                {hint ? <small>{hint}</small> : null}
              </span>
            </Button>
          ))}
        </div>
        {error && (
          <p className="wallet-gate-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
