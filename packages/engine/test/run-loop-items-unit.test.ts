import { describe, expect, it } from "vitest"
import { executeLoopItems, type ExecuteForEachDeps, type LoopItemsRuntime } from "../src/execute/run-loop-items.js"

function runtime(overrides: Partial<LoopItemsRuntime> = {}): LoopItemsRuntime {
  return {
    runId: "r",
    loopItemsDepth: 0,
    controller: new AbortController(),
    interrupted: false,
    completed: new Set(),
    cursor: { loopItems: {} },
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

describe("executeLoopItems unit", () => {
  it("rejects incomplete nodes", async () => {
    await expect(
      executeLoopItems({ id: "x" }, {}, runtime(), () => {}, "/steps/0", deps),
    ).rejects.toMatchObject({ code: "ECP_STEP_FAILED" })
  })

  it("rejects when into already exists", async () => {
    const state = { rows: [1], into: [] }
    await expect(
      executeLoopItems(
        {
          id: "f",
          ref: "state.rows",
          as: "row",
          collect: "state.row",
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
    await executeLoopItems(
      {
        id: "f",
        ref: "state.rows",
        as: "row",
        collect: "state.row",
        into: "collected",
        onError: "continue",
        steps: [],
      },
      state,
      runtime({
        deps: {
          store: {
            writeLoopPartial: async (_runId, _nodeId, file) => {
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
    await executeLoopItems(
      {
        id: "f",
        ref: "state.rows",
        as: "row",
        collect: "state.row",
        into: "collected",
        concurrency: 1,
        steps: [],
      },
      state,
      runtime({
        deps: {
          store: {
            readLoopPartial: async () => ({ results: { "0": 1 }, errors: [] }),
            writeLoopPartial: async () => {
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
    await executeLoopItems(
      {
        id: "inner",
        ref: "state.rows",
        as: "row",
        collect: "state.row",
        into: "collected",
        steps: [],
      },
      state,
      runtime({
        loopItemsDepth: 1,
        deps: {
          store: {
            writeLoopPartial: async () => {
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
      executeLoopItems(
        {
          id: "f",
          ref: "state.rows",
          as: "row",
          collect: "state.row",
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
    await executeLoopItems(
      {
        id: "f",
        ref: "state.rows",
        as: "row",
        collect: "state.row",
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