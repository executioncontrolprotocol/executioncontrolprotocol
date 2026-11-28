import type { ExecutionManifest, Node } from "@executioncontrolprotocol/protocol"
import { describe, expect, it } from "vitest"
import { loopDepthForStep, loopsCrossedBetween, typeLabelCrossingLoops } from "../../src/graph/loop-export-type.js"

function manifestOf(...steps: Node[]): ExecutionManifest {
  return { schema: "@executioncontrolprotocol.execution", version: "2.0", steps }
}

describe("loop export typing", () => {
  const nested: ExecutionManifest = manifestOf({
    type: "loop",
    id: "outer",
    mode: "forEach",
    as: "item",
    input: { items: [] },
    steps: [
      {
        type: "loop",
        id: "inner",
        mode: "for",
        as: "i",
        input: { count: 1 },
        steps: [{ id: "deep", uses: "@executioncontrolprotocol/test.echo", input: { value: "x" } }],
      },
    ],
  })

  it("loopDepthForStep counts enclosing loops", () => {
    expect(loopDepthForStep(nested, "deep")).toBeGreaterThanOrEqual(1)
    expect(loopDepthForStep(nested, "missing")).toBe(0)
  })

  it("loopsCrossedBetween is positive when the writer is deeper than the reader", () => {
    const withTail = manifestOf(
      {
        type: "loop",
        id: "L",
        mode: "forEach",
        as: "x",
        input: { items: [] },
        steps: [{ id: "body", uses: "@executioncontrolprotocol/test.echo", input: { value: "a" }, as: "body" }],
      },
      { id: "after", uses: "@executioncontrolprotocol/test.echo", input: { value: { $ref: "state.body" } } },
    )
    expect(loopsCrossedBetween(withTail, "after", "body")).toBe(1)
    expect(loopsCrossedBetween(withTail, "body", "after")).toBe(0)
  })

  it("typeLabelCrossingLoops appends [] per loop crossed", () => {
    expect(typeLabelCrossingLoops("Label", 0)).toBe("Label")
    expect(typeLabelCrossingLoops("Label", 1)).toBe("Label[]")
    expect(typeLabelCrossingLoops("Label", 2)).toBe("Label[][]")
  })
})