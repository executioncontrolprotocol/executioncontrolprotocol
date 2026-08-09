/**
 * Shared helpers for discovering non-private workspace packages under packages/.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const SKIP_DIRS = new Set(["node_modules", "dist", "coverage", ".turbo"])

/**
 * @typedef {{ name: string, version: string, dir: string, deps: string[] }} WorkspacePackage
 */

/**
 * Absolute path to the monorepo root.
 * @returns {string}
 */
export function repoRoot() {
  return join(dirname(fileURLToPath(import.meta.url)), "..")
}

/**
 * Recursively find package.json files under `dir`, skipping build/vendor dirs.
 * @param {string} dir
 * @param {string[]} [out]
 * @returns {string[]}
 */
export function walkPackageJsonFiles(dir, out = []) {
  if (!existsSync(dir)) return out
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

/**
 * Collect non-private `@executioncontrolprotocol/*` workspace packages.
 * @param {string} [root]
 * @returns {WorkspacePackage[]}
 */
export function listPublishableWorkspaces(root = repoRoot()) {
  const packagesDir = join(root, "packages")
  /** @type {WorkspacePackage[]} */
  const publishable = []

  for (const pkgPath of walkPackageJsonFiles(packagesDir)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"))
    if (pkg.private === true) continue
    if (typeof pkg.name !== "string" || !pkg.name.startsWith("@executioncontrolprotocol/")) {
      continue
    }
    const deps = new Set()
    for (const field of [
      "dependencies",
      "peerDependencies",
      "optionalDependencies",
    ]) {
      const block = pkg[field]
      if (!block || typeof block !== "object") continue
      for (const name of Object.keys(block)) {
        if (name.startsWith("@executioncontrolprotocol/")) deps.add(name)
      }
    }
    publishable.push({
      name: pkg.name,
      version: pkg.version,
      dir: dirname(pkgPath),
      deps: [...deps],
    })
  }

  return publishable
}

/**
 * Topological sort by internal workspace dependencies (publish order).
 * @param {WorkspacePackage[]} packages
 * @returns {WorkspacePackage[]}
 */
export function topoSortPublishable(packages) {
  const byName = new Map(packages.map((p) => [p.name, p]))
  /** @type {Map<string, number>} */
  const visiting = new Map()
  /** @type {WorkspacePackage[]} */
  const ordered = []

  /**
   * @param {string} name
   */
  function visit(name) {
    const state = visiting.get(name)
    if (state === 1) {
      throw new Error(`Circular workspace dependency involving ${name}`)
    }
    if (state === 2) return
    const pkg = byName.get(name)
    if (!pkg) return
    visiting.set(name, 1)
    for (const dep of pkg.deps) {
      if (byName.has(dep)) visit(dep)
    }
    visiting.set(name, 2)
    ordered.push(pkg)
  }

  for (const pkg of packages) visit(pkg.name)
  return ordered
}
