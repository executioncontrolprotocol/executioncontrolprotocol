import type {
  CapabilityDescription,
  CapabilityMetadata,
  ExtensionDescription,
  ExtensionMetadata,
} from "@executioncontrolprotocol/types"
import type { Ecp } from "../../environment/ecp.js"
import { DESCRIBE_AUTHORING_CAPABILITIES_QUERY } from "../../environment/describe.js"

/** Max exact-id detail fetches per assistant turn. @category Harness */
export const DESCRIBE_DETAIL_ID_LIMIT = 3

const NAMESPACED_ID_RE = /@[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(?:\.[a-zA-Z0-9_.-]+)?/g

/**
 * Extract namespaced capability/extension ids mentioned in free text.
 * Prefers longer (capability) ids when both an extension and its child appear.
 * @category Harness
 */
export function extractMentionedEntityIds(
  message: string,
  knownIds: Iterable<string>,
  limit = DESCRIBE_DETAIL_ID_LIMIT
): string[] {
  const known = new Set(knownIds)
  const found = message.match(NAMESPACED_ID_RE) ?? []
  const ordered: string[] = []
  for (const id of found) {
    if (!known.has(id)) continue
    if (ordered.includes(id)) continue
    ordered.push(id)
    if (ordered.length >= limit) break
  }
  return ordered
}

function formatCapabilityDetail(cap: CapabilityDescription): string[] {
  const meta = cap.metadata as CapabilityMetadata | undefined
  const lines = [`Capability ${cap.id}${cap.summary ? ` — ${cap.summary}` : ""}`]
  if (meta?.description) {
    lines.push(meta.description.trim())
  }
  if (meta?.useCases?.length) {
    lines.push("Use cases:")
    for (const u of meta.useCases) lines.push(`- ${u}`)
  }
  if (meta?.samplePrompts?.length) {
    lines.push("Sample prompts:")
    for (const p of meta.samplePrompts) lines.push(`- ${p}`)
  }
  if (cap.inputSchema !== undefined) {
    lines.push(`inputSchema: ${JSON.stringify(cap.inputSchema)}`)
  }
  if (cap.outputSchema !== undefined) {
    lines.push(`outputSchema: ${JSON.stringify(cap.outputSchema)}`)
  }
  return lines
}

function formatExtensionDetail(ext: ExtensionDescription): string[] {
  const meta = ext.metadata as ExtensionMetadata | undefined
  const lines = [`Extension ${ext.id}${ext.summary ? ` — ${ext.summary}` : ""}`]
  if (meta?.description) {
    lines.push(meta.description.trim())
  }
  if (meta?.useCases?.length) {
    lines.push("Use cases:")
    for (const u of meta.useCases) lines.push(`- ${u}`)
  }
  if (meta?.samplePrompts?.length) {
    lines.push("Sample prompts:")
    for (const p of meta.samplePrompts) lines.push(`- ${p}`)
  }
  if (ext.capabilities.length > 0) {
    lines.push(`Capabilities: ${ext.capabilities.join(", ")}`)
  }
  return lines
}

/**
 * Load authoring inventory (summary + JSON Schema I/O) and optional exact-id
 * detail for ids mentioned in the user message.
 * @category Harness
 */
export async function loadEnvironmentDescribeForPrompt(
  ecp: Ecp,
  message: string
): Promise<{
  inventory: Awaited<ReturnType<Ecp["describe"]>>
  detailLines: string[]
}> {
  const inventory = await ecp.describe(DESCRIBE_AUTHORING_CAPABILITIES_QUERY)
  const known = [
    ...(inventory.capabilities ?? []).map((c) => c.id),
    ...(inventory.extensions ?? []).map((e) => e.id),
  ]
  const mentioned = extractMentionedEntityIds(message, known)
  const detailLines: string[] = []
  for (const id of mentioned) {
    const isCapability = id.includes(".") && (inventory.capabilities ?? []).some((c) => c.id === id)
    const descriptor = isCapability
      ? await ecp.describe({
          capabilities: { match: id, mode: "exact", limit: 1 },
        })
      : await ecp.describe({
          extensions: { match: id, mode: "exact", limit: 1 },
        })
    if (isCapability) {
      const cap = descriptor.capabilities?.[0]
      if (cap) detailLines.push(...formatCapabilityDetail(cap), "")
    } else {
      const ext = descriptor.extensions?.[0]
      if (ext) detailLines.push(...formatExtensionDetail(ext), "")
    }
  }
  return { inventory, detailLines }
}
