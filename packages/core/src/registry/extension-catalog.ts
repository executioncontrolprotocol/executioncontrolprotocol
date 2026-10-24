import type { NamespacedId } from "../types/index.js"
import type { ExtensionDefinition } from "../definitions/types.js"

/**
 * Normalize extension id to `@namespace/name` form.
 * @category Runtime
 */
export function normalizeExtensionId(ref: string): NamespacedId {
  if (ref.startsWith("@")) return ref as NamespacedId
  return `@executioncontrolprotocol/${ref}` as NamespacedId
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
 * Resolve a binding ref to an extension definition (object refs only).
 * String ids must already be registered on the environment's {@link Registry}.
 * @category Runtime
 */
export function resolveExtensionDefinition(
  ref: NamespacedId | ExtensionDefinition | string
): ExtensionDefinition | undefined {
  if (isExtensionDefinition(ref)) return ref
  return undefined
}
