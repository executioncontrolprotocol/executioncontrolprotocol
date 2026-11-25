import { useEffect, useMemo, useRef, useState } from "react"
import type { CapabilityEntry, ExecutionManifest, StepNode } from "@executioncontrolprotocol/protocol"
import { capabilitySchemaIndex, retrieveItem, retrieveItems, type AppHostClient } from "../../client/index.js"
import { collectSteps } from "../../graph/index.js"
import type { CapabilitySchemaIndex } from "../../graph/index.js"

const CAPABILITY_LIST_LIMIT = 100

/**
 * Installed capabilities, for typed ports and the node panel.
 * @category App
 */
export interface CapabilityCatalog {
  /** Capability id to its entry. */
  byId: Record<string, CapabilityEntry>
  /** Capability id to its `accepts` / `returns` schemas. */
  schemas: CapabilitySchemaIndex
}

const EMPTY: CapabilityCatalog = { byId: {}, schemas: {} }

/**
 * Distinct capability ids referenced by steps in an execution manifest.
 * @category App
 */
export function manifestCapabilityUses(manifest: ExecutionManifest | undefined): string[] {
  if (!manifest?.steps?.length) return []
  const steps: StepNode[] = []
  collectSteps(manifest.steps, steps)
  const ids = new Set<string>()
  for (const step of steps) {
    if (typeof step.uses === "string") ids.add(step.uses)
  }
  return [...ids].sort()
}

/**
 * Merge a capability list catalogue with full entries loaded by id.
 * @category App
 */
export function mergeCapabilityCatalog(
  listEntries: readonly CapabilityEntry[],
  fullById: Readonly<Record<string, CapabilityEntry>>,
  manifestUses: readonly string[],
): CapabilityCatalog {
  const byId: Record<string, CapabilityEntry> = {}
  for (const entry of listEntries) {
    if (typeof entry.id !== "string") continue
    byId[entry.id] = fullById[entry.id] ?? entry
  }
  for (const id of manifestUses) {
    const full = fullById[id]
    if (full) byId[id] = full
  }
  const schemaSources: CapabilityEntry[] = []
  for (const id of manifestUses) {
    const entry = byId[id] ?? fullById[id]
    if (entry) schemaSources.push(entry)
  }
  return { byId, schemas: capabilitySchemaIndex(schemaSources) }
}

/**
 * Load the capability catalogue once, then lazily fetch full `accepts` / `returns` for each
 * capability id the open manifest references.
 * @category App
 */
export function useCapabilities(
  client: AppHostClient,
  manifest: ExecutionManifest | undefined,
): CapabilityCatalog {
  const [listEntries, setListEntries] = useState<CapabilityEntry[]>([])
  const [fullById, setFullById] = useState<Record<string, CapabilityEntry>>({})
  const manifestUses = useMemo(() => manifestCapabilityUses(manifest), [manifest])
  const fetchedIds = useRef<Set<string>>(new Set())

  useEffect(() => {
    let alive = true
    client
      .retrieve({ type: "capability", limit: CAPABILITY_LIST_LIMIT })
      .then((response) => {
        if (!alive) return
        const entries = retrieveItems<CapabilityEntry>(response).filter((entry) => typeof entry.id === "string")
        setListEntries(entries)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [client])

  useEffect(() => {
    const usesSet = new Set(manifestUses)
    setFullById((previous) => {
      const next: Record<string, CapabilityEntry> = {}
      for (const [id, entry] of Object.entries(previous)) {
        if (usesSet.has(id)) next[id] = entry
      }
      return next
    })
    for (const id of [...fetchedIds.current]) {
      if (!usesSet.has(id)) fetchedIds.current.delete(id)
    }
  }, [manifestUses])

  useEffect(() => {
    if (manifestUses.length === 0) return
    // `fetchedIds` holds ids requested or loaded; a failed request releases its id so a later
    // render retries. Results are always applied (no cancel flag): dropping them after an effect
    // re-run would leave the id marked as fetched with no schema, and its ports `unknown` for good.
    const toFetch = manifestUses.filter((id) => !fetchedIds.current.has(id))
    if (toFetch.length === 0) return
    for (const id of toFetch) fetchedIds.current.add(id)
    void Promise.all(
      toFetch.map(async (id) => {
        try {
          // A retrieve by id answers with `data.item`, not `data.items`.
          const entry = retrieveItem<CapabilityEntry>(await client.retrieve({ type: "capability", id }))
          if (!entry) fetchedIds.current.delete(id)
          return entry
        } catch {
          fetchedIds.current.delete(id)
          return undefined
        }
      }),
    ).then((entries) => {
      setFullById((previous) => {
        const next = { ...previous }
        for (const entry of entries) {
          if (entry && typeof entry.id === "string") next[entry.id] = entry
        }
        return next
      })
    })
  }, [client, manifestUses])

  return useMemo(() => {
    if (listEntries.length === 0 && Object.keys(fullById).length === 0) return EMPTY
    return mergeCapabilityCatalog(listEntries, fullById, manifestUses)
  }, [listEntries, fullById, manifestUses])
}