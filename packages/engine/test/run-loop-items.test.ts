import { afterEach, beforeAll, describe, expect, it } from "vitest"
import type { CapabilityCall, ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { MAX_LOOP_ITEMS } from "@executioncontrolprotocol/protocol"
import { QuickJsExpressionEngine as EngineImpl } from "../../quickjs/src/index.js"
import { awaitTestDelay, resetDelayForTests } from "../../../plugins/plugin-test/src/capabilities/delay-hooks.js"
import { defaultRunClock } from "../src/execute/run-loop-items.js"
import { runExecution, startExecution, validateExecution, type StateStore } from "../src/index.js"
import { MemoryStorage } from "../src/testing/index.js"
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
  return {
    schema: "@executioncontrolprotocol.execution",
    version: "2.0",
    steps: [
      {
        type: "loop",
        mode: "forEach",
        id: "items",
        ref: "state.rows",
        as: "row",
        concurrency: 2,
        steps: [
          {
            id: "body",
            uses: "@executioncontrolprotocol/test.echo",
            input: { value: { "$ref": "state.row" } },
            as: "out",
          },
        ],
        collect: "state.out",
        into: "collected",
        ...extra,
      } as ExecutionManifest["steps"][0],
    ],
  }
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
    expect(outcome.state.collected).toEqual([
      { echo: "a" },
      { echo: "b" },
      { echo: "c" },
    ])
    expect(outcome.events).toContain("loop.start")
    expect(outcome.events).toContain("loop.end")
  })

  it("commits empty into for an empty items array", async () => {
    const outcome = await runExecution(foreachManifest(), { rows: [] }, {
      capabilities: [echoCapability],
      expression: engine,
      call: echoCall,
    })
    expect(outcome.status).toBe("completed")
    expect(outcome.state.collected).toEqual([])
  })

  it("resolves items from expr when ref is omitted", async () => {
    const outcome = await runExecution(
      foreachManifest({ ref: undefined, expr: "(state) => state.rows" }),
      { rows: ["x", "y"] },
      { capabilities: [echoCapability], expression: engine, call: echoCall },
    )
    expect(outcome.status).toBe("completed")
    expect(outcome.state.collected).toEqual([{ echo: "x" }, { echo: "y" }])
  })

  it("fails when expr does not return an array", async () => {
    const outcome = await runExecution(
      foreachManifest({ ref: undefined, expr: "() => 1" }),
      {},
      { capabilities: [echoCapability], expression: engine, call: echoCall },
    )
    expect(outcome.status).toBe("failed")
    expect(outcome.error?.code).toBe("ECP_TYPE_MISMATCH")
  })

  it("commits empty intoErrors for an empty array when onError is continue", async () => {
    const outcome = await runExecution(foreachManifest({ onError: "continue" }), { rows: [] }, {
      capabilities: [echoCapability],
      expression: engine,
      call: echoCall,
    })
    expect(outcome.state.collectedErrors).toEqual([])
  })

  it("fails when items is not an array at run time", async () => {
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
          ref: "state.rows",
          as: "row",
          concurrency: 3,
          onError: "fail",
          steps: [
            {
              id: "body",
              uses: "@executioncontrolprotocol/test.fail",
              input: { message: { "$ref": "state.row" } },
            },
          ],
          collect: "state.row",
          into: "collected",
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

  it("onError continue records null and intoErrors", async () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          mode: "forEach",
          id: "items",
          ref: "state.rows",
          as: "row",
          concurrency: 1,
          onError: "continue",
          steps: [
            {
              id: "body",
              uses: "@executioncontrolprotocol/test.fail",
              expr: "(state) => state.row !== 1",
              input: { message: "bad" },
              as: "out",
            },
            {
              id: "ok",
              uses: "@executioncontrolprotocol/test.echo",
              expr: "(state) => state.row === 1",
              input: { value: { "$ref": "state.row" } },
              as: "out",
            },
          ],
          collect: "state.out",
          into: "collected",
        },
      ],
    }
    const outcome = await runExecution(manifest, { rows: [0, 1, 2] }, {
      capabilities: [
        echoCapability,
        { ...echoCapability, id: "@executioncontrolprotocol/test.fail" },
      ],
      expression: engine,
      call: echoCall,
    })
    expect(outcome.status).toBe("completed")
    expect(outcome.state.collected).toEqual([null, { echo: 1 }, null])
    expect(Array.isArray(outcome.state.collectedErrors)).toBe(true)
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
          ref: "state.rows",
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
          collect: "state.out",
          into: "collected",
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
    expect(Object.keys(partial?.results ?? {}).sort()).toEqual(["0", "1", "2", "3"])
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
          ref: "state.rows",
          as: "shared",
          steps: [{ id: "body", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "out" }],
          collect: "state.out",
          into: "collected",
        },
      ],
    }
    const result = await validateExecution(manifest, { capabilities: [echoCapability] })
    expect(result.issues.some((issue) => issue.code === "ECP_COMMIT_CONFLICT")).toBe(true)
  })

  it("cancel stops in-flight items and does not commit into", async () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          mode: "forEach",
          id: "items",
          ref: "state.rows",
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
          collect: "state.out",
          into: "collected",
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
    expect(outcome.state.collected).toBeUndefined()
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
      results: { "0": { echo: "a" } },
      errors: [],
    })
    const outcome = await runExecution(foreachManifest(), { rows: ["a", "b"] }, {
      capabilities: [echoCapability],
      expression: engine,
      call: echoCall,
      store: storage.runs,
      runId: "r-resume",
      cursor: { completed: [], loops: {}, branches: {}, loopItems: { items: { completed: [0] } } },
    })
    expect(outcome.status).toBe("completed")
    expect(outcome.state.collected).toEqual([{ echo: "a" }, { echo: "b" }])
  })

  it("rejects duplicate into (L3)", async () => {
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
          ref: "state.rows",
          as: "row",
          steps: [{ id: "body", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "out" }],
          collect: "state.out",
          into: "rows",
        },
      ],
    }
    const result = await validateExecution(manifest, { capabilities: [echoCapability] })
    expect(result.issues.some((issue) => issue.code === "ECP_COMMIT_CONFLICT" && issue.path?.endsWith("/into"))).toBe(
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
          ref: "state.rows",
          as: "row",
          concurrency: 2,
          steps: [
            {
              type: "loop",
              mode: "forEach",
              id: "inner",
              ref: "state.row.parts",
              as: "part",
              steps: [
                {
                  id: "echo",
                  uses: "@executioncontrolprotocol/test.echo",
                  input: { value: { "$ref": "state.part" } },
                  as: "piece",
                },
              ],
              collect: "state.piece",
              into: "partsOut",
            },
          ],
          collect: "state.partsOut",
          into: "bundles",
        },
      ],
    }
    const outcome = await runExecution(
      manifest,
      { rows: [{ parts: ["a", "b"] }, { parts: ["c"] }] },
      { capabilities: [echoCapability], expression: engine, call: echoCall },
    )
    expect(outcome.status).toBe("completed")
    expect(outcome.state.bundles).toHaveLength(2)
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
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          mode: "forEach",
          id: "items",
          ref: "state.rows",
          as: "row",
          concurrency: 1,
          steps: [
            {
              type: "loop",
              id: "inner",
              expr: "(state) => state.tick === undefined",
              maxRounds: 1,
              steps: [
                {
                  id: "tick",
                  uses: "@executioncontrolprotocol/test.echo",
                  input: { value: "t" },
                  as: "tick",
                  mode: "replace",
                },
              ],
            },
          ],
          collect: "state.tick",
          into: "collected",
        },
      ],
    }
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
    expect(step?.round).toBe(0)
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
          ref: "state.rows",
          as: "row",
          concurrency: 2,
          steps: [
            {
              type: "loop",
              id: "inner",
              expr: "(state) => state.tick === undefined",
              maxRounds: 1,
              steps: [
                {
                  id: "tick",
                  uses: "@executioncontrolprotocol/test.echo",
                  input: { value: { "$ref": "state.row" } },
                  as: "tick",
                  mode: "replace",
                },
              ],
            },
          ],
          collect: "state.tick",
          into: "collected",
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
    expect(outcome.state.collected).toEqual([{ echo: "a" }, { echo: "b" }])
    expect(written.length).toBeGreaterThan(0)
    for (const state of written) {
      expect(state).not.toHaveProperty("row")
      expect(state).not.toHaveProperty("tick")
    }
    expect(outcome.cursor?.loops).not.toHaveProperty("inner")
    expect(outcome.cursor?.completed).not.toContain("tick")
  })

  it("restarts an unfinished item from its first step, ignoring the previous run's loop cursor", async () => {
    const outcome = await runExecution(loopInItemManifest(), { rows: ["a"] }, {
      capabilities: [echoCapability],
      expression: engine,
      call: echoCall,
      cursor: { completed: [], inProgress: "tick", loops: { inner: 5 }, branches: {}, loopItems: {} },
    })
    expect(outcome.status).toBe("completed")
    expect(outcome.state.collected).toEqual([{ echo: "a" }])
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
          ref: "state.rows",
          as: "row",
          steps: [
            {
              type: "loop",
              id: "inner",
              expr: "(state) => false",
              maxRounds: 1,
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
          collect: "state.scratch",
          into: "collected",
        },
      ],
    }
    const result = await validateExecution(manifest, { capabilities: [echoCapability] })
    expect(result.issues.some((issue) => issue.code === "ECP_COMMIT_CONFLICT" && issue.path?.endsWith("/mode"))).toBe(
      true,
    )
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
          ref: "state.tag",
          as: "row",
          steps: [{ id: "body", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "out" }],
          collect: "state.out",
          into: "collected",
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
          ref: "state.rows",
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
          collect: "state.scratch",
          into: "collected",
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
          ref: "state.missing",
          as: "row",
          steps: [{ id: "body", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "out" }],
          collect: "state.out",
          into: "collected",
        },
      ],
    }
    const result = await validateExecution(manifest, { capabilities: [echoCapability] })
    expect(result.issues.some((issue) => issue.code === "ECP_REF_UNRESOLVED")).toBe(true)
  })

  it("rejects duplicate intoErrors when onError is continue (L3)", async () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      execution: {
        accepts: {
          type: "object",
          properties: { collectedErrors: { type: "array", items: { type: "object" } } },
          required: ["collectedErrors"],
        },
      },
      steps: [
        {
          type: "loop",
          mode: "forEach",
          id: "items",
          ref: "state.rows",
          as: "row",
          onError: "continue",
          steps: [{ id: "body", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" }, as: "out" }],
          collect: "state.out",
          into: "collected",
        },
      ],
    }
    const result = await validateExecution(manifest, {
      capabilities: [echoCapability],
    })
    expect(
      result.issues.some(
        (issue) => issue.code === "ECP_COMMIT_CONFLICT" && String(issue.message).includes("collectedErrors"),
      ),
    ).toBe(true)
  })

  it("flags gated collect refs at validation (L3)", async () => {
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
          ref: "state.rows",
          as: "row",
          steps: [
            {
              id: "body",
              expr: "(state) => false",
              uses: "@executioncontrolprotocol/test.echo",
              input: { value: "x" },
              as: "out",
            },
          ],
          collect: "state.out",
          into: "collected",
        },
      ],
    }
    const result = await validateExecution(manifest, { capabilities: [echoCapability] })
    expect(result.issues.some((issue) => issue.code === "ECP_REF_MAYBE_MISSING")).toBe(true)
  })

})