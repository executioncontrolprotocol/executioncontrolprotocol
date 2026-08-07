import { defineRuntime, globalRegistry } from "@executioncontrolprotocol/core"
import { z } from "zod"
import { BrowserRuntimeExecutor } from "./browser-executor.js"

export { BrowserRuntimeExecutor } from "./browser-executor.js"

/** Browser runtime id. @category Runtime */
export const BROWSER_RUNTIME_ID = "@executioncontrolprotocol/browser" as const

/** Built-in browser runtime definition. @category Runtime */
export const browserRuntimeDefinition = defineRuntime("@executioncontrolprotocol", "browser")
  .withConfig({
    maxConcurrency: z.number().optional(),
    allowParallel: z.boolean().default(true),
    allowLongRunningTasks: z.boolean().default(false),
  })
  .withExecutor(new BrowserRuntimeExecutor())

/** Register `@executioncontrolprotocol/browser` on the global registry. */
export async function registerBrowserRuntime(registry = globalRegistry): Promise<void> {
  if (!registry.getRuntime(BROWSER_RUNTIME_ID)) {
    await registry.registerRuntime(browserRuntimeDefinition)
  }
}
