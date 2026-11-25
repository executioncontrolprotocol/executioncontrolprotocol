import { describe, expect, it } from "vitest"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { validateExecution } from "../src/index.js"
import { WHILE_END_STOP, loopEndValue } from "./manifest-helpers.js"

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
        properties: {
          rows: { type: "array", items: { type: "object" } },
          n: { type: "integer" },
          go: { type: "boolean" },
        },
        required: ["rows", "n", "go"],
      },
    },
    steps: [{ type: "loop", id: "l", steps: body, end: WHILE_END_STOP, ...loop } as ExecutionManifest["steps"][0]],
  } as ExecutionManifest
}

async function issues(loop: Record<string, unknown>) {
  return (await validateExecution(manifest(loop), { capabilities: [echo] })).issues
}

describe("loop mode validation", () => {
  it("requires end and mode-specific input", async () => {
    const found = await issues({ mode: "forEach", as: "r", into: "collected", steps: [] })
    expect(found.filter((issue) => issue.severity === "error").length).toBeGreaterThan(0)
  })

  it("names fields that are not allowed per mode", async () => {
    expect(await issues({ maxRounds: 2, as: "x", end: { input: { repeat: false, value: 1 } } })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/steps/0/as", message: "as is not allowed in while loop mode." }),
      ]),
    )
    expect(await issues({ maxRounds: 2, into: "x", end: { input: { repeat: false, value: 1 } } })).toEqual([])
    expect(
      await issues({
        mode: "for",
        input: { count: { $ref: "state.n" } },
        as: "i",
        maxRounds: 3,
        end: loopEndValue("state.x"),
      }),
    ).toEqual([expect.objectContaining({ path: "/steps/0/maxRounds" })])
    expect(
      await issues({
        mode: "forEach",
        input: { items: { $ref: "state.rows" } },
        as: "r",
        into: "x",
        end: loopEndValue("state.out"),
        maxRounds: 2,
      }),
    ).toEqual([expect.objectContaining({ path: "/steps/0/maxRounds" })])
  })

  it("rejects repeat on forEach end", async () => {
    const found = await issues({
      mode: "forEach",
      input: { items: { $ref: "state.rows" } },
      as: "r",
      into: "x",
      end: { input: { repeat: false, value: { $ref: "state.out" } } },
    })
    expect(found.some((issue) => issue.path === "/steps/0/end/input/repeat")).toBe(true)
  })

  it("requires input.repeat on while end", async () => {
    const found = await issues({ maxRounds: 2, end: { input: {} } })
    expect(found.some((issue) => issue.path === "/steps/0/end/input/repeat")).toBe(true)
  })

  it("keeps create inside while body as ECP_COMMIT_CONFLICT", async () => {
    const found = await issues({ maxRounds: 2, steps: [{ id: "body", uses: echo.id, input: { value: "x" }, as: "out" }] })
    expect(found.map((issue) => issue.code)).toEqual(expect.arrayContaining(["ECP_COMMIT_CONFLICT"]))
  })

  it("accepts legal mode shells", async () => {
    expect(
      await issues({
        maxRounds: 2,
        end: { input: { repeat: { $ref: "state.go" } } },
      }),
    ).toEqual([])
    expect(
      await issues({
        mode: "for",
        input: { count: { $ref: "state.n" } },
        as: "i",
        end: loopEndValue("state.out"),
      }),
    ).toEqual([])
    expect(
      await issues({
        mode: "forEach",
        input: { items: { $ref: "state.rows" } },
        as: "r",
        into: "x",
        end: loopEndValue("state.out"),
      }),
    ).toEqual([])
  })

  it("rejects driver refs whose types do not fit", async () => {
    expect((await issues({ maxRounds: 2, end: { input: { repeat: { $ref: "state.n" } } } })).map((i) => i.code)).toContain(
      "ECP_TYPE_MISMATCH",
    )
    expect(
      (await issues({ mode: "for", input: { count: { $ref: "state.go" } }, as: "i", end: loopEndValue("state.out") })).map(
        (i) => i.code,
      ),
    ).toContain("ECP_TYPE_MISMATCH")
    expect(
      (
        await issues({
          mode: "forEach",
          input: { items: { $ref: "state.n" } },
          as: "r",
          into: "x",
          end: loopEndValue("state.out"),
        })
      ).map((i) => i.code),
    ).toContain("ECP_TYPE_MISMATCH")
  })
})
