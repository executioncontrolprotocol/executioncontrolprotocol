import { describe, expect, it } from "vitest"
import {
  finishOperation,
  plainOutput,
  printCommitHuman,
  printExecuteHuman,
  printError,
  printRetrieveHuman,
  printTable,
  truncateCell,
  writeEnvelope,
} from "../src/lib/output.js"

function captureStdout(run: () => void): string {
  const chunks: string[] = []
  const out = process.stdout.write.bind(process.stdout)
  process.stdout.write = ((c: string | Uint8Array) => {
    chunks.push(String(c))
    return true
  }) as typeof process.stdout.write
  try {
    run()
  } finally {
    process.stdout.write = out
  }
  return chunks.join("")
}

describe("cli output retrieve tables", () => {
  it("prints arbitrary retrieve payloads as json", () => {
    const text = captureStdout(() => printRetrieveHuman({ hello: true }))
    expect(text).toContain('"hello": true')
  })

  it("renders empty lists for every retrieve type", () => {
    const types = ["capability", "execution", "config", "run", "plugin", "formatter", "schema", "unknown"] as const
    for (const type of types) {
      const text = captureStdout(() => printRetrieveHuman({ type, items: [] }))
      expect(text.length).toBeGreaterThan(0)
    }
  })

  it("prints a single retrieve item as json", () => {
    const text = captureStdout(() => printRetrieveHuman({ item: { id: "only", summary: "one" } }))
    expect(text).toContain('"id": "only"')
  })

  it("renders item rows for capability, execution, config, run, and formatter", () => {
    const cap = captureStdout(() =>
      printRetrieveHuman({
        type: "capability",
        items: [{ id: "a", plugin: "p", summary: "x".repeat(80) }],
      }),
    )
    expect(cap).toContain("summary")
    expect(cap).toContain("...")
    const exec = captureStdout(() =>
      printRetrieveHuman({ type: "execution", items: [{ id: "e", version: "2.0", updatedAt: "now" }] }),
    )
    expect(exec).toContain("e")
    const cfg = captureStdout(() => printRetrieveHuman({ type: "config", items: [{ id: "c", plugin: "p" }] }))
    expect(cfg).toContain("c")
    const run = captureStdout(() =>
      printRetrieveHuman({ type: "run", items: [{ id: "r", status: "completed", startedAt: "t" }] }),
    )
    expect(run).toContain("completed")
    const fmt = captureStdout(() =>
      printRetrieveHuman({
        type: "formatter",
        items: [
          { id: "j", mediaType: "application/json", default: true },
          { id: "t", mediaType: "text/plain", default: false },
          { id: "u", mediaType: "text/plain", default: "maybe" },
        ],
      }),
    )
    expect(fmt).toContain("yes")
    expect(fmt).toContain("no")
  })

  it("prints schema documents and schema paths", () => {
    const doc = captureStdout(() =>
      printRetrieveHuman({ type: "schema", item: { document: { $id: "x" } } }),
    )
    expect(doc).toContain("$id")
    const pathOnly = captureStdout(() => printRetrieveHuman({ type: "schema", item: { path: "/tmp/schema.json" } }))
    expect(pathOnly).toContain("schema.json")
  })

  it("prints plugin tables and manifest issue summaries", () => {
    const ok = captureStdout(() =>
      printRetrieveHuman({
        type: "plugin",
        items: [{ package: "@x/a", version: "1", source: "local", manifestOk: true }],
      }),
    )
    expect(ok).toContain("ok")
    const bad = captureStdout(() =>
      printRetrieveHuman({
        type: "plugin",
        items: [
          {
            package: "@x/b",
            version: "1",
            source: "local",
            manifestOk: false,
            issues: [{ code: "ECP_MANIFEST_INVALID", message: "bad", path: "/p", severity: "error" }],
          },
          { package: "@x/c", version: "1", source: "local", manifestOk: false },
        ],
      }),
    )
    expect(bad).toContain("ECP_MANIFEST_INVALID")
    expect(bad).toContain("invalid")
  })
})

