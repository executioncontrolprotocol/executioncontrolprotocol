import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { AppHostClient } from "../../client/index.js"
import { retrieveItems } from "../../client/results.js"
import type { AddStepPlacement } from "../../graph/add-step.js"
import type { ReactFlowPort } from "../../graph/index.js"
import {
  CAPABILITY_SEARCH_DEBOUNCE_MS,
  capabilityRetrieveInput,
  isLatestCapabilityRequest,
} from "../lib/capability-search.js"
import {
  capabilityShortName,
  CORE_GROUP_ID,
  groupCapabilities,
  type CapabilityMenuEntry,
} from "../lib/group-capabilities.js"

/**
 * Optional connection origin for a capability pick (phase 5 drag-to-connect).
 * @category App
 */
export interface CapabilityOriginPort {
  /** Source or target step id. */
  nodeId: string
  /** Handle id on that node. */
  handleId: string
  /** Whether the port is an output or input. */
  side: "output" | "input"
}

/**
 * Where and how the capability menu was opened.
 * @category App
 */
export interface CapabilityMenuRequest {
  /** Viewport X of the menu anchor. */
  clientX: number
  /** Viewport Y of the menu anchor. */
  clientY: number
  /** Step insertion placement when a capability is picked. */
  placement: AddStepPlacement
  /** Set when opened from a dropped connection (not used in phase 4). */
  origin?: CapabilityOriginPort
  /** Port schema at the drop origin (for compatibility wiring). */
  originPort?: ReactFlowPort
  /** Flow point for cursor placement (pane right-click or empty-canvas drop). */
  flowPosition?: { x: number; y: number }
}

interface CapabilityMenuProps {
  /** Host client for capability retrieve. */
  client: AppHostClient
  /** Open request (position and placement). */
  request: CapabilityMenuRequest
  /** Close without inserting. */
  onClose: () => void
  /** Insert the active capability. */
  onPick: (entry: CapabilityMenuEntry, origin?: CapabilityOriginPort) => void
}

/**
 * Searchable capability picker anchored at a canvas point.
 * @category App
 */
