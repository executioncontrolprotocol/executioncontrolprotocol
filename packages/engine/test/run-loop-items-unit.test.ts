import { beforeAll, describe, expect, it } from "vitest"
import { QuickJsExpressionEngine } from "../../quickjs/src/index.js"
import { executeLoopItems, type ExecuteLoopItemsDeps, type LoopItemsRuntime } from "../src/execute/run-loop-items.js"

const engine = new QuickJsExpressionEngine()

beforeAll(async () => {
  await engine.start()
})

function runtime(overrides: Partial<LoopItemsRuntime> = {}): LoopItemsRuntime {
  return {
    runId: "r",
    loopItemsDepth: 0,
    controller: new AbortController(),
    interrupted: false,
    completed: new Set(),
    cursor: { loopItems: {} },
    deps: { expression: engine },
    ...overrides,
  }
}

const baseNode = {
  id: "f",
  mode: "forEach" as const,
  input: { items: { $ref: "state.rows" } },
  as: "row",
  steps: [{ id: "body", uses: "@executioncontrolprotocol/test.echo", input: { value: { $ref: "state.row" } }, as: "out" }],
}

const deps: ExecuteLoopItemsDeps = {
  runBody: async (_steps, itemState) => {
    itemState.out = { echo: itemState.row }
  },
  toIssue: (error) => ({
    code: "ECP_STEP_FAILED",
    severity: "error",
    message: error instanceof Error ? error.message : "failed",
    path: "",
  }),
}

describe("executeLoopItems unit", () => {
  it("rejects incomplete nodes", async () => {
    await expect(executeLoopItems({ id: "x" }, {}, runtime(), () => {}, "/steps/0", deps)).rejects.toMatchObject({
      code: "ECP_STEP_FAILED",
    })
  })

  it("rejects when a body export key already exists in the parent", async () => {
    const state = { rows: [1], out: [] }
    await expect(executeLoopItems(baseNode, state, runtime(), () => {}, "/steps/0", deps)).rejects.toMatchObject({
      code: "ECP_COMMIT_CONFLICT",
    })
  })

  it("records continue errors in the partial file", async () => {
    let lastPartial: unknown
    const state = { rows: [1] }
    await executeLoopItems(
      { ...baseNode, onError: "continue" },
      state,
      runtime({
        deps: {
          expression: engine,
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
    expect(state.out).toEqual([null])
  })

  it("loads existing partial rounds before starting items", async () => {
    const state = { rows: [1, 2] }
    let writes = 0
    await executeLoopItems(
      baseNode,
      state,
      runtime({
        deps: {
          expression: engine,
          store: {
            readLoopPartial: async () => ({ rounds: { "0": { out: 1 } }, errors: [] }),
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
    expect(state.out).toEqual([1, { echo: 2 }])
  })

  it("does not write partial files for nested forEach nodes", async () => {
    let writes = 0
    const state: Record<string, unknown> = { rows: [1] }
    await executeLoopItems(
      baseNode,
      state,
      runtime({
        loopItemsDepth: 1,
        deps: {
          expression: engine,
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
    expect(state.out).toEqual([{ echo: 1 }])
  })

  it("skips committing body arrays when interrupted mid-run", async () => {
    const state: Record<string, unknown> = { rows: [1, 2] }
    const rt = runtime()
    const emit = (): void => {
      rt.interrupted = true
    }
    await executeLoopItems(
      { ...baseNode, concurrency: 1 },
      state,
      rt,
      emit,
      "/steps/0",
      {
        ...deps,
        runBody: async () => {},
      },
    )
    expect(state.out).toBeUndefined()
  })
})