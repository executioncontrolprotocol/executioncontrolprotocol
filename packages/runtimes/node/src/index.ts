export {
  NODE_RUNTIME_ID,
  nodeRuntimeDefinition,
  NodeRuntimeExecutor,
  registerNodeRuntime,
} from "./runtime/builtin-node.js"

export {
  processEnvExtension,
  registerProcessEnvExtension,
} from "@executioncontrolprotocol/process-env"

export {
  secretsExtension,
  registerSecretsExtension,
  setMemorySecret,
  setSecretsProvider,
  setSecretsStore,
  resetSecretsStore,
  memorySecretsProvider,
  memorySecretsStore,
  createOsSecretsStore,
  redactSecret,
  type SecretsStore,
} from "@executioncontrolprotocol/secrets"

export { registerNodeDefaults, environment } from "./environment.js"

export {
  workflow,
  step,
  ref,
  state,
  env,
  secrets,
  expr,
  parallel,
  branch,
  loop,
  extension,
  runtime,
  policy,
  defineExtension,
  defineRuntime,
  definePolicy,
  capability,
  capabilityFor,
  hook,
  Environment,
  Registry,
  globalRegistry,
  registerTestExtension,
  validateWorkflow,
} from "@executioncontrolprotocol/core"
export { compileWorkflowSource, compileAndValidateWorkflowSource } from "@executioncontrolprotocol/core/compile"
