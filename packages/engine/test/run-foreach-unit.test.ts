import { describe, expect, it } from "vitest"
import { executeForEach, type ExecuteForEachDeps, type ForEachRuntime } from "../src/execute/run-foreach.js"

function runtime(overrides: Partial<ForEachRuntime> = {}): ForEachRuntime {
  return {
    runId: "r",
    forEachDepth: 0,
    controller: new AbortController(),
    interrupted: false,
    completed: new Set(),
    cursor: { forEach: {} },
    deps: {},
    ...overrides,
  }
}

const deps: ExecuteForEachDeps = {
  runBody: async () => {},
  toIssue: (error) => ({
    code: "ECP_STEP_FAILED",
    severity: "error",
    message: error instanceof Error ? error.message : "failed",
    path: "",
  }),
}

describe("executeForEach unit", () => {
  it("rejects incomplete nodes", async () => {
    await expect(
      executeForEach({ id: "x" }, {}, runtime(), () => {}, "/steps/0", deps),
    ).rejects.toMatchObject({ code: "ECP_STEP_FAILED" })
  })

  it("rejects when into already exists", async () => {
    const state = { rows: [1], into: [] }
    await expect(
      executeForEach(
        {
          id: "f",
          items: { $ref: "state.rows" },
          as: "row",
          collect: { $ref: "state.row" },
          into: "into",
          steps: [],
        },
        state,
        runtime(),
        () => {},
        "/steps/0",
        deps,
      ),
    ).rejects.toMatchObject({ code: "ECP_COMMIT_CONFLICT" })
  })

  it("records continue errors in the partial file", async () => {
    let lastPartial: unknown
    const state = { rows: [1] }
    await executeForEach(
      {
        id: "f",
        items: { $ref: "state.rows" },
        as: "row",
        collect: { $ref: "state.row" },
        into: "collected",
        onError: "continue",
        steps: [],
      },
      state,
      runtime({
        deps: {
          store: {
            writeForEachPartial: async (_runId, _nodeId, file) => {
              lastPartial = file
            },
          },
        },
      }),
      () => {},
      "/steps/0",
      {
        ...deps,
        runBody: async () => {
          throw new Error("boom")
        },
      },
    )
    expect((lastPartial as { errors: unknown[] }).errors).toHaveLength(1)
    expect(state.collected).toEqual([null])
    expect(state.collectedErrors).toHaveLength(1)
  })

  it("loads existing partial results before starting items", async () => {
    const state = { rows: [1, 2] }
    let writes = 0
    await executeForEach(
      {
        id: "f",
        items: { $ref: "state.rows" },
        as: "row",
        collect: { $ref: "state.row" },
        into: "collected",
        concurrency: 1,
        steps: [],
      },
      state,
      runtime({
        deps: {
          store: {
            readForEachPartial: async () => ({ results: { "0": 1 }, errors: [] }),
            writeForEachPartial: async () => {
              writes += 1
            },
          },
        },
      }),
      () => {},
      "/steps/0",
      deps,
    )
    expect(writes).toBe(1)
    expect(state.collected).toEqual([1, 2])
  })

  it("does not write partial files for nested forEach nodes", async () => {
    let writes = 0
    const state: Record<string, unknown> = { rows: [1] }
    await executeForEach(
      {
        id: "inner",
        items: { $ref: "state.rows" },
        as: "row",
        collect: { $ref: "state.row" },
        into: "collected",
        steps: [],
      },
      state,
      runtime({
        forEachDepth: 1,
        deps: {
          store: {
            writeForEachPartial: async () => {
              writes += 1
            },
          },
        },
      }),
      () => {},
      "/steps/0",
      deps,
    )
    expect(writes).toBe(0)
    expect(state.collected).toEqual([1])
  })

  it("rejects when intoErrors already exists on continue", async () => {
    const state = { rows: [1] }
    await expect(
      executeForEach(
        {
          id: "f",
          items: { $ref: "state.rows" },
          as: "row",
          collect: { $ref: "state.row" },
          into: "collected",
          onError: "continue",
          steps: [],
        },
        { ...state, collectedErrors: [] },
        runtime(),
        () => {},
        "/steps/0",
        deps,
      ),
    ).rejects.toMatchObject({ code: "ECP_COMMIT_CONFLICT" })
  })

  it("skips committing into when interrupted mid-run", async () => {
    const state: Record<string, unknown> = { rows: [1, 2] }
    const rt = runtime()
    const emit = (): void => {
      rt.interrupted = true
    }
    await executeForEach(
      {
        id: "f",
        items: { $ref: "state.rows" },
        as: "row",
        collect: { $ref: "state.row" },
        into: "collected",
        concurrency: 1,
        steps: [],
      },
      state,
      rt,
      emit,
      "/steps/0",
      {
        ...deps,
        runBody: async () => {
          /* emit sets interrupted before second item */
        },
      },
    )
    expect(state.collected).toBeUndefined()
  })
})