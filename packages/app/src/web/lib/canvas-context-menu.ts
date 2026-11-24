/**
 * Graph canvas context-menu target.
 * @category App
 */
export type CanvasContextTarget =
  | { kind: "pane" }
  | { kind: "edge" }
  | { kind: "io" }
  | { kind: "step"; stepId: string }
  | { kind: "loop"; structureId: string }
  | { kind: "frame"; structureId: string }

/**
 * Menu kind returned by the dispatcher (or none).
 * @category App
 */
export type CanvasContextMenuKind = "node" | "container" | "none"

/**
 * Prevent the browser menu and return which App menu should open.
 * @category App
 */
export function openCanvasContextMenu(
  target: CanvasContextTarget,
  event: { preventDefault: () => void },
): CanvasContextMenuKind {
  event.preventDefault()
  if (target.kind === "step") return "node"
  if (target.kind === "loop" || target.kind === "frame") return "container"
  return "none"
}