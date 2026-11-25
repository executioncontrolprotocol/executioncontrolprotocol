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

describe("graph model dataflow: loop end", () => {
  it("resolves a while end's repeat against the body", async () => {
    const found = await errors([
      {
        type: "loop",
        id: "w",
        maxRounds: 3,
        steps: [step("ready", false)],
        end: { input: { repeat: { $ref: "state.ready.echo" } } },
      },
    ])
    // echo returns a string, so repeat is a type mismatch, not an unresolved ref
    expect(found).toEqual(["ECP_TYPE_MISMATCH /steps/0/end/input/repeat/$ref"])
  })

  it("refuses a while end that reads a key the body never writes", async () => {
    const found = await errors([
      { type: "loop", id: "w", maxRounds: 3, steps: [step("a", 1)], end: { input: { repeat: { $ref: "state.nope" } } } },
    ])
    expect(found).toEqual(["ECP_REF_UNRESOLVED /steps/0/end/input/repeat/$ref"])
  })

  it("makes a while into definite after the loop and a for into maybe", async () => {
    const whileLoop = await errors([
      {
        type: "loop",
        id: "w",
        maxRounds: 2,
        steps: [step("a", "x")],
        end: { input: { value: { $ref: "state.a.echo" }, repeat: false } },
        into: "last",
      },
      step("after", { $ref: "state.last" }),
    ])
    expect(whileLoop).toEqual([])
    const forLoop = await errors(
      [
        {
          type: "loop",
          id: "f",
          mode: "for",
          input: { count: { $ref: "state.n" } },
          as: "i",
          steps: [step("a", { $ref: "state.i" })],
          end: { input: { value: { $ref: "state.a.echo" } } },
          into: "last",
        },
        step("after", { $ref: "state.last" }),
      ],
      { n: { type: "integer" } },
    )
    expect(forLoop).toEqual(["ECP_REF_MAYBE_MISSING /steps/1/input/value/$ref"])
  })

  it("checks end inputs against end.accepts", async () => {
    const found = await errors([
      {
        type: "loop",
        id: "w",
        maxRounds: 2,
        steps: [step("a", "x")],
        end: {
          accepts: { type: "object", properties: { value: { type: "integer" } } },
          input: { value: { $ref: "state.a.echo" }, repeat: false },
        },
      },
    ])
    expect(found).toEqual(["ECP_TYPE_MISMATCH /steps/0/end/input/value/$ref"])
  })

  it("types forEach into from end.returns, or unknown when end gathers with an expression", async () => {
    const loop = (end: Record<string, unknown>) => ({
      type: "loop",
      id: "each",
      mode: "forEach",
      input: { items: { $ref: "state.rows" } },
      as: "row",
      steps: [step("a", { $ref: "state.row" })],
      end,
      into: "out",
    })
    const reader = { id: "read", uses: echo.id, input: { value: { $ref: "state.out" } }, as: "read" }
    const typed = await errors(
      [
        loop({
          input: { value: { $ref: "state.a.echo" } },
          expression: "({ length: input.value.length })",
          returns: { type: "object", properties: { length: { type: "integer" } } },
        }),
        reader,
      ],
      { rows: { type: "array" } },
    )
    expect(typed).toEqual([])
    const gathered = await errors(
      [loop({ input: { value: { $ref: "state.a.echo" } }, expression: "input.value.length" }), reader],
      { rows: { type: "array" } },
    )
    expect(gathered).toEqual([])
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
