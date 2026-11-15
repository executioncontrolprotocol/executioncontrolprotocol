import { useEffect, useState } from "react"
import type { CapabilityEntry } from "@executioncontrolprotocol/protocol"
import { capabilitySchemaIndex, retrieveItems, type AppHostClient } from "../../client/index.js"
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
 * Load the capability catalogue once. Failures leave it empty: ports then come from
 * `input` keys only.
 * @category App
 */
export function useCapabilities(client: AppHostClient): CapabilityCatalog {
  const [catalog, setCatalog] = useState<CapabilityCatalog>(EMPTY)
  useEffect(() => {
    let alive = true
    client
      .retrieve({ type: "capability", limit: CAPABILITY_LIST_LIMIT })
      .then((response) => {
        if (!alive) return
        const entries = retrieveItems<CapabilityEntry>(response).filter((entry) => typeof entry.id === "string")
        setCatalog({
          byId: Object.fromEntries(entries.map((entry) => [entry.id, entry])),
          schemas: capabilitySchemaIndex(entries),
        })
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [client])
  return catalog
}
