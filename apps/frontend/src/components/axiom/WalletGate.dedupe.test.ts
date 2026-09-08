import { test } from "bun:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Pins the wallet-gate chooser dedupe (the "Browser wallet ×3" bug): wagmi
// mixes the config-declared generic injected() connector with one mipd
// connector per EIP-6963 announcement, and the chooser used to render that
// raw list — one identical "Browser wallet" row per installed wallet.
// Function-level contract below, plus a source guard so the render path can
// never go back to mapping the raw connector list.
import { dedupeGateConnectors } from "./WalletGate.js";

type Stub = { id: string; type: string; name?: string; rdns?: string };

const GENERIC = { id: "injected", type: "injected", name: "Injected" };
const WC = {
  id: "walletConnect",
  type: "walletConnect",
  name: "WalletConnect",
};
const announced = (rdns: string, name: string): Stub => ({
  id: rdns,
  type: "injected",
  name,
});

test("announced wallets replace the generic injected entry, WalletConnect last", () => {
  // Runtime order from wagmi: declared connectors first (injected, then
  // walletConnect), mipd announcements appended after.
  const out = dedupeGateConnectors([
    GENERIC,
    WC,
    announced("com.mockwallet", "MockWallet"),
    announced("app.fakewallet", "FakeWallet"),
  ]);
  assert.deepEqual(
    out.map((c) => c.id),
    ["com.mockwallet", "app.fakewallet", "walletConnect"],
  );
});

test("no announcements: the single generic browser-wallet entry stays", () => {
  const out = dedupeGateConnectors([GENERIC, WC]);
  assert.deepEqual(
    out.map((c) => c.id),
    ["injected", "walletConnect"],
  );
});

test("duplicate declarations collapse by type:id", () => {
  const out = dedupeGateConnectors([GENERIC, GENERIC, WC, WC]);
  assert.deepEqual(
    out.map((c) => c.id),
    ["injected", "walletConnect"],
  );
});

test("rdns cross-dedupes a declared connector against its mipd twin", () => {
  const declared = {
    id: "metaMask",
    type: "injected",
    name: "MetaMask",
    rdns: "io.metamask",
  };
  const mipdTwin = announced("io.metamask", "MetaMask");
  const out = dedupeGateConnectors([GENERIC, declared, mipdTwin, WC]);
  assert.deepEqual(
    out.map((c) => c.id),
    ["metaMask", "walletConnect"],
  );
});

test("chooser renders the deduped option list, never the raw connectors", () => {
  const src = readFileSync(join(import.meta.dir, "WalletGate.tsx"), "utf8");
  assert.match(
    src,
    /dedupeGateConnectors\(connectors\)/,
    "the option list passes through dedupeGateConnectors",
  );
  assert.match(
    src,
    /\{options\.map\(\(o\) => \(/,
    "the chooser maps the deduped options",
  );
  assert.ok(
    !/connectors\.map\(/.test(src),
    "the raw connector list is never rendered",
  );
});

test("the chooser opens only for 2+ announced wallets", () => {
  const src = readFileSync(join(import.meta.dir, "WalletGate.tsx"), "utf8");
  assert.match(
    src,
    /announcedOptions\.length > 1\) setShowOptions\(true\)/,
    "the generic connector no longer counts toward the chooser trigger",
  );
});
