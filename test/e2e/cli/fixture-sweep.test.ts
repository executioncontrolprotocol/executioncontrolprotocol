import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import {
  assertCliBuilt,
  callTool,
  createCliHome,
  fixturesRoot,
  openMcpSession,
  parseJsonStdout,
  runEcp,
  waitForHost,
} from "../acceptance/support.js"

type ExpectedIssue = {
  code: string
  path: string
  severity: string
  messageIncludes?: string
  suggestionsIncludes?: string[]
}

function issueKey(issue: { code: string; path: string; message: string }): string {
  return `${issue.code}|${issue.path}|${issue.message}`
}

describe("invalid and valid manifest CLI + MCP sweep (F5)", () => {
  const cleanups: Array<() => Promise<void>> = []
  const invalidDir = path.join(fixturesRoot, "manifests/invalid")
  const validDir = path.join(fixturesRoot, "manifests/valid")

  afterEach(async () => {
    while (cleanups.length > 0) await cleanups.pop()?.()
  })

  it(
    "matches expected validation issues across every fixture",
    async () => {
      assertCliBuilt()
      const { env, home } = await createCliHome()
      cleanups.push(async () => {
        await runEcp(["host", "stop"], { env }).catch(() => undefined)
      })
      const start = await runEcp(["host", "start"], { env })
      expect(start.code, start.stderr).toBe(0)
      await waitForHost(home)

      const session = await openMcpSession({ env })
      cleanups.push(session.close)

      const invalidNames = readdirSync(invalidDir)
        .filter((file) => file.endsWith(".ecp.json"))
        .map((file) => file.replace(/\.ecp\.json$/, ""))
        .sort()

      for (const name of invalidNames) {
        const file = path.join(invalidDir, `${name}.ecp.json`)
        const expected = JSON.parse(readFileSync(path.join(invalidDir, `${name}.expected.json`), "utf8")) as ExpectedIssue[]
        const cli = await runEcp(["execute", file, "--validate", "--json"], { env })
        expect(cli.code, name).toBe(2)
        const envelope = parseJsonStdout<{
          ok: boolean
          error?: {
            code: string
            message: string
            path?: string
            issues?: Array<{ code: string; path: string; severity: string; message: string; suggestions?: string[] }>
          }
        }>(cli.stdout)
        expect(envelope.ok, name).toBe(false)
        const issues = envelope.error?.issues ?? []
        if (name === "plugins-missing") {
          expect(issues.some((issue) => issue.code === "ECP_PLUGINS_MISSING"), name).toBe(true)
        }
        const actualTuples = issues.map((row) => ({ code: row.code, path: row.path, severity: row.severity }))
        expect(actualTuples, name).toEqual(
          expected.map((issue) => ({ code: issue.code, path: issue.path, severity: issue.severity })),
        )
        for (const issue of expected) {
          const match = issues.find(
            (row) => row.code === issue.code && row.path === issue.path && row.severity === issue.severity,
          )
          if (issue.messageIncludes) expect(match?.message, `${name} message`).toContain(issue.messageIncludes)
          if (issue.suggestionsIncludes) {
            for (const suggestion of issue.suggestionsIncludes) {
              expect(match?.suggestions ?? [], `${name} suggestions`).toContain(suggestion)
            }
          }
        }
        const keys = issues.map((row) => issueKey(row))
        expect(new Set(keys).size, `${name} duplicate issues`).toBe(keys.length)

        const mcp = await callTool(session.client, "execute", {
          execution: { path: file },
          mode: "validate",
        })
        expect(mcp.isError, name).toBe(true)
        const mcpIssues =
          (
            mcp.structuredContent?.error as {
              issues?: Array<{ code: string; path: string; severity: string; message: string; suggestions?: string[] }>
            }
          )?.issues ?? []
        expect(
          mcpIssues.map((row) => ({ code: row.code, path: row.path, severity: row.severity })),
          `MCP ${name}`,
        ).toEqual(expected.map((issue) => ({ code: issue.code, path: issue.path, severity: issue.severity })))
        const firstIssue = mcpIssues[0]
        const error = mcp.structuredContent?.error as { code?: string; message?: string; path?: string } | undefined
        if (firstIssue && error) {
          const head = error.path
            ? `${error.path}: ${error.code} — ${error.message}`
            : `${error.code} — ${error.message}`
          const firstLine = `${firstIssue.path}: ${firstIssue.code} — ${firstIssue.message}`
          const repeatsHeader = error.code === firstIssue.code && (error.path ?? "") === firstIssue.path && error.message === firstIssue.message
          if (repeatsHeader) {
            expect(mcp.text, `${name} relay header repeat`).not.toContain(`${head}\n${firstLine}`)
          }
        }
      }

      const validNames = readdirSync(validDir)
        .filter((file) => file.endsWith(".ecp.json") && file !== "localize-banner.ecp.json")
        .map((file) => file.replace(/\.ecp\.json$/, ""))

      for (const name of validNames) {
        const file = path.join(validDir, `${name}.ecp.json`)
        const cli = await runEcp(["execute", file, "--validate", "--json"], { env })
        expect(cli.code, name).toBe(0)
        const envelope = parseJsonStdout<{ ok: boolean }>(cli.stdout)
        expect(envelope.ok, name).toBe(true)
      }

      const schemaEnv = path.join(invalidDir, "schema-env.ecp.json")
      const commit = await runEcp(
        ["commit", "--type", "execution", "--action", "create", "--id", "schema-env-sweep", "--object", `@${schemaEnv}`, "--json"],
        { env },
      )
      expect(commit.code).toBe(2)
      const commitEnvelope = parseJsonStdout<{
        ok: boolean
        error?: { issues?: Array<{ code: string; path: string; severity: string; message: string }> }
      }>(commit.stdout)
      expect(commitEnvelope.ok).toBe(false)
      const expectedEnv = JSON.parse(readFileSync(path.join(invalidDir, "schema-env.expected.json"), "utf8")) as ExpectedIssue[]
      const commitIssues = commitEnvelope.error?.issues ?? []
      expect(
        commitIssues.map((row) => ({ code: row.code, path: row.path, severity: row.severity })),
      ).toEqual(expectedEnv.map((issue) => ({ code: issue.code, path: issue.path, severity: issue.severity })))

      await runEcp(["host", "stop"], { env })
    },
    300_000,
  )
})