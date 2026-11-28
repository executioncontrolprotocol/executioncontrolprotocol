import { describe, expect, it } from "vitest"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { validateExecution } from "../src/index.js"
import { forLoop, foreachLoop } from "./manifest-helpers.js"

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

async function issues(steps: ExecutionManifest["steps"]) {
  const manifest: ExecutionManifest = {
    schema: "@executioncontrolprotocol.execution",
    version: "2.0",
    execution: {
      accepts: {
        type: "object",
        properties: {
          rows: { type: "array", items: { type: "object" } },
          n: { type: "integer" },
        },
        required: ["rows", "n"],
      },
    },
    steps,
  }
  return (await validateExecution(manifest, { capabilities: [echo] })).issues
}

describe("loop mode validation", () => {
  it("requires mode, driver, and as", async () => {
    const found = await issues([{ type: "loop", id: "l", steps: [] } as ExecutionManifest["steps"][0]])
    expect(found.filter((issue) => issue.severity === "error").length).toBeGreaterThan(0)
  })

  it("rejects legacy while, end, into, and maxRounds", async () => {
    const found = await issues([
      {
        type: "loop",
        id: "l",
        mode: "while",
        maxRounds: 2,
        steps: [],
        end: { input: { repeat: false } },
      } as ExecutionManifest["steps"][0],
    ])
    expect(found.some((issue) => issue.path?.includes("mode") || issue.path?.includes("maxRounds"))).toBe(true)
    const intoIssue = await issues([
      {
        type: "loop",
        id: "l",
        mode: "forEach",
        as: "r",
        input: { items: { $ref: "state.rows" } },
        into: "collected",
        steps: [],
      } as ExecutionManifest["steps"][0],
    ])
    expect(intoIssue.some((issue) => issue.path?.includes("into"))).toBe(true)
  })

  it("accepts legal for and forEach shells", async () => {
    expect(
      (await issues([forLoop(), { id: "read", uses: echo.id, input: { value: { $ref: "state.out" } }, as: "done" }])).filter(
        (issue) => issue.severity === "error",
      ),
    ).toEqual([])
    expect(
      (
        await issues([
          foreachLoop(),
          { id: "read", uses: echo.id, input: { value: { $ref: "state.out" } }, as: "done" },
        ])
      ).filter((issue) => issue.severity === "error"),
    ).toEqual([])
  })

  it("rejects driver refs whose types do not fit", async () => {
    expect(
      (await issues([forLoop({ input: { count: { $ref: "state.rows" } } })])).map((issue) => issue.code),
    ).toContain("ECP_TYPE_MISMATCH")
    expect(
      (await issues([foreachLoop({ input: { items: { $ref: "state.n" } } })])).map((issue) => issue.code),
    ).toContain("ECP_TYPE_MISMATCH")
  })

  it("allows create inside a for body", async () => {
    const found = await issues([
      forLoop({
        steps: [{ id: "body", uses: echo.id, input: { value: "x" }, as: "fresh", mode: "create" }],
      }),
    ])
    expect(found.map((issue) => issue.code)).not.toContain("ECP_COMMIT_CONFLICT")
  })
})