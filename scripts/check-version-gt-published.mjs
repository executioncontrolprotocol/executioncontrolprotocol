/**
 * Fail if any publishable workspace package version is not strictly greater than
 * the latest version on npm (development branch gate before merge to main).
 */
import { execSync } from "node:child_process"
import semver from "semver"
import {
  listPublishableWorkspaces,
  repoRoot,
} from "./list-publishable-workspaces.mjs"

/**
 * @param {string} name
 * @returns {string | null}
 */
function publishedVersion(name) {
  try {
    return execSync(`npm view "${name}" version`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim()
  } catch {
    return null
  }
}

const publishable = listPublishableWorkspaces(repoRoot())
if (publishable.length === 0) {
  console.error("No publishable workspace packages found under packages/")
  process.exit(1)
}

const versionSet = new Set(publishable.map((p) => p.version))
if (versionSet.size > 1) {
  console.error(
    "All non-private workspace packages must use the same version. Found:",
    [...versionSet].join(", "),
  )
  process.exit(1)
}

let failed = false
for (const { name, version: local } of publishable) {
  const pub = publishedVersion(name)
  if (!pub) {
    console.log(`✓ ${name}@${local} — not on npm yet (nothing to compare)`)
    continue
  }
  if (!semver.gt(local, pub)) {
    console.error(
      `✗ ${name}: package.json version "${local}" must be greater than npm latest "${pub}"`,
    )
    failed = true
  } else {
    console.log(`✓ ${name}@${local} > npm@${pub}`)
  }
}

if (failed) {
  console.error(
    "\nBump versions: npm run version:bump -- <newVersion> (e.g. 0.10.1)",
  )
  process.exit(1)
}
