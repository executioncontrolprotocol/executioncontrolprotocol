/**
 * Publish all non-private workspace packages to npm in dependency order.
 * Skips versions that are already on the registry (safe to re-run).
 *
 * Usage: node scripts/publish-workspaces.mjs
 * Requires NODE_AUTH_TOKEN (or npm login) with publish access.
 */
import { execSync } from "node:child_process"
import {
  listPublishableWorkspaces,
  topoSortPublishable,
  repoRoot,
} from "./list-publishable-workspaces.mjs"

const root = repoRoot()
const dryRun = process.argv.includes("--dry-run")

/**
 * @param {string} name
 * @param {string} version
 * @returns {boolean}
 */
function versionExistsOnNpm(name, version) {
  try {
    const out = execSync(`npm view "${name}@${version}" version`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim()
    return out === version
  } catch {
    return false
  }
}

const packages = topoSortPublishable(listPublishableWorkspaces(root))
if (packages.length === 0) {
  console.error("No publishable workspace packages found under packages/")
  process.exit(1)
}

const versionSet = new Set(packages.map((p) => p.version))
if (versionSet.size > 1) {
  console.error(
    "All non-private workspace packages must use the same version. Found:",
    [...versionSet].join(", "),
  )
  process.exit(1)
}

console.log(
  `Publishing ${packages.length} package(s) at ${[...versionSet][0]}${dryRun ? " (dry-run)" : ""}`,
)

let published = 0
let skipped = 0

for (const pkg of packages) {
  if (versionExistsOnNpm(pkg.name, pkg.version)) {
    console.log(`skip ${pkg.name}@${pkg.version} (already on npm)`)
    skipped += 1
    continue
  }

  console.log(`publish ${pkg.name}@${pkg.version}`)
  if (dryRun) {
    published += 1
    continue
  }

  execSync(`npm publish --workspace=${pkg.name} --access public`, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  })
  published += 1
}

console.log(`\nDone. published=${published} skipped=${skipped}`)
