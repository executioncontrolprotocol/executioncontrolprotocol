import { describe, expect, it } from "vitest"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { defaultRunClock } from "../src/execute/run-loop-items.js"
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

/** A forEach over `items` whose body reads `state.row.name` and collects it. */
function manifest(accepts: Record<string, unknown>, items: string): ExecutionManifest {
  return {
    schema: "@executioncontrolprotocol.execution",
    version: "2.0",
    execution: {
      accepts: { type: "object", properties: accepts, required: Object.keys(accepts) },
      returns: { type: "object", properties: { names: { type: "array" } } },
    },
    steps: [
      {
        type: "loop",
        mode: "forEach",
        id: "each",
        ref: items,
        as: "row",
        steps: [{ id: "body", uses: echo.id, input: { value: { $ref: "state.row.name" } }, as: "out" }],
        collect: "state.out.echo",
        into: "names",
      } as ExecutionManifest["steps"][0],
    ],
  } as unknown as ExecutionManifest
}

const errors = async (m: ExecutionManifest) =>
  (await validateExecution(m, { capabilities: [echo] })).issues.filter((issue) => issue.severity === "error")

describe("forEach L3 element typing", () => {
  it("types the item from an array's items schema at a nested path", async () => {
    const accepts = {
      table: {
        type: "object",
        properties: { rows: { type: "array", items: { type: "object", properties: { name: { type: "string" } } } } },
        required: ["rows"],
      },
    }
    expect(await errors(manifest(accepts, "state.table.rows"))).toEqual([])
  })

  it("types the item as anyOf a tuple's members", async () => {
    const accepts = {
      pair: {
        type: "array",
        items: [
          { type: "object", properties: { name: { type: "string" } } },
          { type: "object", properties: { name: { type: "string" } } },
        ],
      },
    }
    expect(await errors(manifest(accepts, "state.pair"))).toEqual([])
  })

  it("accepts items with no element schema and leaves the check to run time", async () => {
    expect(await errors(manifest({ list: { type: "array" } }, "state.list"))).toEqual([])
    expect(await errors(manifest({ anything: {} }, "state.anything"))).toEqual([])
  })

  it("rejects items that are typed as something other than an array", async () => {
    const issues = await errors(manifest({ text: { type: "string" } }, "state.text"))
    expect(issues.map((issue) => issue.code)).toContain("ECP_TYPE_MISMATCH")
  })
})

describe("defaultRunClock", () => {
  it("rejects a sleep that is aborted while waiting", async () => {
    const controller = new AbortController()
    const pending = defaultRunClock().sleep(60_000, controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: "ECP_RUN_CANCELLED" })
  })

  it("resolves a short sleep and reads the wall clock", async () => {
    const clock = defaultRunClock()
    const before = clock.now()
    await clock.sleep(1, new AbortController().signal)
    expect(clock.now()).toBeGreaterThanOrEqual(before)
  })
})
