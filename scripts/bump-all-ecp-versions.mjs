#!/usr/bin/env node
/**
 * Bump version in all workspace package.json files.
 * With workspace:^ internal deps, only the version field needs updating.
 * Usage: node scripts/bump-all-ecp-versions.mjs <semver>
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")
const newVersion = process.argv[2]
if (!newVersion || !/^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/.test(newVersion)) {
  console.error("Usage: node scripts/bump-all-ecp-versions.mjs <semver>\nExample: 0.10.0")
  process.exit(1)
}

const SKIP_DIRS = new Set(["node_modules", "dist", "archive", "fixtures"])

function walkPackageJsonFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walkPackageJsonFiles(full, out)
      continue
    }
    if (entry.name === "package.json") {
      out.push(full)
    }
  }
  return out
}

const files = walkPackageJsonFiles(root).filter((p) => !p.includes(`${join("archive", "legacy")}`))

function bumpFile(path) {
  const json = JSON.parse(readFileSync(path, "utf8"))
  if (typeof json.version !== "string") return
  const old = json.version
  json.version = newVersion
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`, "utf8")
  console.log(`${path.replace(root + "\\", "").replace(root + "/", "")}: ${old} -> ${newVersion}`)
}

for (const file of files) {
  bumpFile(file)
}

console.log(`\nBumped ${files.length} package.json files to ${newVersion}`)
