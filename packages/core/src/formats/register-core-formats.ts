import type { Registry } from "../registry/registry.js"
import { catalogExtension } from "../registry/extension-catalog.js"
import { formatJsonExtension } from "./format-json.js"
import { formatFluentExtension } from "./format-fluent.js"

/**
 * Catalog and register core-built-in format extensions (@executioncontrolprotocol/format-json, @executioncontrolprotocol/format-fluent).
 * @category Formats
 */
export async function registerCoreFormats(registry?: Registry): Promise<void> {
  catalogExtension(formatJsonExtension)
  catalogExtension(formatFluentExtension)
  if (!registry) return
  if (!registry.getExtension(formatJsonExtension.id)) {
    await registry.registerExtension(formatJsonExtension)
  }
  if (!registry.getExtension(formatFluentExtension.id)) {
    await registry.registerExtension(formatFluentExtension)
  }
}
