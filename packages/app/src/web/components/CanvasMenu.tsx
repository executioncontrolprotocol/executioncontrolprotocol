import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import type { ReactFlowEdge } from "../../graph/index.js"
import type { AddStepPlacement } from "../../graph/index.js"
import {
  connectorDeletePreview,
  findStructure,
  isEndNodeSelection,
  unwrapStructure,
  wrapSelectionIds,
  wrapSteps,
} from "../../graph/index.js"

/**
 * What a canvas menu is open on: a node (step, start node or loop end) or a branch.
 * @category App
 */
export type CanvasMenuState =
  | {
      kind: "node"
      nodeId: string
      clientX: number
      clientY: number
    }
  | {
      kind: "edge"
      edgeId: string
      clientX: number
      clientY: number
    }

interface CanvasMenuProps {
  state: CanvasMenuState
  readOnly: boolean
  manifest: ExecutionManifest
  selectedStepIds: readonly string[]
  edges: readonly ReactFlowEdge[]
  onClose: () => void
  onConfigure: () => void
  onWrap: (kind: "if" | "parallel" | "loop") => void
  /** Delete the node: a step is removed, a start node is removed and its nodes stay. */
  onDelete: () => void
  /** Delete a start node together with the nodes inside it. */
  onDeleteWithNodes: () => void
  onDeleteConnector: () => void
  /** Open the capability menu for a new step at this placement. */
  onOpenCapabilityMenu?: (clientX: number, clientY: number, placement: AddStepPlacement) => void
  /** Append an empty path on a parallel without opening the capability menu. */
  onAppendEmptyPath?: (parallelId: string) => void
}

interface MenuItem {
  id: string
  label: string
  action?: () => void
  submenu?: "wrap"
  disabled?: boolean
  title?: string
}

type Submenu = "wrap" | undefined

/** Room the submenu flyout needs beside the menu (its min width plus the gap). */
const SUBMENU_FLYOUT_WIDTH = 168

/**
 * Cursor-positioned canvas context menu for nodes and branches. Submenus open as a flyout beside the menu, so the item
 * under the pointer never changes.
 * @category App
 */
