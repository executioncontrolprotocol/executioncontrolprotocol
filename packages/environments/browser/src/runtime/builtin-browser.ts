import {
  defineEnvironment,
  BROWSER_ENVIRONMENT_ID,
  registerEnvironmentDefinition,
} from "@executioncontrolprotocol/core"
import { z } from "zod"
import { BrowserRuntimeExecutor } from "./browser-executor.js"
import { browserRegistryExtension } from "../extensions/browser-registry.js"
import { browserLocalConfigExtension } from "../extensions/browser-local-config.js"

export { BrowserRuntimeExecutor } from "./browser-executor.js"
export { BROWSER_ENVIRONMENT_ID }

const BROWSER_ENVIRONMENT_VERSION = "0.14.1"

/** Built-in browser environment definition. @category Environment */
export const browserEnvironmentDefinition = defineEnvironment("@executioncontrolprotocol", "browser")
  .withConfig({
    maxConcurrency: z.number().optional(),
    allowParallel: z.boolean().default(true),
    allowLongRunningTasks: z.boolean().default(false),
  })
  .withVersion(BROWSER_ENVIRONMENT_VERSION)
  .withDefaultExtensions([browserRegistryExtension, browserLocalConfigExtension])
  .withExecutor(new BrowserRuntimeExecutor())

/** Register the browser environment definition for {@link environment} lookup. @category Environment */
export function registerBrowserEnvironment(): void {
  registerEnvironmentDefinition(browserEnvironmentDefinition)
}
