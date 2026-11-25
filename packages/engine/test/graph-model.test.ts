import { afterEach, beforeAll, describe, expect, it } from "vitest"
import type { CapabilityCall, ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { QuickJsExpressionEngine } from "../../quickjs/src/index.js"
import { runExecution, validateExecution, type StateStore } from "../src/index.js"
import { MemoryStorage } from "../src/testing/index.js"
import { foreachLoop, forLoop, manifestWithSteps } from "./manifest-helpers.js"

const engine = new QuickJsExpressionEngine()

beforeAll(async () => {
  await engine.start()
})

afterEach(() => {})

const echoCapability = {
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

async function echoCall(request: CapabilityCall, _signal: AbortSignal, _store: StateStore): Promise<unknown> {
  return { echo: (request.input as { value?: unknown })?.value }
}

const failCapability = {
  ...echoCapability,
  id: "@executioncontrolprotocol/test.fail",
}

async function failCall(request: CapabilityCall, _signal: AbortSignal, _store: StateStore): Promise<unknown> {
  throw Object.assign(new Error(String((request.input as { message?: string })?.message ?? "failed")), {
    code: "ECP_STEP_FAILED",
  })
}

const runDeps = { capabilities: [echoCapability, failCapability], expression: engine, call: echoCall }
const runDepsWithFail = {
  ...runDeps,
  call: async (request: CapabilityCall, signal: AbortSignal, store: StateStore) => {
    if (request.capabilityId === failCapability.id) return failCall(request, signal, store)
    return echoCall(request, signal, store)
  },
}

describe("graph model phase 1a", () => {
  it("if with script condition selects then when input passes", async () => {
    const manifest = manifestWithSteps([
      {
        type: "if",
        id: "scripted",
        input: { flag: { $ref: "state.flag" } },
        script: { source: "return input.flag === true", lang: "js" },
        then: [{ id: "yes", uses: echoCapability.id, input: { value: "y" }, as: "yes" }],
        else: [{ id: "no", uses: echoCapability.id, input: { value: "n" }, as: "no" }],
      },
    ])
    const outcome = await runExecution(manifest, { flag: true }, runDeps)
    expect(outcome.state.yes).toBeDefined()
    expect(outcome.records.some((e) => e.type === "if.select" && e.data.side === "then")).toBe(true)
    const otherwise = await runExecution(manifest, { flag: false }, runDeps)
    expect(otherwise.state.no).toBeDefined()
    expect(otherwise.records.some((e) => e.type === "if.select" && e.data.side === "else")).toBe(true)
  })

  it("emits if.select with reason true, false, throw, missing, and non-boolean", async () => {
    const manifest: ExecutionManifest = manifestWithSteps([
      {
        type: "if",
        id: "t",
        expression: "true",
        then: [{ id: "yes", uses: echoCapability.id, input: { value: "y" }, as: "yes" }],
      },
      {
        type: "if",
        id: "f",
        expression: "false",
        else: [{ id: "no", uses: echoCapability.id, input: { value: "n" }, as: "no" }],
        then: [{ id: "skip", uses: echoCapability.id, input: { value: "s" } }],
      },
      {
        type: "if",
        id: "throw",
        expression: "input.x.y",
        input: {},
        else: [{ id: "caught", uses: echoCapability.id, input: { value: "c" } }],
        then: [{ id: "never", uses: echoCapability.id, input: { value: "n" } }],
      },
      {
        type: "if",
        id: "missing",
        input: { tier: { $ref: "state.tier" } },
        expression: "input.tier === 'gold'",
        else: [{ id: "miss", uses: echoCapability.id, input: { value: "m" }, as: "miss" }],
        then: [{ id: "hit", uses: echoCapability.id, input: { value: "h" } }],
      },
      {
        type: "if",
        id: "nb",
        expression: "1",
        else: [{ id: "bad", uses: echoCapability.id, input: { value: "b" }, as: "bad" }],
        then: [{ id: "ok", uses: echoCapability.id, input: { value: "o" } }],
      },
    ])
    const outcome = await runExecution(manifest, {}, runDeps)
    const selects = outcome.records.filter((event) => event.type === "if.select")
    expect(selects.map((event) => event.data)).toEqual([
      { nodeId: "t", side: "then", reason: "true" },
      { nodeId: "f", side: "else", reason: "false" },
      { nodeId: "throw", side: "else", reason: "throw" },
      { nodeId: "missing", side: "else", reason: "missing" },
      { nodeId: "nb", side: "else", reason: "non-boolean" },
    ])
  })

  it("resume mid-then keeps choices and does not re-decide", async () => {
    const manifest: ExecutionManifest = manifestWithSteps([
      {
        type: "if",
        id: "pick",
        expression: "false",
        then: [
          { id: "mid", uses: echoCapability.id, input: { value: "m" }, as: "mid" },
          { id: "after", uses: echoCapability.id, input: { value: "a" }, as: "after" },
        ],
        else: [{ id: "else", uses: echoCapability.id, input: { value: "e" } }],
      },
    ])
    const outcome = await runExecution(manifest, {}, {
      ...runDeps,
      cursor: { completed: ["mid"], inProgress: "after", choices: { pick: "then" } },
    })
    expect(outcome.steps.map((step) => step.nodeId)).toEqual(["after"])
    expect(outcome.events).not.toContain("if.select")
  })

  it("rejects end without value when into is set", async () => {
    const result = await validateExecution(
      manifestWithSteps([
        {
          type: "loop",
          mode: "forEach",
          id: "rows",
          input: { items: { $ref: "state.rows" } },
          as: "row",
          into: "out",
          steps: [],
          end: { input: {} },
        },
      ]),
      { capabilities: [echoCapability] },
    )
    expect(result.issues.some((issue) => issue.path === "/steps/0/end/input/value")).toBe(true)
  })

  it("allows while end with only repeat", async () => {
    const result = await validateExecution(
      manifestWithSteps([
        {
          type: "loop",
          id: "w",
          maxRounds: 1,
          steps: [{ id: "noop", uses: echoCapability.id, input: { value: "n" } }],
          end: { input: { repeat: false } },
        },
      ]),
      { capabilities: [echoCapability] },
    )
    expect(result.issues.filter((issue) => issue.severity === "error")).toEqual([])
  })

  it("rejects repeat on forEach end at validation", async () => {
    const result = await validateExecution(
      manifestWithSteps([
        {
          type: "loop",
          mode: "forEach",
          id: "rows",
          input: { items: { $ref: "state.rows" } },
          as: "row",
          into: "out",
          steps: [{ id: "body", uses: echoCapability.id, input: { value: { $ref: "state.row" } } }],
          end: { input: { repeat: false, value: { $ref: "state.row" } } },
        },
      ]),
      { capabilities: [echoCapability] },
    )
    expect(result.issues.some((issue) => issue.path === "/steps/0/end/input/repeat")).toBe(true)
  })

  it("runs while once then stops on repeat false", async () => {
    const outcome = await runExecution(
      manifestWithSteps([
        {
          type: "loop",
          id: "w",
          maxRounds: 3,
          steps: [{ id: "body", uses: echoCapability.id, input: { value: "b" }, as: "body", mode: "replace" }],
          end: { input: { repeat: false, value: { $ref: "state.body" } } },
        },
      ]),
      {},
      runDeps,
    )
    expect(outcome.steps.filter((step) => step.nodeId === "body")).toHaveLength(1)
    expect(outcome.events).toContain("loop.repeat")
  })

  it("for with count 0 writes no into", async () => {
    const outcome = await runExecution(
      manifestWithSteps([
        {
          ...forLoop(),
          into: "last",
          steps: [{ id: "body", uses: echoCapability.id, input: { value: "x" }, as: "last" }],
        },
      ]),
      { n: 0 },
      runDeps,
    )
    expect(outcome.state.last).toBeUndefined()
  })

  it("gathers forEach via end into", async () => {
    const outcome = await runExecution(manifestWithSteps([foreachLoop()]), { rows: ["a", "b"] }, runDeps)
    expect(outcome.state.collected).toEqual([{ echo: "a" }, { echo: "b" }])
  })
})

describe("graph model L1/L2 rejects", () => {
  const caps = { capabilities: [echoCapability] }

  it("rejects if with both expression and script", async () => {
    const result = await validateExecution(
      manifestWithSteps([
        {
          type: "if",
          id: "bad",
          expression: "true",
          script: { lang: "js", source: "return true" },
          then: [{ id: "x", uses: echoCapability.id, input: { value: "x" } }],
        },
      ]),
      caps,
    )
    expect(result.issues.some((issue) => issue.code === "ECP_MANIFEST_INVALID" && issue.path.includes("/steps/0"))).toBe(
      true,
    )
  })

  it("rejects if with neither expression nor script", async () => {
    const result = await validateExecution(
      manifestWithSteps([{ type: "if", id: "bad", then: [{ id: "x", uses: echoCapability.id, input: { value: "x" } }] }]),
      caps,
    )
    expect(result.issues.some((issue) => issue.code === "ECP_MANIFEST_INVALID")).toBe(true)
  })

  it("rejects empty if then at schema", async () => {
    const result = await validateExecution(
      manifestWithSteps([{ type: "if", id: "bad", expression: "true", then: [] }]),
      caps,
    )
    expect(result.issues.some((issue) => issue.code === "ECP_MANIFEST_INVALID" && issue.path === "/steps/0/then")).toBe(
      true,
    )
  })

  it("rejects as on if without input", async () => {
    const result = await validateExecution(
      manifestWithSteps([
        {
          type: "if",
          id: "bad",
          expression: "true",
          as: "ctx",
          then: [{ id: "x", uses: echoCapability.id, input: { value: "x" } }],
        },
      ]),
      caps,
    )
    expect(result.issues.some((issue) => issue.path === "/steps/0/as")).toBe(true)
  })

  it("rejects parallel with one path and an empty path", async () => {
    const onePath = await validateExecution(
      manifestWithSteps([
        {
          type: "parallel",
          id: "p",
          paths: [[{ id: "a", uses: echoCapability.id, input: { value: "a" } }]],
        },
      ]),
      caps,
    )
    expect(onePath.issues.some((issue) => issue.path === "/steps/0/paths")).toBe(true)
    const emptyPath = await validateExecution(
      manifestWithSteps([
        {
          type: "parallel",
          id: "p",
          paths: [[], [{ id: "b", uses: echoCapability.id, input: { value: "b" } }]],
        },
      ]),
      caps,
    )
    expect(emptyPath.issues.some((issue) => issue.path?.includes("/paths/0"))).toBe(true)
  })

  it("rejects while with as", async () => {
    const result = await validateExecution(
      manifestWithSteps([
        {
          type: "loop",
          id: "w",
          maxRounds: 1,
          as: "i",
          steps: [],
          end: { input: { repeat: false } },
        },
      ]),
      caps,
    )
    expect(result.issues.some((issue) => issue.path === "/steps/0/as")).toBe(true)
  })

  it("rejects for without input.count and forEach without required fields", async () => {
    const forMissing = await validateExecution(
      manifestWithSteps([
        {
          type: "loop",
          mode: "for",
          id: "f",
          as: "i",
          steps: [],
          end: { input: { value: { $ref: "state.x" } } },
        },
      ]),
      caps,
    )
    expect(forMissing.issues.some((issue) => issue.path === "/steps/0/input/count")).toBe(true)
    const foreachMissing = await validateExecution(
      manifestWithSteps([
        {
          type: "loop",
          mode: "forEach",
          id: "fe",
          input: { items: { $ref: "state.rows" } },
          steps: [],
          end: { input: {} },
        },
      ]),
      caps,
    )
    expect(foreachMissing.issues.filter((issue) => issue.severity === "error").length).toBeGreaterThan(0)
  })

  it("rejects legacy graph shapes at L1", async () => {
    const cases: ExecutionManifest[] = [
      manifestWithSteps([
        {
          type: "branch",
          id: "old",
          branches: [{ steps: [{ id: "x", uses: echoCapability.id, input: { value: "x" } }] }],
        } as ExecutionManifest["steps"][0],
      ]),
      manifestWithSteps([
        { id: "gated", uses: echoCapability.id, expr: "true", input: { value: "x" } } as ExecutionManifest["steps"][0],
      ]),
      manifestWithSteps([
        {
          type: "loop",
          id: "l",
          ref: "state.go",
          maxRounds: 1,
          steps: [],
          end: { input: { repeat: false } },
        } as ExecutionManifest["steps"][0],
      ]),
      manifestWithSteps([
        {
          type: "parallel",
          id: "p",
          branches: [
            [{ id: "a", uses: echoCapability.id, input: { value: "a" } }],
            [{ id: "b", uses: echoCapability.id, input: { value: "b" } }],
          ],
        } as ExecutionManifest["steps"][0],
      ]),
    ]
    for (const manifest of cases) {
      const result = await validateExecution(manifest, caps)
      expect(result.issues.some((issue) => issue.code === "ECP_MANIFEST_INVALID")).toBe(true)
    }
  })
})

describe("graph model L3 dataflow", () => {
  const caps = { capabilities: [echoCapability] }

  it("allows if scoped as inside then and else and refuses it after the if", async () => {
    const inside = await validateExecution(
      {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        execution: {
          accepts: { type: "object", properties: { n: { type: "number" } }, required: ["n"] },
        },
        steps: [
          {
            type: "if",
            id: "pick",
            accepts: { type: "object", properties: { n: { type: "number" } }, required: ["n"] },
            input: { n: { $ref: "state.n" } },
            expression: "input.n > 0",
            as: "ctx",
            then: [{ id: "t", uses: echoCapability.id, input: { value: { $ref: "state.ctx.n" } } }],
            else: [{ id: "e", uses: echoCapability.id, input: { value: { $ref: "state.ctx.n" } } }],
          },
        ],
      },
      caps,
    )
    expect(inside.issues.filter((issue) => issue.severity === "error")).toEqual([])
    const after = await validateExecution(
      manifestWithSteps([
        {
          type: "if",
          id: "pick",
          input: { n: { $ref: "state.n" } },
          expression: "true",
          as: "ctx",
          then: [{ id: "t", uses: echoCapability.id, input: { value: "t" } }],
        },
        { id: "late", uses: echoCapability.id, input: { value: { $ref: "state.ctx" } } },
      ]),
      caps,
    )
    expect(after.issues.some((issue) => issue.code === "ECP_REF_UNRESOLVED")).toBe(true)
  })

  it("rejects scoped as colliding with execution input and loop as", async () => {
    const inputName = await validateExecution(
      {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        execution: { accepts: { type: "object", properties: { tier: { type: "string" } } } },
        steps: [
          {
            type: "if",
            id: "bad",
            expression: "true",
            input: { tier: { $ref: "state.tier" } },
            as: "tier",
            then: [{ id: "x", uses: echoCapability.id, input: { value: "x" } }],
          },
        ],
      },
      caps,
    )
    expect(inputName.issues.some((issue) => issue.code === "ECP_COMMIT_CONFLICT" && issue.path === "/steps/0/as")).toBe(
      true,
    )
    const loopAs = await validateExecution(
      manifestWithSteps([
        {
          type: "loop",
          mode: "for",
          id: "outer",
          input: { count: { $ref: "state.n" } },
          as: "i",
          steps: [
            {
              type: "if",
              id: "inner",
              expression: "true",
              input: { n: { $ref: "state.i" } },
              as: "i",
              then: [{ id: "x", uses: echoCapability.id, input: { value: "x" } }],
            },
          ],
          end: { input: { value: { $ref: "state.x" } } },
        },
      ]),
      caps,
    )
    expect(loopAs.issues.some((issue) => issue.code === "ECP_COMMIT_CONFLICT")).toBe(true)
  })

  it("marks then-only output as maybe without else and definite when both sides write", async () => {
    const noElse = await validateExecution(
      manifestWithSteps([
        {
          type: "if",
          id: "pick",
          expression: "true",
          then: [{ id: "t", uses: echoCapability.id, input: { value: "t" }, as: "out" }],
        },
        { id: "use", uses: echoCapability.id, input: { value: { $ref: "state.out.echo" } } },
      ]),
      caps,
    )
    expect(noElse.issues.some((issue) => issue.code === "ECP_REF_MAYBE_MISSING")).toBe(true)
    const both = await validateExecution(
      manifestWithSteps([
        {
          type: "if",
          id: "pick",
          expression: "true",
          then: [{ id: "t", uses: echoCapability.id, input: { value: "t" }, as: "out" }],
          else: [{ id: "e", uses: echoCapability.id, input: { value: "e" }, as: "out" }],
        },
        { id: "use", uses: echoCapability.id, input: { value: { $ref: "state.out.echo" } } },
      ]),
      caps,
    )
    expect(both.issues.filter((issue) => issue.severity === "error")).toEqual([])
  })

  it("rejects non-array items and non-integer count", async () => {
    const items = await validateExecution(
      {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        execution: { accepts: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
        steps: [
          {
            type: "loop",
            mode: "forEach",
            id: "fe",
            input: { items: { $ref: "state.text" } },
            as: "row",
            into: "out",
            steps: [{ id: "body", uses: echoCapability.id, input: { value: { $ref: "state.row" } }, as: "out" }],
            end: { input: { value: { $ref: "state.out" } } },
          },
        ],
      },
      caps,
    )
    expect(items.issues.some((issue) => issue.code === "ECP_TYPE_MISMATCH")).toBe(true)
    const count = await validateExecution(
      {
        schema: "@executioncontrolprotocol.execution",
        version: "2.0",
        execution: { accepts: { type: "object", properties: { flag: { type: "boolean" } }, required: ["flag"] } },
        steps: [
          {
            type: "loop",
            mode: "for",
            id: "f",
            input: { count: { $ref: "state.flag" } },
            as: "i",
            steps: [{ id: "body", uses: echoCapability.id, input: { value: "x" } }],
            end: { input: { value: { $ref: "state.x" } } },
          },
        ],
      },
      caps,
    )
    expect(count.issues.some((issue) => issue.code === "ECP_TYPE_MISMATCH" && issue.path?.includes("/input/count"))).toBe(
      true,
    )
  })

  it("refuses a parallel path reading a sibling path commit", async () => {
    const result = await validateExecution(
      manifestWithSteps([
        {
          type: "parallel",
          id: "both",
          paths: [
            [{ id: "left", uses: echoCapability.id, input: { value: "l" }, as: "left" }],
            [{ id: "right", uses: echoCapability.id, input: { value: { $ref: "state.left" } }, as: "right" }],
          ],
        },
      ]),
      caps,
    )
    expect(result.issues.some((issue) => issue.message.includes("parallel sibling"))).toBe(true)
  })
})

describe("graph model run semantics", () => {
  it("runs parallel paths with maxConcurrency 1", async () => {
    const manifest = manifestWithSteps([
      {
        type: "parallel",
        id: "p",
        maxConcurrency: 1,
        paths: [
          [{ id: "a", uses: echoCapability.id, input: { value: "a" }, as: "a" }],
          [{ id: "b", uses: echoCapability.id, input: { value: "b" }, as: "b" }],
          [{ id: "c", uses: echoCapability.id, input: { value: "c" }, as: "c" }],
        ],
      },
    ])
    const outcome = await runExecution(manifest, {}, runDeps)
    expect(outcome.status).toBe("completed")
    expect(outcome.state.a).toBeDefined()
    expect(outcome.state.b).toBeDefined()
    expect(outcome.state.c).toBeDefined()
  })

  it("parallel path failure fails the run and clears scoped as", async () => {
    const manifest = manifestWithSteps([
      {
        type: "parallel",
        id: "p",
        as: "query",
        input: { q: { $ref: "state.q" } },
        paths: [
          [{ id: "ok", uses: echoCapability.id, input: { value: "ok" }, as: "ok" }],
          [{ id: "bad", uses: failCapability.id, input: { message: "boom" } }],
        ],
      },
    ])
    const outcome = await runExecution(manifest, { q: "go" }, runDepsWithFail)
    expect(outcome.status).toBe("failed")
    expect(outcome.state.query).toBeUndefined()
  })

  it("scopes parallel as on every path and removes it after", async () => {
    const manifest = manifestWithSteps([
      {
        type: "parallel",
        id: "p",
        input: { q: { $ref: "state.q" } },
        as: "query",
        paths: [
          [{ id: "a", uses: echoCapability.id, input: { value: { $ref: "state.query.q" } }, as: "a" }],
          [{ id: "b", uses: echoCapability.id, input: { value: { $ref: "state.query.q" } }, as: "b" }],
        ],
      },
    ])
    const outcome = await runExecution(manifest, { q: "go" }, runDeps)
    expect(outcome.state.a).toEqual({ echo: "go" })
    expect(outcome.state.b).toEqual({ echo: "go" })
    expect(outcome.state.query).toBeUndefined()
  })

  it("stops while on non-boolean repeat, throwing repeat, and emits loop.exhausted at maxRounds", async () => {
    const nonBool = await runExecution(
      manifestWithSteps([
        {
          type: "loop",
          id: "w",
          maxRounds: 5,
          steps: [{ id: "body", uses: echoCapability.id, input: { value: "b" } }],
          end: { input: { repeat: "yes" } },
        },
      ]),
      {},
      runDeps,
    )
    expect(nonBool.steps.filter((step) => step.nodeId === "body")).toHaveLength(1)
    expect(nonBool.records.some((event) => event.type === "loop.repeat" && event.data.reason === "non-boolean")).toBe(
      true,
    )
    const missingRepeat = await runExecution(
      manifestWithSteps([
        {
          type: "loop",
          id: "w2",
          maxRounds: 5,
          steps: [],
          end: { input: { repeat: { $ref: "state.toggle", optional: true } } },
        },
      ]),
      {},
      runDeps,
    )
    expect(
      missingRepeat.records.some(
        (event) => event.type === "loop.repeat" && (event.data.reason === "missing" || event.data.reason === "non-boolean"),
      ),
    ).toBe(true)
    const exhausted = await runExecution(
      manifestWithSteps([
        {
          type: "loop",
          id: "w3",
          maxRounds: 2,
          steps: [{ id: "body", uses: echoCapability.id, input: { value: "b" } }],
          end: { input: { repeat: true } },
        },
      ]),
      {},
      runDeps,
    )
    const endEvent = exhausted.records.find((event) => event.type === "loop.exhausted")
    expect(endEvent?.data).toEqual({ nodeId: "w3", rounds: 2 })
    expect(exhausted.steps.filter((step) => step.nodeId === "body")).toHaveLength(2)
  })

  it("writes for into from the last gathered round", async () => {
    const outcome = await runExecution(
      manifestWithSteps([
        {
          ...forLoop(),
          steps: [
            { id: "body", uses: echoCapability.id, input: { value: { $ref: "state.i" } }, as: "last", mode: "replace" },
          ],
        },
      ]),
      { n: 3 },
      runDeps,
    )
    expect(outcome.state.last).toEqual({ echo: 2 })
    expect(outcome.state.into).toBeUndefined()
    const withInto = await runExecution(
      manifestWithSteps([
        {
          ...forLoop(),
          into: "summary",
          steps: [
            { id: "body", uses: echoCapability.id, input: { value: "v" }, as: "last", mode: "replace" },
          ],
        },
      ]),
      { n: 2 },
      runDeps,
    )
    expect(withInto.state.summary).toEqual({ echo: "v" })
  })

  it("commits empty forEach into as an empty array", async () => {
    const outcome = await runExecution(
      manifestWithSteps([{ ...foreachLoop(), concurrency: 1 }]),
      { rows: [] },
      runDeps,
    )
    expect(outcome.state.collected).toEqual([])
  })

  it("gathers forEach with end expression and end script", async () => {
    const expr = await runExecution(
      manifestWithSteps([
        {
          ...foreachLoop(),
          end: { input: { value: { $ref: "state.out" } }, expression: "input.value.echo + '-x'" },
        },
      ]),
      { rows: ["a"] },
      runDeps,
    )
    expect(expr.state.collected).toEqual(["a-x"])
    const script = await runExecution(
      manifestWithSteps([
        {
          ...foreachLoop(),
          end: {
            input: { value: { $ref: "state.out" } },
            script: { lang: "js", source: "return input.value.echo + '-s'" },
          },
        },
      ]),
      { rows: ["b"] },
      runDeps,
    )
    expect(script.state.collected).toEqual(["b-s"])
  })

  it("fails the run when end gather throws", async () => {
    const outcome = await runExecution(
      manifestWithSteps([
        {
          ...foreachLoop(),
          end: { input: { value: { $ref: "state.out" } }, expression: "(() => { throw new Error('boom') })()" },
        },
      ]),
      { rows: ["a"] },
      runDeps,
    )
    expect(outcome.status).toBe("failed")
  })

  it("if with missing optional input takes else and does not write scoped as", async () => {
    const outcome = await runExecution(
      manifestWithSteps([
        {
          type: "if",
          id: "pick",
          input: { tier: { $ref: "state.tier" } },
          expression: "input.tier === 'gold'",
          as: "customer",
          then: [{ id: "yes", uses: echoCapability.id, input: { value: "y" } }],
          else: [{ id: "no", uses: echoCapability.id, input: { value: "n" }, as: "picked" }],
        },
      ]),
      {},
      runDeps,
    )
    expect(outcome.state.picked).toEqual({ echo: "n" })
    expect(outcome.state.customer).toBeUndefined()
    expect(outcome.records.some((event) => event.type === "if.select" && event.data.reason === "missing")).toBe(true)
  })

  it("resume inside then of if with as completes without ECP_COMMIT_CONFLICT", async () => {
    const manifest = manifestWithSteps([
      {
        type: "if",
        id: "pick",
        input: { n: { $ref: "state.n" } },
        expression: "input.n > 0",
        as: "ctx",
        then: [
          { id: "mid", uses: echoCapability.id, input: { value: { $ref: "state.ctx.n" } }, as: "mid" },
          { id: "after", uses: echoCapability.id, input: { value: "done" } },
        ],
      },
    ])
    const outcome = await runExecution(manifest, { n: 1 }, {
      ...runDeps,
      cursor: { completed: ["mid"], inProgress: "after", choices: { pick: "then" } },
    })
    expect(outcome.status).toBe("completed")
    expect(outcome.error).toBeUndefined()
  })

  it("resume mid forEach item restarts the in-progress item", async () => {
    const manifest = manifestWithSteps([foreachLoop({ concurrency: 1 })])
    const storage = new MemoryStorage()
    await storage.runs.create(
      {
        id: "r-fe-resume",
        schema: "@executioncontrolprotocol/run",
        version: "1.0",
        status: "running",
        startedAt: new Date().toISOString(),
        execution: { path: null, manifestHash: "h" },
        host: { version: "0", pid: 1, mode: "in-process" },
      },
      manifest,
    )
    await storage.runs.writeLoopPartial!("r-fe-resume", "items", {
      results: { "0": { echo: "a" } },
      errors: [],
    })
    const first = await runExecution(manifest, { rows: ["a", "b"] }, {
      ...runDeps,
      store: storage.runs,
      runId: "r-fe-resume",
      cursor: { completed: [], inProgress: "body", loops: {}, choices: {}, loopItems: { items: { completed: [0] } } },
    })
    expect(first.steps.filter((step) => step.nodeId === "body")).toHaveLength(1)
    expect(first.state.collected).toEqual([{ echo: "a" }, { echo: "b" }])
  })

  it("refuses detached if and loop at run time", async () => {
    const detachedIf: ExecutionManifest = {
      ...manifestWithSteps([{ id: "ok", uses: echoCapability.id, input: { value: "o" } }]),
      detached: [
        {
          type: "if",
          id: "aside",
          expression: "true",
          then: [{ id: "x", uses: echoCapability.id, input: { value: "x" } }],
        },
      ],
    }
    const detachedLoop: ExecutionManifest = {
      ...manifestWithSteps([{ id: "ok", uses: echoCapability.id, input: { value: "o" } }]),
      detached: [
        {
          type: "loop",
          id: "aside",
          maxRounds: 1,
          steps: [],
          end: { input: { repeat: false } },
        },
      ],
    }
    for (const manifest of [detachedIf, detachedLoop]) {
      const outcome = await runExecution(manifest, {}, runDeps)
      expect(outcome.status).toBe("failed")
      expect(outcome.error?.code).toBe("ECP_NODE_DETACHED")
      expect(outcome.steps).toEqual([])
    }
  })
})

describe("graph model QuickJS expressions", () => {
  it("evaluateExpression returns non-booleans unchanged and cannot see host globals", async () => {
    await expect(engine.evaluateExpression("input.n + 1", { n: 1 })).resolves.toBe(2)
    await expect(engine.evaluateExpression("typeof process", {})).resolves.toBe("undefined")
    await expect(engine.evaluateExpression("input", { ok: true })).resolves.toEqual({ ok: true })
  })

  it("evaluateExpression freezes input", async () => {
    const input = { n: 1 }
    await expect(engine.evaluateExpression("input.n = 9; input.n", input)).rejects.toBeDefined()
    expect(input.n).toBe(1)
  })

  it("evaluateExpression respects the time limit", async () => {
    await expect(engine.evaluateExpression("(() => { while (true) {} })()", {})).rejects.toMatchObject({
      code: "ECP_EXPR_TIMEOUT",
    })
  })

  it("stores the last gathered value of a while loop in into", async () => {
    const result = await runExecution(
      manifestWithSteps([
        {
          type: "loop",
          id: "w",
          maxRounds: 3,
          steps: [{ id: "body", uses: echoCapability.id, input: { value: "b" }, as: "out", mode: "replace" }],
          end: { input: { value: { $ref: "state.out.echo" }, repeat: true }, expression: "input.value + '!'" },
          into: "last",
        },
      ]),
      {},
      runDeps,
    )
    expect(result.state.last).toBe("b!")
    expect(result.records.filter((event) => event.type === "loop.repeat")).toHaveLength(3)
    expect(result.records.some((event) => event.type === "loop.exhausted" && event.data.rounds === 3)).toBe(true)
  })

  it("runs nothing when an if without else is false and records side null", async () => {
    const result = await runExecution(
      manifestWithSteps([
        { type: "if", id: "gate", expression: "false", then: [{ id: "inside", uses: echoCapability.id, input: { value: 1 } }] },
        { id: "after", uses: echoCapability.id, input: { value: 2 } },
      ]),
      {},
      runDeps,
    )
    expect(result.steps.some((step) => step.nodeId === "inside")).toBe(false)
    expect(result.steps.some((step) => step.nodeId === "after")).toBe(true)
    const select = result.records.find((event) => event.type === "if.select")
    expect(select?.data).toMatchObject({ nodeId: "gate", side: null, reason: "false" })
  })
})
