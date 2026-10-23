import { LATEST_ECP_VERSION } from "../types/index.js"
import type {
  NamespacedId,
  RequirementEntry,
  RequirementsDocument,
  WorkflowNode,
} from "../types/index.js"
import type { ExtensionBindingBuilder } from "../bindings/extension.js"
import { PolicyBindingBuilder } from "../bindings/policy.js"
import { cloneConfigForManifest } from "../environment/config-resolver.js"

/** Binding accepted by {@link WorkflowBuilder.with}. @category Workflow */
export type WorkflowBinding = ExtensionBindingBuilder | PolicyBindingBuilder

/** Built-in ids that never map to an npm plugin install. @category Workflow */
export const BUILTIN_REQUIREMENT_IDS = new Set<string>([
  "@executioncontrolprotocol/registry-control",
  "@executioncontrolprotocol/test",
  "@executioncontrolprotocol/secrets",
  "@executioncontrolprotocol/process-env",
  "@executioncontrolprotocol/node",
  "@executioncontrolprotocol/browser",
])

function resolveBindingId(ref: NamespacedId | { id: NamespacedId } | string): NamespacedId {
  if (typeof ref === "string") return ref as NamespacedId
  if (typeof ref === "object" && ref !== null && "id" in ref) return ref.id
  return ref as NamespacedId
}

/**
 * Map a capability id (`@scope/name.cap`) to its extension id (`@scope/name`).
 * @category Workflow
 */
export function capabilityToExtensionId(capabilityId: string): NamespacedId {
  const lastDot = capabilityId.lastIndexOf(".")
  if (lastDot <= 0) return capabilityId as NamespacedId
  return capabilityId.slice(0, lastDot) as NamespacedId
}

/** True when this id installs nothing. @category Workflow */
export function isBuiltinRequirementId(id: string): boolean {
  return BUILTIN_REQUIREMENT_IDS.has(id)
}

/**
 * Default npm package for an extension or policy id: `@scope/<name>` → `@scope/plugin-<name>`.
 * Built-ins return `undefined`.
 * @category Workflow
 */
export function inferredPackageName(id: NamespacedId): string | undefined {
  if (isBuiltinRequirementId(id)) return undefined
  const slash = id.lastIndexOf("/")
  if (slash <= 0) return undefined
  const scope = id.slice(0, slash)
  const name = id.slice(slash + 1)
  if (!scope.startsWith("@") || name.length === 0) return undefined
  return `${scope}/plugin-${name}`
}

/** Collect `uses` ids from leaf steps, including flow nodes. @category Workflow */
export function collectCapabilityIds(nodes: WorkflowNode[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const walk = (list: WorkflowNode[]): void => {
    for (const node of list) {
      if (!node.type || node.type === "step") {
        const uses = node.uses
        if (!seen.has(uses)) {
          seen.add(uses)
          out.push(uses)
        }
        continue
      }
      if (node.type === "parallel") {
        for (const branch of node.branches) walk(branch)
      } else if (node.type === "branch") {
        for (const branch of node.branches) walk(branch.steps)
      } else if (node.type === "loop") {
        walk(node.steps)
      }
    }
  }
  walk(nodes)
  return out
}

function entryFromBinding(binding: WorkflowBinding): RequirementEntry {
  const id = resolveBindingId(binding.getRef())
  const pkg = binding.getPackage() ?? inferredPackageName(id)
  const range = binding.getRange()
  const config = cloneConfigForManifest(binding.getConfig())
  const kind: RequirementEntry["kind"] =
    binding instanceof PolicyBindingBuilder ? "policy" : "extension"
  return {
    kind,
    id,
    ...(pkg ? { package: pkg } : {}),
    ...(range ? { range } : {}),
    ...(Object.keys(config).length > 0 ? { config } : {}),
    source: "explicit",
  }
}

function inferredEntry(id: NamespacedId): RequirementEntry {
  const pkg = inferredPackageName(id)
  return {
    kind: "extension",
    id,
    ...(pkg ? { package: pkg } : {}),
    source: "inferred",
  }
}

/**
 * Build a requirements document from explicit `.with()` bindings plus inferred step ids.
 * Explicit rows win when the same id appears in both.
 * @category Workflow
 */
export function buildRequirementsDocument(
  bindings: WorkflowBinding[] | undefined,
  nodes: WorkflowNode[]
): RequirementsDocument {
  const explicit = bindings ?? []
  const requirements: RequirementEntry[] = explicit.map(entryFromBinding)
  const seen = new Set(requirements.map((r) => r.id))
  for (const capabilityId of collectCapabilityIds(nodes)) {
    const id = capabilityToExtensionId(capabilityId)
    if (seen.has(id)) continue
    seen.add(id)
    requirements.push(inferredEntry(id))
  }
  return {
    schema: "@executioncontrolprotocol.requirements",
    version: LATEST_ECP_VERSION,
    requirements,
  }
}

/**
 * Infer a requirements document from a compiled manifest (JSON workflows have no `.with()`).
 * @category Workflow
 */
export function inferRequirementsFromManifest(nodes: WorkflowNode[]): RequirementsDocument {
  return buildRequirementsDocument(undefined, nodes)
}
