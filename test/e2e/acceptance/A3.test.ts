import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  A3_INVALID_NAMES,
  assertCliBuilt,
  callTool,
  createCliHome,
  fixturesRoot,
  openMcpSession,
  parseJsonStdout,
  runEcp,
} from "./support.js"

/**
 * Apply a known fix for each A3 fixture so validate succeeds.
 * Uses suggestions when present (unknown-capability).
 */
function applyFix(
  name: string,
  manifest: Record<string, unknown>,
  suggestions: string[] | undefined,
): Record<string, unknown> {
  const copy = structuredClone(manifest) as Record<string, unknown>
  const steps = copy.steps as Array<Record<string, unknown>>

  switch (name) {
    case "schema-empty-steps":
      copy.steps = [
        {
          id: "echo",
          uses: "@executioncontrolprotocol/test.echo",
          input: { value: "fixed" },
          as: "out",
        },
      ]
      break
    case "unknown-capability": {
      const suggestion = suggestions?.find((row) => row.includes("@executioncontrolprotocol/"))
      const match = suggestion?.match(/'([^']+)'/)
      const uses = match?.[1] ?? "@executioncontrolprotocol/test.echo"
      ;(steps[0] as { uses: string }).uses = uses
      break
    }
    case "duplicate-id":
      ;(steps[1] as { id: string; as: string }).id = "echo2"
      ;(steps[1] as { id: string; as: string }).as = "echo2"
      break
    case "expr-syntax":
      ;(steps[0] as { expr: string }).expr = "(state) => true"
      break
    case "ref-unresolved":
      ;(steps[0] as { input: { value: unknown } }).input = { value: "literal" }
      break
    case "plugins-missing":
      ;(steps[0] as { uses: string }).uses = "@executioncontrolprotocol/test.echo"
      ;(steps[0] as { input: { value: string } }).input = { value: "hi" }
      break
    case "mode-without-as":
      ;(steps[0] as { as: string }).as = "out"
      break
    case "default-arm-not-last": {
      const branch = steps[0] as {
        branches: Array<Record<string, unknown>>
      }
      const defaultArm = branch.branches.find((arm) => arm.expr === undefined)
      const others = branch.branches.filter((arm) => arm !== defaultArm)
      if (defaultArm) branch.branches = [...others, defaultArm]
      break
    }
    default:
      break
  }
  return copy
}

describe("A3 validate fix loop CLI + MCP", () => {
  const cleanups: Array<() => Promise<void>> = []

  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()?.()
  })

  it("eight invalid fixtures return expected codes/paths; fixes validate; MCP parity", async () => {
    assertCliBuilt()
    const { home, env } = await createCliHome()
    const session = await openMcpSession({ env })
    cleanups.push(session.close)

    for (const name of A3_INVALID_NAMES) {
      const file = path.join(fixturesRoot, "manifests/invalid", `${name}.ecp.json`)
      const expected = JSON.parse(
        readFileSync(path.join(fixturesRoot, "manifests/invalid", `${name}.expected.json`), "utf8"),
      ) as Array<{ code: string; path: string }>

      const cli = await runEcp(["execute", file, "--validate", "--json"], { env })
      expect(cli.code, name).toBe(2)
      const envelope = parseJsonStdout<{
        ok: false
        error: { issues?: Array<{ code: string; path: string; suggestions?: string[] }> }
      }>(cli.stdout)
      expect(envelope.ok).toBe(false)
      const actual = envelope.error.issues ?? []
      for (const issue of expected) {
        expect(
          actual.some((row) => row.code === issue.code && row.path === issue.path),
          `${name} missing ${issue.code} ${issue.path}`,
        ).toBe(true)
      }

      const mcp = await callTool(session.client, "execute", {
        execution: { path: file },
        mode: "validate",
      })
      expect(mcp.isError, name).toBe(true)
      const mcpIssues =
        (mcp.structuredContent?.error as { issues?: Array<{ code: string; path: string }> })?.issues ??
        []
      for (const issue of expected) {
        expect(
          mcpIssues.some((row) => row.code === issue.code && row.path === issue.path),
          `MCP ${name} missing ${issue.code} ${issue.path}`,
        ).toBe(true)
      }

      const suggestions = actual.flatMap((issue) => issue.suggestions ?? [])
      const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>
      const fixed = applyFix(name, raw, suggestions)
      const fixedPath = path.join(home, `${name}.fixed.ecp.json`)
      writeFileSync(fixedPath, `${JSON.stringify(fixed, null, 2)}\n`)
      const after = await runEcp(["execute", fixedPath, "--validate", "--json"], { env })
      expect(after.code, `${name} after fix: ${after.stdout}`).toBe(0)
      expect(parseJsonStdout<{ ok: boolean }>(after.stdout).ok).toBe(true)
    }
  }, 240_000)
})
