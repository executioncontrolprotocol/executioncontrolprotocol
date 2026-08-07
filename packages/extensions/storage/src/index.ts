import { defineExtension, capabilityFor, globalRegistry, catalogExtension } from "@executioncontrolprotocol/core"
import { z } from "zod"

const blobs = new Map<string, unknown>()

/** In-memory @executioncontrolprotocol/storage stub. @category Extensions */
export const storageExtension = defineExtension("@executioncontrolprotocol", "storage")
  .withConfig({
    prefix: z.string().optional(),
  })
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/storage", "write")
      .withInput(z.object({ key: z.string(), value: z.unknown() }))
      .withOutput(z.object({ ok: z.boolean() }))
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
