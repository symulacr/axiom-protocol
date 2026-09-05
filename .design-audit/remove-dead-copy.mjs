#!/usr/bin/env node
/* R21 dead-copy removal — deletes the grep-verified dead keys from
   apps/frontend/src/lib/copy.ts (type block + all locale objects).
   Entry boundary: next 4-space-indented `key:` line or 2-space `}`. */
import { readFileSync, writeFileSync } from "node:fs";

const FILE = "apps/frontend/src/lib/copy.ts";
const KEYS = [
  // flowUi transfer-key cluster
  "transferKeyWalkthroughTitle", "transferKeyWalkthroughSteps",
  "transferKeyLabel", "transferKeyHint", "errRecipientKey",
  "errRecipientKeyIsAddress", "noAgentsOption", "detailsEditable",
  "chainLive",
  // landing preview strip cluster
  "previewAgentTitle", "previewAgentDesc", "previewVaultLabel",
  "previewReceiptTitle", "previewReceiptMeta", "stripVerifySmall",
  "stripOperateSmall", "signatureBoundary", "consoleAccess",
  // singletons
  "localeName", "collapseSidebar", "connectionOk", "connectionFail",
  "readyLabel", "needsSetupLabel", "oracleUnreachable", "sponsoredBadge",
  "delegationOwnerOnly",
];
const startPat = new RegExp(`^    (${KEYS.join("|")})[:=]`);
const boundary = /^    [A-Za-z_$][\w$]*:|^  \}/;

const lines = readFileSync(FILE, "utf8").split("\n");
const out = [];
let skipping = false;
let removed = 0;
for (const line of lines) {
  if (skipping) {
    if (boundary.test(line)) {
      skipping = false;
      out.push(line); // next entry / block end — keep
    } else {
      removed++;
    }
    continue;
  }
  if (startPat.test(line)) {
    skipping = true;
    removed++;
    continue;
  }
  out.push(line);
}
writeFileSync(FILE, out.join("\n"));
console.log(`removed ${removed} lines for ${KEYS.length} keys`);
