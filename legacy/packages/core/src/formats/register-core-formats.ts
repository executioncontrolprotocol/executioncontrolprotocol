import type { Registry } from "../registry/registry.js"
import { formatJsonExtension } from "./format-json.js"
import { formatFluentExtension } from "./format-fluent.js"

/**
 * Register core-built-in format extensions (`@executioncontrolprotocol/format-json`, `@executioncontrolprotocol/format-fluent`).
 * Called from environment `init`, not as a catalog side effect.
 * @category Formats
 */
export async function registerCoreFormats(registry?: Registry): Promise<void> {
  if (!registry) return
  if (!registry.getExtension(formatJsonExtension.id)) {
    await registry.registerExtension(formatJsonExtension)
  }
  if (!registry.getExtension(formatFluentExtension.id)) {
    await registry.registerExtension(formatFluentExtension)
  }
}
