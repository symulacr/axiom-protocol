// W7 lane C — mock EIP-1193 wallet for browser E2E (no private key signing).
// Pattern: apps/frontend/e2e/w11-executor-b-theme.spec.ts (EIP-6963 announce
// before app scripts; WalletGate auto-connects a single injected provider).
// Signatures are deterministic non-recoverable filler; this wallet can only
// drive flows that do not require a real secp256k1 signature to be recovered
// on-chain (reads, console sign-in, relayer/permit flows verified separately).
(() => {
  const MOCK_ADDRESS = "0x129aA090bceb49578712b01DFB0c3789d60344e0"; // deterministic E2E account
  const CHAIN_ID_HEX = "0x40da"; // 16602 zeroG Galileo testnet
  const listeners = {};
  const provider = {
    request: async ({ method, params }) => {
      switch (method) {
        case "eth_requestAccounts":
        case "eth_accounts":
          return [MOCK_ADDRESS];
        case "eth_chainId":
          return CHAIN_ID_HEX;
        case "wallet_switchEthereumChain":
        case "wallet_addEthereumChain":
          return null;
        case "wallet_getCapabilities":
          return {};
        case "personal_sign":
        case "eth_signTypedData_v4":
        case "eth_sign":
          return "0x" + "00".repeat(65);
        case "eth_sendTransaction": {
          // Relay the raw tx via the local backend relayer; return its tx hash.
          const tx = params[0] || {};
          try {
            const res = await fetch("/api/relayer/send", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                to: tx.to,
                data: tx.data,
                value: tx.value || "0x0",
                from: MOCK_ADDRESS,
              }),
            });
            const json = await res.json().catch(() => ({}));
            if (res.ok && (json.txHash || json.hash)) {
              return json.txHash || json.hash;
            }
            console.warn("[__h3b_mock] relayer send failed", res.status, json);
          } catch (e) {
            console.warn("[__h3b_mock] relayer unreachable", e);
          }
          return "0x" + "00".repeat(32); // fallback fake hash so the UI flow can proceed
        }
        default:
          console.warn("[__h3b_mock] unhandled method", method);
          return null;
      }
    },
    on: (event, cb) => {
      (listeners[event] ||= []).push(cb);
      if (event === "connect") cb({ chainId: CHAIN_ID_HEX });
    },
    removeListener: (event, cb) => {
      listeners[event] = (listeners[event] || []).filter((f) => f !== cb);
    },
  };
  const info = {
    uuid: "w7-lane-c-mock-wallet",
    name: "W7 Mock Wallet",
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
    rdns: "w7.mock.wallet",
  };
  window.addEventListener("eip6963:requestProvider", () => {
    window.dispatchEvent(
      new CustomEvent("eip6963:announceProvider", {
        detail: Object.freeze({ info, provider }),
      }),
    );
  });
  window.dispatchEvent(
    new CustomEvent("eip6963:announceProvider", {
      detail: Object.freeze({ info, provider }),
    }),
  );
})();
