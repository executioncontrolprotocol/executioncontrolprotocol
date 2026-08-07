/**
 * Browser-safe subset of @executioncontrolprotocol/core (no Node compile/loaders).
 * @packageDocumentation
 */

export { LATEST_ECP_VERSION } from "@executioncontrolprotocol/types"
export * from "@executioncontrolprotocol/types"

export * from "./browser.js"
export { environment, Environment, type RunOptions } from "./environment/environment.js"
export { EcpImpl, type Ecp } from "./environment/ecp.js"
export type { EnvironmentConfigResolver } from "./environment/config-resolver.js"
export {
  resolveEnvConfigAsync,
  cloneConfigForManifest,
  BROWSER_SECRETS_RESOLVER_ID,
} from "./environment/config-resolver.js"
export { extension } from "./bindings/extension.js"
export { harness } from "./bindings/harness.js"
export { runtime } from "./bindings/runtime.js"
export { policy } from "./bindings/policy.js"
export { registerCoreFormats } from "./formats/register-core-formats.js"
export * from "./feedback/index.js"
export { stripMarkdownCodeFences } from "./encoding/strip-markdown-fences.js"
export { assignUniqueStepIds } from "./workflow/assign-unique-step-ids.js"
export { createInvokeBuilder, type InvokeOperationBuilder } from "./invoke/index.js"
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
} from "./runtime/context.js"
export { createUsageLedger } from "./runtime/context.js"
export { evaluatePolicies } from "./runtime/policy-engine.js"
export type {
  ExtensionDefinition,
  RuntimeDefinition,
  PolicyDefinition,
  CapabilityDefinition,
  HookDefinition,
} from "./definitions/types.js"
export { registerTestExtension, testExtension } from "./testing/test-extension.js"
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
export { defineHarness, HarnessDefinitionBuilder, isHarnessDefinition } from "./harness/define-harness.js"
export {
  catalogHarness,
  getCatalogedHarness,
  listCatalogedHarnessIds,
  harnessEvaluateCapabilityId,
  harnessIdFromCapabilityId,
  isHarnessCapabilityId,
} from "./harness/harness-catalog.js"
export type {
  ErasedHarnessHandler,
  HarnessConfigOf,
  HarnessDefinition,
  HarnessHandler,
  HarnessInputOf,
  HarnessOutputOf,
} from "./harness/types.js"
export type { HarnessCapabilityContext } from "./harness/context.js"
export { callModelGenerate } from "./harness/call-model.js"
export {
  isCoreFormatterId,
  CORE_FORMATTER_IDS,
  inferResponseFormatFromFormatter,
} from "./harness/format-resolve.js"
export {
  runModelRepairLoop,
  type ModelRepairGenerateContext,
  type ModelRepairEvaluateResult,
  type RunModelRepairLoopOptions,
  type ModelRepairLoopResult,
} from "./harness/run-model-repair-loop.js"
export {
  harnessPromptFixtureSchema,
  type HarnessPromptFixture,
} from "./harness/prompts/harness-prompt-fixture-schema.js"
export {
  loadSchemaExample,
  loadSchemaExampleEql,
  formatSchemaExampleJson,
  formatSchemaExampleEql,
  loadRepairNeutralExampleEql,
} from "./harness/prompts/load-schema-example.browser.js"
export { buildSystemPromptFromFixture } from "./harness/prompts/build-system-prompt.js"
export { buildRepairHintFromFixture } from "./harness/prompts/build-repair-hint.js"
export * from "./harness/authoring/index.js"
