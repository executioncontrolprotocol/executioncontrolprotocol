export {
  NODE_ENVIRONMENT_ID,
  nodeEnvironmentDefinition,
  NodeRuntimeExecutor,
  registerNodeEnvironment,
} from "./runtime/builtin-node.js"

export { processEnvExtension } from "./secrets/process-env.js"

export {
  secretsExtension,
  setMemorySecret,
  clearMemorySecrets,
  setSecretsProvider,
  setSecretsStore,
  resetSecretsStore,
  memorySecretsProvider,
  memorySecretsStore,
  createOsSecretsStore,
  redactSecret,
  canonicalSecretKey,
  secretRefIdFromLogicalKey,
  ECP_SECRET_REF_PROTOCOL_PREFIX,
  type SecretsStore,
} from "./secrets/index.js"

export { environment } from "./environment.js"

export {
  compileWorkflowSource,
  compileAndValidateWorkflowSource,
  extractWorkflowFromModule,
  extractLoadedWorkflowFromModule,
  type LoadedWorkflow,
  bundleWorkflowSource,
  bundleEnvironmentSource,
  resolveBundleDir,
  isTypeScriptFile,
  type CompileWorkflowResult,
  type CompileWorkflowSourceOptions,
  type CompileDiagnostic,
} from "./compile/entry.js"

export {
  readTextFile,
  loadWorkflowJson,
  loadWorkflowFile,
  loadEnvironmentModule,
  loadWorkflowModule,
} from "./loaders/index.js"

export { readMediaFileFromPath } from "./loaders/read-media-file.js"

export { journalExtension } from "./journal/extension.js"
export {
  writeInvokeJournal,
  readRunJournal,
  readStepJournal,
  listRunJournals,
  journalRunStart,
  journalRunEnd,
  journalStep,
} from "./journal/writer.js"
export { runsRoot, runDir } from "./journal/paths.js"
export { sha256Hex, hashStepDefinition } from "./journal/hash.js"
export { redactSecrets, recordResolvedSecret, secretMarker } from "./journal/redact.js"

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
  policy,
  defineExtension,
  defineEnvironment,
  definePolicy,
  capability,
  capabilityFor,
  hook,
  Environment,
  Registry,
  registerTestExtension,
  testExtension,
  validateWorkflow,
} from "@executioncontrolprotocol/core"
