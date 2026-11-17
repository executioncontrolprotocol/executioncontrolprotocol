import { describe, expect, it } from "vitest"
import { exitCodeForEnvelope } from "../src/lib/exit.js"
import { plainOutput, printCommitHuman, printExecuteHuman, printRetrieveHuman, truncateCell } from "../src/lib/output.js"
import { ecpDataDir, ecpHome, ensureHomeLayout } from "../src/lib/home.js"
import os from "node:os"
import path from "node:path"
import { mkdtempSync, rmSync } from "node:fs"

describe("cli exit and output", () => {
  it("maps envelopes to catalogue exit codes", () => {
    expect(exitCodeForEnvelope({ ok: true, data: { status: "completed" } })).toBe(0)
    expect(exitCodeForEnvelope({ ok: true, data: { status: "failed" } })).toBe(1)
    expect(exitCodeForEnvelope({ ok: true, data: { status: "cancelled" } })).toBe(1)
    expect(exitCodeForEnvelope({ ok: true, data: { validation: { ok: false } } })).toBe(2)
    expect(
      exitCodeForEnvelope({
        ok: false,
        error: { code: "ECP_NOT_FOUND", message: "missing" },
      }),
    ).toBe(2)
    expect(
      exitCodeForEnvelope({
        ok: false,
        error: { code: "ECP_HOST_UNAVAILABLE", message: "down" },
      }),
    ).toBe(4)
    expect(
      exitCodeForEnvelope({
        ok: false,
        error: { code: "NOT_A_REAL_CODE", message: "x" },
      }),
    ).toBe(1)
  })

  it("detects plain output modes", () => {
    expect(plainOutput({ NO_COLOR: "1" })).toBe(true)
  })

  it("formats human retrieve/execute/commit lines", () => {
    const chunks: string[] = []
    const orig = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((chunk: string | Uint8Array) => {
      chunks.push(String(chunk))
      return true
    }) as typeof process.stdout.write
    try {
      printRetrieveHuman({
        type: "capability",
        items: [
          { id: "@executioncontrolprotocol/test.echo", plugin: "@executioncontrolprotocol/test", summary: "Echo" },
          { id: "@executioncontrolprotocol/test.delay", plugin: "@executioncontrolprotocol/test", summary: "Delay" },
        ],
        total: 2,
      })
      printRetrieveHuman({ type: "capability", items: [], total: 0 })
      printExecuteHuman({
        runId: "r1",
        status: "completed",
        steps: [{ nodeId: "echo", status: "completed" }],
        result: { value: 1 },
      })
      printExecuteHuman({ validation: { ok: true, issues: [] } })
      printExecuteHuman({
        validation: {
          ok: false,
          issues: [{ code: "ECP_X", message: "bad", path: "/steps", severity: "error" }],
        },
      })
      printCommitHuman({ type: "execution", id: "e1", version: 2 })
    } finally {
      process.stdout.write = orig
    }
    const text = chunks.join("")
    expect(text).toContain("id")
    expect(text).toContain("summary")
    expect(text).toContain("@executioncontrolprotocol/test.echo")
    expect(text).toContain("No capabilities found.")
    expect(truncateCell("x".repeat(61))).toBe(`${"x".repeat(57)}...`)
    expect(text).toContain("echo  completed")
    expect(text).toContain("valid")
    expect(text).toContain("ECP_X")
    expect(text).toContain("execution  e1  2")
  })

  it("resolves home and data dir under a temp root", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "ecp-cli-home-"))
    try {
      const env = { ECP_HOME: root } as NodeJS.ProcessEnv
      expect(ecpHome(env)).toBe(path.resolve(root))
      expect(ecpDataDir(env)).toBe(path.resolve(root, "plugins"))
      const layout = ensureHomeLayout({ ...env })
      expect(layout.home).toBe(path.resolve(root))
      expect(layout.dataDir).toBe(path.resolve(root, "plugins"))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
