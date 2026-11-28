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
  returns: { type: "object", properties: { echo: { type: "string" } }, required: ["echo"] },
}

const step = (id: string, value: unknown, as = id) => ({ id, uses: echo.id, input: { value }, as, mode: "replace" })

async function errors(steps: unknown[], accepts?: Record<string, unknown>) {
  const manifest = {
    schema: "@executioncontrolprotocol.execution",
    version: "2.0",
    ...(accepts ? { execution: { accepts: { type: "object", properties: accepts, required: Object.keys(accepts) } } } : {}),
    steps,
  } as unknown as ExecutionManifest
  const report = await validateExecution(manifest, { capabilities: [echo] })
  return report.issues.filter((issue) => issue.severity === "error").map((issue) => `${issue.code} ${issue.path}`)
}

describe("graph model dataflow: loop body arrays", () => {
  it("types forEach body exports as definite arrays after the loop", async () => {
    const found = await errors(
      [
        {
          type: "loop",
          mode: "forEach",
          id: "each",
          input: { items: { $ref: "state.rows" } },
          as: "row",
          steps: [step("a", { $ref: "state.row" }, "out")],
        },
        step("after", { $ref: "state.out" }),
      ],
      { rows: { type: "array" } },
    )
    expect(found).toEqual([])
  })

  it("publishes empty arrays when for count is zero", async () => {
    const found = await errors([
      {
        type: "loop",
        mode: "for",
        id: "f",
        input: { count: 0 },
        as: "i",
        steps: [step("body", "x")],
      },
      step("after", { $ref: "state.body" }),
    ])
    expect(found).toEqual([])
  })

  it("refuses refs to loop as after the loop", async () => {
    const found = await errors(
      [
        {
          type: "loop",
          mode: "forEach",
          id: "each",
          input: { items: { $ref: "state.rows" } },
          as: "row",
          steps: [step("a", { $ref: "state.row" })],
        },
        step("after", { $ref: "state.row" }),
      ],
      { rows: { type: "array" } },
    )
    expect(found).toEqual(["ECP_REF_UNRESOLVED /steps/1/input/value/$ref"])
  })

  it("marks gated body exports as maybe for in-loop refs", async () => {
    const found = await errors(
      [
        {
          type: "loop",
          mode: "forEach",
          id: "each",
          input: { items: { $ref: "state.rows" } },
          as: "row",
          steps: [
            {
              type: "if",
              id: "pick",
              expression: "false",
              then: [step("t", "t", "out")],
            },
            step("use", { $ref: "state.out.echo" }),
          ],
        },
      ],
      { rows: { type: "array" } },
    )
    expect(found).toEqual(["ECP_REF_MAYBE_MISSING /steps/0/steps/1/input/value/$ref"])
  })

  it("rejects legacy end and into on loops at validation", async () => {
    const report = await validateExecution(
      {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        steps: [
          {
            type: "loop",
            mode: "forEach",
            id: "rows",
            input: { items: { $ref: "state.rows" } },
            as: "row",
            into: "collected",
            steps: [],
            end: { input: { value: { $ref: "state.row" } } },
          },
        ],
      } as ExecutionManifest,
      { capabilities: [echo] },
    )
    const paths = report.issues.filter((issue) => issue.severity === "error").map((issue) => issue.path)
    expect(paths).toContain("/steps/0/end")
    expect(paths).toContain("/steps/0/into")
  })
})

describe("graph model dataflow: scoped as", () => {
  it("does not leave a parallel's as visible after the parallel", async () => {
    const found = await errors(
      [
        {
          type: "parallel",
          id: "p",
          accepts: { type: "object", properties: { q: { type: "string" } } },
          input: { q: { $ref: "state.q" } },
          as: "query",
          paths: [[step("a", { $ref: "state.query.q" })], [step("b", { $ref: "state.query.q" })]],
        },
        step("after", { $ref: "state.query" }),
      ],
      { q: { type: "string" } },
    )
    expect(found).toEqual(["ECP_REF_UNRESOLVED /steps/1/input/value/$ref"])
  })

  it("does not leave an if's as visible after the if when both sides run nodes", async () => {
    const found = await errors(
      [
        {
          type: "if",
          id: "pick",
          accepts: { type: "object", properties: { q: { type: "string" } } },
          input: { q: { $ref: "state.q" } },
          expression: "input.q === 'x'",
          as: "ctx",
          then: [step("a", { $ref: "state.ctx.q" })],
          else: [step("b", { $ref: "state.ctx.q" })],
        },
        step("after", { $ref: "state.ctx" }),
      ],
      { q: { type: "string" } },
    )
    expect(found).toEqual(["ECP_REF_UNRESOLVED /steps/1/input/value/$ref"])
  })
})