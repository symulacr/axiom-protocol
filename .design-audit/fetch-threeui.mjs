#!/usr/bin/env node
/* Fetch the ThreeUI Community repo (MIT) as a tarball and extract it. */
import { execSync } from "node:child_process";
const res = await fetch("https://github.com/MengTo/threeui/archive/refs/heads/main.tar.gz");
if (!res.ok) { console.error("fetch failed", res.status); process.exit(1); }
const buf = Buffer.from(await res.arrayBuffer());
import { writeFileSync, mkdirSync } from "node:fs";
mkdirSync("/tmp/threeui", { recursive: true });
writeFileSync("/tmp/threeui/src.tar.gz", buf);
execSync("tar -xzf /tmp/threeui/src.tar.gz -C /tmp/threeui");
console.log("extracted");
