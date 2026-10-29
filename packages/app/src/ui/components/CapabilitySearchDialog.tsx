import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import type { CapabilityDescription, EnvironmentDescriptor } from "@executioncontrolprotocol/core/types"
import { authorableCapabilityGroups } from "../lib/capability-catalog.js"

/** Props for {@link CapabilitySearchDialog}. @category App */
export interface CapabilitySearchDialogProps {
  /** Live process-host describe catalog. */
  descriptor: EnvironmentDescriptor | null | undefined
  /** True while the selected capability is being inserted. */
  busy?: boolean
  /** Close without inserting. */
  onClose: () => void
  /** Insert the selected capability as a new step. */
  onSelect: (capability: CapabilityDescription) => void
}

/**
 * Large search overlay of authorable capabilities, grouped by plugin.
 * @category App
 */
export function CapabilitySearchDialog({
  descriptor,
  busy = false,
  onClose,
  onSelect,
}: CapabilitySearchDialogProps) {
  const [query, setQuery] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)

  const groups = useMemo(
    () => authorableCapabilityGroups(descriptor, query),
    [descriptor, query]
  )
  const flat = useMemo(
    () => groups.flatMap((group) => group.capabilities),
    [groups]
  )

  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    if (flat.length === 0) {
      setActiveIndex(0)
      return
    }
    if (activeIndex >= flat.length) setActiveIndex(0)
  }, [activeIndex, flat.length])

  const selectAt = (index: number) => {
    const cap = flat[index]
    if (!cap || busy) return
    onSelect(cap)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault()
      if (!busy) onClose()
      return
    }
    if (event.key === "ArrowDown") {
      event.preventDefault()
      if (flat.length === 0) return
      setActiveIndex((current) => (current + 1) % flat.length)
      return
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      if (flat.length === 0) return
      setActiveIndex((current) => (current - 1 + flat.length) % flat.length)
      return
    }
    if (event.key === "Enter") {
      event.preventDefault()
      selectAt(activeIndex)
    }
  }

  let rowIndex = -1

  return (
    <div
      className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/70 p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="capability-search-title"
      onClick={() => {
        if (!busy) onClose()
      }}
    >
      <div
        className="flex h-full w-[75vw] max-w-[75vw] flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-start justify-between gap-4 border-b border-outline-variant px-5 py-4">
          <div className="min-w-0">
            <h2 id="capability-search-title" className="font-display text-headline text-on-surface">
              Add capability
            </h2>
            <p className="mt-1 text-label text-on-surface-variant">
              Search installed plugins and capabilities. The new step wires to the first matching port.
            </p>
          </div>
          <button
            type="button"
            className="material-symbols-outlined cursor-pointer text-on-surface-variant hover:text-on-surface"
            onClick={onClose}
            aria-label="Close"
            disabled={busy}
          >
            close
          </button>
        </div>
        <div className="border-b border-outline-variant px-5 py-3">
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search plugins and capabilities"
            className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-sm text-on-surface outline-none focus:border-outline"
            disabled={busy}
            aria-controls="capability-search-list"
            aria-autocomplete="list"
          />
        </div>
        <div id="capability-search-list" className="min-h-0 flex-1 overflow-y-auto px-5 py-3" role="listbox">
          {groups.length === 0 ? (
            <p className="px-1 py-6 text-center text-label text-on-surface-variant">
              No capabilities match that search.
            </p>
          ) : (
            groups.map((group) => (
              <section key={group.extension.id} className="mb-4 last:mb-0">
                <h3 className="mb-1.5 font-display text-sm text-on-surface">
                  {group.extension.label ?? group.extension.id}
                </h3>
                {group.extension.summary ? (
                  <p className="mb-2 text-[11px] text-on-surface-variant">{group.extension.summary}</p>
                ) : null}
                <ul className="flex flex-col gap-1">
                  {group.capabilities.map((cap) => {
                    rowIndex += 1
                    const index = rowIndex
                    const active = index === activeIndex
                    return (
                      <li key={cap.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={active}
                          disabled={busy}
                          className={`w-full rounded-lg border px-3 py-2 text-left ${
                            active
                              ? "border-outline bg-surface-container-highest"
                              : "border-transparent hover:bg-surface-container-high"
                          }`}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => selectAt(index)}
                        >
                          <span className="block font-mono text-sm text-on-surface">
                            {cap.label ?? cap.id}
                          </span>
                          {cap.summary ? (
                            <span className="mt-0.5 block text-[11px] text-on-surface-variant">
                              {cap.summary}
                            </span>
                          ) : cap.metadata?.description ? (
                            <span className="mt-0.5 block text-[11px] text-on-surface-variant">
                              {cap.metadata.description}
                            </span>
                          ) : (
                            <span className="mt-0.5 block break-all font-mono text-[11px] text-outline">
                              {cap.id}
                            </span>
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
