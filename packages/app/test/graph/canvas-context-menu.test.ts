import { describe, expect, it, vi } from "vitest"
import { openCanvasContextMenu } from "../../src/web/lib/canvas-context-menu.js"

describe("openCanvasContextMenu", () => {
  const targets = [
    { kind: "pane" as const, expect: "none" as const },
    { kind: "edge" as const, expect: "none" as const },
    { kind: "io" as const, expect: "none" as const },
    { kind: "step" as const, stepId: "a", expect: "node" as const },
    { kind: "loop" as const, structureId: "loop-1", expect: "container" as const },
    { kind: "frame" as const, structureId: "branch-1", expect: "container" as const },
  ]

  it.each(targets)("calls preventDefault and returns $expect for $kind", (target) => {
    const preventDefault = vi.fn()
    const kind = openCanvasContextMenu(target, { preventDefault })
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(kind).toBe(target.expect)
  })
})