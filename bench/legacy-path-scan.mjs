/**
 * Scan workspace sources for `legacy/` path fragments (A12 walker).
 */
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

const DEFAULT_SKIP_DIRS = new Set(["node_modules", "dist", ".git", "coverage"])
const CODE_GLOB = /\.(ts|mts|js|mjs|json|yaml|yml)$/

/**
 * Directories and files excluded from the scan (historical docs).
 */
export const LEGACY_SCAN_EXCLUDE = [
  "realignment/",
  "REALIGNMENT-PLAN.md",
  "AGENTS.md",
  "ARCHITECTURE.md",
]

/**
 * @param {string} repoRoot
 * @param {Record<string, string> | undefined} fileMap relative path -> contents (for unit tests)
 * @returns {string[]} violating relative paths
 */
export function findLegacyPathRefs(repoRoot, fileMap) {
  const violations = []
  const entries = fileMap ? Object.entries(fileMap) : [...walkRepo(repoRoot)]
  for (const [rel, text] of entries) {
    if (isExcluded(rel)) continue
    if (!CODE_GLOB.test(rel)) continue
    if (/(?:from|require)\s*\(?["'][^"']*legacy\//.test(text)) {
      violations.push(rel)
    }
  }
  return violations
}

function isExcluded(rel) {
  const norm = rel.replace(/\\/g, "/")
  if (LEGACY_SCAN_EXCLUDE.some((prefix) => norm === prefix || norm.startsWith(prefix))) return true
  if (norm.endsWith(".md")) return true
  return false
}

function* walkRepo(root) {
  const stack = [root]
  while (stack.length > 0) {
    const dir = stack.pop()
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (DEFAULT_SKIP_DIRS.has(entry.name)) continue
      const full = path.join(dir, entry.name)
      const rel = path.relative(root, full).replace(/\\/g, "/")
      if (entry.isDirectory()) {
        stack.push(full)
        continue
      }
      if (!CODE_GLOB.test(entry.name)) continue
      yield [rel, readFileSync(full, "utf8")]
    }
  }
}