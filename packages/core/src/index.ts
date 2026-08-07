export { LATEST_ECP_VERSION } from "@executioncontrolprotocol/types"
export * from "@executioncontrolprotocol/types"

export { ref } from "./helpers/ref.js"
export { state } from "./helpers/state.js"
export { env } from "./helpers/env.js"
export { secrets } from "./helpers/secrets.js"
export { browser } from "./helpers/browser.js"
export { expr } from "./helpers/expr.js"

export * from "./config-schema/index.js"
export * from "./definitions/index.js"
export type {
  ExtensionDefinition,
  RuntimeDefinition,
  PolicyDefinition,
  CapabilityDefinition,
  HookDefinition,
} from "./definitions/types.js"
export { step } from "./bindings/step.js"
export { runtime } from "./bindings/runtime.js"
export { extension } from "./bindings/extension.js"
export { harness } from "./bindings/harness.js"
export { policy } from "./bindings/policy.js"
export { registerCoreFormats } from "./formats/register-core-formats.js"
export * from "./harness/index.js"
export * from "./feedback/index.js"
export { stripMarkdownCodeFences } from "./encoding/strip-markdown-fences.js"
export { stripHarnessTypeScriptOutput } from "./encoding/strip-harness-typescript-output.js"
export { workflow, WorkflowBuilder } from "./workflow/builder.js"
export { parallel, branch, loop } from "./workflow/flow.js"

export { environment, Environment } from "./environment/environment.js"
export { EcpImpl, type Ecp, type RunOptions } from "./environment/ecp.js"
export { assignUniqueStepIds } from "./workflow/assign-unique-step-ids.js"
export { createInvokeBuilder, type InvokeOperationBuilder } from "./invoke/index.js"
export type { EnvironmentConfigResolver } from "./environment/config-resolver.js"
export { resolveEnvConfigAsync, cloneConfigForManifest } from "./environment/config-resolver.js"
export {
  PROCESS_ENV_RESOLVER_ID,
  SECRETS_RESOLVER_ID,
  BROWSER_SECRETS_RESOLVER_ID,
} from "./environment/config-resolver.js"
export { Registry, globalRegistry, type RegistryRegistrationGuard } from "./registry/registry.js"
export {
  catalogExtension,
  getCatalogedExtension,
  resolveExtensionDefinition,
  isExtensionDefinition,
  listCatalogedExtensionIds,
  normalizeExtensionId,
} from "./registry/extension-catalog.js"
export { ensureBoundExtensionsRegistered } from "./registry/ensure-bound-extensions.js"
export {
  RegistryFrozenError,
  RegistryRegistrationDeniedError,
} from "./registry/errors.js"
export { matchesNamespace, matchesAnyNamespace } from "./registry/namespace.js"
export { InMemoryRuntimeExecutor } from "./runtime/in-memory-executor.js"
export type { RuntimeExecutor, RuntimeExecutionContext } from "./runtime/executor.js"
export type {
  PolicyContext,
  CapabilityContext,
  LifecycleContext,
  EnvironmentLifecycleHost,
  UsageLedger,
  Logger,
  RunContext,
  StepExecutionContext,
} from "./runtime/context.js"
export { createUsageLedger } from "./runtime/context.js"
export { registerTestExtension, testExtension } from "./testing/test-extension.js"

export {
  renderWorkflowToFluent,
  renderWorkflowManifestToFluent,
  encodeFluent,
  type RenderWorkflowToFluentOptions,
} from "./fluent/index.js"
export { validateWorkflow } from "./validate/workflow.js"
export {
  capabilityIdSchema,
  commitModeSchema,
  parseWorkflowManifest,
  stepNodeSchema,
  workflowManifestSchema,
  workflowNodeSchema,
  type ParsedStepNode,
  type ParsedWorkflowManifest,
  type ParsedWorkflowNode,
} from "./validate/workflow-schema.js"
export {
  EcpError,
  normalizeWorkflowManifest,
  encodeFailure,
  decodeFailure,
  ecpEncodeInputSchema,
  ecpDecodeInputSchema,
  ecpEncodeResultSchema,
  ecpDecodeResultSchema,
  type EncodeOperationBuilder,
  type DecodeOperationBuilder,
  type UtilityCapabilityContext,
} from "./encoding/index.js"
export {
  buildStepIndex,
  resolveEcpPatchPath,
  applyPatch,
  createPatchBuilder,
  type PatchOperationBuilder,
  type StepIndex,
  ecpPatchDocumentSchema,
  ecpPatchEntrySchema,
} from "./patch/index.js"
export { zodIssuesToValidationIssues } from "./validate/zod-mapper.js"
export type {
  StoreContext,
  MutationBuffer,
  StoreReadOptions,
  StoreWriteOptions,
} from "./runtime/store.js"
export {
  isImageRef,
  collectImageRefs,
  collectOutputFormatHints,
  imageRefUrlHostname,
  isSvgHint,
} from "./image/image-ref.js"
export type { CollectedImageRef, CollectedFormatHint } from "./image/image-ref.js"
