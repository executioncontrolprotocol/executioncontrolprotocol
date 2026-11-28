import { describe, expect, it, vi } from "vitest"
import { openCanvasContextMenu, type CanvasContextTarget } from "../../src/web/lib/canvas-context-menu.js"

describe("openCanvasContextMenu", () => {
  const targets: Array<{ target: CanvasContextTarget; expect: "none" | "edge" | "node"; label: string }> = [
    { label: "pane", target: { kind: "pane" }, expect: "none" },
    { label: "edge", target: { kind: "edge" }, expect: "edge" },
    { label: "io", target: { kind: "io" }, expect: "none" },
    { label: "step", target: { kind: "node", nodeId: "a" }, expect: "node" },
    { label: "start node", target: { kind: "node", nodeId: "if-1" }, expect: "node" },
    { label: "end marker id", target: { kind: "node", nodeId: "end:loop-1:loop" }, expect: "node" },
  ]

  it.each(targets)("calls preventDefault and returns $expect for $label", ({ target, expect: expected }) => {
    const preventDefault = vi.fn()
    const kind = openCanvasContextMenu(target, { preventDefault })
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(kind).toBe(expected)
  })
})
