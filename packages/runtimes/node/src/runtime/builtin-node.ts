import { defineRuntime, globalRegistry } from "@executioncontrolprotocol/core"
import { z } from "zod"
import { NodeRuntimeExecutor } from "./node-executor.js"

export { NodeRuntimeExecutor } from "./node-executor.js"

/** Node runtime id. @category Runtime */
export const NODE_RUNTIME_ID = "@executioncontrolprotocol/node" as const

/** Built-in Node runtime definition. @category Runtime */
export const nodeRuntimeDefinition = defineRuntime("@executioncontrolprotocol", "node")
  .withConfig({
    maxConcurrency: z.number().optional(),
  })
  .withExecutor(new NodeRuntimeExecutor())

/** Register `@executioncontrolprotocol/node` on the global registry. */
export async function registerNodeRuntime(registry = globalRegistry): Promise<void> {
  if (!registry.getRuntime(NODE_RUNTIME_ID)) {
    await registry.registerRuntime(nodeRuntimeDefinition)
  }
}
