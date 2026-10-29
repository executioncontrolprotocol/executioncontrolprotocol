import type {
  CapabilityDescription,
  EnvironmentDescriptor,
  ExtensionDescription,
} from "@executioncontrolprotocol/core/types"
import type { CapabilitySchemaIndex } from "../../graph/index.js"

/** Capability grouped under its plugin for the canvas search modal. @category App */
export interface CatalogPluginGroup {
  /** Extension (plugin) row. */
  extension: ExtensionDescription
  /** Authorable capabilities on this plugin, already sorted. */
  capabilities: CapabilityDescription[]
}

function tokenize(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean)
}

function extensionById(
  descriptor: EnvironmentDescriptor
): Map<string, ExtensionDescription> {
  const map = new Map<string, ExtensionDescription>()
  for (const ext of descriptor.extensions) {
    map.set(ext.id, ext)
  }
  return map
}

function stubExtension(id: string): ExtensionDescription {
  return { id, order: 0, capabilities: [] }
}

function blockedExtensionIds(descriptor: EnvironmentDescriptor): Set<string> {
  const blocked = new Set<string>()
  for (const ext of descriptor.extensions) {
    if (ext.isAuthorable === false) blocked.add(ext.id)
  }
  return blocked
}

function haystack(cap: CapabilityDescription, ext: ExtensionDescription): string {
  return [
    cap.id,
    cap.label ?? "",
    cap.summary ?? "",
    cap.metadata?.description ?? "",
    ext.id,
    ext.label ?? "",
    ext.summary ?? "",
    ext.metadata?.description ?? "",
  ]
    .join(" ")
    .toLowerCase()
}

function matchesHaystack(text: string, tokens: string[]): boolean {
  return tokens.every((token) => text.includes(token))
}

function compareLabelThenId(a: { id: string; label?: string }, b: { id: string; label?: string }): number {
  const left = (a.label ?? a.id).toLocaleLowerCase()
  const right = (b.label ?? b.id).toLocaleLowerCase()
  const byLabel = left.localeCompare(right)
  if (byLabel !== 0) return byLabel
  return a.id.localeCompare(b.id)
}

/**
 * Authorable capabilities grouped by plugin, filtered by a free-text query.
 * Empty query lists every authorable capability. Non-authorable extensions
 * (format, journal, secrets) are omitted.
 * @category App
 */
export function authorableCapabilityGroups(
  descriptor: EnvironmentDescriptor | null | undefined,
  query = ""
): CatalogPluginGroup[] {
  if (!descriptor) return []
  const tokens = tokenize(query)
  const extensions = extensionById(descriptor)
  const blocked = blockedExtensionIds(descriptor)
  const grouped = new Map<string, CatalogPluginGroup>()

  for (const cap of descriptor.capabilities) {
    if (blocked.has(cap.extension)) continue
    const ext = extensions.get(cap.extension) ?? stubExtension(cap.extension)
    if (tokens.length > 0 && !matchesHaystack(haystack(cap, ext), tokens)) continue
    const group = grouped.get(ext.id)
    if (group) {
      group.capabilities.push(cap)
      continue
    }
    grouped.set(ext.id, { extension: ext, capabilities: [cap] })
  }

  const groups = [...grouped.values()]
  for (const group of groups) {
    group.capabilities.sort(compareLabelThenId)
  }
  groups.sort((a, b) => compareLabelThenId(a.extension, b.extension))
  return groups
}

/**
 * JSON Schema I/O index keyed by capability id, for {@link workflowToReactFlow}.
 * @category App
 */
export function capabilitySchemasFromDescriptor(
  descriptor: EnvironmentDescriptor | null | undefined
): CapabilitySchemaIndex {
  const out: CapabilitySchemaIndex = {}
  if (!descriptor) return out
  for (const cap of descriptor.capabilities) {
    if (cap.inputSchema === undefined && cap.outputSchema === undefined) continue
    out[cap.id] = {
      inputSchema: cap.inputSchema,
      outputSchema: cap.outputSchema,
    }
  }
  return out
}
