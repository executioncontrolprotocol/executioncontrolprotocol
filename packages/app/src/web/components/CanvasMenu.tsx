import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import type { ExecutionManifest } from "@executioncontrolprotocol/protocol"
import type { ReactFlowEdge } from "../../graph/index.js"
import type { AddStepPlacement } from "../../graph/index.js"
import {
  STRUCTURE_EDIT_PARALLEL_MIN,
  connectorDeletePreview,
  findStructure,
  unwrapStructure,
  wrapSelectionIds,
  wrapSteps,
} from "../../graph/index.js"

export type CanvasMenuState =
  | {
      kind: "node"
      stepId: string
      clientX: number
      clientY: number
    }
  | {
      kind: "container"
      structureId: string
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
  onDeleteStep: () => void
  onUnwrap: () => void
  onRemoveStructure: () => void
  onDeleteConnector: () => void
  /** Open the capability menu for a new step at this placement. */
  onOpenCapabilityMenu?: (clientX: number, clientY: number, placement: AddStepPlacement) => void
}

type Submenu = "wrap" | "delete" | undefined

/** Room the submenu flyout needs beside the menu (its min width plus the gap). */
const SUBMENU_FLYOUT_WIDTH = 168

/**
 * Cursor-positioned canvas context menu for steps and structures. Submenus open as a flyout beside the menu, so the
 * item under the pointer never changes.
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
  onDeleteStep,
  onUnwrap,
  onRemoveStructure,
  onDeleteConnector,
  edges,
  onOpenCapabilityMenu,
}: CanvasMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [submenu, setSubmenu] = useState<Submenu>(undefined)
  /** Open the submenu flyout on the left when there's no room for it on the right inside the canvas. */
  const [flyoutLeft, setFlyoutLeft] = useState(false)
  const [focusIndex, setFocusIndex] = useState(0)
  const [pos, setPos] = useState({ left: state.clientX, top: state.clientY })

  const wrapIds =
    state.kind === "node" ? wrapSelectionIds(selectedStepIds, state.stepId) : ([] as string[])

  const wrapIf = state.kind === "node" ? wrapSteps(manifest, wrapIds, "if") : undefined
  const wrapParallel = state.kind === "node" ? wrapSteps(manifest, wrapIds, "parallel") : undefined
  const wrapLoop = state.kind === "node" ? wrapSteps(manifest, wrapIds, "loop") : undefined

  const unwrapPreview =
    state.kind === "container" ? unwrapStructure(manifest, state.structureId) : undefined

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

  const deleteConnectorLabel = "Delete branch"

  const structure =
    state.kind === "container" ? findStructure(manifest, state.structureId) : undefined

  const addItems =
    !readOnly && state.kind === "container" && onOpenCapabilityMenu && structure
      ? structure.type === "loop"
        ? [
            {
              id: "add-step",
              label: "Add step…",
              action: () => onOpenCapabilityMenu(state.clientX, state.clientY, { kind: "loop-body", loopId: structure.id }),
            },
          ]
        : structure.type === "if"
          ? [
              {
                id: "add-then",
                label: "Add to then…",
                action: () => onOpenCapabilityMenu(state.clientX, state.clientY, { kind: "then-side", ifId: structure.id }),
              },
            ]
          : structure.type === "parallel"
            ? [
                {
                  id: "add-path",
                  label: "Add path…",
                  action: () =>
                    onOpenCapabilityMenu(state.clientX, state.clientY, { kind: "new-path", parallelId: structure.id }),
                },
              ]
            : []
      : []

  const items =
    state.kind === "edge"
      ? readOnly
        ? [{ id: "configure", label: "Configure", action: onConfigure }]
        : [
            { id: "configure", label: "Configure", action: onConfigure },
            {
              id: "delete-connector",
              label: deleteConnectorLabel,
              action: onDeleteConnector,
              disabled: !deletePreview.ok,
              title: deletePreview.ok ? undefined : deletePreview.reason,
            },
          ]
      : readOnly
    ? [{ id: "configure", label: "Configure", action: onConfigure }]
    : state.kind === "node"
      ? [
          { id: "configure", label: "Configure", action: onConfigure },
          { id: "wrap", label: "Wrap in", submenu: "wrap" as const },
          { id: "delete-step", label: "Delete step", action: onDeleteStep },
        ]
      : [
          { id: "configure", label: "Configure", action: onConfigure },
          ...addItems,
          { id: "delete", label: "Delete", submenu: "delete" as const },
        ]

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setFocusIndex((index) => Math.min(index + 1, items.length - 1))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setFocusIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === "Enter") {
      event.preventDefault()
      const item = items[focusIndex]
      if (!item) return
      if ("submenu" in item && item.submenu) setSubmenu(item.submenu)
      else if ("action" in item && item.action) item.action()
    } else if (event.key === "ArrowRight" && items[focusIndex] && "submenu" in items[focusIndex]) {
      setSubmenu(items[focusIndex].submenu)
    } else if (event.key === "ArrowLeft" && submenu) {
      setSubmenu(undefined)
    }
  }

  const parallelDisabled = wrapParallel && !wrapParallel.ok
  const parallelHint = wrapParallel && !wrapParallel.ok ? wrapParallel.reason : undefined

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
              disabled={"disabled" in item ? item.disabled : false}
              title={"title" in item ? item.title : undefined}
              className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-[12px] text-on-surface hover:bg-surface-container-highest${
                index === focusIndex ? " bg-surface-container-highest" : ""
              }`}
              aria-haspopup={"submenu" in item && item.submenu ? "menu" : undefined}
              aria-expanded={"submenu" in item && item.submenu ? submenu === item.submenu : undefined}
              onMouseEnter={() => {
                setSubmenu("submenu" in item && item.submenu ? item.submenu : undefined)
              }}
              onClick={() => {
                if ("submenu" in item && item.submenu) setSubmenu(item.submenu)
                else if ("action" in item && item.action) item.action()
              }}
            >
              {item.label}
              {"submenu" in item && item.submenu ? <span aria-hidden="true">▸</span> : null}
            </button>
          ))}
      {submenu === "wrap" && !readOnly ? (
        <div
          role="menu"
          data-testid="canvas-submenu"
          className={`absolute top-0 min-w-[10rem] rounded-md border border-outline-variant bg-surface-container-high py-1 shadow-lg ${
            flyoutLeft ? "right-full mr-1" : "left-full ml-1"
          }`}
        >
          <button
            type="button"
            role="menuitem"
            data-testid="canvas-menu-item-wrap-if"
            disabled={wrapIf !== undefined && !wrapIf.ok}
            className="block w-full px-3 py-1.5 text-left text-[12px] enabled:hover:bg-surface-container-highest disabled:opacity-50"
            onClick={() => onWrap("if")}
          >
            If
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="canvas-menu-item-wrap-parallel"
            disabled={parallelDisabled}
            title={parallelHint}
            className="block w-full px-3 py-1.5 text-left text-[12px] enabled:hover:bg-surface-container-highest disabled:opacity-50"
            onClick={() => onWrap("parallel")}
          >
            Parallel
            {parallelHint === STRUCTURE_EDIT_PARALLEL_MIN ? (
              <span className="mt-0.5 block text-[10px] text-on-surface-variant">Select two or more steps</span>
            ) : null}
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="canvas-menu-item-wrap-loop"
            disabled={wrapLoop !== undefined && !wrapLoop.ok}
            className="block w-full px-3 py-1.5 text-left text-[12px] enabled:hover:bg-surface-container-highest disabled:opacity-50"
            onClick={() => onWrap("loop")}
          >
            Loop
          </button>
        </div>
      ) : null}
      {submenu === "delete" && !readOnly ? (
        <div
          role="menu"
          data-testid="canvas-submenu"
          className={`absolute top-0 min-w-[10rem] rounded-md border border-outline-variant bg-surface-container-high py-1 shadow-lg ${
            flyoutLeft ? "right-full mr-1" : "left-full ml-1"
          }`}
        >
          <button
            type="button"
            role="menuitem"
            data-testid="canvas-menu-item-delete-keep-steps"
            disabled={unwrapPreview !== undefined && !unwrapPreview.ok}
            title={unwrapPreview && !unwrapPreview.ok ? unwrapPreview.reason : undefined}
            className="block w-full px-3 py-1.5 text-left text-[12px] enabled:hover:bg-surface-container-highest disabled:opacity-50"
            onClick={onUnwrap}
          >
            Keep steps
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="canvas-menu-item-delete-with-steps"
            className="block w-full px-3 py-1.5 text-left text-[12px] hover:bg-surface-container-highest"
            onClick={onRemoveStructure}
          >
            With its steps
          </button>
        </div>
      ) : null}
    </div>
  )
}