describe("cli output helpers", () => {
  it("truncates cells and skips empty tables", () => {
    expect(truncateCell("short")).toBe("short")
    expect(truncateCell("x".repeat(60), 60)).toBe("x".repeat(60))
    expect(truncateCell("x".repeat(61), 60)).toMatch(/\.\.\.$/)
    expect(truncateCell("x".repeat(80))).toMatch(/\.\.\.$/)
    expect(() => printTable([{ key: "a", header: "a" }], [])).not.toThrow()
  })

  it("covers plainOutput and commit/execute formatters", () => {
    expect(plainOutput({ NO_COLOR: "1" })).toBe(true)
    const wasTty = process.stdout.isTTY
    Object.defineProperty(process.stdout, "isTTY", { value: false, configurable: true })
    expect(plainOutput({})).toBe(true)
    Object.defineProperty(process.stdout, "isTTY", { value: true, configurable: true })
    expect(plainOutput({})).toBe(false)
    Object.defineProperty(process.stdout, "isTTY", { value: wasTty, configurable: true })
    const valOk = captureStdout(() =>
      printExecuteHuman({ validation: { valid: true, issues: [{ path: "/w", code: "W", message: "warn", severity: "warning" }] } }),
    )
    expect(valOk).toContain("valid")
    expect(valOk).toContain("warn")
    const valBad = captureStdout(() =>
      printExecuteHuman({
        validation: {
          valid: false,
          issues: [{ path: "/e", code: "E", message: "bad", severity: "error" }],
        },
      }),
    )
    expect(valBad).toContain("validation error")
    const run = captureStdout(() =>
      printExecuteHuman({ runId: "r", status: "completed", result: { ok: true }, steps: [{ nodeId: "a", status: "completed" }] }),
    )
    expect(run).toContain('"ok": true')
    const stepsOnly = captureStdout(() => printExecuteHuman({ steps: [{ nodeId: "only", status: "running" }] }))
    expect(stepsOnly).toContain("only")
    const runIdOnly = captureStdout(() => printExecuteHuman({ runId: "r2", status: "running" }))
    expect(runIdOnly).toContain("r2")
    const commit = captureStdout(() => printCommitHuman({ type: "execution", id: "demo", version: 2 }))
    expect(commit).toContain("demo")
    const deleted = captureStdout(() => printCommitHuman({ type: "execution", version: null }))
    expect(deleted).toContain("deleted")
  })

  it("prints warnings-only issues on errors", () => {
    const err: string[] = []
    const stderr = process.stderr.write.bind(process.stderr)
    process.stderr.write = ((c: string | Uint8Array) => {
      err.push(String(c))
      return true
    }) as typeof process.stderr.write
    try {
      printError({
        code: "ECP_MANIFEST_INVALID",
        message: "warn only",
        issues: [{ path: "/w", code: "W", message: "warn", severity: "warning", suggestions: ["fix"] }],
      })
      printError({
        code: "ECP_MANIFEST_INVALID",
        message: "two errors",
        issues: [
          { path: "/a", code: "A", message: "a", severity: "error" },
          { path: "/b", code: "B", message: "b", severity: "error" },
        ],
      })
    } finally {
      process.stderr.write = stderr
    }
    expect(err.join("")).toContain("warn only")
    expect(err.join("")).toContain("suggestion: fix")
    expect(err.join("")).toContain("validation errors")
  })

  it("writeEnvelope and finishOperation cover json and error exits", () => {
    const originalExit = process.exit
    process.exit = (() => {
      throw new Error("exit")
    }) as typeof process.exit
  const chunks: string[] = []
  const out = process.stdout.write.bind(process.stdout)
  const err = process.stderr.write.bind(process.stderr)
  process.stdout.write = ((c: string | Uint8Array) => {
    chunks.push(String(c))
    return true
  }) as typeof process.stdout.write
  process.stderr.write = ((c: string | Uint8Array) => {
    chunks.push(String(c))
    return true
  }) as typeof process.stderr.write
    try {
      expect(() =>
        writeEnvelope({ ok: true, data: { ok: true } }, { json: true, human: () => undefined }),
      ).toThrow("exit")
      expect(chunks.join("")).toContain('"ok":true')
      expect(() =>
        writeEnvelope(
          { ok: true, data: { ok: true } },
          { human: () => {
            chunks.push("human")
          } },
        ),
      ).toThrow("exit")
      expect(chunks.join("")).toContain("human")
      expect(() =>
        writeEnvelope(
          { ok: false, error: { code: "ECP_NOT_FOUND", message: "x" } },
          { exitCode: 7, human: () => undefined },
        ),
      ).toThrow("exit")
      expect(() =>
        writeEnvelope({ ok: false, error: { code: "ECP_NOT_FOUND", message: "x" } }, { human: () => undefined }),
      ).toThrow("exit")
      expect(() =>
        finishOperation({ ok: true, data: { x: 1 } }, { human: () => undefined }),
      ).toThrow("exit")
      expect(() =>
        finishOperation(
          { ok: false, error: { code: "ECP_STEP_FAILED", message: "no file" } },
          { out: "/tmp/should-not-write.json", human: () => undefined },
        ),
      ).toThrow("exit")
    } finally {
      process.exit = originalExit
      process.stdout.write = out
      process.stderr.write = err
    }
  })
})