export function CapabilityMenu({ client, request, onClose, onPick }: CapabilityMenuProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const requestIdRef = useRef(0)
  const [query, setQuery] = useState("")
  const [entries, setEntries] = useState<CapabilityMenuEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [pos, setPos] = useState({ left: request.clientX, top: request.clientY })

  const groups = useMemo(() => groupCapabilities(entries), [entries])
  const flat = useMemo(() => groups.flatMap((group) => group.entries), [groups])

  const layoutMenu = useCallback(() => {
    const canvas = document.querySelector('[data-testid="graph-canvas"]')
    const menu = rootRef.current
    if (!(canvas instanceof HTMLElement) || !menu) return
    const bounds = canvas.getBoundingClientRect()
    const rect = menu.getBoundingClientRect()
    let left = request.clientX
    let top = request.clientY
    if (left + rect.width > bounds.right) left = bounds.right - rect.width - 4
    if (top + rect.height > bounds.bottom) top = bounds.bottom - rect.height - 4
    if (left < bounds.left) left = bounds.left + 4
    if (top < bounds.top) top = bounds.top + 4
    setPos({ left, top })
  }, [request.clientX, request.clientY])

  useLayoutEffect(() => {
    layoutMenu()
  }, [layoutMenu, entries.length, loading])

  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (rootRef.current?.contains(target as Node)) return
      onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true)
      document.removeEventListener("keydown", onKey)
    }
  }, [onClose])

  useEffect(() => {
    const trimmed = query.trim()
    const delay = trimmed.length === 0 ? 0 : CAPABILITY_SEARCH_DEBOUNCE_MS
    let alive = true
    const timer = window.setTimeout(() => {
      const id = ++requestIdRef.current
      setLoading(true)
      void client
        .retrieve(capabilityRetrieveInput(query))
        .then((response) => {
          if (!alive || !isLatestCapabilityRequest(id, requestIdRef.current)) return
          const items = retrieveItems<CapabilityMenuEntry>(response).filter(
            (entry) => typeof entry.id === "string" && typeof entry.plugin === "string",
          )
          setEntries(
            items.map((entry) => ({
              id: entry.id,
              plugin: entry.plugin,
              summary: typeof entry.summary === "string" ? entry.summary : "",
              ...(entry.contract !== undefined ? { contract: entry.contract } : {}),
              ...(entry.code !== undefined ? { code: entry.code } : {}),
            })),
          )
          setLoading(false)
        })
        .catch(() => {
          if (!alive || !isLatestCapabilityRequest(id, requestIdRef.current)) return
          setEntries([])
          setLoading(false)
        })
    }, delay)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [client, query])

  useEffect(() => {
    const trimmed = query.trim().toLowerCase()
    if (trimmed.length === 0) {
      setActiveIndex(0)
      return
    }
    let best = 0
    let bestScore = -1
    for (let index = 0; index < flat.length; index += 1) {
      const entry = flat[index]!
      const short = capabilityShortName(entry.id).toLowerCase()
      const id = entry.id.toLowerCase()
      let score = 0
      if (short === trimmed) score = 100
      else if (short.startsWith(trimmed)) score = 80
      else if (id.includes(trimmed)) score = 50
      if (score > bestScore) {
        bestScore = score
        best = index
      }
    }
    setActiveIndex(bestScore >= 0 ? best : 0)
  }, [flat, query])

  const pickAt = (index: number) => {
    const entry = flat[index]
    if (!entry) return
    onPick(entry, request.origin)
  }

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      if (flat.length === 0) return
      setActiveIndex((current) => Math.min(current + 1, flat.length - 1))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      if (flat.length === 0) return
      setActiveIndex((current) => Math.max(current - 1, 0))
    } else if (event.key === "Enter") {
      event.preventDefault()
      const trimmed = query.trim().toLowerCase()
      if (trimmed.length === 0) {
        pickAt(activeIndex)
        return
      }
      let best = activeIndex
      let bestScore = -1
      for (let index = 0; index < flat.length; index += 1) {
        const entry = flat[index]!
        const short = capabilityShortName(entry.id).toLowerCase()
        const id = entry.id.toLowerCase()
        let score = 0
        if (short === trimmed) score = 100
        else if (short.startsWith(trimmed)) score = 80
        else if (id.includes(trimmed)) score = 50
        if (score > bestScore) {
          bestScore = score
          best = index
        }
      }
      pickAt(bestScore >= 0 ? best : activeIndex)
    } else if (event.key === "Escape") {
      event.preventDefault()
      onClose()
    }
  }

  let rowIndex = -1

  return (
    <div
      ref={rootRef}
      role="dialog"
      data-testid="capability-menu"
      className="fixed z-[100] flex max-h-[min(24rem,70vh)] w-[min(22rem,90vw)] flex-col overflow-hidden rounded-md border border-outline-variant bg-surface-container-high shadow-lg"
      style={{ left: pos.left, top: pos.top }}
    >
      <input
        ref={searchRef}
        type="search"
        data-testid="capability-menu-search"
        placeholder="Search capabilities…"
        className="shrink-0 border-b border-outline-variant bg-surface-container-lowest px-3 py-2 font-mono text-[12px] text-on-surface outline-none"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onSearchKeyDown}
        autoComplete="off"
      />
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {loading ? (
          <p className="px-3 py-1.5 text-[12px] text-on-surface-variant">Loading…</p>
        ) : null}
        {!loading && flat.length === 0 ? (
          <p className="px-3 py-1.5 text-[12px] text-on-surface-variant">No capabilities match</p>
        ) : null}
        {groups.map((group) => (
          <div key={group.plugin} role="group" data-testid={`capability-menu-group-${group.plugin}`}>
            <p
              className="px-3 pb-0.5 pt-1.5 font-mono text-[10px] uppercase text-on-surface-variant"
              data-testid={group.plugin === CORE_GROUP_ID ? "capability-menu-group-core" : undefined}
            >
              {group.plugin}
            </p>
            {group.entries.map((entry) => {
              rowIndex += 1
              const index = rowIndex
              const active = index === activeIndex
              return (
                <button
                  key={entry.id}
                  type="button"
                  data-testid={`capability-menu-item-${entry.id}`}
                  data-active={active ? "true" : "false"}
                  className={`block w-full px-3 py-1.5 text-left hover:bg-surface-container-highest${
                    active ? " bg-surface-container-highest" : ""
                  }`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => pickAt(index)}
                >
                  <span className="block text-[12px] text-on-surface">{capabilityShortName(entry.id)}</span>
                  <span className="block text-[10px] text-on-surface-variant">{entry.summary}</span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}