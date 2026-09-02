#!/usr/bin/env node
/**
 * One-time helper: rewrite @executioncontrolprotocol/* deps to workspace:^
 * and common tooling deps to catalog: in workspace package.json files.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")

const SKIP_DIRS = new Set(["node_modules", "dist", "archive", "fixtures", "coverage", ".git"])
const CATALOG_TOOLS = new Set([
  "typescript",
  "vitest",
  "zod",
  "@types/node",
  "eslint",
  "@typescript-eslint/eslint-plugin",
  "@typescript-eslint/parser",
  "typescript-eslint",
])

const DEP_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
]

function walkPackageJsonFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walkPackageJsonFiles(full, out)
      continue
    }
    if (entry.name === "package.json") out.push(full)
  }
  return out
}

function rewriteDep(name, version, field) {
  if (name.startsWith("@executioncontrolprotocol/")) {
    if (field === "peerDependencies") return "workspace:^"
    return "workspace:^"
  }
  if (CATALOG_TOOLS.has(name) && typeof version === "string" && !version.startsWith("workspace:")) {
    return "catalog:"
  }
  return version
}

const files = walkPackageJsonFiles(root).filter(
  (p) => !p.includes(join("archive", "legacy")) && !p.includes("fixtures/consumer-cli"),
)

for (const file of files) {
  const json = JSON.parse(readFileSync(file, "utf8"))
  let changed = false

  for (const field of DEP_FIELDS) {
    const deps = json[field]
    if (!deps || typeof deps !== "object") continue
    for (const [name, version] of Object.entries(deps)) {
      const next = rewriteDep(name, version, field)
      if (next !== version) {
        deps[name] = next
        changed = true
      }
    }
  }

  if (changed) {
    writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`, "utf8")
    console.log(`updated ${file}`)
  }
}
