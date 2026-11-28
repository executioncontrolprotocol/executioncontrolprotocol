import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import { EXECUTION_ACCEPTS_NODE_ID } from "../../src/graph/io-from-schema.js"
import { LOOP_INDEX_HANDLE, LOOP_ITEM_HANDLE, PARALLEL_PATH_HANDLE_PREFIX } from "../../src/graph/types.js"
import { readerScope, sourceScope, sourceVisibleTo } from "../../src/graph/read-order.js"

const echo = "@executioncontrolprotocol/test.echo"

function linear(ids: string[]): ExecutionManifest {
  return {
    schema: "@executioncontrolprotocol.execution",
    version: "2.0",
    steps: ids.map((id, index) => ({ id, uses: echo, input: { value: String(index) }, as: id })),
  }
}

describe("sourceVisibleTo", () => {
  it("allows document-order reads and refuses backwards", () => {
    const manifest = linear(["A", "B"])
    expect(
      sourceVisibleTo(manifest, { nodeId: "A", handleId: "output" }, "B"),
    ).toBe(true)
    expect(
      sourceVisibleTo(manifest, { nodeId: "B", handleId: "output" }, "A"),
    ).toBe(false)
  })

  it("refuses parallel siblings and allows later steps", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "parallel",
          id: "p",
          paths: [
            [{ id: "a", uses: echo, input: { value: "a" }, as: "a" }],
            [{ id: "b", uses: echo, input: { value: "b" }, as: "b" }],
          ],
        },
        { id: "after", uses: echo, input: { value: "x" }, as: "after" },
      ],
    }
    expect(sourceVisibleTo(manifest, { nodeId: "a", handleId: "output" }, "b")).toBe(false)
    expect(sourceVisibleTo(manifest, { nodeId: "b", handleId: "output" }, "a")).toBe(false)
    expect(sourceVisibleTo(manifest, { nodeId: "a", handleId: "output" }, "after")).toBe(true)
  })

  it("handles forEach item visibility and body output after the loop", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          id: "rows",
          mode: "forEach",
          as: "row",
          input: { items: { $ref: "state.items" } },
          steps: [{ id: "body", uses: echo, input: { value: "v" }, as: "body" }],
        },
        { id: "after", uses: echo, input: { value: "x" }, as: "after" },
      ],
    }
    expect(sourceVisibleTo(manifest, { nodeId: "rows", handleId: LOOP_ITEM_HANDLE }, "body")).toBe(true)
    expect(sourceVisibleTo(manifest, { nodeId: "rows", handleId: LOOP_ITEM_HANDLE }, "after")).toBe(false)
    expect(sourceVisibleTo(manifest, { nodeId: "body", handleId: "output" }, "after")).toBe(true)
  })

  it("refuses if-side cross reads", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "if",
          id: "pick",
          expression: "true",
          then: [{ id: "a", uses: echo, input: { value: "a" }, as: "a" }],
          else: [{ id: "b", uses: echo, input: { value: "b" }, as: "b" }],
        },
      ],
    }
    expect(sourceVisibleTo(manifest, { nodeId: "a", handleId: "output" }, "b")).toBe(false)
    expect(sourceVisibleTo(manifest, { nodeId: "b", handleId: "output" }, "a")).toBe(false)
  })

  it("allows a step inside an if side to read a step before the if (engine L3 accepts it)", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        { id: "before", uses: echo, input: { value: "x" }, as: "before" },
        {
          type: "if",
          id: "pick",
          expression: "true",
          then: [{ id: "inner", uses: echo, input: { value: "i" }, as: "inner" }],
        },
      ],
    }
    expect(sourceVisibleTo(manifest, { nodeId: "before", handleId: "output" }, "inner")).toBe(true)
  })

  it("refuses self reads", () => {
    const manifest = linear(["only"])
    expect(sourceVisibleTo(manifest, { nodeId: "only", handleId: "output" }, "only")).toBe(false)
  })

  it("allows a step after a for loop to read the last body output", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          id: "retry",
          mode: "for",
          as: "i",
          input: { count: 2 },
          steps: [{ id: "body", uses: echo, input: { value: "b" }, as: "body", mode: "replace" }],
        },
        { id: "after", uses: echo, input: { value: "a" }, as: "after" },
      ],
    }
    expect(sourceVisibleTo(manifest, { nodeId: "body", handleId: "output" }, "after")).toBe(true)
  })

  it("exposes accepts to every step", () => {
    const manifest = linear(["only"])
    expect(
      sourceVisibleTo(manifest, { nodeId: EXECUTION_ACCEPTS_NODE_ID, handleId: "prompt" }, "only"),
    ).toBe(true)
  })

  it("refuses missing writers and targets", () => {
    const manifest = linear(["A"])
    expect(sourceVisibleTo(manifest, { nodeId: "ghost", handleId: "output" }, "A")).toBe(false)
    expect(sourceVisibleTo(manifest, { nodeId: "A", handleId: "output" }, "ghost")).toBe(false)
  })

  it("allows for-loop index inside body but not after the loop", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          id: "rounds",
          mode: "for",
          input: { count: { $ref: "state.n" } },
          as: "i",
          steps: [{ id: "body", uses: echo, input: { value: "b" }, as: "body" }],
        },
        { id: "after", uses: echo, input: { value: "a" }, as: "after" },
      ],
    }
    expect(sourceVisibleTo(manifest, { nodeId: "rounds", handleId: LOOP_INDEX_HANDLE }, "body")).toBe(true)
    expect(sourceVisibleTo(manifest, { nodeId: "rounds", handleId: LOOP_INDEX_HANDLE }, "after")).toBe(false)
  })
})
describe("sourceVisibleTo: reader nested deeper than the writer", () => {
  const step = (id: string) => ({ id, uses: "@executioncontrolprotocol/test.echo", as: id })
  const manifestWith = (structure: Record<string, unknown>, after: string[] = []): ExecutionManifest =>
    ({
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [step("A"), structure, ...after.map(step)],
    }) as unknown as ExecutionManifest

  it("a step inside a for loop reads a step before the loop", () => {
    const m = manifestWith({
      type: "loop",
      id: "L",
      mode: "for",
      as: "i",
      input: { count: 1 },
      steps: [step("B")],
    })
    expect(sourceVisibleTo(m, { nodeId: "A", handleId: "output" }, "B")).toBe(true)
  })

  it("a step inside an if side reads a step before the if", () => {
    const m = manifestWith({ type: "if", id: "br", expression: "true", then: [step("B")] })
    expect(sourceVisibleTo(m, { nodeId: "A", handleId: "output" }, "B")).toBe(true)
  })

  it("a step inside a parallel path reads a step before the parallel, not a sibling path", () => {
    const m = manifestWith({ type: "parallel", id: "p", paths: [[step("B")], [step("C")]] })
    expect(sourceVisibleTo(m, { nodeId: "A", handleId: "output" }, "B")).toBe(true)
    expect(sourceVisibleTo(m, { nodeId: "B", handleId: "output" }, "C")).toBe(false)
  })

  it("a step before a structure can't read a step inside it", () => {
    const m = manifestWith({
      type: "loop",
      id: "L",
      mode: "for",
      as: "i",
      input: { count: 1 },
      steps: [step("B")],
    })
    expect(sourceVisibleTo(m, { nodeId: "B", handleId: "output" }, "A")).toBe(false)
  })

  it("a step two containers deep reads a step before both structures", () => {
    const m = manifestWith({
      type: "loop",
      id: "L",
      mode: "for",
      as: "i",
      input: { count: 1 },
      steps: [
        { type: "if", id: "br", expression: "true", then: [step("B")] },
      ],
    })
    expect(sourceVisibleTo(m, { nodeId: "A", handleId: "output" }, "B")).toBe(true)
  })
})

