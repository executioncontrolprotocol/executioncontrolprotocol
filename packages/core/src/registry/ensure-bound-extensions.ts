import type { NamespacedId } from "@executioncontrolprotocol/types"
import type { ExtensionBindingBuilder } from "../bindings/extension.js"
import type { Registry } from "./registry.js"
import { resolveExtensionDefinition, normalizeExtensionId } from "./extension-catalog.js"
import { registerCoreFormats } from "../formats/register-core-formats.js"

function bindingRefId(ref: NamespacedId | import("../definitions/types.js").ExtensionDefinition | string): NamespacedId {
  if (typeof ref === "string") return normalizeExtensionId(ref)
  if ("id" in ref) return ref.id
  return ref as NamespacedId
}

/**
 * Register all bound extensions that are not yet in the registry.
 * Resolves string refs via the extension catalog; object refs register directly.
 * @category Runtime
 */
export async function ensureBoundExtensionsRegistered(
  bindings: ExtensionBindingBuilder[],
  registry: Registry
): Promise<void> {
  await registerCoreFormats(registry)
  for (const binding of bindings) {
    const ref = binding.getRef()
    const def = resolveExtensionDefinition(ref)
    const id = bindingRefId(ref)

    if (!def) {
      if (registry.getExtension(id)) continue
      throw new Error(
        `Extension ${id} is not registered. Import its package (to populate the catalog) or pass extension(def) with the imported ExtensionDefinition.`
      )
    }

    if (!registry.getExtension(def.id)) {
      await registry.registerExtension(def)
    }
  }
}
