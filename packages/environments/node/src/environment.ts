import {
  environment as coreEnvironment,
  registerEnvironmentDefinition,
  registerHostFileReader,
} from "@executioncontrolprotocol/core"
import type { Environment } from "@executioncontrolprotocol/core"
import { nodeEnvironmentDefinition } from "./runtime/builtin-node.js"
import { readMediaFileFromPath } from "./loaders/read-media-file.js"

registerHostFileReader(readMediaFileFromPath)

/**
 * Create a Node environment. `id` must be `@executioncontrolprotocol/node`;
 * `label` is the instance name (the old free-form environment id).
 * @category Environment
 */
export function environment(id: string, label?: string): Environment {
  registerEnvironmentDefinition(nodeEnvironmentDefinition)
  return coreEnvironment(id, label)
}