describe("readerScope", () => {
  it("returns the else side for a nested if reader", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "if",
          id: "outer",
          expression: "false",
          then: [],
          else: [
            {
              type: "if",
              id: "inner",
              expression: "true",
              then: [{ id: "leaf", uses: echo, input: { value: 1 }, as: "leaf" }],
            },
          ],
        },
      ],
    }
    const scope = readerScope(manifest, "inner")
    expect(scope?.some((segment) => segment.id === "outer" && segment.side === "else")).toBe(true)
  })

  it("returns undefined for an unknown reader", () => {
    expect(readerScope({ steps: [] }, "missing")).toBeUndefined()
  })
})

describe("sourceScope", () => {
  it("returns a parallel path scope for path output ports", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "parallel",
          id: "p",
          paths: [[{ id: "a", uses: echo, input: { value: 1 }, as: "a" }], [{ id: "b", uses: echo, input: { value: 2 }, as: "b" }]],
        },
      ],
    }
    const scope = sourceScope(manifest, { nodeId: "p", handleId: `${PARALLEL_PATH_HANDLE_PREFIX}1` })
    expect(scope?.some((segment) => segment.kind === "parallel" && segment.index === 0)).toBe(true)
  })

  it("returns undefined for non-tunnel handles on controls", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [{ type: "if", id: "g", expression: "true", then: [] }],
    }
    expect(sourceScope(manifest, { nodeId: "g", handleId: "not-a-port" })).toBeUndefined()
  })
})