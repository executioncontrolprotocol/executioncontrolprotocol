import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import { EXECUTION_ACCEPTS_NODE_ID } from "../../src/graph/io-from-schema.js"
import { LOOP_ITEM_HANDLE, LOOP_INTO_HANDLE } from "../../src/graph/types.js"
import { sourceVisibleTo } from "../../src/graph/read-order.js"

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
          branches: [
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

  it("handles forEach item and into visibility", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          id: "rows",
          mode: "forEach",
          as: "row",
          into: "results",
          ref: "state.items",
          collect: "state.row",
          steps: [{ id: "body", uses: echo, input: { value: "v" }, as: "body" }],
        },
        { id: "after", uses: echo, input: { value: "x" }, as: "after" },
      ],
    }
    expect(sourceVisibleTo(manifest, { nodeId: "rows", handleId: LOOP_ITEM_HANDLE }, "body")).toBe(true)
    expect(sourceVisibleTo(manifest, { nodeId: "rows", handleId: LOOP_ITEM_HANDLE }, "after")).toBe(false)
    expect(sourceVisibleTo(manifest, { nodeId: "rows", handleId: LOOP_INTO_HANDLE }, "after")).toBe(true)
    expect(sourceVisibleTo(manifest, { nodeId: "body", handleId: "output" }, "after")).toBe(false)
  })

  it("refuses branch-arm cross reads", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "branch",
          id: "route",
          branches: [
            { expr: "(state) => true", steps: [{ id: "a", uses: echo, input: { value: "a" }, as: "a" }] },
            { steps: [{ id: "b", uses: echo, input: { value: "b" }, as: "b" }] },
          ],
        },
      ],
    }
    expect(sourceVisibleTo(manifest, { nodeId: "a", handleId: "output" }, "b")).toBe(false)
    expect(sourceVisibleTo(manifest, { nodeId: "b", handleId: "output" }, "a")).toBe(false)
  })

  it("allows a step inside a branch arm to read a step before the branch (engine L3 accepts it)", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        { id: "before", uses: echo, input: { value: "x" }, as: "before" },
        {
          type: "branch",
          id: "route",
          branches: [{ steps: [{ id: "inner", uses: echo, input: { value: "i" }, as: "inner" }] }],
        },
      ],
    }
    expect(sourceVisibleTo(manifest, { nodeId: "before", handleId: "output" }, "inner")).toBe(true)
  })

  it("refuses self reads", () => {
    const manifest = linear(["only"])
    expect(sourceVisibleTo(manifest, { nodeId: "only", handleId: "output" }, "only")).toBe(false)
  })

  it("allows a step after a while loop to read body output", () => {
    const manifest: ExecutionManifest = {
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [
        {
          type: "loop",
          id: "retry",
          expr: "(state) => true",
          steps: [{ id: "body", uses: echo, input: { value: "b" }, as: "body" }],
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
})
describe("sourceVisibleTo: reader nested deeper than the writer", () => {
  const step = (id: string) => ({ id, uses: "@executioncontrolprotocol/test.echo", as: id })
  const manifestWith = (structure: Record<string, unknown>, after: string[] = []): ExecutionManifest =>
    ({
      schema: "@executioncontrolprotocol.execution",
      version: "2.0",
      steps: [step("A"), structure, ...after.map(step)],
    }) as unknown as ExecutionManifest

  it("a step inside a while loop reads a step before the loop", () => {
    const m = manifestWith({ type: "loop", id: "L", mode: "while", expr: "(s) => false", maxRounds: 1, steps: [step("B")] })
    expect(sourceVisibleTo(m, { nodeId: "A", handleId: "output" }, "B")).toBe(true)
  })

  it("a step inside a branch arm reads a step before the branch", () => {
    const m = manifestWith({ type: "branch", id: "br", branches: [{ expr: "(s) => true", steps: [step("B")] }] })
    expect(sourceVisibleTo(m, { nodeId: "A", handleId: "output" }, "B")).toBe(true)
  })

  it("a step inside a parallel line reads a step before the parallel, not a sibling line", () => {
    const m = manifestWith({ type: "parallel", id: "p", branches: [[step("B")], [step("C")]] })
    expect(sourceVisibleTo(m, { nodeId: "A", handleId: "output" }, "B")).toBe(true)
    expect(sourceVisibleTo(m, { nodeId: "B", handleId: "output" }, "C")).toBe(false)
  })

  it("a step before a structure can't read a step inside it", () => {
    const m = manifestWith({ type: "loop", id: "L", mode: "while", expr: "(s) => false", maxRounds: 1, steps: [step("B")] })
    expect(sourceVisibleTo(m, { nodeId: "B", handleId: "output" }, "A")).toBe(false)
  })

  it("a step two levels deep reads a step before both structures", () => {
    const m = manifestWith({
      type: "loop",
      id: "L",
      mode: "while",
      expr: "(s) => false",
      maxRounds: 1,
      steps: [{ type: "branch", id: "br", branches: [{ expr: "(s) => true", steps: [step("B")] }] }],
    })
    expect(sourceVisibleTo(m, { nodeId: "A", handleId: "output" }, "B")).toBe(true)
  })
})
