/**
 * Graph canvas context-menu target. Containers are drawn only; they are never a target.
 * @category App
 */
export type CanvasContextTarget =
  | { kind: "pane" }
  | { kind: "edge" }
  | { kind: "io" }
  | { kind: "node"; nodeId: string }

/**
 * Menu kind returned by the dispatcher (or none).
 * @category App
 */
export type CanvasContextMenuKind = "node" | "edge" | "none"

/**
 * Prevent the browser menu and return which App menu should open.
 * @category App
 */
export function openCanvasContextMenu(
  target: CanvasContextTarget,
  event: { preventDefault: () => void },
): CanvasContextMenuKind {
  event.preventDefault()
  if (target.kind === "node") return "node"
  if (target.kind === "edge") return "edge"
  return "none"
}