export function CanvasMenu({
  state,
  readOnly,
  manifest,
  selectedStepIds,
  onClose,
  onConfigure,
  onWrap,
  onDelete,
  onDeleteWithNodes,
  onDeleteConnector,
  edges,
  onOpenCapabilityMenu,
  onAppendEmptyPath,
}: CanvasMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [submenu, setSubmenu] = useState<Submenu>(undefined)
  /** Open the submenu flyout on the left when there's no room for it on the right inside the canvas. */
  const [flyoutLeft, setFlyoutLeft] = useState(false)
  const [focusIndex, setFocusIndex] = useState(0)
  const [pos, setPos] = useState({ left: state.clientX, top: state.clientY })

  const nodeId = state.kind === "node" ? state.nodeId : undefined
  const isEnd = nodeId !== undefined && isEndNodeSelection(manifest, nodeId)
  const structure = nodeId !== undefined && !isEnd ? findStructure(manifest, nodeId) : undefined

  const wrapIds = nodeId !== undefined && !isEnd ? wrapSelectionIds(selectedStepIds, nodeId) : ([] as string[])
  const wrapIf = wrapIds.length > 0 ? wrapSteps(manifest, wrapIds, "if") : undefined
  const wrapParallel = wrapIds.length > 0 ? wrapSteps(manifest, wrapIds, "parallel") : undefined
  const wrapLoop = wrapIds.length > 0 ? wrapSteps(manifest, wrapIds, "loop") : undefined

  const layoutMenu = useCallback(() => {
    const canvas = document.querySelector('[data-testid="graph-canvas"]')
    const menu = rootRef.current
    if (!(canvas instanceof HTMLElement) || !menu) return
    const bounds = canvas.getBoundingClientRect()
    const rect = menu.getBoundingClientRect()
    let left = state.clientX
    let top = state.clientY
    if (left + rect.width > bounds.right) left = bounds.right - rect.width - 4
    if (top + rect.height > bounds.bottom) top = bounds.bottom - rect.height - 4
    if (left < bounds.left) left = bounds.left + 4
    if (top < bounds.top) top = bounds.top + 4
    setPos({ left, top })
    setFlyoutLeft(left + rect.width + SUBMENU_FLYOUT_WIDTH > bounds.right)
  }, [state.clientX, state.clientY])

  useLayoutEffect(() => {
    layoutMenu()
  }, [layoutMenu, submenu, readOnly, state.kind])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (rootRef.current?.contains(target as Node)) return
      onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (submenu) setSubmenu(undefined)
        else onClose()
      }
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true)
      document.removeEventListener("keydown", onKey)
    }
  }, [onClose, submenu])

  const edgeRecord = state.kind === "edge" ? edges.find((edge) => edge.id === state.edgeId) : undefined
  const deletePreview =
    state.kind === "edge" && edgeRecord
      ? connectorDeletePreview(manifest, edgeRecord)
      : { ok: false as const, reason: "" }

  const open = (placement: AddStepPlacement) => () => onOpenCapabilityMenu?.(state.clientX, state.clientY, placement)

  const addItems: MenuItem[] = []
  if (!readOnly && onOpenCapabilityMenu && structure) {
    if (structure.type === "loop") {
      addItems.push({ id: "add-step", label: "Add node in the loop", action: open({ kind: "loop-body", loopId: structure.id }) })
    } else if (structure.type === "if") {
      addItems.push(
        { id: "add-then", label: "Add node in then", action: open({ kind: "then-side", ifId: structure.id }) },
        { id: "add-else", label: "Add node in else", action: open({ kind: "else-side", ifId: structure.id }) },
      )
    } else if (structure.type === "parallel") {
      structure.paths.forEach((_path, index) => {
        addItems.push({
          id: `add-path-${index + 1}`,
          label: `Add node in path ${index + 1}`,
          action: open({ kind: "path-side", parallelId: structure.id, pathIndex: index }),
        })
      })
      addItems.push({
        id: "add-path",
        label: "Add path",
        action: () => onAppendEmptyPath?.(structure.id),
      })
    }
  }

  const configureItem: MenuItem = { id: "configure", label: "Configure", action: onConfigure }
  let items: MenuItem[]
  if (state.kind === "edge") {
    items = readOnly
      ? [configureItem]
      : [
          configureItem,
          {
            id: "delete-connector",
            label: "Delete branch",
            action: onDeleteConnector,
            disabled: !deletePreview.ok,
            title: deletePreview.ok ? undefined : deletePreview.reason,
          },
        ]
  } else if (readOnly) {
    items = [configureItem]
  } else if (structure) {
    const unwrapPreview = unwrapStructure(manifest, structure.id)
    items = [
      configureItem,
      { id: "wrap", label: "Wrap in", submenu: "wrap" },
      ...addItems,
      {
        id: "delete",
        label: "Delete",
        action: onDelete,
        disabled: !unwrapPreview.ok,
        title: unwrapPreview.ok ? undefined : unwrapPreview.reason,
      },
      { id: "delete-with-nodes", label: "Delete with its nodes", action: onDeleteWithNodes },
    ]
  } else {
    items = [
      configureItem,
      { id: "wrap", label: "Wrap in", submenu: "wrap" },
      { id: "delete-step", label: "Delete", action: onDelete },
    ]
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    const item = items[focusIndex]
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setFocusIndex((index) => Math.min(index + 1, items.length - 1))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setFocusIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === "Enter") {
      event.preventDefault()
      if (!item || item.disabled) return
      if (item.submenu) setSubmenu(item.submenu)
      else item.action?.()
    } else if (event.key === "ArrowRight" && item?.submenu) {
      setSubmenu(item.submenu)
    } else if (event.key === "ArrowLeft" && submenu) {
      setSubmenu(undefined)
    }
  }

  const parallelHint = wrapParallel && !wrapParallel.ok ? wrapParallel.reason : undefined
  const submenuClass = `absolute top-0 min-w-[10rem] rounded-md border border-outline-variant bg-surface-container-high py-1 shadow-lg ${
    flyoutLeft ? "right-full mr-1" : "left-full ml-1"
  }`
  const wrapItemClass =
    "block w-full px-3 py-1.5 text-left text-[12px] enabled:hover:bg-surface-container-highest disabled:opacity-50"

  return (
    <div
      ref={rootRef}
      role="menu"
      data-testid="canvas-menu"
      className="fixed z-[100] min-w-[11rem] rounded-md border border-outline-variant bg-surface-container-high py-1 shadow-lg"
      style={{ left: pos.left, top: pos.top }}
      onKeyDown={onKeyDown}
    >
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          data-testid={`canvas-menu-item-${item.id}`}
          disabled={item.disabled ?? false}
          title={item.title}
          className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-[12px] text-on-surface hover:bg-surface-container-highest disabled:opacity-50${
            index === focusIndex ? " bg-surface-container-highest" : ""
          }`}
          aria-haspopup={item.submenu ? "menu" : undefined}
          aria-expanded={item.submenu ? submenu === item.submenu : undefined}
          onMouseEnter={() => setSubmenu(item.submenu)}
          onClick={() => {
            if (item.submenu) setSubmenu(item.submenu)
            else item.action?.()
          }}
        >
          {item.label}
          {item.submenu ? <span aria-hidden="true">▸</span> : null}
        </button>
      ))}
      {submenu === "wrap" && !readOnly ? (
        <div role="menu" data-testid="canvas-submenu" className={submenuClass}>
          <button
            type="button"
            role="menuitem"
            data-testid="canvas-menu-item-wrap-if"
            disabled={wrapIf !== undefined && !wrapIf.ok}
            title={wrapIf && !wrapIf.ok ? wrapIf.reason : undefined}
            className={wrapItemClass}
            onClick={() => onWrap("if")}
          >
            If
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="canvas-menu-item-wrap-parallel"
            disabled={parallelHint !== undefined}
            title={parallelHint}
            className={wrapItemClass}
            onClick={() => onWrap("parallel")}
          >
            Parallel
            {parallelHint ? (
              <span className="mt-0.5 block text-[10px] text-on-surface-variant">{parallelHint}</span>
            ) : null}
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="canvas-menu-item-wrap-loop"
            disabled={wrapLoop !== undefined && !wrapLoop.ok}
            title={wrapLoop && !wrapLoop.ok ? wrapLoop.reason : undefined}
            className={wrapItemClass}
            onClick={() => onWrap("loop")}
          >
            Loop
          </button>
        </div>
      ) : null}
    </div>
  )
}
