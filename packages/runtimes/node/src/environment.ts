import { environment as coreEnvironment, registerRegistryControlPolicy, runtime } from "@executioncontrolprotocol/core"
import type { Environment } from "@executioncontrolprotocol/core"
import { registerStandardPolicies } from "@executioncontrolprotocol/policies"
import { NODE_RUNTIME_ID, registerNodeRuntime } from "./runtime/builtin-node.js"
import { registerProcessEnvExtension } from "@executioncontrolprotocol/process-env"
import { registerSecretsExtension } from "@executioncontrolprotocol/secrets"

/** Register Node runtime and standard Node extensions. */
export async function registerNodeDefaults(): Promise<void> {
  await registerNodeRuntime()
  await registerSecretsExtension()
  await registerProcessEnvExtension()
  await registerStandardPolicies()
  await registerRegistryControlPolicy()
}

/**
 * Create a Node environment with `@executioncontrolprotocol/node` runtime pre-bound.
 * @category Environment
 */
export async function environment(id: string, label?: string): Promise<Environment> {
  await registerNodeDefaults()
  return coreEnvironment(id, label).withRuntime(runtime(NODE_RUNTIME_ID, "Node Runtime"))
}
