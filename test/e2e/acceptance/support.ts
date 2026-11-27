/**
 * Shared helpers for MVP acceptance scenarios A1–A12.
 * @category Test
 */
export {
  assertCliBuilt,
  createCliHome,
  ecpBin,
  fileUrlForLocalPath,
  fixturesRoot,
  parseJsonStdout,
  pluginTestRoot,
  runEcp,
  seedPluginLink,
  waitForHost,
} from "../cli/support.js"
export { callTool, openMcpSession, repoRoot } from "../mcp/support.js"

import path from "node:path"
import { fileURLToPath } from "node:url"

const acceptanceDir = path.dirname(fileURLToPath(import.meta.url))

/** Repo root (three levels up from `test/e2e/acceptance`). */
export const acceptanceRepoRoot = path.resolve(acceptanceDir, "../../..")

/** Minimal second plugin used by A6 mid-session link. */
export const minimalPluginRoot = path.join(
  acceptanceRepoRoot,
  "test/e2e/cli/fixtures/minimal-plugin",
)

/** Strip volatile fields for A9 warm vs in-process parity. */
export function stripVolatile(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripVolatile)
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (
        key === "runId" ||
        key === "startedAt" ||
        key === "endedAt" ||
        key === "durationMs" ||
        key === "timing" ||
        key === "updatedAt" ||
        key === "createdAt"
      ) {
        continue
      }
      out[key] = stripVolatile(entry)
    }
    return out
  }
  return value
}

/** The eight invalid fixtures used by A3. */
export const A3_INVALID_NAMES = [
  "schema-empty-steps",
  "unknown-capability",
  "duplicate-id",
  "expr-syntax",
  "ref-unresolved",
  "plugins-missing",
  "mode-without-as",
  "l2-if-empty-then",
] as const
