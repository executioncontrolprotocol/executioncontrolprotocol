import { defineExtension, capabilityFor, globalRegistry, catalogExtension } from "@executioncontrolprotocol/core"
import { z } from "zod"

const blobs = new Map<string, unknown>()

/** In-memory @executioncontrolprotocol/storage stub. @category Extensions */
export const storageExtension = defineExtension("@executioncontrolprotocol", "storage")
  .withConfig({
    prefix: z.string().optional(),
  })
  .withMetadata({
    summary: "In-memory key-value blob storage for workflows.",
    description:
      "Simple process-local storage for passing data between workflow steps or caching intermediate results. Values are not persisted across environment restarts.",
  })
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/storage", "write")
      .withInput(z.object({ key: z.string(), value: z.unknown() }))
      .withOutput(z.object({ ok: z.boolean() }))
      .withMetadata({
        summary: "Store a value under a logical key.",
        description:
          "Writes an arbitrary value to the in-memory store, optionally prefixed by extension config. Overwrites any existing value for the same key.",
        useCases: [
          "Workflow step caches a large intermediate result for a later step.",
          "Demo stores user preferences for the current session.",
        ],
        samplePrompts: [
          "Save this payload under key session-state.",
          "Write the compiled manifest to storage.",
        ],
      })
      .withHandler(async (input, ctx) => {
        const cfg = (ctx as { extensionConfig?: Record<string, unknown> }).extensionConfig ?? {}
        const prefix = (cfg.prefix as string) ?? ""
        const key = `${prefix}${(input as { key: string }).key}`
        blobs.set(key, (input as { value: unknown }).value)
        return { ok: true }
      }),
    capabilityFor("@executioncontrolprotocol/storage", "read")
      .withInput(z.object({ key: z.string() }))
      .withOutput(z.object({ value: z.unknown().optional() }))
      .withMetadata({
        summary: "Read a previously stored value by key.",
        description:
          "Returns the value for a key from the in-memory store, or undefined when missing. Applies the same optional prefix as write.",
        useCases: [
          "Downstream step loads cached data from an earlier write.",
          "Workflow branch checks whether a key was populated.",
        ],
        samplePrompts: [
          "Read the value stored under session-state.",
          "Fetch the cached manifest from storage.",
        ],
      })
      .withHandler(async (input, ctx) => {
        const cfg = (ctx as { extensionConfig?: Record<string, unknown> }).extensionConfig ?? {}
        const prefix = (cfg.prefix as string) ?? ""
        const key = `${prefix}${(input as { key: string }).key}`
        return { value: blobs.get(key) }
      }),
  ])
  .build()

catalogExtension(storageExtension)

/** Register @executioncontrolprotocol/storage. */
export async function registerStorageExtension(): Promise<void> {
  if (!globalRegistry.getExtension("@executioncontrolprotocol/storage")) {
    await globalRegistry.registerExtension(storageExtension)
  }
}

export default storageExtension
