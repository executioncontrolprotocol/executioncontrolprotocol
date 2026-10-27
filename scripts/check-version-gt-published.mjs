/**
 * Fail if any publishable workspace package version is not strictly greater than
 * the latest version on npm (development branch gate before merge to main).
 */
import { execSync } from "node:child_process"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import semver from "semver"
import { listPublishableWorkspaces, repoRoot } from "./list-publishable-workspaces.mjs"

/**
 * Latest `version` on the npm registry, or `null` when the package is unpublished.
 * @param {string} name
 * @returns {string | null}
 */
export function publishedVersion(name) {
  try {
    return execSync(`npm view "${name}" version`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim()
  } catch {
    return null
  }
}

/**
 * Compare workspace package versions to published npm versions.
 * Unpublished packages pass. Local must be semver-greater than npm latest.
 * @param {{ name: string, version: string }[]} packages
 * @param {(name: string) => string | null} [lookup]
 * @returns {{ ok: boolean, lines: string[] }}
 */
export function checkWorkspaceVersionsVsNpm(packages, lookup = publishedVersion) {
  if (packages.length === 0) {
    return { ok: false, lines: ["No publishable workspace packages found under packages/ and plugins/"] }
  }

  /** @type {string[]} */
  const lines = []
  let failed = false
  for (const { name, version: local } of packages) {
    const pub = lookup(name)
    if (!pub) {
      lines.push(`OK ${name}@${local} — not on npm yet (nothing to compare)`)
      continue
    }
    if (!semver.valid(local) || !semver.gt(local, pub)) {
      lines.push(`FAIL ${name}: package.json version "${local}" must be greater than npm latest "${pub}"`)
      failed = true
    } else {
      lines.push(`OK ${name}@${local} > npm@${pub}`)
    }
  }
  return { ok: !failed, lines }
}

function isMainModule() {
  const invoked = process.argv[1]
  if (!invoked) return false
  return resolve(fileURLToPath(import.meta.url)) === resolve(invoked)
}

if (isMainModule()) {
  const result = checkWorkspaceVersionsVsNpm(listPublishableWorkspaces(repoRoot()))
  for (const line of result.lines) {
    if (line.startsWith("FAIL")) console.error(line)
    else console.log(line)
  }
  if (!result.ok) {
    console.error("\nBump package.json above npm latest (`pnpm exec changeset` then `pnpm exec changeset version`).")
    process.exit(1)
  }
}
