import { describe, expect, it, vi } from "vitest"
import {
  canFitCanvasViewport,
  FIT_VIEW_MIN_EDGE_PX,
  focusCanvasPane,
  type CanvasFocusRoot,
} from "../src/ui/lib/fit-canvas.js"

function rootWithPane(pane: { focus: ReturnType<typeof vi.fn> } | null): CanvasFocusRoot {
  return {
    querySelector: (selectors: string) => (selectors === ".react-flow" ? pane : null),
  }
}

describe("canFitCanvasViewport", () => {
  it("allows fit when the pane is measured and the graph has nodes", () => {
    expect(canFitCanvasViewport(480, 320, 3)).toBe(true)
  })

  it("rejects an empty graph or an unmeasured pane", () => {
    expect(canFitCanvasViewport(480, 320, 0)).toBe(false)
    expect(canFitCanvasViewport(0, 320, 2)).toBe(false)
    expect(canFitCanvasViewport(480, 0, 2)).toBe(false)
  })

  it("rejects a pane smaller than the minimum edge and accepts the boundary", () => {
    const under = FIT_VIEW_MIN_EDGE_PX - 1
    expect(canFitCanvasViewport(under, 400, 1)).toBe(false)
    expect(canFitCanvasViewport(400, under, 1)).toBe(false)
    expect(canFitCanvasViewport(FIT_VIEW_MIN_EDGE_PX, FIT_VIEW_MIN_EDGE_PX, 1)).toBe(true)
  })
})

describe("focusCanvasPane", () => {
  it("focuses the React Flow pane without scrolling", () => {
    const focus = vi.fn()
    expect(focusCanvasPane(rootWithPane({ focus }))).toBe(true)
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it("returns false when the root or pane is missing", () => {
    expect(focusCanvasPane(null)).toBe(false)
    expect(focusCanvasPane(undefined)).toBe(false)
    expect(focusCanvasPane(rootWithPane(null))).toBe(false)
  })

  it("ignores other selectors besides the React Flow root", () => {
    const focus = vi.fn()
    const root: CanvasFocusRoot = {
      querySelector: (selectors: string) =>
        selectors === ".react-flow__pane" ? { focus } : null,
    }
    expect(focusCanvasPane(root)).toBe(false)
    expect(focus).not.toHaveBeenCalled()
  })
})
