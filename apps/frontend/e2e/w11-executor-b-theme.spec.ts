// Wave-11 executor-B verification: light theme must apply inside .app-shell on
// /app. Uses a mock EIP-1193 injected provider (chain 16602, the dev env's
// VITE_CHAIN_ID) announced via the EIP-6963 provider info event before app
// scripts run; the WalletGate auto-connect path (single injected provider)
// signs the console in without a real wallet.
import { test, expect } from "@playwright/test";

const MOCK_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678";
const CHAIN_ID_HEX = "0x40da"; // 16602 zeroG Galileo testnet (dev env default)

const mockProvider = `
(() => {
  const listeners = {};
  const provider = {
    request: async ({ method }) => {
      switch (method) {
        case "eth_requestAccounts":
        case "eth_accounts":
          return ["${MOCK_ADDRESS}"];
        case "eth_chainId":
          return "${CHAIN_ID_HEX}";
        case "wallet_switchEthereumChain":
        case "wallet_addEthereumChain":
          return null;
        case "personal_sign":
        case "eth_signTypedData_v4":
          return "0x" + "00".repeat(65);
        default:
          return null;
      }
    },
    on: (event, cb) => { (listeners[event] ||= []).push(cb); },
    removeListener: (event, cb) => {
      listeners[event] = (listeners[event] || []).filter((f) => f !== cb);
    },
  };
  const info = {
    uuid: "w11-mock-wallet",
    name: "Wave11 Mock Wallet",
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
    rdns: "w11.mock.wallet",
  };
  window.addEventListener("eip6963:requestProvider", () => {
    window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
  });
  window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
})();
`;

test("light theme paints paper inside .app-shell on /app", async ({ page }) => {
  await page.addInitScript({
    content: `window.localStorage.setItem("axiom-ui-settings", JSON.stringify({theme:"light", density:"calm", locale:"en", railWidth:248, railCollapsed:false, railHidden:false, reducedMotion:false, direction:"ltr"})); ${mockProvider}`,
  });
  await page.goto("/app", { waitUntil: "domcontentloaded" });
  // LockedRoute CTA opens WalletGate; its auto-connect (one injected wallet)
  // signs in silently and swaps in the AppShell.
  const connect = page.getByRole("button", { name: /connect wallet/i }).first();
  await connect.click({ timeout: 10000 }).catch(() => {});
  await expect(page.locator(".app-shell.light")).toBeVisible({
    timeout: 20000,
  });
  const bg = await page
    .locator(".app-shell.light")
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  // Light --bg #f1eee8 = rgb(241, 238, 232) — NOT the dark canvas.
  expect(bg).toBe("rgb(241, 238, 232)");
  // State token re-pin visible on the shell root.
  const warning = await page
    .locator(".app-shell.light")
    .evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--warning").trim(),
    );
  expect(warning.toLowerCase()).toBe("#8a4a12");
});
