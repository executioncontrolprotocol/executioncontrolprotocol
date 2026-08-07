import type { NamespacedId } from "@executioncontrolprotocol/types"
import type { ExtensionDefinition } from "../definitions/types.js"

const catalog = new Map<NamespacedId, ExtensionDefinition>()

/**
 * Normalize extension id to `@namespace/name` form.
 * @category Runtime
 */
export function normalizeExtensionId(ref: string): NamespacedId {
  if (ref.startsWith("@")) return ref as NamespacedId
  return `@executioncontrolprotocol/${ref}` as NamespacedId
}

/**
 * Register an extension definition for lookup by id when binding with `extension("@scope/name")`.
 * Extension packages should call this at module load (or inside their `register*` helper).
 * @category Runtime
 */
export function catalogExtension(def: ExtensionDefinition): void {
  catalog.set(def.id, def)
}

/**
 * Look up a cataloged extension definition by namespaced id.
 * @category Runtime
 */
export function getCatalogedExtension(id: NamespacedId | string): ExtensionDefinition | undefined {
  return catalog.get(normalizeExtensionId(id))
}

/** Type guard for an inline extension definition. @category Runtime */
export function isExtensionDefinition(ref: unknown): ref is ExtensionDefinition {
  return (
    typeof ref === "object" &&
    ref !== null &&
    "id" in ref &&
    "capabilities" in ref &&
    Array.isArray((ref as ExtensionDefinition).capabilities)
  )
}

/**
 * Resolve a binding ref to an extension definition (direct object or catalog lookup).
 * @category Runtime
 */
export function resolveExtensionDefinition(
  ref: NamespacedId | ExtensionDefinition | string
): ExtensionDefinition | undefined {
  if (isExtensionDefinition(ref)) return ref
  return getCatalogedExtension(ref as string)
}

/**
 * List all cataloged extension ids (for tests and diagnostics).
 * @category Runtime
 */
export function listCatalogedExtensionIds(): NamespacedId[] {
  return [...catalog.keys()]
}
