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
} from "./environment/config-resolver.js"
export { extension } from "./bindings/extension.js"
export { runtime } from "./bindings/runtime.js"
export { policy } from "./bindings/policy.js"
export { registerCoreFormats } from "./formats/register-core-formats.js"
export { assignUniqueStepIds } from "./workflow/assign-unique-step-ids.js"
export {
  toProviderChatTurns,
  flattenProviderChatTurns,
  type ProviderChatPriorMessage,
  type ProviderChatTurn,
  type ToProviderChatTurnsOptions,
} from "./helpers/provider-chat-turns.js"
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
export {
  resolveCapabilityExecution,
  isBrowserRuntimeId,
  isNodeRuntimeId,
} from "./runtime/capability-execution.js"
export { NODE_RUNTIME_ID, BROWSER_RUNTIME_ID } from "./runtime/runtime-ids.js"
export {
  hopRemoteInvoke,
  invokeFailure,
  isInvokeResult,
  buildInvokeFailureDiagnostics,
  formatValidationIssueLine,
  type RemoteInvokeBinding,
} from "./runtime/remote-invoke.js"
export {
  dispatchCapability,
  dispatchCapabilityResult,
  createDispatchingCall,
  CapabilityDispatchError,
} from "./runtime/dispatch-capability.js"
export {
  BROWSER_FILE_LOCATOR_PREFIX,
  isBrowserFileLocator,
  createBrowserFileLocator,
  createCapabilityBlobStore,
  stashCapabilityBlob,
  collectBrowserLocators,
  serializeCapabilityBlobs,
  hydrateCapabilityBlobs,
  type CapabilityBlob,
  type CapabilityBlobStore,
  type SerializedCapabilityBlob,
} from "./runtime/blobs.js"
export {
  createCapabilityArtifactStore,
  type CapabilityArtifact,
  type CapabilityArtifactStore,
} from "./runtime/artifacts.js"
export {
  resolveFile,
  writeMediaArtifact,
  artifactFetchPathname,
  isArtifactFetchPathname,
  parseArtifactFetchPathname,
  ARTIFACT_HTTP_PATH_PREFIX,
  STORAGE_ARTIFACT_URI_PREFIX,
  type ResolvedFile,
  type ResolveFileOptions,
  type WriteMediaArtifactOptions,
  type MediaArtifactStore,
  type FileCapabilityContext,
  type ArtifactFetchPathnameOptions,
} from "./media/index.js"
export {
  handleMixedBrowserBlobUpload,
  type MixedBlobUploadInput,
  type MixedBlobUploadOutput,
} from "./runtime/mixed-blob-upload.js"
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
export {
  isFileRef,
  collectFileRefs,
  collectOutputFormatHints,
  fileRefUrlHostname,
  isSvgHint,
} from "./file/file-ref.js"
export type { CollectedFileRef, CollectedFormatHint } from "./file/file-ref.js"
export { assertMediaType, mediaTypeMatches } from "./media/assert-media-type.js"
