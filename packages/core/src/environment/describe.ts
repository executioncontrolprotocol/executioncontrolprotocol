import { LATEST_ECP_VERSION } from "@executioncontrolprotocol/types"
import type {
  CapabilityDescription,
  CapabilityMetadata,
  DescribeQuery,
  DescribeSelection,
  EnvironmentDescriptor,
  EnvironmentManifest,
  ExtensionDescription,
  ExtensionMetadata,
  PolicyDescription,
} from "@executioncontrolprotocol/types"
import type { Registry } from "../registry/registry.js"
import { resolveCapabilityExecution } from "../runtime/capability-execution.js"
import { isZodType, jsonSchemaFromZod } from "../schema/json-schema.js"
import type { CapabilityDefinition } from "../definitions/types.js"
import type { ExtensionDefinition } from "../definitions/types.js"
import type { z } from "zod"

function fuzzyMatch(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase())
}

function tokenMatchScore(text: string, query: string): number {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return 0
  const hay = text.toLowerCase()
  let matched = 0
  for (const t of tokens) {
    if (hay.includes(t)) matched++
  }
  return matched / tokens.length
}

/** Resolve match target: `id` aliases exact match. */
function resolveSelectionMatch(selection?: DescribeSelection): {
  match?: string
  mode: NonNullable<DescribeSelection["mode"]>
} {
  if (!selection) return { mode: "fuzzy" }
  if (selection.id?.trim()) {
    return { match: selection.id.trim(), mode: "exact" }
  }
  return { match: selection.match, mode: selection.mode ?? "fuzzy" }
}

function matchesSelection(
  text: string,
  id: string,
  selection?: DescribeSelection
): boolean {
  const { match, mode } = resolveSelectionMatch(selection)
  if (!match) return true
  if (mode === "exact") return id === match
  if (mode === "partial") return fuzzyMatch(text, match)
  return fuzzyMatch(text, match) || tokenMatchScore(text, match) > 0
}

/** True when the selection targets one entity by exact id (auto detail). */
function isExactIdDetail(selection?: DescribeSelection): boolean {
  const { match, mode } = resolveSelectionMatch(selection)
  return mode === "exact" && typeof match === "string" && match.length > 0
}

function pickFields<T extends object>(obj: T, include?: string[]): Partial<T> {
  if (!include || include.length === 0) return obj
  const out: Partial<T> = {}
  for (const key of include) {
    if (key in obj) (out as Record<string, unknown>)[key] = obj[key as keyof T]
  }
  return out
}

/** Inventory fields always retained when `include` projects capability rows. */
const CAPABILITY_INVENTORY_KEYS = [
  "id",
  "label",
  "extension",
  "execution",
  "summary",
] as const

/** Inventory fields always retained when `include` projects extension rows. */
const EXTENSION_INVENTORY_KEYS = [
  "id",
  "label",
  "order",
  "capabilities",
  "summary",
  "supportedRuntimes",
] as const

/**
 * Project a capability description. `include` adds/keeps named fields but never
 * drops inventory keys (so `include: ["inputSchema"]` yields inventory + schema).
 */
function pickCapabilityFields(
  desc: CapabilityDescription,
  include?: string[]
): CapabilityDescription {
  if (!include || include.length === 0) return desc
  return pickFields(desc, [
    ...CAPABILITY_INVENTORY_KEYS,
    ...include,
  ]) as CapabilityDescription
}

/**
 * Project an extension description. `include` never drops inventory keys.
 */
function pickExtensionFields(
  desc: ExtensionDescription,
  include?: string[]
): ExtensionDescription {
  if (!include || include.length === 0) return desc
  return pickFields(desc, [
    ...EXTENSION_INVENTORY_KEYS,
    ...include,
  ]) as ExtensionDescription
}

/**
 * Describe query for authoring catalogs: inventory rows plus JSON Schema I/O
 * (no nested metadata essays).
 * @category Environment
 */
export const DESCRIBE_AUTHORING_CAPABILITIES_QUERY = {
  capabilities: {
    include: ["inputSchema", "outputSchema"],
  },
} as const satisfies DescribeQuery

function applyLimit<T>(items: T[], limit?: number): T[] {
  if (limit === undefined) return items
  return items.slice(0, limit)
}

function projectSchema(schema: unknown): unknown {
  if (schema === undefined) return undefined
  if (isZodType(schema)) return jsonSchemaFromZod(schema as z.ZodType)
  return schema
}

function capabilitySearchText(
  cap: CapabilityDefinition,
  extensionId: string
): string {
  const meta = cap.metadata
  return [
    cap.id,
    cap.name,
    extensionId,
    meta?.label ?? "",
    meta?.summary ?? "",
    meta?.description ?? "",
    ...(meta?.useCases ?? []),
    ...(meta?.samplePrompts ?? []),
  ].join(" ")
}

function extensionSearchText(
  id: string,
  bindingLabel: string | undefined,
  def: ExtensionDefinition | undefined
): string {
  const meta = def?.metadata
  return [
    id,
    bindingLabel ?? "",
    def?.name ?? "",
    meta?.label ?? "",
    meta?.summary ?? "",
    meta?.description ?? "",
    ...(meta?.useCases ?? []),
    ...(meta?.samplePrompts ?? []),
  ].join(" ")
}

/** Options for {@link buildDescriptor}. @category Environment */
export interface BuildDescriptorOptions {
  /**
   * Attach full metadata on every capability/extension for search haystacks.
   * Does not attach I/O schemas (those stay on exact-id detail).
   */
  searchIndex?: boolean
}

