import {
  defineEnvironment,
  NODE_ENVIRONMENT_ID,
  registerEnvironmentDefinition,
} from "@executioncontrolprotocol/core"
import { z } from "zod"
import { NodeRuntimeExecutor } from "./node-executor.js"
import { testExtension } from "@executioncontrolprotocol/core"
import { secretsExtension } from "../secrets/index.js"
import { processEnvExtension } from "../secrets/process-env.js"
import { journalExtension } from "../journal/extension.js"

export { NodeRuntimeExecutor } from "./node-executor.js"
export { NODE_ENVIRONMENT_ID }

const NODE_ENVIRONMENT_VERSION = "0.50.0"

/** Built-in Node environment definition. @category Environment */
export const nodeEnvironmentDefinition = defineEnvironment("@executioncontrolprotocol", "node")
  .withConfig({
    maxConcurrency: z.number().optional(),
  })
  .withVersion(NODE_ENVIRONMENT_VERSION)
  .withDefaultExtensions([secretsExtension, processEnvExtension, testExtension, journalExtension])
  .withExecutor(new NodeRuntimeExecutor())

/** Register the Node environment definition for {@link environment} lookup. @category Environment */
export function registerNodeEnvironment(): void {
  registerEnvironmentDefinition(nodeEnvironmentDefinition)
}
