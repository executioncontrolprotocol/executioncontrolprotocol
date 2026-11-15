/** Allow the graph to shrink into a narrow split pane. @category App */
export const CANVAS_MIN_ZOOM = 0.15

/** Skip fit until the pane has a real size (flex layout can be 0 on first paint). @category App */
export const FIT_VIEW_MIN_EDGE_PX = 32

/** Shared React Flow `fitView` options for load, reload, and pane resize. @category App */
export const CANVAS_FIT_VIEW_OPTIONS = {
  padding: 0.16,
  duration: 0,
  minZoom: CANVAS_MIN_ZOOM,
} as const

/** Minimal DOM root used to focus the React Flow pane. @category App */
export interface CanvasFocusRoot {
  /** Query a descendant, matching `ParentNode.querySelector`. */
  querySelector(selectors: string): CanvasFocusTarget | null
}

/** Focusable pane target. @category App */
export interface CanvasFocusTarget {
  /** Focus the pane without scrolling the page. */
  focus(options?: FocusOptions): void
}

/**
 * True when the canvas has nodes and a measured pane large enough to frame them.
 * @category App
 */
export function canFitCanvasViewport(
  width: number,
  height: number,
  nodeCount: number
): boolean {
  if (nodeCount <= 0) return false
  if (width < FIT_VIEW_MIN_EDGE_PX || height < FIT_VIEW_MIN_EDGE_PX) return false
  return true
}

/**
 * Focus the React Flow pane so keyboard shortcuts work after load or reload.
 * Returns whether `focus` was called.
 * @category App
 */
export function focusCanvasPane(root: CanvasFocusRoot | null | undefined): boolean {
  const pane = root?.querySelector(".react-flow")
  if (!pane) return false
  pane.focus({ preventScroll: true })
  return true
}