function buildCapabilityDescription(
  cap: CapabilityDefinition,
  def: ExtensionDefinition,
  opts: {
    detail: boolean
    searchIndex?: boolean
    includeSchemas?: boolean
    includeMetadata?: boolean
  }
): CapabilityDescription {
  const meta = cap.metadata
  const label = meta?.label ?? cap.name
  const inventory: CapabilityDescription = {
    id: cap.id,
    label,
    extension: def.id,
    execution: resolveCapabilityExecution(cap, def),
    ...(meta?.summary ? { summary: meta.summary } : {}),
  }
  const withMetadata = opts.detail || opts.searchIndex || opts.includeMetadata
  const withSchemas = opts.detail || opts.includeSchemas
  return {
    ...inventory,
    ...(withMetadata && meta ? { metadata: meta as CapabilityMetadata } : {}),
    ...(withSchemas
      ? {
          inputSchema: projectSchema(cap.inputSchema),
          outputSchema: projectSchema(cap.outputSchema),
        }
      : {}),
  }
}

function buildExtensionDescription(
  e: { id: string | unknown; label?: string; order?: number },
  i: number,
  def: ExtensionDefinition | undefined,
  opts: {
    detail: boolean
    searchIndex?: boolean
    includeMetadata?: boolean
  }
): ExtensionDescription {
  const id = String(e.id)
  const meta = def?.metadata
  const inventory: ExtensionDescription = {
    id,
    label: meta?.label ?? e.label,
    order: e.order ?? i,
    capabilities: def?.capabilities.map((c) => c.id) ?? [],
    ...(meta?.summary ? { summary: meta.summary } : {}),
    ...(def?.supportedRuntimes?.length
      ? { supportedRuntimes: [...def.supportedRuntimes] }
      : {}),
  }
  const withMetadata = opts.detail || opts.searchIndex || opts.includeMetadata
  return {
    ...inventory,
    ...(withMetadata && meta ? { metadata: meta as ExtensionMetadata } : {}),
    ...(opts.detail && def?.configSchema
      ? { configSchema: projectSchema(def.configSchema) }
      : {}),
  }
}

/** Build environment descriptor from registry + bindings. */
export async function buildDescriptor(
  registry: Registry,
  manifest: EnvironmentManifest,
  query?: DescribeQuery,
  options?: BuildDescriptorOptions
): Promise<EnvironmentDescriptor> {
  const capabilityDetail = isExactIdDetail(query?.capabilities)
  const extensionDetail = isExactIdDetail(query?.extensions)
  const searchIndex = options?.searchIndex === true
  const capInclude = query?.capabilities?.include ?? []
  const extInclude = query?.extensions?.include ?? []

  const caps: CapabilityDescription[] = []
  for (const extBinding of manifest.extensions ?? []) {
    const def = registry.getExtension(String(extBinding.id))
    if (!def) continue
    for (const cap of def.capabilities) {
      const text = capabilitySearchText(cap, def.id)
      if (!matchesSelection(text, cap.id, query?.capabilities)) continue
      const desc = buildCapabilityDescription(cap, def, {
        detail: capabilityDetail,
        searchIndex,
        includeSchemas:
          capInclude.includes("inputSchema") || capInclude.includes("outputSchema"),
        includeMetadata: capInclude.includes("metadata"),
      })
      caps.push(pickCapabilityFields(desc, query?.capabilities?.include))
    }
  }

  const extensions: ExtensionDescription[] = applyLimit(
    (manifest.extensions ?? [])
      .map((e, i) => {
        const def = registry.getExtension(String(e.id))
        const text = extensionSearchText(String(e.id), e.label, def)
        if (!matchesSelection(text, String(e.id), query?.extensions)) return null
        const desc = buildExtensionDescription(e, i, def, {
          detail: extensionDetail,
          searchIndex,
          includeMetadata: extInclude.includes("metadata"),
        })
        return pickExtensionFields(desc, query?.extensions?.include)
      })
      .filter((x): x is ExtensionDescription => x !== null),
    query?.extensions?.limit
  )

  const policies: PolicyDescription[] = applyLimit(
    (manifest.policies ?? [])
      .map((p) => {
        const def = registry.getPolicy(String(p.id))
        const text = `${p.id} ${p.label ?? ""} ${def?.name ?? ""}`
        if (!matchesSelection(text, String(p.id), query?.policies)) return null
        const desc: PolicyDescription = {
          id: String(p.id),
          label: p.label,
          summary: def?.name,
          config: p.config,
          configSchema: def?.configSchema,
        }
        return pickFields(desc, query?.policies?.include) as PolicyDescription
      })
      .filter((x): x is PolicyDescription => x !== null),
    query?.policies?.limit
  )

  const runtimeId = String(manifest.runtime?.id ?? "@executioncontrolprotocol/node")
  const runtimeLabel = manifest.runtime?.label
  const runtimeText = `${runtimeId} ${runtimeLabel ?? ""}`
  const includeRuntime =
    !query?.runtime?.match && !query?.runtime?.id
      ? true
      : matchesSelection(runtimeText, runtimeId, query?.runtime)

  return {
    schema: "@executioncontrolprotocol.environment.describe",
    version: LATEST_ECP_VERSION,
    environment: manifest.environment,
    runtime: includeRuntime
      ? {
          id: runtimeId,
          label: runtimeLabel,
          features: {
            loops: true,
            parallel: true,
            branches: true,
            pauses: true,
            cancellation: true,
          },
        }
      : {
          id: runtimeId,
          features: {
            loops: false,
            parallel: false,
            branches: false,
            pauses: false,
            cancellation: false,
          },
        },
    extensions,
    capabilities: applyLimit(caps, query?.capabilities?.limit),
    policies,
  }
}
