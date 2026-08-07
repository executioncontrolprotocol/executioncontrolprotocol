#!/usr/bin/env node
/**
 * Launcher so Windows npm bin shims always invoke Node (never open .ts in an editor).
 */
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const entry = path.join(__dirname, "..", "dist", "index.js");
if (!fs.existsSync(entry)) {
  console.error(
    "ecp: dist/index.js not found. Run from repo root: npm run build",
  );
  process.exit(1);
}

const r = spawnSync(process.execPath, [entry, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});
process.exit(r.status === null ? 1 : r.status);
