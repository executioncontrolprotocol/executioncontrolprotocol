#!/usr/bin/env node
/**
 * Bump version in all workspace package.json files and align @executioncontrolprotocol/* ranges.
 * Usage: node scripts/bump-all-ecp-versions.mjs <semver>
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")
const newVersion = process.argv[2] ?? "0.0.10"

if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/.test(newVersion)) {
  console.error(`Invalid semver: ${newVersion}`)
  process.exit(1)
}

const SKIP_DIRS = new Set(["node_modules", "dist", "archive"])

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

function bumpInternalDep(version) {
  if (version === "1.0.0" || version === "^1.0.0" || version === "~1.0.0") {
    return version.startsWith("^") || version.startsWith("~")
      ? `${version[0]}${newVersion}`
      : newVersion
  }
  return version
}

function bumpFile(path) {
  const json = JSON.parse(readFileSync(path, "utf8"))
  const old = json.version
  json.version = newVersion

  for (const field of [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ]) {
    const deps = json[field]
    if (!deps) continue
    for (const [name, version] of Object.entries(deps)) {
      if (name.startsWith("@executioncontrolprotocol/")) {
        deps[name] = bumpInternalDep(version)
      }
    }
  }

  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`, "utf8")
  console.log(`${path.replace(root + "\\", "").replace(root + "/", "")}: ${old} -> ${newVersion}`)
}

const files = walkPackageJsonFiles(root).filter((p) => !p.includes(`${join("archive", "legacy")}`))
for (const file of files) {
  bumpFile(file)
}

console.log(`\nBumped ${files.length} package.json files to ${newVersion}`)
