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
  .withMetadata({
    summary: "In-memory recall and search for workflow context.",
    description:
      "Stores and retrieves entries across named collections in process memory. Hooks can auto-remember step outputs when configured.",
  })
  .withCapabilities([
    capabilityFor("@executioncontrolprotocol/memory", "search")
      .withInput(z.object({ query: z.string(), since: z.string().optional() }))
      .withOutput(z.object({ results: z.array(z.unknown()) }))
      .withMetadata({
        summary: "Search stored memory entries by text query.",
        description:
          "Performs a simple substring match across all remembered entries. Returns matching records for use in follow-up prompts or routing.",
        useCases: [
          "Assistant step recalls prior user facts from memory.",
          "Workflow searches step-output history for a keyword.",
        ],
        samplePrompts: [
          "Search memory for mentions of invoice totals.",
          "Find prior entries about the echo workflow.",
        ],
      })
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
      .withMetadata({
        summary: "Persist an entry into a memory collection.",
        description:
          "Appends an arbitrary entry to a named collection, defaulting to default. Entries remain available for later search within the same environment lifetime.",
        useCases: [
          "Chat turn stores a summarized fact for future turns.",
          "Workflow explicitly records a decision for audit recall.",
        ],
        samplePrompts: [
          "Remember that the user prefers dark mode.",
          "Store this step output in the default collection.",
        ],
      })
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
