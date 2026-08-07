import { LATEST_ECP_VERSION } from "@executioncontrolprotocol/types"
import type {
  CapabilityDescription,
  DescribeQuery,
  DescribeSelection,
  EnvironmentDescriptor,
  ExtensionDescription,
  PolicyDescription,
} from "@executioncontrolprotocol/types"
import type { Registry } from "../registry/registry.js"
import type { EnvironmentManifest } from "@executioncontrolprotocol/types"

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

function matchesSelection(
  text: string,
  id: string,
  selection?: DescribeSelection
): boolean {
  if (!selection?.match) return true
  const mode = selection.mode ?? "fuzzy"
  if (mode === "exact") return id === selection.match
  if (mode === "partial") return fuzzyMatch(text, selection.match)
  return fuzzyMatch(text, selection.match) || tokenMatchScore(text, selection.match) > 0
}

function pickFields<T extends object>(obj: T, include?: string[]): Partial<T> {
  if (!include || include.length === 0) return obj
  const out: Partial<T> = {}
  for (const key of include) {
    if (key in obj) (out as Record<string, unknown>)[key] = obj[key as keyof T]
  }
  return out
}

function applyLimit<T>(items: T[], limit?: number): T[] {
  if (limit === undefined) return items
  return items.slice(0, limit)
}

/** Build environment descriptor from registry + bindings. */
export async function buildDescriptor(
  registry: Registry,
  manifest: EnvironmentManifest,
  query?: DescribeQuery
): Promise<EnvironmentDescriptor> {
  const caps: CapabilityDescription[] = []
  for (const extBinding of manifest.extensions ?? []) {
    const def = registry.getExtension(String(extBinding.id))
    if (!def) continue
    for (const cap of def.capabilities) {
      const text = `${cap.id} ${cap.name}`
      if (!matchesSelection(text, cap.id, query?.capabilities)) continue
      const desc: CapabilityDescription = {
        id: cap.id,
        label: cap.name,
        extension: def.id,
        inputSchema: cap.inputSchema,
        outputSchema: cap.outputSchema,
      }
      caps.push(
        pickFields(desc, query?.capabilities?.include) as CapabilityDescription
      )
    }
  }

  const extensions: ExtensionDescription[] = applyLimit(
    (manifest.extensions ?? [])
      .map((e, i) => {
        const def = registry.getExtension(String(e.id))
        const text = `${e.id} ${e.label ?? ""} ${def?.name ?? ""}`
        if (!matchesSelection(text, String(e.id), query?.extensions)) return null
        const desc: ExtensionDescription = {
          id: String(e.id),
          label: e.label,
          order: e.order ?? i,
          capabilities: def?.capabilities.map((c) => c.id) ?? [],
          ...(def?.supportedRuntimes?.length
            ? { supportedRuntimes: [...def.supportedRuntimes] }
            : {}),
        }
        return pickFields(desc, query?.extensions?.include) as ExtensionDescription
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
    !query?.runtime?.match || matchesSelection(runtimeText, runtimeId, query.runtime)

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
