import { defineExtension, capabilityFor, globalRegistry, hook, catalogExtension } from "@executioncontrolprotocol/core"
import { z } from "zod"

const store = new Map<string, unknown[]>()

/** In-memory stub for @executioncontrolprotocol/memory. @category Extensions */
export const memoryExtension = defineExtension("@executioncontrolprotocol", "memory")
  .withConfig({
    hydrateModels: z.boolean().default(true),
    rememberOutputs: z.boolean().default(false),
    collections: z.array(z.string()).default([]),
  })
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/memory", "search")
      .withInput(z.object({ query: z.string(), since: z.string().optional() }))
      .withOutput(z.object({ results: z.array(z.unknown()) }))
      .withHandler(async (input) => {
        const q = (input as { query: string }).query.toLowerCase()
        const all = [...store.values()].flat()
        return {
          results: all.filter((r) => JSON.stringify(r).toLowerCase().includes(q)),
        }
      }),
    capabilityFor("@executioncontrolprotocol/memory", "remember")
      .withInput(z.object({ entry: z.unknown(), collection: z.string().optional() }))
      .withOutput(z.object({ stored: z.boolean() }))
      .withHandler(async (input) => {
        const col = (input as { collection?: string }).collection ?? "default"
        const list = store.get(col) ?? []
        list.push((input as { entry: unknown }).entry)
        store.set(col, list)
        return { stored: true }
      }),
  ])
  .withHooks([
    hook("step:completed", async (ctx) => {
      if (ctx.output === undefined || !ctx.step) return
      const col = "step-outputs"
      const list = store.get(col) ?? []
      list.push({ stepId: ctx.step.id, output: ctx.output })
      store.set(col, list)
    }),
    hook("run:finally", async () => undefined),
  ])
  .build()

catalogExtension(memoryExtension)

export async function registerMemoryExtension(): Promise<void> {
  if (!globalRegistry.getExtension("@executioncontrolprotocol/memory")) {
    await globalRegistry.registerExtension(memoryExtension)
  }
}

export default memoryExtension
