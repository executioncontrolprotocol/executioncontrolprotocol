import { afterEach, beforeAll, describe, expect, it } from "vitest"
import type { CapabilityCall, ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { MAX_LOOP_ITEMS } from "@executioncontrolprotocol/protocol"
import { QuickJsExpressionEngine as EngineImpl } from "../../quickjs/src/index.js"
import { awaitTestDelay, resetDelayForTests } from "../../../plugins/plugin-test/src/capabilities/delay-hooks.js"
import { defaultRunClock } from "../src/execute/run-loop-items.js"
import { runExecution, startExecution, validateExecution, type StateStore } from "../src/index.js"
import { MemoryStorage } from "../src/testing/index.js"
import { foreachLoop, manifestWithSteps } from "./manifest-helpers.js"

const engine = new EngineImpl()

beforeAll(async () => {
  await engine.start()
})

afterEach(() => {
  resetDelayForTests()
})

async function echoCall(request: CapabilityCall, _signal: AbortSignal, _store: StateStore): Promise<unknown> {
  const input = (request.input ?? {}) as Record<string, unknown>
  if (request.capabilityId.endsWith(".fail")) {
    throw Object.assign(new Error(String(input.message ?? "failed")), { code: "ECP_STEP_FAILED" })
  }
  if (request.capabilityId.endsWith(".delay")) {
    await awaitTestDelay(Number(input.ms ?? 5), _signal, false)
    return { echo: input.value }
  }
  return { echo: input.value }
}

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

function foreachManifest(extra: Partial<ExecutionManifest["steps"][0]> = {}): ExecutionManifest {
  return manifestWithSteps([foreachLoop(extra as never)])
}

describe("run forEach", () => {
  it("collects three items in index order with concurrency 2", async () => {
    const outcome = await runExecution(
      foreachManifest(),
      { rows: ["a", "b", "c"] },
      {
        capabilities: [echoCapability],
        expression: engine,
        call: echoCall,
      },
    )
    expect(outcome.status).toBe("completed")
    expect(outcome.state.out).toEqual([
      { echo: "a" },
      { echo: "b" },
      { echo: "c" },
    ])
    expect(outcome.events).toContain("loop.start")
    expect(outcome.events).toContain("loop.end")
  })

  it("commits empty out arrays for an empty items array", async () => {
    const outcome = await runExecution(foreachManifest(), { rows: [] }, {
      capabilities: [echoCapability],
      expression: engine,
      call: echoCall,
    })
    expect(outcome.status).toBe("completed")
    expect(outcome.state.out).toEqual([])
  })

  it("resolves items from input.items when bound to state", async () => {
    const outcome = await runExecution(
      foreachManifest(),
      { rows: ["x", "y"] },
      { capabilities: [echoCapability], expression: engine, call: echoCall },
    )
    expect(outcome.status).toBe("completed")
    expect(outcome.state.out).toEqual([{ echo: "x" }, { echo: "y" }])
  })

  it("fails when items is not an array at run time", async () => {
    const outcome = await runExecution(
      foreachManifest({ input: { items: { $ref: "state.notArray" } } }),
      { notArray: "nope" },
      { capabilities: [echoCapability], expression: engine, call: echoCall },
    )
    expect(outcome.status).toBe("failed")
    expect(outcome.error?.code).toBe("ECP_TYPE_MISMATCH")
  })


  it("fails when default items ref resolves to a non-array", async () => {
    const outcome = await runExecution(foreachManifest(), { rows: "nope" }, {
      capabilities: [echoCapability],
      expression: engine,
      call: echoCall,
    })
    expect(outcome.status).toBe("failed")
    expect(outcome.error?.code).toBe("ECP_TYPE_MISMATCH")
  })

  it("fails when items exceed MAX_LOOP_ITEMS", async () => {
    const rows = Array.from({ length: MAX_LOOP_ITEMS + 1 }, (_, index) => index)
    const outcome = await runExecution(foreachManifest(), { rows }, {
      capabilities: [echoCapability],
      expression: engine,
      call: echoCall,
    })
    expect(outcome.status).toBe("failed")
    expect(outcome.error?.code).toBe("ECP_LIMIT_EXCEEDED")
  })

  it("onError fail reports the lowest index even when a higher index fails first", async () => {
    const simple: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          mode: "forEach",
          id: "items",
          input: { items: { $ref: "state.rows" } },
          as: "row",
          concurrency: 3,
          onError: "fail",
          steps: [
            {
              id: "body",
              uses: "@executioncontrolprotocol/test.fail",
              input: { message: { "$ref": "state.row" } },
              as: "out",
            },
          ],
        },
      ],
    }
    const outcome = await runExecution(simple, { rows: [0, 1, 2] }, {
      capabilities: [
        echoCapability,
        { ...echoCapability, id: "@executioncontrolprotocol/test.fail" },
      ],
      expression: engine,
      call: echoCall,
    })
    expect(outcome.status).toBe("failed")
    expect(outcome.error?.details).toMatchObject({ index: 0 })
  })

  it("onError continue records null slots in the out array", async () => {
    const manifest: ExecutionManifest = foreachManifest({
      concurrency: 1,
      onError: "continue",
      steps: [{ id: "body", uses: "@executioncontrolprotocol/test.fail", input: { message: "bad" }, as: "out" }],
    })
    const outcome = await runExecution(manifest, { rows: [1] }, {
      capabilities: [
        echoCapability,
        { ...echoCapability, id: "@executioncontrolprotocol/test.fail" },
      ],
      expression: engine,
      call: echoCall,
    })
    expect(outcome.status).toBe("completed")
    expect(outcome.state.out).toEqual([null])
  })

  it("writes partial results under concurrency without losing entries", async () => {
    const storage = new MemoryStorage()
    await storage.runs.create(
      {
        id: "r-partial",
        schema: "@executioncontrolprotocol/run",
        version: "1.0",
        status: "running",
        startedAt: new Date().toISOString(),
        execution: { path: null, manifestHash: "h" },
        host: { version: "0", pid: 1, mode: "in-process" },
      },
      foreachManifest(),
    )
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          mode: "forEach",
          id: "items",
          input: { items: { $ref: "state.rows" } },
          as: "row",
          concurrency: 4,
          steps: [
            {
              id: "body",
              uses: "@executioncontrolprotocol/test.delay",
              input: { ms: 10, value: { "$ref": "state.row" } },
              as: "out",
            },
          ],
        },
      ],
    }
    const outcome = await runExecution(manifest, { rows: [0, 1, 2, 3] }, {
      capabilities: [
        echoCapability,
        { ...echoCapability, id: "@executioncontrolprotocol/test.delay" },
      ],
      expression: engine,
      call: echoCall,
      store: storage.runs,
      runId: "r-partial",
    })
    expect(outcome.status).toBe("completed")
    const partial = await storage.runs.readLoopPartial!("r-partial", "items")
    expect(Object.keys(partial?.rounds ?? {}).sort()).toEqual(["0", "1", "2", "3"])
  })

  it("rejects a forEach as key that shadows parent state (L3)", async () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      execution: {
        accepts: {
          type: "object",
          properties: { shared: { type: "string" } },
          required: ["shared"],
        },
      },
      steps: [
        {
          type: "loop",
          mode: "forEach",
          id: "items",
          input: { items: { $ref: "state.rows" } },
          as: "shared",
          steps: [{ id: "body", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "out" }],
        },
      ],
    }
    const result = await validateExecution(manifest, { capabilities: [echoCapability] })
    expect(result.issues.some((issue) => issue.code === "ECP_COMMIT_CONFLICT")).toBe(true)
  })

  it("cancel stops in-flight items and does not commit body arrays", async () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          mode: "forEach",
          id: "items",
          input: { items: { $ref: "state.rows" } },
          as: "row",
          concurrency: 2,
          steps: [
            {
              id: "body",
              uses: "@executioncontrolprotocol/test.delay",
              input: { ms: 200, hold: true, value: { "$ref": "state.row" } },
              as: "out",
            },
          ],
        },
      ],
    }
    const active = startExecution(manifest, { rows: [0, 1, 2] }, {
      capabilities: [
        echoCapability,
        { ...echoCapability, id: "@executioncontrolprotocol/test.delay" },
      ],
      expression: engine,
      call: echoCall,
    })
    setTimeout(() => active.cancel(), 20)
    const outcome = await active.outcome
    expect(outcome.status).toBe("cancelled")
    expect(outcome.state.out).toBeUndefined()
  })

  it("resumes by skipping items already recorded in the partial file", async () => {
    const storage = new MemoryStorage()
    await storage.runs.create(
      {
        id: "r-resume",
        schema: "@executioncontrolprotocol/run",
        version: "1.0",
        status: "running",
        startedAt: new Date().toISOString(),
        execution: { path: null, manifestHash: "h" },
        host: { version: "0", pid: 1, mode: "in-process" },
      },
      foreachManifest(),
    )
    await storage.runs.writeLoopPartial!("r-resume", "items", {
      rounds: { "0": { out: { echo: "a" } } },
      errors: [],
    })
    const outcome = await runExecution(foreachManifest(), { rows: ["a", "b"] }, {
      capabilities: [echoCapability],
      expression: engine,
      call: echoCall,
      store: storage.runs,
      runId: "r-resume",
      cursor: { completed: [], loops: {}, choices: {}, loopItems: { items: { completed: [0] } } },
    })
    expect(outcome.status).toBe("completed")
    expect(outcome.state.out).toEqual([{ echo: "a" }, { echo: "b" }])
  })

  it("rejects duplicate body export keys in parent scope (L3)", async () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      execution: {
        accepts: {
          type: "object",
          properties: { rows: { type: "array" } },
          required: ["rows"],
        },
      },
      steps: [
        { id: "seed", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "out" },
        {
          type: "loop",
          mode: "forEach",
          id: "items",
          input: { items: { $ref: "state.rows" } },
          as: "row",
          steps: [{ id: "body", uses: "@executioncontrolprotocol/test.echo", input: { value: "y" }, as: "out" }],
        },
      ],
    }
    const result = await validateExecution(manifest, { capabilities: [echoCapability] })
    expect(result.issues.some((issue) => issue.code === "ECP_COMMIT_CONFLICT" && issue.path?.endsWith("/steps"))).toBe(
      true,
    )
  })

  it("supports nested forEach without writing an inner partial file", async () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          mode: "forEach",
          id: "outer",
          input: { items: { $ref: "state.rows" } },
          as: "row",
          concurrency: 2,
          steps: [
            {
              type: "loop",
              mode: "forEach",
              id: "inner",
              input: { items: { $ref: "state.row.parts" } },
              as: "part",
              steps: [
                {
                  id: "echo",
                  uses: "@executioncontrolprotocol/test.echo",
                  input: { value: { "$ref": "state.part" } },
                  as: "piece",
                },
              ],
            },
          ],
        },
      ],
    }
    const outcome = await runExecution(
      manifest,
      { rows: [{ parts: ["a", "b"] }, { parts: ["c"] }] },
      { capabilities: [echoCapability], expression: engine, call: echoCall },
    )
    expect(outcome.status).toBe("completed")
    expect(outcome.state.piece).toEqual([
      [{ echo: "a" }, { echo: "b" }],
      [{ echo: "c" }],
    ])
  })

  it("defaultRunClock sleep rejects an aborted signal", async () => {
    const clock = defaultRunClock()
    const controller = new AbortController()
    controller.abort()
    await expect(clock.sleep(5, controller.signal)).rejects.toMatchObject({ code: "ECP_RUN_CANCELLED" })
  })

  it("records step items path when a loop runs inside an item", async () => {
    const storage = new MemoryStorage()
    await storage.runs.create(
      {
        id: "r-loop",
        schema: "@executioncontrolprotocol/run",
        version: "1.0",
        status: "running",
        startedAt: new Date().toISOString(),
        execution: { path: null, manifestHash: "h" },
        host: { version: "0", pid: 1, mode: "in-process" },
      },
      foreachManifest(),
    )
    const manifest: ExecutionManifest = foreachManifest({
      concurrency: 1,
      steps: [
        {
          id: "tick",
          uses: "@executioncontrolprotocol/test.echo",
          input: { value: { $ref: "state.row" } },
          as: "tick",
        },
      ],
    })
    await runExecution(manifest, { rows: [1] }, {
      capabilities: [echoCapability],
      expression: engine,
      call: echoCall,
      store: storage.runs,
      runId: "r-loop",
    })
    const detail = await storage.runs.get("r-loop", ["steps"])
    const step = detail?.steps?.find((record) => record.nodeId === "tick")
    expect(step?.items).toEqual([0])
    expect(step?.round ?? null).toBeNull()
  })

  function loopInItemManifest(): ExecutionManifest {
    return {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          mode: "forEach",
          id: "items",
          input: { items: { $ref: "state.rows" } },
          as: "row",
          concurrency: 2,
          steps: [
            {
              id: "tick",
              uses: "@executioncontrolprotocol/test.echo",
              input: { value: { $ref: "state.row" } },
              as: "tick",
            },
          ],
        },
      ],
    }
  }

  it("keeps item scopes out of the run's state file and cursor", async () => {
    const storage = new MemoryStorage()
    await storage.runs.create(
      {
        id: "r-scope",
        schema: "@executioncontrolprotocol/run",
        version: "1.0",
        status: "running",
        startedAt: new Date().toISOString(),
        execution: { path: null, manifestHash: "h" },
        host: { version: "0", pid: 1, mode: "in-process" },
      },
      loopInItemManifest(),
    )
    const written: Array<Record<string, unknown>> = []
    const writeState = storage.runs.writeState.bind(storage.runs)
    storage.runs.writeState = async (runId, state) => {
      written.push(structuredClone(state) as Record<string, unknown>)
      await writeState(runId, state)
    }
    const outcome = await runExecution(loopInItemManifest(), { rows: ["a", "b"] }, {
      capabilities: [echoCapability],
      expression: engine,
      call: echoCall,
      store: storage.runs,
      runId: "r-scope",
    })
    expect(outcome.status).toBe("completed")
    expect(outcome.state.tick).toEqual([{ echo: "a" }, { echo: "b" }])
    expect(written.length).toBeGreaterThan(0)
    for (const state of written) {
      expect(state).not.toHaveProperty("row")
    }
    expect(outcome.cursor?.loops).not.toHaveProperty("inner")
    expect(outcome.cursor?.completed).not.toContain("tick")
  })

  it("restarts an unfinished item from its first step, ignoring the previous run's loop cursor", async () => {
    const outcome = await runExecution(loopInItemManifest(), { rows: ["a"] }, {
      capabilities: [echoCapability],
      expression: engine,
      call: echoCall,
      cursor: { completed: [], inProgress: "tick", loops: {}, choices: {}, loopItems: {} },
    })
    expect(outcome.status).toBe("completed")
    expect(outcome.state.tick).toEqual([{ echo: "a" }])
  })

  it("rejects create inside a nested loop within forEach (L3)", async () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      execution: {
        accepts: {
          type: "object",
          properties: { rows: { type: "array", items: { type: "string" } } },
          required: ["rows"],
        },
      },
      steps: [
        {
          type: "loop",
          mode: "forEach",
          id: "items",
          input: { items: { $ref: "state.rows" } },
          as: "row",
          steps: [
            {
              type: "loop",
              mode: "for",
              id: "inner",
              input: { count: 1 },
              as: "i",
              steps: [
                {
                  id: "warm",
                  uses: "@executioncontrolprotocol/test.echo",
                  input: { value: "x" },
                  as: "scratch",
                  mode: "replace",
                },
                {
                  id: "body",
                  uses: "@executioncontrolprotocol/test.echo",
                  input: { value: "x" },
                  as: "scratch",
                  mode: "create",
                },
              ],
            },
          ],
        },
      ],
    }
    const result = await validateExecution(manifest, { capabilities: [echoCapability] })
    expect(
      result.issues.some(
        (issue) =>
          issue.code === "ECP_COMMIT_CONFLICT" &&
          (issue.path?.endsWith("/mode") || issue.path?.endsWith("/as")),
      ),
    ).toBe(true)
  })

  it("flags items refs that are not arrays (L3)", async () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      execution: {
        accepts: {
          type: "object",
          properties: { tag: { type: "string" } },
          required: ["tag"],
        },
      },
      steps: [
        {
          type: "loop",
          mode: "forEach",
          id: "items",
          input: { items: { $ref: "state.tag" } },
          as: "row",
          steps: [{ id: "body", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "out" }],
        },
      ],
    }
    const result = await validateExecution(manifest, { capabilities: [echoCapability] })
    expect(result.issues.some((issue) => issue.code === "ECP_TYPE_MISMATCH")).toBe(true)
  })

  it("allows create inside a forEach body (unlike loops)", async () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      execution: {
        accepts: {
          type: "object",
          properties: { rows: { type: "array", items: { type: "string" } } },
          required: ["rows"],
        },
      },
      steps: [
        {
          type: "loop",
          mode: "forEach",
          id: "items",
          input: { items: { $ref: "state.rows" } },
          as: "row",
          steps: [
            {
              id: "body",
              uses: "@executioncontrolprotocol/test.echo",
              input: { value: "x" },
              as: "scratch",
              mode: "create",
            },
          ],
        },
      ],
    }
    const result = await validateExecution(manifest, { capabilities: [echoCapability] })
    expect(result.issues.filter((issue) => issue.severity === "error")).toEqual([])
  })

  it("flags unresolved items refs (L3)", async () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          mode: "forEach",
          id: "items",
          input: { items: { $ref: "state.missing" } },
          as: "row",
          steps: [{ id: "body", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "out" }],
        },
      ],
    }
    const result = await validateExecution(manifest, { capabilities: [echoCapability] })
    expect(result.issues.some((issue) => issue.code === "ECP_REF_UNRESOLVED")).toBe(true)
  })

  it("flags maybe refs to gated body exports inside the loop (L3)", async () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      execution: {
        accepts: {
          type: "object",
          properties: { rows: { type: "array", items: { type: "string" } } },
          required: ["rows"],
        },
      },
      steps: [
        {
          type: "loop",
          mode: "forEach",
          id: "items",
          input: { items: { $ref: "state.rows" } },
          as: "row",
          steps: [
            {
              type: "if",
              id: "gate",
              expression: "false",
              then: [{ id: "body", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "out" }],
            },
            {
              id: "use",
              uses: "@executioncontrolprotocol/test.echo",
              input: { value: { $ref: "state.out.echo" } },
            },
          ],
        },
      ],
    }
    const result = await validateExecution(manifest, { capabilities: [echoCapability] })
    expect(result.issues.some((issue) => issue.code === "ECP_REF_MAYBE_MISSING")).toBe(true)
  })

})
