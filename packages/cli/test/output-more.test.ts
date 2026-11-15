import { describe, expect, it } from "vitest"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { finishOperation, printError, printExecuteHuman, printRetrieveHuman } from "../src/lib/output.js"

describe("cli output edges", () => {
  it("prints formatter text and error suggestions", () => {
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
      printRetrieveHuman({ text: "formatted" })
      printRetrieveHuman({ nested: true })
      printExecuteHuman({ runId: "r", status: "running" })
      printExecuteHuman({
        steps: [],
        error: { code: "ECP_STEP_FAILED", message: "boom", path: "/steps/0" },
      })
      printError({
        code: "ECP_NOT_FOUND",
        message: "missing",
        path: "/id",
        suggestions: ["create it"],
        issues: [{ code: "ECP_X", message: "bad", path: "/x", severity: "error", suggestions: ["fix"] }],
      })
    } finally {
      process.stdout.write = out
      process.stderr.write = err
    }
    const text = chunks.join("")
    expect(text).toContain("formatted")
    expect(text).toContain("suggestion: create it")
    expect(text).toContain("ECP_STEP_FAILED")
  })

  it("finishOperation writes --out, json, and error paths", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "ecp-cli-out-"))
    const file = path.join(dir, "data.json")
    const originalExit = process.exit
    const codes: number[] = []
    process.exit = ((c?: number) => {
      codes.push(c ?? 0)
      throw new Error(`exit:${c}`)
    }) as typeof process.exit
    const chunks: string[] = []
    const out = process.stdout.write.bind(process.stdout)
    process.stdout.write = ((c: string | Uint8Array) => {
      chunks.push(String(c))
      return true
    }) as typeof process.stdout.write
    try {
      expect(() =>
        finishOperation(
          { ok: true, data: { status: "completed", value: 1 } },
          { out: file, human: () => undefined },
        ),
      ).toThrow(/exit:0/)
      expect(JSON.parse(readFileSync(file, "utf8")).value).toBe(1)

      expect(() =>
        finishOperation(
          { ok: true, data: { status: "completed" } },
          { json: true, human: () => undefined },
        ),
      ).toThrow(/exit:0/)
      expect(chunks.join("")).toContain('"ok":true')

      expect(() =>
        finishOperation(
          { ok: false, error: { code: "ECP_NOT_FOUND", message: "gone" } },
          { human: () => undefined },
        ),
      ).toThrow(/exit:2/)

      expect(() =>
        finishOperation(
          { ok: true, data: { status: "completed", hello: true } },
          { human: (data) => {
            chunks.push(JSON.stringify(data))
          } },
        ),
      ).toThrow(/exit:0/)
      expect(codes).toEqual([0, 0, 2, 0])
    } finally {
      process.exit = originalExit
      process.stdout.write = out
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
