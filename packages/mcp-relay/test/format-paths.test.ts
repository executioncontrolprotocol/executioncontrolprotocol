import { describe, expect, it } from "vitest"
import os from "node:os"
import path from "node:path"
import { formatData, formatEnvelope, formatError } from "../src/format.js"
import { isConnectionError } from "../src/forward.js"
import { resolveAgainst, resolveExecutePaths, resolveRetrievePaths } from "../src/paths.js"
import { asToolInputSchema, executeInputSchema, retrieveInputSchema } from "../src/schemas.js"

describe("format and paths", () => {
  it("formats success and error envelopes", () => {
    const ok = formatEnvelope({ ok: true, data: { hello: 1 } })
    expect(ok.isError).toBeUndefined()
    expect(ok.structuredContent).toEqual({ hello: 1 })
    expect(ok.content[0]?.text).toContain('"hello": 1')

    const bad = formatEnvelope({
      ok: false,
      error: {
        code: "ECP_NOT_FOUND",
        message: "missing",
        path: "/id",
        suggestions: ["create it"],
        issues: [{ code: "ECP_X", message: "bad", path: "/x", severity: "error", suggestions: ["fix"] }],
      },
    })
    expect(bad.isError).toBe(true)
    expect(bad.content[0]?.text).toContain("ECP_NOT_FOUND")
    expect(bad.content[0]?.text).toContain("/x: ECP_X")
  })

  it("adds a resume hint for interrupted runs", () => {
    const text = formatData({ runId: "r1", status: "interrupted" })
    expect(text).toContain('resume": "r1"')
  })

  it("formats issue lines", () => {
    const text = formatError({
      code: "ECP_MANIFEST_INVALID",
      message: "The execution is invalid.",
      issues: [{ code: "ECP_Y", message: "y", path: "/steps", severity: "error" }],
    })
    expect(text).toContain("ECP_MANIFEST_INVALID — 1 validation error")
    expect(text.split("\n")[0]).toBe("ECP_MANIFEST_INVALID — 1 validation error")
    expect(text).toContain("/steps: ECP_Y — y")
    expect(text).not.toContain("The execution is invalid.")
  })

  it("keeps a plain header when there are no issues", () => {
    expect(formatError({ code: "ECP_NOT_FOUND", message: "missing" })).toContain("ECP_NOT_FOUND — missing")
  })

  it("resolves relative paths against cwd", () => {
    const cwd = path.join(os.tmpdir(), "relay-cwd")
    expect(resolveAgainst(cwd, "a.ecp.json")).toBe(path.join(cwd, "a.ecp.json"))
    expect(resolveAgainst(cwd, path.join(cwd, "abs.json"))).toBe(path.join(cwd, "abs.json"))
    expect(resolveExecutePaths({ execution: { path: "flows/x.ecp.json" }, output: { path: "out.json" } }, cwd)).toEqual({
      execution: { path: path.join(cwd, "flows", "x.ecp.json") },
      output: { path: path.join(cwd, "out.json") },
    })
    expect(resolveExecutePaths({ resume: "r1" }, cwd)).toEqual({ resume: "r1" })
    expect(resolveRetrievePaths({ type: "capability" }, cwd).output).toBeUndefined()
    expect(resolveRetrievePaths({ type: "capability", output: { path: "cap.json" } }, cwd).output?.path).toBe(
      path.join(cwd, "cap.json"),
    )
  })

  it("detects connection errors", () => {
    expect(isConnectionError(Object.assign(new Error("fetch failed"), { code: "ECONNREFUSED" }))).toBe(true)
    expect(isConnectionError(new Error("nope"))).toBe(false)
  })

  it("exposes protocol schemas without $id", () => {
    expect(retrieveInputSchema.type).toBe("object")
    expect(executeInputSchema).not.toHaveProperty("$id")
    expect(asToolInputSchema({ $schema: "x", $id: "y", type: "object" })).toEqual({ type: "object" })
  })
})
