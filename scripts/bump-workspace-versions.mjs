#!/usr/bin/env node
/**
 * Bump the same version in root package.json and every packages/*/package.json.
 * Usage: node scripts/bump-workspace-versions.mjs <newVersion>
 * Example: npm run version:bump -- 0.4.0
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const newVersion = process.argv[2];
if (!newVersion || !/^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/.test(newVersion)) {
  console.error(
    "Usage: node scripts/bump-workspace-versions.mjs <semver>\nExample: 0.4.0 or 0.4.0-rc.1",
  );
  process.exit(1);
}

function bumpFile(path) {
  const raw = readFileSync(path, "utf8");
  const json = JSON.parse(raw);
  const old = json.version;
  json.version = newVersion;

  // Keep internal workspace dependency ranges aligned for npm publishes.
  const internal = [
    "@executioncontrolprotocol/spec",
    "@executioncontrolprotocol/runtime",
    "@executioncontrolprotocol/cli",
  ];
  for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    const deps = json[field];
    if (!deps) continue;
    for (const name of internal) {
      if (typeof deps[name] === "string") {
        deps[name] = `^${newVersion}`;
      }
    }
  }

  writeFileSync(path, JSON.stringify(json, null, 2) + "\n", "utf8");
  console.log(`${path}: ${old} → ${newVersion}`);
}

bumpFile(join(root, "package.json"));

const packagesDir = join(root, "packages");
if (!existsSync(packagesDir)) {
  process.exit(0);
}

for (const name of readdirSync(packagesDir, { withFileTypes: true })) {
  if (!name.isDirectory()) continue;
  const pkgPath = join(packagesDir, name.name, "package.json");
  if (existsSync(pkgPath)) {
    bumpFile(pkgPath);
  }
}

console.log("\nDone. Commit the version changes, then merge to main to publish.");
