import { describe, expect, it } from "vitest"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { validateExecution } from "../src/index.js"

const echo = {
  id: "@executioncontrolprotocol/test.echo",
  plugin: "@executioncontrolprotocol/test",
  package: "@executioncontrolprotocol/test",
  pluginVersion: "0.0.0",
  summary: "",
  description: "",
  useCases: [],
  projections: [],
  accepts: { type: "object", properties: { value: {} } },
  returns: { type: "object", properties: { echo: {} } },
}

const body = [{ id: "body", uses: echo.id, input: { value: "x" }, as: "out", mode: "replace" }]

function manifest(loop: Record<string, unknown>): ExecutionManifest {
  return {
    schema: "@executioncontrolprotocol.execution",
    version: "2.0",
    execution: {
      accepts: {
        type: "object",
        properties: { rows: { type: "array", items: { type: "object" } }, n: { type: "integer" }, go: { type: "boolean" } },
        required: ["rows", "n", "go"],
      },
    },
    steps: [{ type: "loop", id: "l", steps: body, ...loop } as ExecutionManifest["steps"][0]],
  } as ExecutionManifest
}

async function issues(loop: Record<string, unknown>) {
  return (await validateExecution(manifest(loop), { capabilities: [echo] })).issues
}

describe("loop mode validation", () => {
  it("reports one readable error when both ref and expr are set", async () => {
    const found = await issues({ mode: "forEach", ref: "state.rows", expr: "(s) => s.rows", as: "r", collect: "state.out", into: "x" })
    expect(found).toEqual([
      expect.objectContaining({ code: "ECP_MANIFEST_INVALID", path: "/steps/0", message: "Loop in forEach mode requires exactly one of ref and expr." }),
    ])
  })

  it("reports one readable error when neither ref nor expr is set", async () => {
    const found = await issues({ maxRounds: 2 })
    expect(found).toEqual([
      expect.objectContaining({ path: "/steps/0/ref", message: "Loop in while mode requires exactly one of ref and expr." }),
    ])
  })

  it("names the mode for fields it doesn't allow, one error each", async () => {
    expect(await issues({ expr: "(s) => false", maxRounds: 2, collect: "state.out" })).toEqual([
      expect.objectContaining({ path: "/steps/0/collect", message: "collect is not allowed in while loop mode." }),
    ])
    expect(await issues({ mode: "for", ref: "state.n", as: "i", maxRounds: 3 })).toEqual([
      expect.objectContaining({ path: "/steps/0/maxRounds", message: "maxRounds is not allowed in for loop mode." }),
    ])
    expect(
      await issues({ mode: "forEach", ref: "state.rows", as: "r", collect: "state.out", into: "x", maxRounds: 2 }),
    ).toEqual([expect.objectContaining({ path: "/steps/0/maxRounds", message: "maxRounds is not allowed in forEach loop mode." })])
  })

  it("rejects throttle and names the missing per-mode fields", async () => {
    expect(
      await issues({ mode: "forEach", ref: "state.rows", as: "r", collect: "state.out", into: "x", throttle: { starts: 1, perSeconds: 1 } }),
    ).toEqual([expect.objectContaining({ path: "/steps/0/throttle", message: "Loop in forEach mode does not support throttle." })])
    expect(await issues({ mode: "for", ref: "state.n" })).toEqual([
      expect.objectContaining({ path: "/steps/0/as", message: "for loop requires as." }),
    ])
    const missing = await issues({ mode: "forEach", ref: "state.rows" })
    expect(missing.map((issue) => issue.message).sort()).toEqual([
      "forEach loop requires as.",
      "forEach loop requires collect.",
      "forEach loop requires into.",
    ])
  })

  it("keeps real errors inside the loop body", async () => {
    const found = await issues({ maxRounds: 2, steps: [{ id: "body", uses: echo.id, input: { value: "x" }, as: "out" }] })
    expect(found.map((issue) => issue.code)).toEqual(expect.arrayContaining(["ECP_MANIFEST_INVALID", "ECP_COMMIT_CONFLICT"]))
  })

  it("accepts each mode driven by ref, and warns only for an expr-driven forEach", async () => {
    expect(await issues({ ref: "state.go", maxRounds: 2 })).toEqual([])
    expect(await issues({ mode: "for", ref: "state.n", as: "i" })).toEqual([])
    expect(await issues({ mode: "forEach", ref: "state.rows", as: "r", collect: "state.out", into: "x" })).toEqual([])
    expect(await issues({ mode: "forEach", expr: "(s) => s.rows", as: "r", collect: "state.out", into: "x" })).toEqual([
      expect.objectContaining({ code: "ECP_LOOP_UNTYPED", severity: "warning", path: "/steps/0/expr" }),
    ])
  })

  it("rejects a ref whose type doesn't fit the mode", async () => {
    expect((await issues({ ref: "state.n", maxRounds: 2 })).map((issue) => issue.code)).toContain("ECP_TYPE_MISMATCH")
    expect((await issues({ mode: "for", ref: "state.go", as: "i" })).map((issue) => issue.code)).toContain("ECP_TYPE_MISMATCH")
    expect(
      (await issues({ mode: "forEach", ref: "state.n", as: "r", collect: "state.out", into: "x" })).map((issue) => issue.code),
    ).toContain("ECP_TYPE_MISMATCH")
  })
})
