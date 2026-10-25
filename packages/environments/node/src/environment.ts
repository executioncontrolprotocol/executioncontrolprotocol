import {
  environment as coreEnvironment,
  registerEnvironmentDefinition,
} from "@executioncontrolprotocol/core"
import type { Environment } from "@executioncontrolprotocol/core"
import { nodeEnvironmentDefinition } from "./runtime/builtin-node.js"
import { createDiskMediaStore } from "./media/disk-media-store.js"

/**
 * Create a Node environment. `id` must be `@executioncontrolprotocol/node`;
 * `label` is the instance name (the old free-form environment id).
 * Binds a disk MediaStore via `.use()`.
 * @category Environment
 */
export function environment(id: string, label?: string): Environment {
  registerEnvironmentDefinition(nodeEnvironmentDefinition)
  return coreEnvironment(id, label).use(createDiskMediaStore())
}
